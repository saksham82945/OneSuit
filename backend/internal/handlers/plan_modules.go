package handlers

import (
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// Plan modules: whole sections a subscription plan can switch off for its
// clients (Ads Manager, Webhooks, API keys, ...). A switched-off module is
// hidden in the client's menu and its API answers 403.

// PlanModule describes one switchable section.
type PlanModule struct {
	Key   string   `json:"key"`
	Label string   `json:"label"`
	Hint  string   `json:"hint"`
	Paths []string `json:"-"` // API path prefixes it owns
}

// PlanModules is every module a plan can switch, in display order.
var PlanModules = []PlanModule{
	{Key: "campaigns", Label: "Campaigns", Hint: "Broadcast campaigns and campaign analytics", Paths: []string{"/api/campaigns"}},
	{Key: "chatbot", Label: "Chatbot & flows", Hint: "Keyword replies, chatbot flows and WhatsApp Flows",
		Paths: []string{"/api/chatbot/flows", "/api/chatbot/keywords", "/api/flows"}},
	{Key: "ai_agents", Label: "AI integration", Hint: "AI agents and AI replies", Paths: []string{"/api/chatbot/ai-contexts"}},
	{Key: "ads_manager", Label: "Ads Manager", Hint: "Click-to-WhatsApp ads, leads and ad credit", Paths: []string{"/api/ads"}},
	{Key: "webhooks", Label: "Webhooks", Hint: "Send events to the client's own systems", Paths: []string{"/api/webhooks"}},
	{Key: "api_integration", Label: "API integration", Hint: "API keys for the REST API", Paths: []string{"/api/api-keys"}},
	{Key: "calling", Label: "Calling", Hint: "WhatsApp calls, call logs and IVR",
		Paths: []string{"/api/calls", "/api/call-logs", "/api/call-transfers", "/api/ivr-flows"}},
	{Key: "catalogue", Label: "Catalogue", Hint: "Product catalogues", Paths: []string{"/api/catalogs"}},
	{Key: "integrations", Label: "Integrations", Hint: "Third-party integrations", Paths: []string{"/api/integrations"}},
}

func validModuleKey(k string) bool {
	for _, m := range PlanModules {
		if m.Key == k {
			return true
		}
	}
	return false
}

// moduleOn reads a module switch from a plan's Modules map (missing = on).
func moduleOn(modules models.JSONB, key string) bool {
	v, ok := modules[key]
	if !ok {
		return true
	}
	b, isBool := v.(bool)
	return !isBool || b
}

type orgModulesEntry struct {
	modules map[string]bool
	at      time.Time
}

var (
	orgModulesMu    sync.Mutex
	orgModulesCache = map[uuid.UUID]orgModulesEntry{}
)

const orgModulesTTL = 30 * time.Second

// orgModules returns which modules a workspace's plan includes. Workspaces
// without a plan get everything.
func (a *App) orgModules(orgID uuid.UUID) map[string]bool {
	orgModulesMu.Lock()
	if e, ok := orgModulesCache[orgID]; ok && time.Since(e.at) < orgModulesTTL {
		orgModulesMu.Unlock()
		return e.modules
	}
	orgModulesMu.Unlock()

	var plan models.SubscriptionPlan
	err := a.DB.Model(&models.SubscriptionPlan{}).
		Joins("JOIN organization_subscriptions s ON s.plan_id = subscription_plans.id AND s.deleted_at IS NULL").
		Where("s.organization_id = ?", orgID).First(&plan).Error
	out := make(map[string]bool, len(PlanModules))
	for _, m := range PlanModules {
		out[m.Key] = err != nil || moduleOn(plan.Modules, m.Key)
	}
	orgModulesMu.Lock()
	orgModulesCache[orgID] = orgModulesEntry{modules: out, at: time.Now()}
	orgModulesMu.Unlock()
	return out
}

// clearOrgModulesCache drops cached module switches (after a plan or a
// client's plan changes).
func clearOrgModulesCache() {
	orgModulesMu.Lock()
	orgModulesCache = map[uuid.UUID]orgModulesEntry{}
	orgModulesMu.Unlock()
}

// PlanModuleGuard blocks the API of modules the caller's plan switches off.
// Super admins are never blocked.
func (a *App) PlanModuleGuard(r *fastglue.Request) *fastglue.Request {
	path := string(r.RequestCtx.Path())
	if !strings.HasPrefix(path, "/api/") || string(r.RequestCtx.Method()) == "OPTIONS" {
		return r
	}
	// Teams switched off for client workspaces: their changes are refused
	// (reading teams stays open, chat transfers use it).
	if (path == "/api/teams" || strings.HasPrefix(path, "/api/teams/")) && string(r.RequestCtx.Method()) != "GET" {
		if userID, ok := r.RequestCtx.UserValue("user_id").(uuid.UUID); ok && !a.IsSuperAdmin(userID) && !a.loadPlatformConfig().TeamsEnabledAdmin {
			_ = r.SendErrorEnvelope(fasthttp.StatusForbidden, "Teams are turned off for workspaces. Contact support.", nil, "")
			return nil
		}
	}
	var module *PlanModule
	for i := range PlanModules {
		for _, p := range PlanModules[i].Paths {
			if path == p || strings.HasPrefix(path, p+"/") {
				module = &PlanModules[i]
			}
		}
	}
	if module == nil {
		return r
	}
	userID, ok := r.RequestCtx.UserValue("user_id").(uuid.UUID)
	if !ok || a.IsSuperAdmin(userID) {
		return r
	}
	orgID, err := a.getOrgID(r)
	automationOff := (module.Key == "chatbot" || module.Key == "ai_agents") && !a.loadPlatformConfig().AutomationEnabledAdmin
	if err != nil || (a.orgModules(orgID)[module.Key] && !automationOff) {
		return r
	}
	_ = r.SendErrorEnvelope(fasthttp.StatusForbidden,
		module.Label+" isn't included in your plan. Contact support to upgrade.", nil, "")
	return nil
}

// GetPlanModules tells the app which sections the workspace's plan includes
// (GET /api/plan/modules), so the menu can hide the rest.
func (a *App) GetPlanModules(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	mods := make(map[string]bool, len(PlanModules)+1)
	superAdmin := a.callerIsSuperAdmin(r)
	for k, on := range a.orgModules(orgID) {
		mods[k] = on || superAdmin
	}
	// Teams is switched platform-wide by the super admin, separately for
	// client workspaces and for super admins.
	cfg := a.loadPlatformConfig()
	if !superAdmin && !cfg.AutomationEnabledAdmin {
		mods["chatbot"], mods["ai_agents"] = false, false
	}
	mods["teams"] = cfg.TeamsEnabledAdmin
	if superAdmin {
		mods["teams"] = cfg.TeamsEnabledSuperAdmin
	}
	pending := !superAdmin && a.orgPendingPayment(orgID)
	return r.SendEnvelope(map[string]any{"modules": mods, "pending_payment": pending})
}

// SuperAdminListPlanModules lists the switchable modules for the plan editor
// (GET /api/super-admin/plan-modules).
func (a *App) SuperAdminListPlanModules(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	return r.SendEnvelope(map[string]any{"modules": PlanModules})
}

// Pending payment: a workspace that signed up for a paid plan but hasn't paid
// yet can only reach the payment and account endpoints.

var pendingPaymentAllowed = []string{
	"/api/me", "/api/auth/", "/api/public/", "/api/payments", "/api/billing", "/api/plan/modules",
	"/api/organizations/current", "/api/support-tickets", "/api/branding", "/api/users/me",
}

// orgPendingPayment reports whether the workspace still owes its first payment.
func (a *App) orgPendingPayment(orgID uuid.UUID) bool {
	var status string
	a.DB.Model(&models.OrganizationSubscription{}).Select("status").Where("organization_id = ?", orgID).Scan(&status)
	return status == models.VendorStatusPendingPayment
}

// PendingPaymentGuard answers 402 for everything else until the workspace pays.
func (a *App) PendingPaymentGuard(r *fastglue.Request) *fastglue.Request {
	path := string(r.RequestCtx.Path())
	if !strings.HasPrefix(path, "/api/") || string(r.RequestCtx.Method()) == "OPTIONS" {
		return r
	}
	for _, p := range pendingPaymentAllowed {
		if strings.HasPrefix(path, p) {
			return r
		}
	}
	userID, ok := r.RequestCtx.UserValue("user_id").(uuid.UUID)
	if !ok || a.IsSuperAdmin(userID) {
		return r
	}
	orgID, err := a.getOrgID(r)
	if err != nil || !a.orgPendingPayment(orgID) {
		return r
	}
	_ = r.SendErrorEnvelope(fasthttp.StatusPaymentRequired, "Complete your payment to start using OneSuit.", nil, "")
	return nil
}
