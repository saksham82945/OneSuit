package handlers

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/shridarpatil/whatomate/internal/database"
	"github.com/shridarpatil/whatomate/internal/models"
)

// Explorer accounts let people look around a shared demo workspace (read-only,
// full of sample data) before they subscribe. Subscribing gives them their own
// business on a free trial, with them as its admin.

// demoOrgID returns the demo workspace's organization ID (uuid.Nil if none).
func (a *App) demoOrgID() uuid.UUID {
	return database.DemoWorkspaceID(a.DB)
}

// ExploreRequest is the body for creating an explorer account.
type ExploreRequest struct {
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Explore creates an explorer account in the demo workspace and signs it in.
// No login required.
func (a *App) Explore(r *fastglue.Request) error {
	var req ExploreRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	cfg := a.loadPlatformConfig()
	if cfg.MaintenanceMode {
		return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, cfg.MaintenanceMessage, nil, "")
	}
	if !cfg.AllowVendorSignup {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "New sign-ups are currently closed. Please contact us.", nil, "")
	}

	req.FullName = strings.TrimSpace(req.FullName)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	switch {
	case req.FullName == "":
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Your name is required", nil, "")
	case !validEmail(req.Email):
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Please enter a valid email address", nil, "")
	case len(req.Password) < minPasswordLength:
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest,
			fmt.Sprintf("Password must be at least %d characters", minPasswordLength), nil, "")
	}

	demoID := a.demoOrgID()
	if demoID == uuid.Nil {
		return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "The demo workspace isn't available right now.", nil, "")
	}
	var role models.CustomRole
	if err := a.DB.Where("organization_id = ? AND name = ?", demoID, database.ExplorerRoleName).First(&role).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusServiceUnavailable, "The demo workspace isn't available right now.", nil, "")
	}

	var count int64
	a.DB.Unscoped().Model(&models.User{}).Where("LOWER(email) = ?", req.Email).Count(&count)
	if count > 0 {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "An account with this email already exists. Please sign in instead.", nil, "")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "We couldn't create your account. Please try again.", nil, "")
	}
	user := models.User{
		OrganizationID: demoID, Email: req.Email, PasswordHash: string(hash), FullName: req.FullName,
		RoleID: &role.ID, IsActive: true, IsAvailable: true, Settings: models.JSONB{"account_type": "explorer"},
	}
	txErr := a.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		return tx.Create(&models.UserOrganization{UserID: user.ID, OrganizationID: demoID, RoleID: &role.ID, IsDefault: true}).Error
	})
	if txErr != nil {
		a.Log.Error("Failed to create explorer", "error", txErr)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "We couldn't create your account. Please try again.", nil, "")
	}
	a.Log.Info("New explorer account", "user_id", user.ID)
	return a.sendAuthenticated(r, &user)
}

// SubscribeRequest is the body for an explorer choosing a plan.
type SubscribeRequest struct {
	BusinessName string `json:"business_name"`
	PlanID       string `json:"plan_id"`
	Phone        string `json:"phone"`
}

// Subscribe turns the signed-in explorer into a customer: it creates their own
// business on a free trial of the chosen plan, makes them its admin, removes
// them from the demo workspace and switches their session to the new business.
func (a *App) Subscribe(r *fastglue.Request) error {
	userID, ok := r.RequestCtx.UserValue("user_id").(uuid.UUID)
	if !ok {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	var req SubscribeRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}

	var user models.User
	if err := a.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	demoID := a.demoOrgID()
	if user.IsSuperAdmin || demoID == uuid.Nil || user.OrganizationID != demoID {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Your account already belongs to a business.", nil, "")
	}

	cfg := a.loadPlatformConfig()
	if !cfg.AllowVendorSignup {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "New subscriptions are currently closed. Please contact us.", nil, "")
	}
	req.BusinessName = strings.TrimSpace(req.BusinessName)
	if req.BusinessName == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Business name is required", nil, "")
	}
	planID := req.PlanID
	if planID == "" {
		planID = cfg.DefaultPlanID
	}
	sub := models.OrganizationSubscription{
		Status: models.VendorStatusTrial, OwnerName: user.FullName, OwnerEmail: user.Email,
		OwnerPhone: strings.TrimSpace(req.Phone),
	}
	if planID != "" {
		plan, err := a.findPlan(planID)
		if err != nil || !plan.IsActive {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "That plan is not available", nil, "")
		}
		sub.PlanID = &plan.ID
	}
	if cfg.TrialDays > 0 {
		trialEnds := time.Now().AddDate(0, 0, cfg.TrialDays)
		sub.RenewalDate = &trialEnds
	} else {
		sub.Status = models.VendorStatusActive
	}

	var orgID, adminRoleID uuid.UUID
	txErr := a.DB.Transaction(func(tx *gorm.DB) error {
		org, err := createVendorOrganization(tx, req.BusinessName, cfg.Timezone)
		if err != nil {
			return err
		}
		orgID = org.ID
		var adminRole models.CustomRole
		if err := tx.Where("organization_id = ? AND name = ? AND is_system = ?", org.ID, "admin", true).First(&adminRole).Error; err != nil {
			return err
		}
		adminRoleID = adminRole.ID
		if err := database.SeedDefaultWidgetsForOrg(tx, org.ID, user.ID); err != nil {
			return err
		}
		sub.OrganizationID = org.ID
		if err := tx.Create(&sub).Error; err != nil {
			return err
		}
		if err := tx.Create(&models.UserOrganization{UserID: user.ID, OrganizationID: org.ID, RoleID: &adminRole.ID, IsDefault: true}).Error; err != nil {
			return err
		}
		// Leave the demo workspace and make the new business their home.
		if err := tx.Where("user_id = ? AND organization_id = ?", user.ID, demoID).Delete(&models.UserOrganization{}).Error; err != nil {
			return err
		}
		return tx.Model(&user).Updates(map[string]any{
			"organization_id": org.ID,
			"role_id":         adminRole.ID,
			"settings":        models.JSONB{"account_type": "customer"},
		}).Error
	})
	if txErr != nil {
		a.Log.Error("Subscribe failed", "error", txErr, "user_id", user.ID)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "We couldn't create your business. Please try again.", nil, "")
	}
	a.InvalidateUserPermissionsCache(user.ID)
	a.logAudit(orgID, user.ID, "organization", orgID, models.AuditActionCreated, nil,
		map[string]any{"name": req.BusinessName, "source": "explorer_upgrade", "plan_id": sub.PlanID, "status": sub.Status})

	user.OrganizationID, user.RoleID = orgID, &adminRoleID
	return a.sendAuthenticated(r, &user)
}

// demoWritablePaths are the non-GET endpoints explorers may still call while
// inside the demo workspace.
var demoWritablePaths = []string{"/api/auth/", "/api/subscribe", "/api/me/", "/api/support-tickets", "/api/public/"}

// DemoReadOnlyGuard rejects changes (any non-GET request) made inside the demo
// workspace by anyone but a super admin, so explorers can look but not touch.
// Register it after the auth middleware.
func (a *App) DemoReadOnlyGuard(r *fastglue.Request) *fastglue.Request {
	switch string(r.RequestCtx.Method()) {
	case "GET", "HEAD", "OPTIONS":
		return r
	}
	path := string(r.RequestCtx.Path())
	if !strings.HasPrefix(path, "/api/") || strings.HasSuffix(path, "/mark-read") {
		return r
	}
	for _, p := range demoWritablePaths {
		if strings.HasPrefix(path, p) {
			return r
		}
	}
	userID, ok := r.RequestCtx.UserValue("user_id").(uuid.UUID)
	if !ok {
		return r
	}
	demoID := a.demoOrgID()
	if demoID == uuid.Nil {
		return r
	}
	if orgID, err := a.getOrgID(r); err != nil || orgID != demoID || a.IsSuperAdmin(userID) {
		return r
	}
	_ = r.SendErrorEnvelope(fasthttp.StatusForbidden,
		"This is a demo workspace, so changes are turned off. Choose a plan to get your own workspace.", nil, "")
	return nil
}
