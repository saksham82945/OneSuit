package handlers

import (
	"errors"
	"fmt"
	"math"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/shridarpatil/whatomate/internal/models"
)

// Ads Manager: ad credit wallet, AI ad generation, metrics summary, Meta
// "fetched" lists and custom conversion events. Payments and Meta's Marketing
// API aren't wired yet: top-ups are recorded as pending requests (a super admin
// approves them once paid) and sync/fetch answer that Facebook isn't connected.

const (
	adFreeGenerations = 5
	adWalletCurrency  = "INR"
	adMinTopup        = 500.0
	adMaxTopup        = 1000000.0
)

// adCreditPacks are the ready-made top-up packs offered on the Ads screens.
var adCreditPacks = map[string]struct {
	Name   string
	Amount float64
}{
	"starter": {"Ads Starter Pack", 5000},
	"growth":  {"Ads Growth Pack", 10000},
}

var (
	adGenerateSizes     = map[string]bool{"1:1": true, "3:4": true, "4:5": true, "9:16": true, "16:9": true}
	adEventSources      = map[string]bool{"website": true, "whatsapp": true, "server": true, "offline": true}
	adEventNamePattern  = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{0,49}$`)
	errAdWalletNotFound = errors.New("wallet not found")
)

// --- Wallet ---

// loadAdWallet returns the org's wallet, creating it on first use.
func (a *App) loadAdWallet(db *gorm.DB, orgID uuid.UUID) (*models.AdWallet, error) {
	var w models.AdWallet
	err := db.Where("organization_id = ?", orgID).
		Attrs(models.AdWallet{OrganizationID: orgID, Currency: adWalletCurrency}).FirstOrCreate(&w).Error
	if err != nil {
		// Lost a race with another request creating it: read it back.
		if err2 := db.Where("organization_id = ?", orgID).First(&w).Error; err2 != nil {
			return nil, err
		}
	}
	return &w, nil
}

// adWalletBalance is the wallet balance, or fallback when there's no wallet yet.
func (a *App) adWalletBalance(orgID uuid.UUID, fallback float64) float64 {
	var w models.AdWallet
	if err := a.DB.Where("organization_id = ?", orgID).First(&w).Error; err != nil {
		return fallback
	}
	return w.Balance
}

func freeGenerationsLeft(w *models.AdWallet) int {
	if left := adFreeGenerations - w.FreeGenerationsUsed; left > 0 {
		return left
	}
	return 0
}

func (a *App) adWalletResponse(orgID uuid.UUID, w *models.AdWallet) map[string]any {
	txs := []models.AdCreditTransaction{}
	a.DB.Where("organization_id = ?", orgID).Order("created_at DESC").Limit(10).Find(&txs)
	var pending float64
	a.DB.Model(&models.AdCreditTransaction{}).
		Where("organization_id = ? AND status = ? AND type = ?", orgID, "pending", "credit").
		Select("COALESCE(SUM(amount), 0)").Scan(&pending)
	packs := make([]map[string]any, 0, len(adCreditPacks))
	for _, key := range []string{"starter", "growth"} {
		p := adCreditPacks[key]
		packs = append(packs, map[string]any{"key": key, "name": p.Name, "amount": p.Amount})
	}
	return map[string]any{
		"balance":                w.Balance,
		"currency":               w.Currency,
		"free_generations_left":  freeGenerationsLeft(w),
		"free_generations_total": adFreeGenerations,
		"pending_amount":         pending,
		"transactions":           txs,
		"packs":                  packs,
	}
}

// GetAdWallet returns the ad credit balance, free AI generations and recent transactions.
func (a *App) GetAdWallet(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionRead)
	if err != nil {
		return nil
	}
	w, err := a.loadAdWallet(a.DB, orgID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load ad credit", nil, "")
	}
	return r.SendEnvelope(a.adWalletResponse(orgID, w))
}

// TopupAdWallet records a request to add ad credit. Payments aren't integrated
// yet, so the request stays pending and the balance is unchanged until it is
// approved.
func (a *App) TopupAdWallet(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req struct {
		Amount float64 `json:"amount"`
		Pack   string  `json:"pack"`
		Note   string  `json:"note"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	amount, packName := req.Amount, ""
	if req.Pack != "" {
		p, ok := adCreditPacks[strings.ToLower(strings.TrimSpace(req.Pack))]
		if !ok {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Pack must be starter or growth", nil, "")
		}
		amount, packName = p.Amount, p.Name
	}
	amount = math.Round(amount*100) / 100
	if amount < adMinTopup || amount > adMaxTopup {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, fmt.Sprintf("Amount must be between ₹%.0f and ₹%.0f", adMinTopup, adMaxTopup), nil, "")
	}
	if _, err := a.loadAdWallet(a.DB, orgID); err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load ad credit", nil, "")
	}
	tx := models.AdCreditTransaction{
		OrganizationID: orgID, Amount: amount, Currency: adWalletCurrency, Type: "credit", Status: "pending",
		PackName: packName, Note: strings.TrimSpace(req.Note), RequestedByID: &userID,
	}
	if err := a.DB.Create(&tx).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to record the top-up request", nil, "")
	}
	return r.SendEnvelope(map[string]any{
		"transaction": tx,
		"message":     "Our team will contact you to complete the payment. Your ad credit is added once the payment is confirmed.",
	})
}

// SuperAdminListAdCredits lists ad credit top-up requests across organizations. Optional ?status=.
func (a *App) SuperAdminListAdCredits(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	type row struct {
		models.AdCreditTransaction
		OrganizationName string `json:"organization_name"`
	}
	q := a.DB.Table("ad_credit_transactions t").Select("t.*, o.name AS organization_name").
		Joins("LEFT JOIN organizations o ON o.id = t.organization_id").Where("t.deleted_at IS NULL")
	if s := string(r.RequestCtx.QueryArgs().Peek("status")); s != "" {
		q = q.Where("t.status = ?", s)
	}
	rows := []row{}
	if err := q.Order("t.created_at DESC").Limit(200).Scan(&rows).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list ad credit requests", nil, "")
	}
	return r.SendEnvelope(map[string]any{"transactions": rows, "total": len(rows)})
}

// SuperAdminApproveAdCredit marks a pending top-up as paid and credits the wallet.
func (a *App) SuperAdminApproveAdCredit(r *fastglue.Request) error {
	adminID, err := a.requireSuperAdmin(r)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "ad credit request")
	if err != nil {
		return nil
	}
	var tx models.AdCreditTransaction
	var wallet *models.AdWallet
	txErr := a.DB.Transaction(func(db *gorm.DB) error {
		if err := db.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).First(&tx).Error; err != nil {
			return errAdWalletNotFound
		}
		if tx.Status != "pending" || tx.Type != "credit" {
			return errors.New("not pending")
		}
		w, err := a.loadAdWallet(db, tx.OrganizationID)
		if err != nil {
			return err
		}
		if err := db.Model(&models.AdWallet{}).Where("id = ?", w.ID).
			Update("balance", gorm.Expr("balance + ?", tx.Amount)).Error; err != nil {
			return err
		}
		now := time.Now()
		tx.Status, tx.ApprovedByID, tx.CompletedAt = "completed", &adminID, &now
		if err := db.Save(&tx).Error; err != nil {
			return err
		}
		wallet = w
		wallet.Balance += tx.Amount
		return nil
	})
	switch {
	case errors.Is(txErr, errAdWalletNotFound):
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Ad credit request not found", nil, "")
	case txErr != nil && txErr.Error() == "not pending":
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "This request is not pending", nil, "")
	case txErr != nil:
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to approve the request", nil, "")
	}
	return r.SendEnvelope(map[string]any{"transaction": tx, "balance": wallet.Balance})
}

// --- AI ad generation ---

type adGenerateRequest struct {
	BusinessName string `json:"business_name"`
	WebsiteURL   string `json:"website_url"`
	Audience     string `json:"audience"`
	AdType       string `json:"ad_type"`
	MediaType    string `json:"media_type"`
	Size         string `json:"size"`
	Count        int    `json:"count"`
}

func (req *adGenerateRequest) validate() string {
	req.BusinessName = strings.TrimSpace(req.BusinessName)
	req.WebsiteURL = strings.TrimSpace(req.WebsiteURL)
	req.Audience = strings.TrimSpace(req.Audience)
	req.AdType = strings.TrimSpace(req.AdType)
	if req.AdType == "auto" {
		req.AdType = ""
	}
	if req.MediaType == "" {
		req.MediaType = "image"
	}
	if req.Size == "" {
		req.Size = "1:1"
	}
	if req.Count == 0 {
		req.Count = 3
	}
	switch {
	case req.BusinessName == "":
		return "Business name is required"
	case len([]rune(req.BusinessName)) > 100:
		return "Business name must be 100 characters or fewer"
	case req.WebsiteURL != "" && !validWebURL(req.WebsiteURL):
		return "Website URL must start with http:// or https://"
	case len([]rune(req.Audience)) > 200:
		return "Target audience must be 200 characters or fewer"
	case req.AdType != "" && !adTypes[req.AdType]:
		return "Ad type must be auto, click_to_whatsapp, whatsapp_status, website_to_whatsapp, website or lead_form"
	case req.MediaType != "image" && req.MediaType != "video":
		return "Media type must be image or video"
	case !adGenerateSizes[req.Size]:
		return "Size must be 1:1, 3:4, 4:5, 9:16 or 16:9"
	case req.Count < 1 || req.Count > 5:
		return "Number of ads must be between 1 and 5"
	}
	return ""
}

func adIsWhatsAppType(t string) bool {
	return t == "click_to_whatsapp" || t == "whatsapp_status" || t == "website_to_whatsapp"
}

// generateAdVariants builds count clearly different ad variants from templates.
func generateAdVariants(req adGenerateRequest) []map[string]any {
	biz := req.BusinessName
	who := req.Audience
	if who == "" {
		who = "people like you"
	}
	domain := ""
	if req.WebsiteURL != "" {
		if u, err := url.Parse(req.WebsiteURL); err == nil {
			domain = strings.TrimPrefix(u.Hostname(), "www.")
		}
	}
	// When the AI decides, each variant tries a different objective.
	autoTypes := []string{"click_to_whatsapp", "lead_form", "whatsapp_status", "click_to_whatsapp", "lead_form"}
	if domain != "" {
		autoTypes = []string{"click_to_whatsapp", "lead_form", "website_to_whatsapp", "whatsapp_status", "website"}
	}
	audiences := []string{
		who,
		who + " who engaged with your page in the last 30 days",
		"Lookalike (1%) of your WhatsApp contacts",
		who + " within 15 km of your business",
		"Past leads and customers (retargeting)",
	}
	if domain != "" {
		audiences[4] = "People who visited " + domain + " in the last 30 days"
	}
	type tpl struct {
		angle, headline, text, cta string
	}
	templates := []tpl{
		{"Offer", "Exclusive offer from %[1]s", "🎉 Special deal for %[2]s! Get the best of %[1]s at a price you'll love — this week only. %[3]s and claim yours before it's gone.", "Shop now"},
		{"Problem → Solution", "%[1]s makes it easy", "Tired of searching for the right option? %[1]s helps %[2]s get exactly what they need — quickly and without the hassle. %[3]s; we usually reply in minutes.", "Learn more"},
		{"Social proof", "Loved by %[2]s", "⭐⭐⭐⭐⭐ \"Fast, friendly and exactly what I needed.\" Join the customers who trust %[1]s every day. %[3]s and see why they keep coming back.", "Learn more"},
		{"Urgency", "Last few spots at %[1]s", "⏳ Only a few slots left this month! %[2]s are booking fast — don't miss out on %[1]s. %[3]s today to lock in your place.", "Book now"},
		{"Benefits", "Why choose %[1]s?", "✅ Trusted quality  ✅ Quick support  ✅ Honest prices. %[1]s is built for %[2]s. %[3]s and get a personalised answer in minutes.", "Get quote"},
	}
	out := make([]map[string]any, 0, req.Count)
	for i := 0; i < req.Count; i++ {
		t := templates[i%len(templates)]
		adType := req.AdType
		if adType == "" {
			adType = autoTypes[i%len(autoTypes)]
		}
		action := "Visit our website"
		switch {
		case adIsWhatsAppType(adType):
			action = "Tap to chat with us on WhatsApp"
		case adType == "lead_form":
			action = "Fill a quick form and we'll call you back"
		}
		cta := t.cta
		if adIsWhatsAppType(adType) {
			cta = "Send WhatsApp message"
		} else if adType == "lead_form" && (cta == "Shop now" || cta == "Learn more") {
			cta = "Sign up"
		}
		welcome := ""
		if adIsWhatsAppType(adType) {
			welcome = fmt.Sprintf("Hi %s! I saw your ad (%s) and want to know more.", biz, strings.ToLower(t.angle))
		}
		website := ""
		if adType == "website" || adType == "website_to_whatsapp" {
			website = req.WebsiteURL
		}
		out = append(out, map[string]any{
			"id":                 fmt.Sprintf("v%d", i+1),
			"angle":              t.angle,
			"name":               fmt.Sprintf("%s – %s", biz, t.angle),
			"headline":           fmt.Sprintf(t.headline, biz, who),
			"primary_text":       fmt.Sprintf(t.text, biz, who, action),
			"cta":                cta,
			"welcome_message":    welcome,
			"website_url":        website,
			"suggested_ad_type":  adType,
			"suggested_audience": audiences[i%len(audiences)],
			"media_type":         req.MediaType,
			"size":               req.Size,
		})
	}
	return out
}

// GenerateAds creates ad copy variants from a short brief. Each request uses one
// of the organization's free generations.
func (a *App) GenerateAds(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req adGenerateRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	if msg := req.validate(); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	w, err := a.loadAdWallet(a.DB, orgID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load ad credit", nil, "")
	}
	res := a.DB.Model(&models.AdWallet{}).
		Where("id = ? AND free_generations_used < ?", w.ID, adFreeGenerations).
		Update("free_generations_used", gorm.Expr("free_generations_used + 1"))
	if res.Error != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to generate ads", nil, "")
	}
	if res.RowsAffected == 0 {
		return r.SendErrorEnvelope(fasthttp.StatusPaymentRequired,
			"You've used all your free AI ad generations. Create ads manually, or contact us to unlock more generations.", nil, "")
	}
	a.DB.First(w, "id = ?", w.ID)
	return r.SendEnvelope(map[string]any{
		"variants":              generateAdVariants(req),
		"free_generations_left": freeGenerationsLeft(w),
	})
}

// --- Metrics summary ---

// AdsSummary returns headline metrics for the Ads Manager. Optional
// ?from=YYYY-MM-DD&to=YYYY-MM-DD&status=. Spend, impressions and clicks stay 0
// until ads run through Meta.
func (a *App) AdsSummary(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionRead)
	if err != nil {
		return nil
	}
	from, hasFrom := parseDateParam(r, "from")
	to, hasTo := parseDateParam(r, "to")
	if hasTo {
		to = endOfDay(to)
	}
	status := string(r.RequestCtx.QueryArgs().Peek("status"))

	camp := a.DB.Model(&models.AdCampaign{}).Where("organization_id = ?", orgID)
	if status != "" {
		camp = camp.Where("status = ?", status)
	}
	var totals struct {
		Impressions int64
		Clicks      int64
		Spend       float64
		Campaigns   int64
	}
	camp.Session(&gorm.Session{}).
		Select("COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(clicks),0) AS clicks, COALESCE(SUM(spend),0) AS spend, COUNT(*) AS campaigns").
		Scan(&totals)

	leadsQ := a.DB.Model(&models.AdLead{}).Where("organization_id = ?", orgID)
	eventsQ := a.DB.Model(&models.AdEvent{}).Where("organization_id = ?", orgID)
	if hasFrom {
		leadsQ = leadsQ.Where("created_at >= ?", from)
		eventsQ = eventsQ.Where("created_at >= ?", from)
	}
	if hasTo {
		leadsQ = leadsQ.Where("created_at <= ?", to)
		eventsQ = eventsQ.Where("created_at <= ?", to)
	}
	if status != "" {
		ids := a.DB.Model(&models.AdCampaign{}).Select("id").Where("organization_id = ? AND status = ?", orgID, status)
		leadsQ = leadsQ.Where("campaign_id IN (?)", ids)
	}
	var leads, signals int64
	leadsQ.Count(&leads)
	eventsQ.Count(&signals)

	ctr, cpl := 0.0, 0.0
	if totals.Impressions > 0 {
		ctr = math.Round(float64(totals.Clicks)/float64(totals.Impressions)*10000) / 100
	}
	if leads > 0 {
		cpl = math.Round(totals.Spend/float64(leads)*100) / 100
	}
	return r.SendEnvelope(map[string]any{
		"leads":         leads,
		"ctr":           ctr,
		"cost_per_lead": cpl,
		"total_spend":   totals.Spend,
		"capi_signals":  signals,
		"impressions":   totals.Impressions,
		"clicks":        totals.Clicks,
		"campaigns":     totals.Campaigns,
		"currency":      adWalletCurrency,
	})
}

// --- Fetched from Meta / sync ---

const adsNotConnectedMessage = "Connect your Facebook account in Ads Manager → Setup to fetch ads and audiences from Meta."

func (a *App) adsFetched(r *fastglue.Request, key string) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionRead)
	if err != nil {
		return nil
	}
	setup, err := a.loadAdsSetup(orgID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load ads setup", nil, "")
	}
	msg := adsNotConnectedMessage
	if setup.FacebookConnected {
		msg = "Nothing fetched from Meta yet. Use Sync to import from your ad account."
	}
	pg := parsePagination(r)
	resp := listEnvelope(key, []any{}, 0, pg)
	resp["meta_connected"] = setup.FacebookConnected
	resp["message"] = msg
	return r.SendEnvelope(resp)
}

// ListFetchedAds lists ads imported from the connected Meta ad account.
func (a *App) ListFetchedAds(r *fastglue.Request) error { return a.adsFetched(r, "ads") }

// ListFetchedAudiences lists audiences imported from the connected Meta ad account.
func (a *App) ListFetchedAudiences(r *fastglue.Request) error { return a.adsFetched(r, "audiences") }

// SyncAds imports ads, audiences and results from Meta.
func (a *App) SyncAds(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	setup, err := a.loadAdsSetup(orgID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load ads setup", nil, "")
	}
	if !setup.FacebookConnected {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "Connect your Facebook account first", nil, "")
	}
	return r.SendErrorEnvelope(fasthttp.StatusConflict, "Syncing with Meta switches on once the platform's Meta app is approved for ads. Please check back soon.", nil, "")
}

// --- Custom event definitions ---

func (a *App) adEventDefinitionResponse(orgID uuid.UUID, defs []models.AdEventDefinition) []map[string]any {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	names := make([]string, 0, len(defs))
	for _, d := range defs {
		names = append(names, d.Name)
	}
	var stats []struct {
		EventName string
		NToday    int64
		N7        int64
		N30       int64
		Last      *time.Time
	}
	if len(names) > 0 {
		a.DB.Model(&models.AdEvent{}).
			Select("event_name, COUNT(*) FILTER (WHERE created_at >= ?) AS n_today, COUNT(*) FILTER (WHERE created_at >= ?) AS n7, COUNT(*) AS n30, MAX(created_at) AS last",
				today, now.AddDate(0, 0, -7)).
			Where("organization_id = ? AND created_at >= ? AND event_name IN ?", orgID, now.AddDate(0, 0, -30), names).
			Group("event_name").Scan(&stats)
	}
	byName := map[string]int{}
	for i, s := range stats {
		byName[s.EventName] = i
	}
	out := make([]map[string]any, 0, len(defs))
	for _, d := range defs {
		row := map[string]any{
			"id": d.ID, "name": d.Name, "description": d.Description, "source": d.Source, "created_at": d.CreatedAt,
			"count_today": int64(0), "count_7d": int64(0), "count_30d": int64(0), "last_seen_at": nil,
		}
		if i, ok := byName[d.Name]; ok {
			row["count_today"], row["count_7d"], row["count_30d"], row["last_seen_at"] = stats[i].NToday, stats[i].N7, stats[i].N30, stats[i].Last
		}
		out = append(out, row)
	}
	return out
}

// ListAdEventDefinitions lists the org's custom events with counts. Optional ?search=.
func (a *App) ListAdEventDefinitions(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionRead)
	if err != nil {
		return nil
	}
	q := a.DB.Where("organization_id = ?", orgID)
	if s := strings.TrimSpace(string(r.RequestCtx.QueryArgs().Peek("search"))); s != "" {
		q = q.Where("name ILIKE ?", "%"+s+"%")
	}
	defs := []models.AdEventDefinition{}
	if err := q.Order("created_at DESC").Find(&defs).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list events", nil, "")
	}
	out := a.adEventDefinitionResponse(orgID, defs)
	return r.SendEnvelope(map[string]any{"events": out, "total": len(out)})
}

// CreateAdEventDefinition adds a custom event to track.
func (a *App) CreateAdEventDefinition(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Source      string `json:"source"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	d := models.AdEventDefinition{
		OrganizationID: orgID, Name: strings.TrimSpace(req.Name),
		Description: strings.TrimSpace(req.Description), Source: strings.ToLower(strings.TrimSpace(req.Source)),
	}
	if d.Source == "" {
		d.Source = "server"
	}
	switch {
	case d.Name == "":
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Event name is required", nil, "")
	case !adEventNamePattern.MatchString(d.Name):
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Event name must start with a letter and use only letters, numbers and underscores (max 50)", nil, "")
	case !adEventSources[d.Source]:
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Source must be website, whatsapp, server or offline", nil, "")
	case len(d.Description) > 500:
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Description must be 500 characters or fewer", nil, "")
	}
	var exists int64
	a.DB.Model(&models.AdEventDefinition{}).Where("organization_id = ? AND LOWER(name) = LOWER(?)", orgID, d.Name).Count(&exists)
	if exists > 0 {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "An event with this name already exists", nil, "")
	}
	if err := a.DB.Create(&d).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save event", nil, "")
	}
	return r.SendEnvelope(a.adEventDefinitionResponse(orgID, []models.AdEventDefinition{d})[0])
}

// DeleteAdEventDefinition stops tracking a custom event (recorded events are kept).
func (a *App) DeleteAdEventDefinition(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	d, err := adsFind[models.AdEventDefinition](a, r, orgID, "Event")
	if err != nil {
		return nil
	}
	if err := a.DB.Unscoped().Delete(d).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete event", nil, "")
	}
	return r.SendEnvelope(map[string]any{"success": true})
}

// RecordAdEvent records one occurrence of a standard or custom event
// (e.g. from your website or server). Body: {event_name, value?, currency?, contact_name?}.
func (a *App) RecordAdEvent(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req struct {
		EventName   string  `json:"event_name"`
		Value       float64 `json:"value"`
		Currency    string  `json:"currency"`
		ContactName string  `json:"contact_name"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	name := strings.TrimSpace(req.EventName)
	known := false
	for _, e := range adStandardEvents {
		if e.Name == name {
			known = true
		}
	}
	if !known {
		var n int64
		a.DB.Model(&models.AdEventDefinition{}).Where("organization_id = ? AND name = ?", orgID, name).Count(&n)
		known = n > 0
	}
	if !known {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Unknown event. Create it in Ads Manager → Events first.", nil, "")
	}
	if req.Value < 0 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Value cannot be negative", nil, "")
	}
	cur := strings.ToUpper(strings.TrimSpace(req.Currency))
	if cur == "" {
		cur = adWalletCurrency
	}
	if !validCurrency(cur) {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Currency must be a 3-letter code such as INR", nil, "")
	}
	ev := models.AdEvent{OrganizationID: orgID, EventName: name, Value: req.Value, Currency: cur, ContactName: strings.TrimSpace(req.ContactName)}
	if err := a.DB.Create(&ev).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to record event", nil, "")
	}
	return r.SendEnvelope(ev)
}
