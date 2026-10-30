package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
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

// Self-service onboarding: the public pricing page, website sign-up (a new
// business gets its own organization on a free trial), invite links that let
// team members join an organization, and the plan's user limit.

const minPasswordLength = 8

// ============================================================================
// Shared helpers
// ============================================================================

// sendAuthenticated issues tokens for user (in their current organization),
// sets the auth cookies and sends the same payload as Login.
func (a *App) sendAuthenticated(r *fastglue.Request, user *models.User) error {
	if user.RoleID != nil {
		var role models.CustomRole
		if err := a.DB.Where("id = ?", *user.RoleID).First(&role).Error; err == nil {
			if perms, err := a.GetRolePermissionsCached(role.ID); err == nil {
				role.Permissions = make([]models.Permission, 0, len(perms))
				for _, p := range perms {
					if parts := splitPermission(p); len(parts) == 2 {
						role.Permissions = append(role.Permissions, models.Permission{Resource: parts[0], Action: parts[1]})
					}
				}
			}
			user.Role = &role
		}
	}

	accessToken, err := a.generateAccessToken(user)
	if err != nil {
		a.Log.Error("Failed to generate access token", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to generate token", nil, "")
	}
	refreshToken, err := a.generateRefreshToken(user)
	if err != nil {
		a.Log.Error("Failed to generate refresh token", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to generate token", nil, "")
	}
	a.setAuthCookies(r, accessToken, refreshToken)
	return r.SendEnvelope(CookieAuthResponse{
		ExpiresIn: a.Config.JWT.AccessExpiryMins * 60,
		User:      *user,
	})
}

// userLimitReached reports whether orgID already has as many members as its
// plan allows. Organizations without a plan, or on a plan with max_users = 0,
// are unlimited. Returns status 0 when another user may be added.
func (a *App) userLimitReached(db *gorm.DB, orgID uuid.UUID) (int, string) {
	var limit struct{ MaxUsers int }
	err := db.Table("organization_subscriptions s").
		Select("p.max_users").
		Joins("JOIN subscription_plans p ON p.id = s.plan_id").
		Where("s.organization_id = ? AND s.deleted_at IS NULL", orgID).
		Scan(&limit).Error
	if err != nil || limit.MaxUsers <= 0 {
		return 0, ""
	}
	var members int64
	db.Model(&models.UserOrganization{}).Where("organization_id = ?", orgID).Count(&members)
	if members >= int64(limit.MaxUsers) {
		return fasthttp.StatusForbidden, fmt.Sprintf(
			"Your plan allows up to %d users. Upgrade your plan to add more.", limit.MaxUsers)
	}
	return 0, ""
}

// requireUserSlot sends a 403 and returns errEnvelopeSent when orgID is at its
// plan's user limit. Super admins are exempt.
func (a *App) requireUserSlot(r *fastglue.Request, orgID, actorID uuid.UUID) error {
	if a.IsSuperAdmin(actorID) {
		return nil
	}
	if status, msg := a.userLimitReached(a.DB, orgID); status != 0 {
		_ = r.SendErrorEnvelope(status, msg, nil, "")
		return errEnvelopeSent
	}
	return nil
}

// ============================================================================
// Public pricing
// ============================================================================

// PublicPlan is a plan as shown on the public pricing page.
type PublicPlan struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Price       float64   `json:"price"`
	Currency    string    `json:"currency"`
	Interval    string    `json:"interval"`
	// Offers (% off) for longer billing cycles.
	QuarterlyDiscount  float64  `json:"quarterly_discount"`
	HalfYearlyDiscount float64  `json:"half_yearly_discount"`
	YearlyDiscount     float64  `json:"yearly_discount"`
	MaxUsers           int      `json:"max_users"`
	MaxContacts        int      `json:"max_contacts"`
	MaxAccounts        int      `json:"max_accounts"`
	Features           []string `json:"features"`
}

// GetPublicPlans returns the active plans and sign-up settings. No login required.
func (a *App) GetPublicPlans(r *fastglue.Request) error {
	cfg := a.loadPlatformConfig()
	var plans []models.SubscriptionPlan
	if err := a.DB.Where("is_active = ?", true).Order("price ASC, name ASC").Find(&plans).Error; err != nil {
		a.Log.Error("Failed to list public plans", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load plans", nil, "")
	}
	out := make([]PublicPlan, 0, len(plans))
	for _, p := range plans {
		features := []string(p.Features)
		if features == nil {
			features = []string{}
		}
		out = append(out, PublicPlan{
			ID: p.ID, Name: p.Name, Description: p.Description, Price: p.Price, Currency: models.PlatformCurrency,
			Interval: p.Interval, QuarterlyDiscount: p.QuarterlyDiscount, HalfYearlyDiscount: p.HalfYearlyDiscount, YearlyDiscount: p.YearlyDiscount, MaxUsers: p.MaxUsers, MaxContacts: p.MaxContacts, MaxAccounts: p.MaxAccounts,
			Features: features,
		})
	}
	return r.SendEnvelope(map[string]any{
		"plans":           out,
		"platform_name":   cfg.PlatformName,
		"support_email":   cfg.SupportEmail,
		"trial_days":      cfg.TrialDays,
		"default_plan":    cfg.DefaultPlanID,
		"signup_enabled":  cfg.AllowVendorSignup && !cfg.MaintenanceMode,
		"explore_enabled": cfg.AllowVendorSignup && !cfg.MaintenanceMode && a.demoOrgID() != uuid.Nil,
	})
}

// ============================================================================
// Website sign-up
// ============================================================================

// SignupRequest is the body for creating a new business account.
type SignupRequest struct {
	BusinessName string `json:"business_name"`
	FullName     string `json:"full_name"`
	Email        string `json:"email"`
	Password     string `json:"password"`
	Phone        string `json:"phone"`
	PlanID       string `json:"plan_id"`
}

// Signup creates a new organization on a free trial of the chosen plan, makes
// the person its owner (admin) and signs them in. No login required.
func (a *App) Signup(r *fastglue.Request) error {
	var req SignupRequest
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

	req.BusinessName = strings.TrimSpace(req.BusinessName)
	req.FullName = strings.TrimSpace(req.FullName)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Phone = strings.TrimSpace(req.Phone)
	switch {
	case req.BusinessName == "":
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Business name is required", nil, "")
	case req.FullName == "":
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Your name is required", nil, "")
	case !validEmail(req.Email):
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Please enter a valid email address", nil, "")
	case len(req.Password) < minPasswordLength:
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest,
			fmt.Sprintf("Password must be at least %d characters", minPasswordLength), nil, "")
	}

	// Plan: the one chosen, else the platform default, else none.
	planID := req.PlanID
	if planID == "" {
		planID = cfg.DefaultPlanID
	}
	var plan *models.SubscriptionPlan
	if planID != "" {
		p, err := a.findPlan(planID)
		if err != nil || !p.IsActive {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "That plan is not available", nil, "")
		}
		plan = p
	}

	var count int64
	a.DB.Unscoped().Model(&models.User{}).Where("LOWER(email) = ?", req.Email).Count(&count)
	if count > 0 {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "An account with this email already exists. Please sign in instead.", nil, "")
	}

	sub := models.OrganizationSubscription{
		Status:     models.VendorStatusTrial,
		OwnerName:  req.FullName,
		OwnerEmail: req.Email,
		OwnerPhone: req.Phone,
	}
	if plan != nil {
		sub.PlanID = &plan.ID
	}
	if cfg.TrialDays > 0 {
		trialEnds := time.Now().AddDate(0, 0, cfg.TrialDays)
		sub.RenewalDate = &trialEnds
	} else {
		sub.Status = models.VendorStatusActive
	}

	var owner *models.User
	txErr := a.DB.Transaction(func(tx *gorm.DB) error {
		org, err := createVendorOrganization(tx, req.BusinessName, cfg.Timezone)
		if err != nil {
			return err
		}
		if owner, err = createVendorOwner(tx, org.ID, req.FullName, req.Email, req.Password); err != nil {
			return err
		}
		if err := database.SeedDefaultWidgetsForOrg(tx, org.ID, owner.ID); err != nil {
			return err
		}
		sub.OrganizationID = org.ID
		return tx.Create(&sub).Error
	})
	if txErr != nil {
		a.Log.Error("Sign-up failed", "error", txErr, "email", req.Email)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "We couldn't create your account. Please try again.", nil, "")
	}

	planLabel := "none"
	if sub.PlanID != nil {
		planLabel = sub.PlanID.String()
	}
	// Don't pass the *uuid.UUID itself to the logger: a nil pointer panics in its String().
	a.Log.Info("New business signed up", "org_id", owner.OrganizationID, "user_id", owner.ID, "plan_id", planLabel)
	a.logAudit(owner.OrganizationID, owner.ID, "organization", owner.OrganizationID, models.AuditActionCreated, nil,
		map[string]any{"name": req.BusinessName, "source": "signup", "plan_id": sub.PlanID, "status": sub.Status})

	return a.sendAuthenticated(r, owner)
}

// ============================================================================
// Invite links
// ============================================================================

const (
	defaultInviteDays = 7
	maxInviteDays     = 30
	maxInviteUses     = 1000
)

func hashInviteToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func newInviteToken() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// InviteResponse is an invite as shown to organization admins. Token and Path
// are only included right after creation, because only a hash is stored.
type InviteResponse struct {
	ID        uuid.UUID `json:"id"`
	Token     string    `json:"token,omitempty"`
	Path      string    `json:"path,omitempty"`
	RoleID    uuid.UUID `json:"role_id"`
	RoleName  string    `json:"role_name"`
	Email     string    `json:"email"`
	ExpiresAt time.Time `json:"expires_at"`
	MaxUses   int       `json:"max_uses"`
	UsedCount int       `json:"used_count"`
	Status    string    `json:"status"` // active, expired, used
	CreatedAt time.Time `json:"created_at"`
}

func inviteStatus(inv *models.OrganizationInvite) string {
	switch {
	case time.Now().After(inv.ExpiresAt):
		return "expired"
	case inv.MaxUses > 0 && inv.UsedCount >= inv.MaxUses:
		return "used"
	default:
		return "active"
	}
}

func toInviteResponse(inv *models.OrganizationInvite, roleName string) InviteResponse {
	return InviteResponse{
		ID: inv.ID, RoleID: inv.RoleID, RoleName: roleName, Email: inv.Email, ExpiresAt: inv.ExpiresAt,
		MaxUses: inv.MaxUses, UsedCount: inv.UsedCount, Status: inviteStatus(inv), CreatedAt: inv.CreatedAt,
	}
}

// CreateInviteRequest is the body for creating an invite link.
type CreateInviteRequest struct {
	RoleID        *uuid.UUID `json:"role_id"`
	Email         string     `json:"email"`
	ExpiresInDays int        `json:"expires_in_days"`
	MaxUses       *int       `json:"max_uses"`
}

// CreateInvite creates an invite link for the current organization.
func (a *App) CreateInvite(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceUsers, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req CreateInviteRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}

	// Role: the one given (must belong to this org), else the org's default role.
	var role models.CustomRole
	q := a.DB.Where("organization_id = ?", orgID)
	if req.RoleID != nil {
		q = q.Where("id = ?", *req.RoleID)
	} else {
		q = q.Where("is_default = ?", true)
	}
	if err := q.First(&role).Error; err != nil {
		if req.RoleID != nil {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Role not found", nil, "")
		}
		if err := a.DB.Where("organization_id = ? AND name = ? AND is_system = ?", orgID, "agent", true).First(&role).Error; err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Choose a role for this invite", nil, "")
		}
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email != "" && !validEmail(req.Email) {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Email is not a valid email address", nil, "")
	}
	days := req.ExpiresInDays
	if days == 0 {
		days = defaultInviteDays
	}
	if days < 1 || days > maxInviteDays {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, fmt.Sprintf("Expiry must be between 1 and %d days", maxInviteDays), nil, "")
	}
	maxUses := 1
	if req.MaxUses != nil {
		maxUses = *req.MaxUses
	}
	if maxUses < 0 || maxUses > maxInviteUses {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, fmt.Sprintf("Uses must be between 0 (unlimited) and %d", maxInviteUses), nil, "")
	}

	token, err := newInviteToken()
	if err != nil {
		a.Log.Error("Failed to generate invite token", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to create invite", nil, "")
	}
	inv := models.OrganizationInvite{
		OrganizationID: orgID,
		TokenHash:      hashInviteToken(token),
		RoleID:         role.ID,
		Email:          req.Email,
		ExpiresAt:      time.Now().AddDate(0, 0, days),
		MaxUses:        maxUses,
		CreatedByID:    &userID,
	}
	if err := a.DB.Create(&inv).Error; err != nil {
		a.Log.Error("Failed to create invite", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to create invite", nil, "")
	}
	a.logAudit(orgID, userID, "invite", inv.ID, models.AuditActionCreated, nil,
		map[string]any{"role": role.Name, "email": inv.Email, "max_uses": inv.MaxUses, "expires_at": inv.ExpiresAt})

	resp := toInviteResponse(&inv, role.Name)
	resp.Token = token
	resp.Path = "/join/" + token
	return r.SendEnvelope(resp)
}

// ListInvites lists the current organization's invite links, newest first.
func (a *App) ListInvites(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceUsers, models.ActionRead)
	if err != nil {
		return nil
	}
	var invites []models.OrganizationInvite
	if err := a.DB.Where("organization_id = ?", orgID).Order("created_at DESC").Find(&invites).Error; err != nil {
		a.Log.Error("Failed to list invites", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list invites", nil, "")
	}
	roleNames := map[uuid.UUID]string{}
	var roles []models.CustomRole
	a.DB.Where("organization_id = ?", orgID).Find(&roles)
	for _, role := range roles {
		roleNames[role.ID] = role.Name
	}
	out := make([]InviteResponse, 0, len(invites))
	for i := range invites {
		out = append(out, toInviteResponse(&invites[i], roleNames[invites[i].RoleID]))
	}
	return r.SendEnvelope(map[string]any{"invites": out})
}

// DeleteInvite revokes an invite link.
func (a *App) DeleteInvite(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceUsers, models.ActionWrite)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "invite")
	if err != nil {
		return nil
	}
	res := a.DB.Where("id = ? AND organization_id = ?", id, orgID).Delete(&models.OrganizationInvite{})
	if res.Error != nil {
		a.Log.Error("Failed to delete invite", "error", res.Error)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to revoke invite", nil, "")
	}
	if res.RowsAffected == 0 {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Invite not found", nil, "")
	}
	a.logAudit(orgID, userID, "invite", id, models.AuditActionDeleted, nil, nil)
	return r.SendEnvelope(map[string]any{"success": true})
}

var errInviteUnusable = errors.New("invite unusable")

// findUsableInvite returns the invite for token if it exists, hasn't expired
// and has uses left.
func (a *App) findUsableInvite(db *gorm.DB, token string) (*models.OrganizationInvite, error) {
	if token == "" {
		return nil, errInviteUnusable
	}
	var inv models.OrganizationInvite
	if err := db.Where("token_hash = ?", hashInviteToken(token)).First(&inv).Error; err != nil {
		return nil, errInviteUnusable
	}
	if inviteStatus(&inv) != "active" {
		return nil, errInviteUnusable
	}
	return &inv, nil
}

const inviteInvalidMessage = "This invite link is invalid, has expired, or has already been used. Ask your admin for a new one."

// GetPublicInvite describes an invite so the join page can show who you're
// joining. No login required.
func (a *App) GetPublicInvite(r *fastglue.Request) error {
	token, _ := r.RequestCtx.UserValue("token").(string)
	inv, err := a.findUsableInvite(a.DB, token)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, inviteInvalidMessage, nil, "")
	}
	var org models.Organization
	if err := a.DB.Where("id = ?", inv.OrganizationID).First(&org).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, inviteInvalidMessage, nil, "")
	}
	var role models.CustomRole
	a.DB.Where("id = ?", inv.RoleID).First(&role)
	return r.SendEnvelope(map[string]any{
		"organization_name": org.Name,
		"role_name":         role.Name,
		"email":             inv.Email,
		"expires_at":        inv.ExpiresAt,
	})
}

// AcceptInviteRequest is the body for joining an organization with an invite.
type AcceptInviteRequest struct {
	Token    string `json:"token"`
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AcceptInvite joins the invite's organization and signs the person in. New
// people get an account; someone who already has one confirms their password
// and is added to the organization. No login required.
func (a *App) AcceptInvite(r *fastglue.Request) error {
	var req AcceptInviteRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	req.FullName = strings.TrimSpace(req.FullName)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	inv, err := a.findUsableInvite(a.DB, req.Token)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, inviteInvalidMessage, nil, "")
	}
	if !validEmail(req.Email) {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Please enter a valid email address", nil, "")
	}
	if inv.Email != "" && inv.Email != req.Email {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "This invite is for a different email address", nil, "")
	}
	if status, msg := a.orgAccessBlocked(&models.User{}, inv.OrganizationID); status != 0 {
		return r.SendErrorEnvelope(status, msg, nil, "")
	}

	var existing models.User
	existingFound := a.DB.Where("LOWER(email) = ?", req.Email).First(&existing).Error == nil
	if existingFound {
		if bcrypt.CompareHashAndPassword([]byte(existing.PasswordHash), []byte(req.Password)) != nil {
			return r.SendErrorEnvelope(fasthttp.StatusUnauthorized,
				"An account with this email already exists. Enter its password to join, or use a different email.", nil, "")
		}
		if !existing.IsActive {
			return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Account is disabled", nil, "")
		}
		var member int64
		a.DB.Model(&models.UserOrganization{}).
			Where("user_id = ? AND organization_id = ?", existing.ID, inv.OrganizationID).Count(&member)
		if member > 0 {
			return r.SendErrorEnvelope(fasthttp.StatusConflict, "You are already a member of this organization. Please sign in.", nil, "")
		}
	} else {
		if req.FullName == "" {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Your name is required", nil, "")
		}
		if len(req.Password) < minPasswordLength {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest,
				fmt.Sprintf("Password must be at least %d characters", minPasswordLength), nil, "")
		}
		var deleted int64
		a.DB.Unscoped().Model(&models.User{}).Where("LOWER(email) = ?", req.Email).Count(&deleted)
		if deleted > 0 {
			return r.SendErrorEnvelope(fasthttp.StatusConflict, "This email can't be used. Please contact your admin.", nil, "")
		}
	}

	var user models.User
	txErr := a.DB.Transaction(func(tx *gorm.DB) error {
		// Claim one use atomically so two people can't both use a single-use link.
		claim := tx.Model(&models.OrganizationInvite{}).
			Where("id = ? AND (max_uses = 0 OR used_count < max_uses) AND expires_at > ?", inv.ID, time.Now()).
			UpdateColumn("used_count", gorm.Expr("used_count + 1"))
		if claim.Error != nil {
			return claim.Error
		}
		if claim.RowsAffected == 0 {
			return errInviteUnusable
		}
		if status, _ := a.userLimitReached(tx, inv.OrganizationID); status != 0 {
			return errUserLimit
		}

		roleID := inv.RoleID
		if existingFound {
			user = existing
		} else {
			hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
			if err != nil {
				return err
			}
			user = models.User{
				OrganizationID: inv.OrganizationID,
				Email:          req.Email,
				PasswordHash:   string(hash),
				FullName:       req.FullName,
				RoleID:         &roleID,
				IsActive:       true,
				IsAvailable:    true,
				Settings:       models.JSONB{},
			}
			if err := tx.Create(&user).Error; err != nil {
				return err
			}
		}
		return tx.Create(&models.UserOrganization{
			UserID:         user.ID,
			OrganizationID: inv.OrganizationID,
			RoleID:         &roleID,
			IsDefault:      !existingFound,
		}).Error
	})
	switch {
	case errors.Is(txErr, errInviteUnusable):
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, inviteInvalidMessage, nil, "")
	case errors.Is(txErr, errUserLimit):
		_, msg := a.userLimitReached(a.DB, inv.OrganizationID)
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, msg+" Ask your admin to upgrade.", nil, "")
	case txErr != nil:
		a.Log.Error("Failed to accept invite", "error", txErr)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "We couldn't add you to the organization. Please try again.", nil, "")
	}

	a.logAudit(inv.OrganizationID, user.ID, "invite", inv.ID, models.AuditActionUpdated, nil,
		map[string]any{"accepted_by": user.Email})

	// Sign them in to the organization they just joined, with the invite's role.
	roleID := inv.RoleID
	user.OrganizationID = inv.OrganizationID
	user.RoleID = &roleID
	return a.sendAuthenticated(r, &user)
}

var errUserLimit = errors.New("plan user limit reached")
