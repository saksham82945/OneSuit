package handlers

import (
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"

	"github.com/shridarpatil/whatomate/internal/models"
)

// ============================================================================
// Role-aware dashboard overview (GET /api/dashboard/overview)
//
// One payload drives the "Today at a Glance" / "Workspace Overview" /
// "Action Needed" sections of the main dashboard for every member of an
// organization. Every org-wide number is gated by the permission that already
// protects the matching list page, so a member never sees a count they could
// not read elsewhere. Fields the caller may not read are omitted (null).
// ============================================================================

// DashboardToday holds today's counts (midnight in the organization's time zone).
type DashboardToday struct {
	MessagesToday         *int64 `json:"messages_today,omitempty"`
	NewContactsToday      *int64 `json:"new_contacts_today,omitempty"`
	OpenConversations     *int64 `json:"open_conversations,omitempty"`
	CampaignMessagesToday *int64 `json:"campaign_messages_today,omitempty"`
}

// DashboardWorkspaceOverview holds organization-wide totals.
type DashboardWorkspaceOverview struct {
	TotalContacts       *int64 `json:"total_contacts,omitempty"`
	MessagesSent30d     *int64 `json:"messages_sent_30d,omitempty"`
	MessagesReceived30d *int64 `json:"messages_received_30d,omitempty"`
	ActiveCampaigns     *int64 `json:"active_campaigns,omitempty"`
	TotalCampaigns      *int64 `json:"total_campaigns,omitempty"`
	TemplatesApproved   *int64 `json:"templates_approved,omitempty"`
	TemplatesTotal      *int64 `json:"templates_total,omitempty"`
	TeamMembers         *int64 `json:"team_members,omitempty"`
	ConnectedNumbers    *int64 `json:"connected_numbers,omitempty"`
	Calls30d            *int64 `json:"calls_30d,omitempty"`
	ChatbotFlows        *int64 `json:"chatbot_flows,omitempty"`
	AdLeads30d          *int64 `json:"ad_leads_30d,omitempty"`
	AIResponses30d      *int64 `json:"ai_responses_30d,omitempty"`
}

// DashboardAgentStats are the caller's own numbers (always visible to them).
type DashboardAgentStats struct {
	MyOpenChats             int64    `json:"my_open_chats"`
	AssignedToMe            int64    `json:"assigned_to_me"`
	ResolvedToday           int64    `json:"resolved_today"`
	MyMessagesToday         int64    `json:"my_messages_today"`
	AvgFirstResponseSeconds *float64 `json:"avg_first_response_seconds"` // last 30 days; null when no data
}

// DashboardQuota is one plan limit and how much of it is used. Limit 0 = unlimited.
type DashboardQuota struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Used  int64  `json:"used"`
	Limit int64  `json:"limit"`
}

// DashboardPlanInfo describes the organization's subscription.
type DashboardPlanInfo struct {
	Name        string           `json:"name"`
	Status      string           `json:"status"` // active, trial, suspended
	Price       float64          `json:"price"`
	Currency    string           `json:"currency"`
	Interval    string           `json:"interval"`
	RenewalDate *time.Time       `json:"renewal_date"`
	DaysLeft    *int             `json:"days_left"`
	Quotas      []DashboardQuota `json:"quotas"`
}

// DashboardActions lists things that need the caller's attention.
type DashboardActions struct {
	PlanExpiringSoon        bool   `json:"plan_expiring_soon"`
	PlanExpired             bool   `json:"plan_expired"`
	NoNumberConnected       *bool  `json:"no_number_connected,omitempty"`
	TemplatesPending        *int64 `json:"templates_pending,omitempty"`
	TemplatesRejected       *int64 `json:"templates_rejected,omitempty"`
	UnassignedConversations *int64 `json:"unassigned_conversations,omitempty"`
	OpenSupportTickets      *int64 `json:"open_support_tickets,omitempty"`
}

// DashboardOverviewResponse is the payload for GET /api/dashboard/overview.
type DashboardOverviewResponse struct {
	Role         string                     `json:"role"`
	IsDemo       bool                       `json:"is_demo"`
	IsSuperAdmin bool                       `json:"is_super_admin"`
	Timezone     string                     `json:"timezone"`
	Today        DashboardToday             `json:"today"`
	Overview     DashboardWorkspaceOverview `json:"overview"`
	Agent        *DashboardAgentStats       `json:"agent,omitempty"`
	Plan         *DashboardPlanInfo         `json:"plan,omitempty"`
	Actions      DashboardActions           `json:"actions"`
}

// planExpiryWarningDays is how close a renewal/trial end must be to be flagged.
const planExpiryWarningDays = 7

func i64(v int64) *int64 { return &v }

// tableExists reports whether a table is present (used for optional modules).
func (a *App) tableExists(name string) bool {
	var ok bool
	if err := a.DB.Raw("SELECT to_regclass(?) IS NOT NULL", name).Scan(&ok).Error; err != nil {
		return false
	}
	return ok
}

// countSQL runs a COUNT query and returns 0 on error (logged).
func (a *App) countSQL(query string, args ...any) int64 {
	var n int64
	if err := a.DB.Raw(query, args...).Scan(&n).Error; err != nil {
		a.Log.Error("Dashboard count failed", "error", err)
		return 0
	}
	return n
}

// orgLocation returns the organization's configured time zone (UTC fallback).
func (a *App) orgLocation(orgID uuid.UUID) *time.Location {
	var org models.Organization
	if err := a.DB.Select("id", "settings").Where("id = ?", orgID).First(&org).Error; err == nil {
		if tz, ok := org.Settings["timezone"].(string); ok && tz != "" {
			if loc, err := time.LoadLocation(tz); err == nil {
				return loc
			}
		}
	}
	return time.UTC
}

func startOfDay(t time.Time, loc *time.Location) time.Time {
	t = t.In(loc)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
}

// daysBetween returns whole calendar days from `from` to `to` (negative if past).
func daysBetween(from, to time.Time, loc *time.Location) int {
	a, b := startOfDay(from, loc), startOfDay(to, loc)
	return int(b.Sub(a).Hours() / 24)
}

// GetDashboardOverview returns role-aware dashboard sections for the current org.
func (a *App) GetDashboardOverview(r *fastglue.Request) error {
	orgID, userID, err := a.getOrgAndUserID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	perms, err := a.getUserPermissionsCached(userID, orgID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "Insufficient permissions", nil, "")
	}
	isDemo := orgID != uuid.Nil && orgID == a.demoOrgID()
	permSet := make(map[string]bool, len(perms.Permissions))
	for _, p := range perms.Permissions {
		permSet[p] = true
	}
	// The demo workspace only holds sample data, so explorers see the full
	// admin-style overview (counts only — nothing they can change).
	can := func(resource string) bool {
		return perms.IsSuperAdmin || isDemo || permSet[resource+":"+models.ActionRead]
	}

	loc := a.orgLocation(orgID)
	now := time.Now()
	today := startOfDay(now, loc)
	since30 := now.AddDate(0, 0, -30)

	resp := DashboardOverviewResponse{
		Role:         perms.RoleName,
		IsDemo:       isDemo,
		IsSuperAdmin: perms.IsSuperAdmin,
		Timezone:     loc.String(),
	}
	if resp.Role == "" {
		resp.Role = "member"
	}

	// --- Messages (org-wide, analytics) ---
	if can(models.ResourceAnalytics) {
		var m struct {
			Today    int64
			Sent     int64
			Received int64
		}
		if err := a.DB.Raw(`SELECT
				COUNT(*) FILTER (WHERE created_at >= ?) AS today,
				COUNT(*) FILTER (WHERE direction = 'outgoing' AND created_at >= ?) AS sent,
				COUNT(*) FILTER (WHERE direction = 'incoming' AND created_at >= ?) AS received
			FROM messages
			WHERE organization_id = ? AND deleted_at IS NULL AND created_at >= ?`,
			today, since30, since30, orgID, minTime(today, since30)).Scan(&m).Error; err != nil {
			a.Log.Error("Dashboard message counts failed", "error", err)
		}
		resp.Today.MessagesToday = i64(m.Today)
		resp.Overview.MessagesSent30d = i64(m.Sent)
		resp.Overview.MessagesReceived30d = i64(m.Received)
	}

	// --- Contacts / conversations ---
	if can(models.ResourceContacts) {
		var c struct {
			Total int64
			New   int64
			Open  int64
		}
		if err := a.DB.Raw(`SELECT
				COUNT(*) AS total,
				COUNT(*) FILTER (WHERE created_at >= ?) AS new,
				COUNT(*) FILTER (WHERE last_inbound_at >= ?) AS open
			FROM contacts WHERE organization_id = ? AND deleted_at IS NULL`,
			today, now.Add(-24*time.Hour), orgID).Scan(&c).Error; err != nil {
			a.Log.Error("Dashboard contact counts failed", "error", err)
		}
		resp.Overview.TotalContacts = i64(c.Total)
		resp.Today.NewContactsToday = i64(c.New)
		// "Open" = customer wrote in the last 24h, i.e. the WhatsApp service window is open.
		resp.Today.OpenConversations = i64(c.Open)
	}

	// --- Campaigns ---
	if can(models.ResourceCampaigns) {
		var c struct {
			Total  int64
			Active int64
		}
		if err := a.DB.Raw(`SELECT COUNT(*) AS total,
				COUNT(*) FILTER (WHERE status IN ('scheduled','queued','processing')) AS active
			FROM bulk_message_campaigns WHERE organization_id = ? AND deleted_at IS NULL`, orgID).Scan(&c).Error; err != nil {
			a.Log.Error("Dashboard campaign counts failed", "error", err)
		}
		resp.Overview.TotalCampaigns = i64(c.Total)
		resp.Overview.ActiveCampaigns = i64(c.Active)
		resp.Today.CampaignMessagesToday = i64(a.countSQL(`SELECT COUNT(*) FROM bulk_message_recipients r
			JOIN bulk_message_campaigns c ON c.id = r.campaign_id
			WHERE c.organization_id = ? AND r.deleted_at IS NULL AND r.sent_at >= ?`, orgID, today))
		if a.tableExists("ad_leads") {
			resp.Overview.AdLeads30d = i64(a.countSQL(`SELECT COUNT(*) FROM ad_leads
				WHERE organization_id = ? AND deleted_at IS NULL AND created_at >= ?`, orgID, since30))
		}
	}

	// --- Templates ---
	if can(models.ResourceTemplates) {
		var t struct {
			Total    int64
			Approved int64
			Pending  int64
			Rejected int64
		}
		if err := a.DB.Raw(`SELECT COUNT(*) AS total,
				COUNT(*) FILTER (WHERE UPPER(status) = 'APPROVED') AS approved,
				COUNT(*) FILTER (WHERE UPPER(status) IN ('PENDING','IN_APPEAL','PENDING_DELETION')) AS pending,
				COUNT(*) FILTER (WHERE UPPER(status) IN ('REJECTED','DISABLED','PAUSED')) AS rejected
			FROM templates WHERE organization_id = ? AND deleted_at IS NULL`, orgID).Scan(&t).Error; err != nil {
			a.Log.Error("Dashboard template counts failed", "error", err)
		}
		resp.Overview.TemplatesTotal = i64(t.Total)
		resp.Overview.TemplatesApproved = i64(t.Approved)
		resp.Actions.TemplatesPending = i64(t.Pending)
		resp.Actions.TemplatesRejected = i64(t.Rejected)
	}

	if can(models.ResourceUsers) || can(models.ResourceTeams) {
		resp.Overview.TeamMembers = i64(a.countSQL(`SELECT COUNT(*) FROM user_organizations
			WHERE organization_id = ? AND deleted_at IS NULL`, orgID))
	}

	if can(models.ResourceAccounts) {
		n := a.countSQL(`SELECT COUNT(*) FROM whatsapp_accounts WHERE organization_id = ? AND deleted_at IS NULL`, orgID)
		resp.Overview.ConnectedNumbers = i64(n)
		none := n == 0
		resp.Actions.NoNumberConnected = &none
	}

	if can(models.ResourceCallLogs) {
		resp.Overview.Calls30d = i64(a.countSQL(`SELECT COUNT(*) FROM call_logs
			WHERE organization_id = ? AND deleted_at IS NULL AND created_at >= ?`, orgID, since30))
	}

	if can(models.ResourceFlowsChatbot) {
		resp.Overview.ChatbotFlows = i64(a.countSQL(`SELECT COUNT(*) FROM chatbot_flows
			WHERE organization_id = ? AND deleted_at IS NULL`, orgID))
	}

	if can(models.ResourceChatbotAI) || can(models.ResourceAnalytics) {
		resp.Overview.AIResponses30d = i64(a.countSQL(`SELECT COUNT(*) FROM chatbot_session_messages m
			JOIN chatbot_sessions s ON s.id = m.session_id
			WHERE s.organization_id = ? AND m.step_name = 'ai_response' AND m.deleted_at IS NULL AND m.created_at >= ?`,
			orgID, since30))
	}

	if can(models.ResourceTransfers) {
		resp.Actions.UnassignedConversations = i64(a.countSQL(`SELECT COUNT(*) FROM agent_transfers
			WHERE organization_id = ? AND deleted_at IS NULL AND status = 'active' AND agent_id IS NULL`, orgID))
	}

	// --- The caller's own work ---
	if can(models.ResourceChat) {
		ag := &DashboardAgentStats{}
		ag.MyOpenChats = a.countSQL(`SELECT COUNT(*) FROM agent_transfers
			WHERE organization_id = ? AND deleted_at IS NULL AND status = 'active' AND agent_id = ?`, orgID, userID)
		ag.AssignedToMe = a.countSQL(`SELECT COUNT(*) FROM contacts
			WHERE organization_id = ? AND deleted_at IS NULL AND assigned_user_id = ?`, orgID, userID)
		ag.ResolvedToday = a.countSQL(`SELECT COUNT(*) FROM agent_transfers
			WHERE organization_id = ? AND deleted_at IS NULL AND status = 'resumed' AND resumed_at >= ?
			AND (agent_id = ? OR resumed_by = ?)`, orgID, today, userID, userID)
		ag.MyMessagesToday = a.countSQL(`SELECT COUNT(*) FROM messages
			WHERE organization_id = ? AND deleted_at IS NULL AND sent_by_user_id = ? AND created_at >= ?`, orgID, userID, today)
		var avg *float64
		if err := a.DB.Raw(`SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - transferred_at)))
			FROM agent_transfers
			WHERE organization_id = ? AND deleted_at IS NULL AND agent_id = ?
			AND first_response_at IS NOT NULL AND transferred_at >= ?`, orgID, userID, since30).Scan(&avg).Error; err == nil {
			ag.AvgFirstResponseSeconds = avg
		}
		resp.Agent = ag
	}

	// --- Plan & quota (people who manage the workspace settings) ---
	if !isDemo && (perms.IsSuperAdmin || permSet[models.ResourceSettingsGeneral+":"+models.ActionRead]) {
		resp.Plan = a.dashboardPlan(orgID, now, loc)
		if resp.Plan != nil && resp.Plan.DaysLeft != nil {
			d := *resp.Plan.DaysLeft
			resp.Actions.PlanExpired = d < 0
			resp.Actions.PlanExpiringSoon = d >= 0 && d <= planExpiryWarningDays
		}
		resp.Actions.OpenSupportTickets = i64(a.countSQL(`SELECT COUNT(*) FROM support_tickets
			WHERE organization_id = ? AND deleted_at IS NULL AND status = ?`, orgID, models.TicketStatusOpen))
	}

	return r.SendEnvelope(resp)
}

func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

// dashboardPlan loads the org's subscription and quota usage (nil without a subscription row).
func (a *App) dashboardPlan(orgID uuid.UUID, now time.Time, loc *time.Location) *DashboardPlanInfo {
	var sub models.OrganizationSubscription
	if err := a.DB.Where("organization_id = ?", orgID).First(&sub).Error; err != nil {
		return nil
	}
	info := &DashboardPlanInfo{Status: sub.Status, RenewalDate: sub.RenewalDate, Quotas: []DashboardQuota{}}
	if sub.RenewalDate != nil {
		d := daysBetween(now, *sub.RenewalDate, loc)
		info.DaysLeft = &d
	}
	var plan models.SubscriptionPlan
	if sub.PlanID != nil && a.DB.Where("id = ?", *sub.PlanID).First(&plan).Error == nil {
		info.Name, info.Price, info.Currency, info.Interval = plan.Name, plan.Price, plan.Currency, plan.Interval
	}
	contacts := a.countSQL(`SELECT COUNT(*) FROM contacts WHERE organization_id = ? AND deleted_at IS NULL`, orgID)
	users := a.countSQL(`SELECT COUNT(*) FROM user_organizations WHERE organization_id = ? AND deleted_at IS NULL`, orgID)
	accounts := a.countSQL(`SELECT COUNT(*) FROM whatsapp_accounts WHERE organization_id = ? AND deleted_at IS NULL`, orgID)
	info.Quotas = append(info.Quotas,
		DashboardQuota{Key: "contacts", Label: "Contacts", Used: contacts, Limit: int64(plan.MaxContacts)},
		DashboardQuota{Key: "users", Label: "Team members", Used: users, Limit: int64(plan.MaxUsers)},
		DashboardQuota{Key: "accounts", Label: "WhatsApp numbers", Used: accounts, Limit: int64(plan.MaxAccounts)},
	)
	return info
}

// ============================================================================
// Super admin overview fields (inlined into SuperAdminDashboardResponse)
// ============================================================================

// SuperAdminExpiringPlan is a vendor whose subscription ends soon.
type SuperAdminExpiringPlan struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	PlanName    string    `json:"plan_name"`
	Status      string    `json:"status"`
	OwnerEmail  string    `json:"owner_email"`
	RenewalDate time.Time `json:"renewal_date"`
	DaysLeft    int       `json:"days_left"`
}

// SuperAdminRecentSubscription is a recently created/changed vendor subscription.
// There is no payments table yet, so this stands in for "recent payments".
type SuperAdminRecentSubscription struct {
	ID        uuid.UUID `json:"id"` // organization ID
	Name      string    `json:"name"`
	PlanName  string    `json:"plan_name"`
	Status    string    `json:"status"`
	Amount    float64   `json:"amount"`
	Currency  string    `json:"currency"`
	Interval  string    `json:"interval"`
	UpdatedAt time.Time `json:"updated_at"`
	IsNew     bool      `json:"is_new"` // created (not just changed) in the last 30 days
}

// SuperAdminOverview holds the extra platform-wide metrics for the dashboard.
// Revenue figures are derived from plan prices of paying (active) vendors, as
// the platform does not record individual payments yet.
type SuperAdminOverview struct {
	Currency            string                         `json:"currency"`
	NewSignupsToday     int64                          `json:"new_signups_today"`
	RevenueToday        float64                        `json:"revenue_today"`
	PaymentsToday       int64                          `json:"payments_today"`
	MessagesToday       int64                          `json:"messages_today"`
	TotalRevenue        float64                        `json:"total_revenue"`
	RevenueByCurrency   map[string]float64             `json:"revenue_by_currency"`
	ActivePlans         int64                          `json:"active_plans"`
	Workspaces          int64                          `json:"workspaces"`
	ConnectedNumbers    int64                          `json:"connected_numbers"`
	MessagesSent30d     int64                          `json:"messages_sent_30d"`
	MessagesReceived30d int64                          `json:"messages_received_30d"`
	AICalls30d          int64                          `json:"ai_calls_30d"`
	Calls30d            int64                          `json:"calls_30d"`
	TotalCampaigns      int64                          `json:"total_campaigns"`
	WalletsAvailable    bool                           `json:"wallets_available"`
	WalletsTotal        float64                        `json:"wallets_total"`
	PendingTopups       int64                          `json:"pending_topups"`
	ExpiringSoon        int64                          `json:"expiring_soon"`
	ExpiredPlans        int64                          `json:"expired_plans"`
	ExpiringPlans       []SuperAdminExpiringPlan       `json:"expiring_plans"`
	RecentSubscriptions []SuperAdminRecentSubscription `json:"recent_subscriptions"`
}

// buildSuperAdminOverview computes the platform-wide dashboard metrics.
// The shared demo workspace is excluded from vendor/revenue figures.
func (a *App) buildSuperAdminOverview() SuperAdminOverview {
	cfg := a.loadPlatformConfig()
	loc := time.UTC
	if cfg.Timezone != "" {
		if l, err := time.LoadLocation(cfg.Timezone); err == nil {
			loc = l
		}
	}
	now := time.Now()
	today := startOfDay(now, loc)
	since30 := now.AddDate(0, 0, -30)
	in7 := now.AddDate(0, 0, planExpiryWarningDays)
	demoID := a.demoOrgID() // uuid.Nil never matches a real org

	ov := SuperAdminOverview{
		Currency:            strings.ToUpper(strings.TrimSpace(cfg.DefaultCurrency)),
		RevenueByCurrency:   map[string]float64{},
		ExpiringPlans:       []SuperAdminExpiringPlan{},
		RecentSubscriptions: []SuperAdminRecentSubscription{},
	}

	ov.NewSignupsToday = a.countSQL(`SELECT COUNT(*) FROM organizations
		WHERE deleted_at IS NULL AND id <> ? AND created_at >= ?`, demoID, today)
	ov.Workspaces = a.countSQL(`SELECT COUNT(*) FROM organizations WHERE deleted_at IS NULL AND id <> ?`, demoID)
	ov.ConnectedNumbers = a.countSQL(`SELECT COUNT(*) FROM whatsapp_accounts WHERE deleted_at IS NULL AND organization_id <> ?`, demoID)

	var m struct {
		Today    int64
		Sent     int64
		Received int64
	}
	if err := a.DB.Raw(`SELECT
			COUNT(*) FILTER (WHERE created_at >= ?) AS today,
			COUNT(*) FILTER (WHERE direction = 'outgoing' AND created_at >= ?) AS sent,
			COUNT(*) FILTER (WHERE direction = 'incoming' AND created_at >= ?) AS received
		FROM messages WHERE deleted_at IS NULL AND organization_id <> ? AND created_at >= ?`,
		today, since30, since30, demoID, minTime(today, since30)).Scan(&m).Error; err != nil {
		a.Log.Error("Super admin message counts failed", "error", err)
	}
	ov.MessagesToday, ov.MessagesSent30d, ov.MessagesReceived30d = m.Today, m.Sent, m.Received

	ov.AICalls30d = a.countSQL(`SELECT COUNT(*) FROM chatbot_session_messages m
		JOIN chatbot_sessions s ON s.id = m.session_id
		WHERE m.step_name = 'ai_response' AND m.deleted_at IS NULL AND m.created_at >= ? AND s.organization_id <> ?`, since30, demoID)
	ov.Calls30d = a.countSQL(`SELECT COUNT(*) FROM call_logs WHERE deleted_at IS NULL AND created_at >= ? AND organization_id <> ?`, since30, demoID)
	ov.TotalCampaigns = a.countSQL(`SELECT COUNT(*) FROM bulk_message_campaigns WHERE deleted_at IS NULL AND organization_id <> ?`, demoID)

	if a.tableExists("ad_wallets") {
		ov.WalletsAvailable = true
		var total *float64
		if err := a.DB.Raw(`SELECT SUM(balance) FROM ad_wallets WHERE deleted_at IS NULL AND organization_id <> ?`, demoID).Scan(&total).Error; err == nil && total != nil {
			ov.WalletsTotal = *total
		}
	}
	if a.tableExists("ad_credit_transactions") {
		ov.PendingTopups = a.countSQL(`SELECT COUNT(*) FROM ad_credit_transactions
			WHERE deleted_at IS NULL AND status = 'pending' AND type = 'credit'`)
	}

	// Subscriptions joined with their plan and organization.
	var subs []struct {
		OrganizationID uuid.UUID
		OrgName        string
		Status         string
		RenewalDate    *time.Time
		OwnerEmail     string
		CreatedAt      time.Time
		UpdatedAt      time.Time
		PlanName       *string
		Price          *float64
		Currency       *string
		Interval       *string
	}
	if err := a.DB.Raw(`SELECT s.organization_id, o.name AS org_name, s.status, s.renewal_date, s.owner_email,
			s.created_at, s.updated_at, p.name AS plan_name, p.price, p.currency, p.interval
		FROM organization_subscriptions s
		JOIN organizations o ON o.id = s.organization_id AND o.deleted_at IS NULL
		LEFT JOIN subscription_plans p ON p.id = s.plan_id
		WHERE s.deleted_at IS NULL AND s.organization_id <> ?`, demoID).Scan(&subs).Error; err != nil {
		a.Log.Error("Super admin subscription load failed", "error", err)
	}

	revenueToday := map[string]float64{}
	planCurrencies := map[string]int{}
	for _, s := range subs {
		planName, price, currency, interval := "", 0.0, "", ""
		if s.PlanName != nil {
			planName = *s.PlanName
		}
		if s.Price != nil {
			price = *s.Price
		}
		if s.Currency != nil {
			currency = strings.ToUpper(*s.Currency)
		}
		if s.Interval != nil {
			interval = *s.Interval
		}
		hasPlan := s.PlanName != nil
		if hasPlan && currency != "" {
			planCurrencies[currency]++
		}
		notExpired := s.RenewalDate == nil || !s.RenewalDate.Before(now)

		if hasPlan && s.Status != models.VendorStatusSuspended && notExpired {
			ov.ActivePlans++
		}
		// Paying vendors: active (not trial) on a priced plan.
		if hasPlan && s.Status == models.VendorStatusActive && price > 0 && notExpired {
			ov.RevenueByCurrency[currency] += price
			if !s.CreatedAt.Before(today) {
				ov.PaymentsToday++
				revenueToday[currency] += price
			}
		}
		if s.Status != models.VendorStatusSuspended && s.RenewalDate != nil {
			switch {
			case s.RenewalDate.Before(now):
				ov.ExpiredPlans++
			case s.RenewalDate.Before(in7):
				ov.ExpiringSoon++
				ov.ExpiringPlans = append(ov.ExpiringPlans, SuperAdminExpiringPlan{
					ID: s.OrganizationID, Name: s.OrgName, PlanName: planName, Status: s.Status,
					OwnerEmail: s.OwnerEmail, RenewalDate: *s.RenewalDate, DaysLeft: daysBetween(now, *s.RenewalDate, loc),
				})
			}
		}
		ov.RecentSubscriptions = append(ov.RecentSubscriptions, SuperAdminRecentSubscription{
			ID: s.OrganizationID, Name: s.OrgName, PlanName: planName, Status: s.Status,
			Amount: price, Currency: currency, Interval: interval, UpdatedAt: s.UpdatedAt,
			IsNew: !s.CreatedAt.Before(since30),
		})
	}

	// Pick the headline currency: the platform default if it has revenue,
	// otherwise the currency with the most revenue, otherwise the currency
	// most vendors' plans are priced in.
	if ov.Currency == "" || ov.RevenueByCurrency[ov.Currency] == 0 {
		best := ""
		for c, v := range ov.RevenueByCurrency {
			if best == "" || v > ov.RevenueByCurrency[best] || (v == ov.RevenueByCurrency[best] && c < best) {
				best = c
			}
		}
		if best == "" {
			for c, n := range planCurrencies {
				if best == "" || n > planCurrencies[best] || (n == planCurrencies[best] && c < best) {
					best = c
				}
			}
		}
		if best != "" {
			ov.Currency = best
		}
	}
	if ov.Currency == "" {
		ov.Currency = "INR"
	}
	ov.TotalRevenue = ov.RevenueByCurrency[ov.Currency]
	ov.RevenueToday = revenueToday[ov.Currency]

	sort.Slice(ov.ExpiringPlans, func(i, j int) bool {
		return ov.ExpiringPlans[i].RenewalDate.Before(ov.ExpiringPlans[j].RenewalDate)
	})
	if len(ov.ExpiringPlans) > 10 {
		ov.ExpiringPlans = ov.ExpiringPlans[:10]
	}
	sort.Slice(ov.RecentSubscriptions, func(i, j int) bool {
		return ov.RecentSubscriptions[i].UpdatedAt.After(ov.RecentSubscriptions[j].UpdatedAt)
	})
	if len(ov.RecentSubscriptions) > 6 {
		ov.RecentSubscriptions = ov.RecentSubscriptions[:6]
	}
	return ov
}
