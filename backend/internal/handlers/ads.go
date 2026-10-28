package handlers

import (
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"

	"github.com/shridarpatil/whatomate/internal/models"
)

// Ads Manager API. Viewing needs campaigns:read, changing needs campaigns:write.
// Everything is stored locally; calls to Meta's Marketing API (Facebook
// connect, launching ads, syncing leads) are switched on once the platform's
// Meta app is approved for ads, and until then those actions answer 409 with
// an explanation.

var (
	adTypes           = map[string]bool{"click_to_whatsapp": true, "whatsapp_status": true, "website_to_whatsapp": true, "website": true, "lead_form": true}
	adQuestionTypes   = map[string]bool{"full_name": true, "phone": true, "email": true, "city": true, "short_text": true}
	adAudienceSources = map[string]bool{"all_contacts": true, "contacts_tag": true, "leads": true}
	adStandardEvents  = []struct{ Name, Description string }{
		{"Lead", "Someone filled in a lead form or became a lead from an ad"},
		{"ConversationStarted", "Someone opened a WhatsApp chat from a Click-to-WhatsApp ad"},
		{"AddToCart", "Someone added a product to their cart"},
		{"InitiateCheckout", "Someone started checking out"},
		{"Purchase", "Someone completed a purchase"},
	}
)

func (a *App) adsMetaReady() bool {
	appID, secret, configID := a.platformMetaCreds(a.loadPlatformConfig())
	return appID != "" && secret != "" && configID != ""
}

func (a *App) loadAdsSetup(orgID uuid.UUID) (*models.AdsSetup, error) {
	var setup models.AdsSetup
	err := a.DB.Where("organization_id = ?", orgID).
		Attrs(models.AdsSetup{OrganizationID: orgID}).FirstOrInit(&setup).Error
	return &setup, err
}

func (a *App) adsSetupResponse(setup *models.AdsSetup) map[string]any {
	return map[string]any{
		"facebook_connected":     setup.FacebookConnected,
		"facebook_user_name":     setup.FacebookUserName,
		"page_id":                setup.PageID,
		"page_name":              setup.PageName,
		"whatsapp_account":       setup.WhatsAppAccount,
		"lead_terms_accepted":    setup.LeadTermsAcceptedAt != nil,
		"lead_terms_accepted_at": setup.LeadTermsAcceptedAt,
		"ad_credit":              setup.AdCredit,
		"currency":               a.loadPlatformConfig().DefaultCurrency,
		"meta_ready":             a.adsMetaReady(),
		"steps": map[string]bool{
			"connect_facebook": setup.FacebookConnected,
			"select_page":      setup.PageID != "",
			"link_whatsapp":    setup.WhatsAppAccount != "",
			"accept_terms":     setup.LeadTermsAcceptedAt != nil,
		},
	}
}

// --- Setup ---

// GetAdsSetup returns the Ads Manager setup progress.
func (a *App) GetAdsSetup(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionRead)
	if err != nil {
		return nil
	}
	setup, err := a.loadAdsSetup(orgID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load ads setup", nil, "")
	}
	return r.SendEnvelope(a.adsSetupResponse(setup))
}

// ConnectAdsFacebook starts connecting the business's Facebook account for ads.
func (a *App) ConnectAdsFacebook(r *fastglue.Request) error {
	if _, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite); err != nil {
		return nil
	}
	if !a.adsMetaReady() {
		return r.SendErrorEnvelope(fasthttp.StatusConflict,
			"Connecting Facebook needs the platform's Meta app. Ask the platform owner to set it up in Super Admin → Configuration → Signup settings.", nil, "")
	}
	return r.SendErrorEnvelope(fasthttp.StatusConflict,
		"Facebook connection for ads switches on once the platform's Meta app is approved for ads (ads_management, leads_retrieval). Please check back soon.", nil, "")
}

// DisconnectAdsFacebook forgets the connected Facebook account and page.
func (a *App) DisconnectAdsFacebook(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	setup, err := a.loadAdsSetup(orgID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update ads setup", nil, "")
	}
	setup.FacebookConnected, setup.FacebookUserName, setup.FacebookAccessTokenEnc = false, "", ""
	setup.PageID, setup.PageName = "", ""
	if err := a.DB.Save(setup).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update ads setup", nil, "")
	}
	return r.SendEnvelope(a.adsSetupResponse(setup))
}

// UpdateAdsSetup sets the ad page and/or the WhatsApp number ads land on.
func (a *App) UpdateAdsSetup(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req struct {
		PageID          *string `json:"page_id"`
		PageName        *string `json:"page_name"`
		WhatsAppAccount *string `json:"whatsapp_account"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	setup, err := a.loadAdsSetup(orgID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update ads setup", nil, "")
	}
	if req.PageID != nil {
		if *req.PageID != "" && !setup.FacebookConnected {
			return r.SendErrorEnvelope(fasthttp.StatusConflict, "Connect your Facebook account first", nil, "")
		}
		setup.PageID = strings.TrimSpace(*req.PageID)
		if req.PageName != nil {
			setup.PageName = strings.TrimSpace(*req.PageName)
		}
	}
	if req.WhatsAppAccount != nil {
		name := strings.TrimSpace(*req.WhatsAppAccount)
		if name != "" {
			var count int64
			a.DB.Model(&models.WhatsAppAccount{}).Where("organization_id = ? AND name = ?", orgID, name).Count(&count)
			if count == 0 {
				return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "That WhatsApp number isn't connected to this workspace", nil, "")
			}
		}
		setup.WhatsAppAccount = name
	}
	if err := a.DB.Save(setup).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update ads setup", nil, "")
	}
	return r.SendEnvelope(a.adsSetupResponse(setup))
}

// AcceptAdsLeadTerms records acceptance of Meta's Lead Form ads terms.
func (a *App) AcceptAdsLeadTerms(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	setup, err := a.loadAdsSetup(orgID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update ads setup", nil, "")
	}
	now := time.Now()
	setup.LeadTermsAcceptedAt = &now
	if err := a.DB.Save(setup).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update ads setup", nil, "")
	}
	return r.SendEnvelope(a.adsSetupResponse(setup))
}

// --- Campaigns (ads) ---

type adCampaignRequest struct {
	Name        *string       `json:"name"`
	Type        *string       `json:"type"`
	DailyBudget *float64      `json:"daily_budget"`
	Currency    *string       `json:"currency"`
	StartDate   *string       `json:"start_date"`
	EndDate     *string       `json:"end_date"`
	AudienceID  *string       `json:"audience_id"`
	FormID      *string       `json:"form_id"`
	Creative    *models.JSONB `json:"creative"`
}

// optionalOrgRef parses an optional id that must belong to orgID in table.
func (a *App) optionalOrgRef(value *string, orgID uuid.UUID, model any) (*uuid.UUID, bool) {
	if value == nil || *value == "" {
		return nil, true
	}
	id, err := uuid.Parse(*value)
	if err != nil {
		return nil, false
	}
	var count int64
	a.DB.Model(model).Where("id = ? AND organization_id = ?", id, orgID).Count(&count)
	return &id, count > 0
}

func parseOptionalDate(s *string) (*time.Time, bool) {
	if s == nil || *s == "" {
		return nil, true
	}
	t, ok := parseFlexibleDate(*s)
	return &t, ok
}

func (a *App) applyAdCampaign(req *adCampaignRequest, c *models.AdCampaign, orgID uuid.UUID) string {
	if req.Name != nil {
		c.Name = strings.TrimSpace(*req.Name)
	}
	if req.Type != nil {
		c.Type = *req.Type
	}
	if req.DailyBudget != nil {
		c.DailyBudget = *req.DailyBudget
	}
	if req.Currency != nil && *req.Currency != "" {
		c.Currency = strings.ToUpper(strings.TrimSpace(*req.Currency))
	}
	if req.Creative != nil {
		c.Creative = *req.Creative
	}
	if req.StartDate != nil {
		t, ok := parseOptionalDate(req.StartDate)
		if !ok {
			return "Start date must be a date such as 2026-11-01"
		}
		c.StartDate = t
	}
	if req.EndDate != nil {
		t, ok := parseOptionalDate(req.EndDate)
		if !ok {
			return "End date must be a date such as 2026-11-30"
		}
		c.EndDate = t
	}
	if req.AudienceID != nil {
		id, ok := a.optionalOrgRef(req.AudienceID, orgID, &models.AdAudience{})
		if !ok {
			return "Audience not found"
		}
		c.AudienceID = id
	}
	if req.FormID != nil {
		id, ok := a.optionalOrgRef(req.FormID, orgID, &models.AdLeadForm{})
		if !ok {
			return "Lead form not found"
		}
		c.FormID = id
	}
	switch {
	case c.Name == "":
		return "Ad name is required"
	case !adTypes[c.Type]:
		return "Ad type must be click_to_whatsapp, whatsapp_status, website_to_whatsapp, website or lead_form"
	case c.DailyBudget < 0:
		return "Daily budget cannot be negative"
	case !validCurrency(c.Currency):
		return "Currency must be a 3-letter code such as INR"
	case c.StartDate != nil && c.EndDate != nil && c.EndDate.Before(*c.StartDate):
		return "End date must be after the start date"
	}
	if c.Creative == nil {
		c.Creative = models.JSONB{}
	}
	return ""
}

// ListAdCampaigns lists ads. Optional ?type=&status=&search=.
func (a *App) ListAdCampaigns(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionRead)
	if err != nil {
		return nil
	}
	q := a.DB.Where("organization_id = ?", orgID)
	if t := string(r.RequestCtx.QueryArgs().Peek("type")); t != "" {
		q = q.Where("type = ?", t)
	}
	if s := string(r.RequestCtx.QueryArgs().Peek("status")); s != "" {
		q = q.Where("status = ?", s)
	}
	if s := strings.TrimSpace(string(r.RequestCtx.QueryArgs().Peek("search"))); s != "" {
		q = q.Where("name ILIKE ?", "%"+s+"%")
	}
	campaigns := []models.AdCampaign{}
	if err := q.Order("created_at DESC").Find(&campaigns).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list ads", nil, "")
	}
	return r.SendEnvelope(map[string]any{"campaigns": campaigns, "total": len(campaigns)})
}

// CreateAdCampaign saves a new ad as a draft.
func (a *App) CreateAdCampaign(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req adCampaignRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	c := models.AdCampaign{OrganizationID: orgID, Status: "draft", Currency: a.loadPlatformConfig().DefaultCurrency, CreatedByID: &userID}
	if msg := a.applyAdCampaign(&req, &c, orgID); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	if err := a.DB.Create(&c).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save ad", nil, "")
	}
	return r.SendEnvelope(c)
}

// UpdateAdCampaign edits an ad. Status only changes through launch.
func (a *App) UpdateAdCampaign(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	c, err := adsFind[models.AdCampaign](a, r, orgID, "Ad")
	if err != nil {
		return nil
	}
	var req adCampaignRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	if msg := a.applyAdCampaign(&req, c, orgID); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	if err := a.DB.Save(c).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save ad", nil, "")
	}
	return r.SendEnvelope(c)
}

// DeleteAdCampaign deletes an ad that isn't running.
func (a *App) DeleteAdCampaign(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	c, err := adsFind[models.AdCampaign](a, r, orgID, "Ad")
	if err != nil {
		return nil
	}
	if c.Status == "active" {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "Pause this ad before deleting it", nil, "")
	}
	if err := a.DB.Delete(c).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete ad", nil, "")
	}
	return r.SendEnvelope(map[string]any{"success": true})
}

// LaunchAdCampaign publishes an ad to Meta. It explains what is missing first.
func (a *App) LaunchAdCampaign(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	c, err := adsFind[models.AdCampaign](a, r, orgID, "Ad")
	if err != nil {
		return nil
	}
	setup, err := a.loadAdsSetup(orgID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load ads setup", nil, "")
	}
	var missing []string
	if !setup.FacebookConnected {
		missing = append(missing, "connect your Facebook account")
	}
	if setup.PageID == "" {
		missing = append(missing, "choose your Facebook page")
	}
	if setup.WhatsAppAccount == "" && c.Type != "website" {
		missing = append(missing, "link a WhatsApp number")
	}
	if c.Type == "lead_form" {
		if setup.LeadTermsAcceptedAt == nil {
			missing = append(missing, "accept the Lead Form terms")
		}
		if c.FormID == nil {
			missing = append(missing, "pick a lead form for this ad")
		}
	}
	if len(missing) > 0 {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "Before launching, "+strings.Join(missing, ", ")+" (Ads Manager → Setup).", nil, "")
	}
	return r.SendErrorEnvelope(fasthttp.StatusConflict, "Launching ads switches on once the platform's Meta app is approved for ads. Your ad is saved as a draft.", nil, "")
}

// --- Lead forms ---

type adFormRequest struct {
	Name            *string           `json:"name"`
	Headline        *string           `json:"headline"`
	Description     *string           `json:"description"`
	Questions       *[]map[string]any `json:"questions"`
	PrivacyURL      *string           `json:"privacy_url"`
	ThankYouMessage *string           `json:"thank_you_message"`
	Status          *string           `json:"status"`
}

func applyAdForm(req *adFormRequest, f *models.AdLeadForm) string {
	set := func(dst *string, src *string) {
		if src != nil {
			*dst = strings.TrimSpace(*src)
		}
	}
	set(&f.Name, req.Name)
	set(&f.Headline, req.Headline)
	set(&f.Description, req.Description)
	set(&f.PrivacyURL, req.PrivacyURL)
	set(&f.ThankYouMessage, req.ThankYouMessage)
	if req.Status != nil {
		f.Status = *req.Status
	}
	if req.Questions != nil {
		qs := models.JSONBArray{}
		seen := map[string]bool{}
		for _, q := range *req.Questions {
			key, _ := q["key"].(string)
			label, _ := q["label"].(string)
			typ, _ := q["type"].(string)
			key, label = strings.TrimSpace(key), strings.TrimSpace(label)
			if key == "" || label == "" || !adQuestionTypes[typ] || seen[key] {
				return "Each question needs a unique key, a label and a type (full_name, phone, email, city or short_text)"
			}
			seen[key] = true
			qs = append(qs, map[string]any{"key": key, "label": label, "type": typ})
		}
		f.Questions = qs
	}
	if f.Questions == nil {
		f.Questions = models.JSONBArray{}
	}
	switch {
	case f.Name == "":
		return "Form name is required"
	case f.Status != "draft" && f.Status != "published":
		return "Status must be draft or published"
	case f.PrivacyURL != "" && !validWebURL(f.PrivacyURL):
		return "Privacy policy link must start with http:// or https://"
	case f.Status == "published" && len(f.Questions) == 0:
		return "Add at least one question before publishing"
	case f.Status == "published" && f.PrivacyURL == "":
		return "A privacy policy link is required before publishing"
	}
	return ""
}

// ListAdForms lists lead forms with their lead counts.
func (a *App) ListAdForms(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionRead)
	if err != nil {
		return nil
	}
	forms := []models.AdLeadForm{}
	if err := a.DB.Where("organization_id = ?", orgID).Order("created_at DESC").Find(&forms).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list forms", nil, "")
	}
	var counts []struct {
		FormID uuid.UUID
		N      int64
	}
	a.DB.Model(&models.AdLead{}).Select("form_id, COUNT(*) AS n").
		Where("organization_id = ? AND form_id IS NOT NULL", orgID).Group("form_id").Scan(&counts)
	byForm := map[uuid.UUID]int64{}
	for _, c := range counts {
		byForm[c.FormID] = c.N
	}
	out := make([]map[string]any, 0, len(forms))
	for _, f := range forms {
		out = append(out, map[string]any{
			"id": f.ID, "name": f.Name, "headline": f.Headline, "description": f.Description, "questions": f.Questions,
			"privacy_url": f.PrivacyURL, "thank_you_message": f.ThankYouMessage, "status": f.Status,
			"leads_count": byForm[f.ID], "created_at": f.CreatedAt,
		})
	}
	return r.SendEnvelope(map[string]any{"forms": out})
}

// CreateAdForm creates a lead form (draft by default).
func (a *App) CreateAdForm(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req adFormRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	f := models.AdLeadForm{OrganizationID: orgID, Status: "draft"}
	if msg := applyAdForm(&req, &f); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	if err := a.DB.Create(&f).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save form", nil, "")
	}
	return r.SendEnvelope(f)
}

// UpdateAdForm edits a lead form, including publishing it.
func (a *App) UpdateAdForm(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	f, err := adsFind[models.AdLeadForm](a, r, orgID, "Form")
	if err != nil {
		return nil
	}
	var req adFormRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	if msg := applyAdForm(&req, f); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	if err := a.DB.Save(f).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save form", nil, "")
	}
	return r.SendEnvelope(f)
}

// DeleteAdForm deletes a lead form no ad uses.
func (a *App) DeleteAdForm(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	f, err := adsFind[models.AdLeadForm](a, r, orgID, "Form")
	if err != nil {
		return nil
	}
	var inUse int64
	a.DB.Model(&models.AdCampaign{}).Where("form_id = ?", f.ID).Count(&inUse)
	if inUse > 0 {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "An ad uses this form. Change or delete that ad first.", nil, "")
	}
	if err := a.DB.Delete(f).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete form", nil, "")
	}
	return r.SendEnvelope(map[string]any{"success": true})
}

// --- Leads ---

type adLeadRow struct {
	models.AdLead
	CampaignName string `json:"campaign_name"`
	FormName     string `json:"form_name"`
}

// ListAdLeads lists leads. Optional ?search=&form_id=&source=&page=&limit=.
func (a *App) ListAdLeads(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionRead)
	if err != nil {
		return nil
	}
	pg := parsePagination(r)
	q := a.DB.Table("ad_leads l").Where("l.organization_id = ? AND l.deleted_at IS NULL", orgID)
	if s := strings.TrimSpace(string(r.RequestCtx.QueryArgs().Peek("search"))); s != "" {
		like := "%" + s + "%"
		q = q.Where("(l.name ILIKE ? OR l.phone ILIKE ? OR l.email ILIKE ?)", like, like, like)
	}
	if s := string(r.RequestCtx.QueryArgs().Peek("source")); s != "" {
		q = q.Where("l.source = ?", s)
	}
	if s := string(r.RequestCtx.QueryArgs().Peek("form_id")); s != "" {
		if id, err := uuid.Parse(s); err == nil {
			q = q.Where("l.form_id = ?", id)
		}
	}
	var total int64
	q.Count(&total)
	leads := []adLeadRow{}
	if err := pg.Apply(q.Select("l.*, c.name AS campaign_name, f.name AS form_name").
		Joins("LEFT JOIN ad_campaigns c ON c.id = l.campaign_id").
		Joins("LEFT JOIN ad_lead_forms f ON f.id = l.form_id").
		Order("l.created_at DESC")).Scan(&leads).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list leads", nil, "")
	}
	return r.SendEnvelope(listEnvelope("leads", leads, total, pg))
}

// CreateAdLead adds a lead by hand (the same path Meta lead sync will use later).
func (a *App) CreateAdLead(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req struct {
		Name    string       `json:"name"`
		Phone   string       `json:"phone"`
		Email   string       `json:"email"`
		FormID  *string      `json:"form_id"`
		Answers models.JSONB `json:"answers"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	lead := models.AdLead{
		OrganizationID: orgID, Name: strings.TrimSpace(req.Name), Phone: digitsOnly(req.Phone),
		Email: strings.ToLower(strings.TrimSpace(req.Email)), Source: "manual", Answers: req.Answers,
	}
	switch {
	case lead.Name == "" && lead.Phone == "":
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "A name or phone number is required", nil, "")
	case lead.Phone != "" && (len(lead.Phone) < 8 || len(lead.Phone) > 15):
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Phone number must be 8–15 digits with the country code", nil, "")
	case lead.Email != "" && !validEmail(lead.Email):
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Email is not a valid email address", nil, "")
	}
	id, ok := a.optionalOrgRef(req.FormID, orgID, &models.AdLeadForm{})
	if !ok {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Lead form not found", nil, "")
	}
	lead.FormID = id
	if lead.Answers == nil {
		lead.Answers = models.JSONB{}
	}
	txErr := a.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&lead).Error; err != nil {
			return err
		}
		return tx.Create(&models.AdEvent{OrganizationID: orgID, EventName: "Lead", ContactName: lead.Name}).Error
	})
	if txErr != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save lead", nil, "")
	}
	return r.SendEnvelope(lead)
}

// DeleteAdLead deletes a lead.
func (a *App) DeleteAdLead(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	lead, err := adsFind[models.AdLead](a, r, orgID, "Lead")
	if err != nil {
		return nil
	}
	if err := a.DB.Delete(lead).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete lead", nil, "")
	}
	return r.SendEnvelope(map[string]any{"success": true})
}

// AdLeadToContact links a lead to a contact, creating the contact if needed.
func (a *App) AdLeadToContact(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	if !a.HasPermission(r.RequestCtx.UserValue("user_id").(uuid.UUID), models.ResourceContacts, models.ActionWrite, orgID) {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "You need permission to add contacts", nil, "")
	}
	lead, err := adsFind[models.AdLead](a, r, orgID, "Lead")
	if err != nil {
		return nil
	}
	if lead.Phone == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "This lead has no phone number", nil, "")
	}
	var contact models.Contact
	err = a.DB.Where("organization_id = ? AND phone_number = ?", orgID, lead.Phone).First(&contact).Error
	if err != nil {
		setup, _ := a.loadAdsSetup(orgID)
		contact = models.Contact{
			OrganizationID: orgID, PhoneNumber: lead.Phone, ProfileName: lead.Name, WhatsAppAccount: setup.WhatsAppAccount,
			Tags: models.JSONBArray{"Ad lead"}, Metadata: models.JSONB{"source": "ads", "email": lead.Email},
		}
		if err := a.DB.Create(&contact).Error; err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to create contact", nil, "")
		}
	}
	lead.ContactID = &contact.ID
	a.DB.Model(lead).Update("contact_id", contact.ID)
	return r.SendEnvelope(map[string]any{"contact_id": contact.ID})
}

// --- Audiences ---

func (a *App) adAudienceSize(orgID uuid.UUID, aud *models.AdAudience) int64 {
	var n int64
	switch aud.Source {
	case "all_contacts":
		a.DB.Model(&models.Contact{}).Where("organization_id = ?", orgID).Count(&n)
	case "contacts_tag":
		if len(aud.Tags) > 0 {
			a.DB.Model(&models.Contact{}).Where("organization_id = ? AND jsonb_exists_any(tags, ARRAY[?])", orgID, []string(aud.Tags)).Count(&n)
		}
	case "leads":
		a.DB.Model(&models.AdLead{}).Where("organization_id = ?", orgID).Count(&n)
	}
	return n
}

type adAudienceRequest struct {
	Name        *string   `json:"name"`
	Source      *string   `json:"source"`
	Tags        *[]string `json:"tags"`
	Description *string   `json:"description"`
}

func applyAdAudience(req *adAudienceRequest, aud *models.AdAudience) string {
	if req.Name != nil {
		aud.Name = strings.TrimSpace(*req.Name)
	}
	if req.Source != nil {
		aud.Source = *req.Source
	}
	if req.Description != nil {
		aud.Description = strings.TrimSpace(*req.Description)
	}
	if req.Tags != nil {
		tags := models.StringArray{}
		for _, t := range *req.Tags {
			if t = strings.TrimSpace(t); t != "" {
				tags = append(tags, t)
			}
		}
		aud.Tags = tags
	}
	if aud.Tags == nil {
		aud.Tags = models.StringArray{}
	}
	switch {
	case aud.Name == "":
		return "Audience name is required"
	case !adAudienceSources[aud.Source]:
		return "Source must be all_contacts, contacts_tag or leads"
	case aud.Source == "contacts_tag" && len(aud.Tags) == 0:
		return "Pick at least one tag"
	}
	return ""
}

func (a *App) adAudienceResponse(orgID uuid.UUID, aud *models.AdAudience) map[string]any {
	return map[string]any{
		"id": aud.ID, "name": aud.Name, "source": aud.Source, "tags": aud.Tags, "description": aud.Description,
		"size": a.adAudienceSize(orgID, aud), "created_at": aud.CreatedAt,
	}
}

// ListAdAudiences lists audiences with their current size.
func (a *App) ListAdAudiences(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionRead)
	if err != nil {
		return nil
	}
	var audiences []models.AdAudience
	if err := a.DB.Where("organization_id = ?", orgID).Order("created_at DESC").Find(&audiences).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list audiences", nil, "")
	}
	out := make([]map[string]any, 0, len(audiences))
	for i := range audiences {
		out = append(out, a.adAudienceResponse(orgID, &audiences[i]))
	}
	return r.SendEnvelope(map[string]any{"audiences": out})
}

// CreateAdAudience creates an audience.
func (a *App) CreateAdAudience(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req adAudienceRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	aud := models.AdAudience{OrganizationID: orgID}
	if msg := applyAdAudience(&req, &aud); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	if err := a.DB.Create(&aud).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save audience", nil, "")
	}
	return r.SendEnvelope(a.adAudienceResponse(orgID, &aud))
}

// UpdateAdAudience edits an audience.
func (a *App) UpdateAdAudience(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	aud, err := adsFind[models.AdAudience](a, r, orgID, "Audience")
	if err != nil {
		return nil
	}
	var req adAudienceRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	if msg := applyAdAudience(&req, aud); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	if err := a.DB.Save(aud).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save audience", nil, "")
	}
	return r.SendEnvelope(a.adAudienceResponse(orgID, aud))
}

// DeleteAdAudience deletes an audience no ad uses.
func (a *App) DeleteAdAudience(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionWrite)
	if err != nil {
		return nil
	}
	aud, err := adsFind[models.AdAudience](a, r, orgID, "Audience")
	if err != nil {
		return nil
	}
	var inUse int64
	a.DB.Model(&models.AdCampaign{}).Where("audience_id = ?", aud.ID).Count(&inUse)
	if inUse > 0 {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "An ad targets this audience. Change or delete that ad first.", nil, "")
	}
	if err := a.DB.Delete(aud).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete audience", nil, "")
	}
	return r.SendEnvelope(map[string]any{"success": true})
}

// --- Events ---

// ListAdEvents returns counts per standard event and the latest events.
func (a *App) ListAdEvents(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionRead)
	if err != nil {
		return nil
	}
	now := time.Now()
	var stats []struct {
		EventName string
		N7        int64
		N30       int64
		Last      *time.Time
	}
	a.DB.Model(&models.AdEvent{}).
		Select("event_name, COUNT(*) FILTER (WHERE created_at >= ?) AS n7, COUNT(*) AS n30, MAX(created_at) AS last", now.AddDate(0, 0, -7)).
		Where("organization_id = ? AND created_at >= ?", orgID, now.AddDate(0, 0, -30)).
		Group("event_name").Scan(&stats)
	byName := map[string]int{}
	for i, s := range stats {
		byName[s.EventName] = i
	}
	events := make([]map[string]any, 0, len(adStandardEvents))
	for _, e := range adStandardEvents {
		row := map[string]any{"name": e.Name, "description": e.Description, "count_7d": 0, "count_30d": 0, "last_seen_at": nil}
		if i, ok := byName[e.Name]; ok {
			row["count_7d"], row["count_30d"], row["last_seen_at"] = stats[i].N7, stats[i].N30, stats[i].Last
		}
		events = append(events, row)
	}
	var recent []struct {
		models.AdEvent
		CampaignName string `json:"campaign_name"`
	}
	a.DB.Table("ad_events e").Select("e.*, c.name AS campaign_name").
		Joins("LEFT JOIN ad_campaigns c ON c.id = e.campaign_id").
		Where("e.organization_id = ?", orgID).Order("e.created_at DESC").Limit(50).Scan(&recent)
	if recent == nil {
		recent = []struct {
			models.AdEvent
			CampaignName string `json:"campaign_name"`
		}{}
	}
	return r.SendEnvelope(map[string]any{"events": events, "recent": recent})
}

// --- helpers ---

// adsFind loads a record of T by the {id} path param within orgID, sending 400/404 itself.
func adsFind[T any](a *App, r *fastglue.Request, orgID uuid.UUID, label string) (*T, error) {
	id, err := parsePathUUID(r, "id", strings.ToLower(label))
	if err != nil {
		return nil, err
	}
	return findByIDAndOrg[T](a.DB, r, id, orgID, label)
}

func digitsOnly(s string) string {
	var b strings.Builder
	for _, c := range s {
		if c >= '0' && c <= '9' {
			b.WriteRune(c)
		}
	}
	return b.String()
}
