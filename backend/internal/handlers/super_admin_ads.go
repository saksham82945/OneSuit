package handlers

import (
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"

	"github.com/shridarpatil/whatomate/internal/models"
)

// Super admin Ads Manager: every ad every client runs, the Facebook page each
// client connected, and controls to pause, resume, end or delete ads and to
// disconnect a client's page.

// SuperAdminAd is an ad with the client it belongs to.
type SuperAdminAd struct {
	ID             uuid.UUID  `json:"id"`
	OrganizationID uuid.UUID  `json:"organization_id"`
	ClientName     string     `json:"client_name"`
	PageName       string     `json:"page_name"`
	Name           string     `json:"name"`
	Type           string     `json:"type"`
	Status         string     `json:"status"`
	DailyBudget    float64    `json:"daily_budget"`
	Currency       string     `json:"currency"`
	StartDate      *time.Time `json:"start_date"`
	EndDate        *time.Time `json:"end_date"`
	Impressions    int64      `json:"impressions"`
	Clicks         int64      `json:"clicks"`
	Leads          int64      `json:"leads"`
	Spend          float64    `json:"spend"`
	CreatedByName  string     `json:"created_by_name"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// SuperAdminAdClient is one client's ads setup: its Facebook page and totals.
type SuperAdminAdClient struct {
	OrganizationID    uuid.UUID `json:"organization_id"`
	ClientName        string    `json:"client_name"`
	FacebookConnected bool      `json:"facebook_connected"`
	FacebookUserName  string    `json:"facebook_user_name"`
	PageID            string    `json:"page_id"`
	PageName          string    `json:"page_name"`
	WhatsAppAccount   string    `json:"whatsapp_account"`
	Ads               int64     `json:"ads"`
	ActiveAds         int64     `json:"active_ads"`
	Spend             float64   `json:"spend"`
	Leads             int64     `json:"leads"`
	WalletBalance     float64   `json:"wallet_balance"`
}

// SuperAdminListAds returns every client's ads, each client's page and totals
// (GET /api/super-admin/ads). Optional ?status=, ?org_id= and ?search=.
func (a *App) SuperAdminListAds(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	args := r.RequestCtx.QueryArgs()
	demoID := a.demoOrgID()

	q := a.DB.Table("ad_campaigns c").
		Select(`c.id, c.organization_id, o.name AS client_name, COALESCE(s.page_name, '') AS page_name, c.name, c.type,
			c.status, c.daily_budget, c.currency, c.start_date, c.end_date, c.impressions, c.clicks, c.leads, c.spend,
			COALESCE(u.full_name, '') AS created_by_name, c.created_at, c.updated_at`).
		Joins("JOIN organizations o ON o.id = c.organization_id AND o.deleted_at IS NULL").
		Joins("LEFT JOIN ads_setups s ON s.organization_id = c.organization_id AND s.deleted_at IS NULL").
		Joins("LEFT JOIN users u ON u.id = c.created_by_id").
		Where("c.deleted_at IS NULL AND c.organization_id <> ?", demoID)
	if s := string(args.Peek("status")); s != "" {
		q = q.Where("c.status = ?", s)
	}
	if id, err := uuid.Parse(string(args.Peek("org_id"))); err == nil {
		q = q.Where("c.organization_id = ?", id)
	}
	if s := strings.TrimSpace(string(args.Peek("search"))); s != "" {
		like := "%" + strings.ToLower(s) + "%"
		q = q.Where("LOWER(c.name) LIKE ? OR LOWER(o.name) LIKE ? OR LOWER(COALESCE(s.page_name, '')) LIKE ?", like, like, like)
	}
	ads := []SuperAdminAd{}
	if err := q.Order("c.updated_at DESC").Limit(500).Scan(&ads).Error; err != nil {
		a.Log.Error("Super admin ads list failed", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load ads", nil, "")
	}

	// One row per client that set up ads or created an ad.
	clients := []SuperAdminAdClient{}
	if err := a.DB.Raw(`
		SELECT o.id AS organization_id, o.name AS client_name,
			COALESCE(s.facebook_connected, false) AS facebook_connected, COALESCE(s.facebook_user_name, '') AS facebook_user_name,
			COALESCE(s.page_id, '') AS page_id, COALESCE(s.page_name, '') AS page_name, COALESCE(s.whats_app_account, '') AS whats_app_account,
			COALESCE(c.ads, 0) AS ads, COALESCE(c.active_ads, 0) AS active_ads, COALESCE(c.spend, 0) AS spend, COALESCE(c.leads, 0) AS leads,
			COALESCE(w.balance, 0) AS wallet_balance
		FROM organizations o
		LEFT JOIN ads_setups s ON s.organization_id = o.id AND s.deleted_at IS NULL
		LEFT JOIN (
			SELECT organization_id, COUNT(*) AS ads, COUNT(*) FILTER (WHERE status = 'active') AS active_ads,
				SUM(spend) AS spend, SUM(leads) AS leads
			FROM ad_campaigns WHERE deleted_at IS NULL GROUP BY organization_id
		) c ON c.organization_id = o.id
		LEFT JOIN ad_wallets w ON w.organization_id = o.id AND w.deleted_at IS NULL
		WHERE o.deleted_at IS NULL AND o.id <> ? AND (s.id IS NOT NULL OR c.ads > 0)
		ORDER BY o.name ASC`, demoID).Scan(&clients).Error; err != nil {
		a.Log.Error("Super admin ads clients failed", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load ads", nil, "")
	}
	var totals struct {
		Ads         int64   `json:"ads"`
		Active      int64   `json:"active"`
		Paused      int64   `json:"paused"`
		Draft       int64   `json:"draft"`
		Spend       float64 `json:"spend"`
		Leads       int64   `json:"leads"`
		Clicks      int64   `json:"clicks"`
		Impressions int64   `json:"impressions"`
	}
	a.DB.Raw(`SELECT COUNT(*) AS ads,
			COUNT(*) FILTER (WHERE status = 'active') AS active,
			COUNT(*) FILTER (WHERE status = 'paused') AS paused,
			COUNT(*) FILTER (WHERE status = 'draft') AS draft,
			COALESCE(SUM(spend), 0) AS spend, COALESCE(SUM(leads), 0) AS leads,
			COALESCE(SUM(clicks), 0) AS clicks, COALESCE(SUM(impressions), 0) AS impressions
		FROM ad_campaigns WHERE deleted_at IS NULL AND organization_id <> ?`, demoID).Scan(&totals)
	pages := 0
	for _, c := range clients {
		if c.PageID != "" {
			pages++
		}
	}
	var pendingTopups int64
	a.DB.Model(&models.AdCreditTransaction{}).Where("status = ? AND type = ?", "pending", "credit").Count(&pendingTopups)

	return r.SendEnvelope(map[string]any{
		"ads":            ads,
		"clients":        clients,
		"totals":         totals,
		"pages":          pages,
		"pending_topups": pendingTopups,
		"currency":       models.PlatformCurrency,
	})
}

// SuperAdminSetAdStatus pauses, resumes or ends any client's ad
// (PUT /api/super-admin/ads/{id}/status, body {"status": "paused"}).
func (a *App) SuperAdminSetAdStatus(r *fastglue.Request) error {
	adminID, err := a.requireSuperAdmin(r)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "ad")
	if err != nil {
		return nil
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	var ad models.AdCampaign
	if err := a.DB.Where("id = ?", id).First(&ad).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Ad not found", nil, "")
	}
	allowed := map[string][]string{
		"paused": {"active"},
		"active": {"paused"},
		"ended":  {"active", "paused", "draft"},
	}
	from, ok := allowed[req.Status]
	if !ok {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Status must be active, paused or ended", nil, "")
	}
	valid := false
	for _, s := range from {
		valid = valid || s == ad.Status
	}
	if !valid {
		msg := "This ad can't be changed from " + ad.Status + " to " + req.Status
		if req.Status == "active" && ad.Status == "draft" {
			msg = "A draft has to be launched by the client from their Ads Manager"
		}
		return r.SendErrorEnvelope(fasthttp.StatusConflict, msg, nil, "")
	}
	before := ad.Status
	ad.Status = req.Status
	if err := a.DB.Model(&ad).Update("status", ad.Status).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update the ad", nil, "")
	}
	a.Log.Info("Super admin changed ad status", "ad", ad.ID, "org", ad.OrganizationID, "from", before, "to", ad.Status, "by", adminID)
	return r.SendEnvelope(ad)
}

// SuperAdminDeleteAd deletes any client's ad that isn't running
// (DELETE /api/super-admin/ads/{id}).
func (a *App) SuperAdminDeleteAd(r *fastglue.Request) error {
	adminID, err := a.requireSuperAdmin(r)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "ad")
	if err != nil {
		return nil
	}
	var ad models.AdCampaign
	if err := a.DB.Where("id = ?", id).First(&ad).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Ad not found", nil, "")
	}
	if ad.Status == "active" {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "Pause this ad before deleting it", nil, "")
	}
	if err := a.DB.Delete(&ad).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete the ad", nil, "")
	}
	a.Log.Info("Super admin deleted ad", "ad", ad.ID, "org", ad.OrganizationID, "by", adminID)
	return r.SendEnvelope(map[string]any{"success": true})
}

// SuperAdminDisconnectAdsPage disconnects a client's Facebook account and page
// and pauses their running ads (POST /api/super-admin/ads/clients/{id}/disconnect).
func (a *App) SuperAdminDisconnectAdsPage(r *fastglue.Request) error {
	adminID, err := a.requireSuperAdmin(r)
	if err != nil {
		return nil
	}
	orgID, err := parsePathUUID(r, "id", "client")
	if err != nil {
		return nil
	}
	var setup models.AdsSetup
	if err := a.DB.Where("organization_id = ?", orgID).First(&setup).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "This client hasn't set up ads", nil, "")
	}
	setup.FacebookConnected, setup.FacebookUserName, setup.FacebookAccessTokenEnc = false, "", ""
	setup.PageID, setup.PageName = "", ""
	if err := a.DB.Save(&setup).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to disconnect the page", nil, "")
	}
	res := a.DB.Model(&models.AdCampaign{}).Where("organization_id = ? AND status = ?", orgID, "active").Update("status", "paused")
	a.Log.Info("Super admin disconnected a client's ads page", "org", orgID, "paused_ads", res.RowsAffected, "by", adminID)
	return r.SendEnvelope(map[string]any{"success": true, "paused_ads": res.RowsAffected})
}
