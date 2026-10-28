package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/shridarpatil/whatomate/internal/database"
	"github.com/shridarpatil/whatomate/internal/models"
)

// Super Admin panel: platform-wide management of vendors (organizations),
// subscription plans, public pages, platform configuration and support tickets.
// Every /api/super-admin/* handler is restricted to super admins.

// requireSuperAdmin returns the caller's user ID if they are a super admin.
// Otherwise it sends 401/403 and returns errEnvelopeSent.
func (a *App) requireSuperAdmin(r *fastglue.Request) (uuid.UUID, error) {
	userID, ok := r.RequestCtx.UserValue("user_id").(uuid.UUID)
	if !ok {
		_ = r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
		return uuid.Nil, errEnvelopeSent
	}
	if !a.IsSuperAdmin(userID) {
		_ = r.SendErrorEnvelope(fasthttp.StatusForbidden, "Super admin access required", nil, "")
		return uuid.Nil, errEnvelopeSent
	}
	return userID, nil
}

// ============================================================================
// Platform configuration
// ============================================================================

const platformConfigKey = "platform_config"

// PlatformConfig is the platform-wide configuration edited on the Configuration page.
type PlatformConfig struct {
	PlatformName             string `json:"platform_name"`
	SupportEmail             string `json:"support_email"`
	SupportPhone             string `json:"support_phone"`
	DefaultCurrency          string `json:"default_currency"`
	DefaultPlanID            string `json:"default_plan_id"` // empty = no plan
	TrialDays                int    `json:"trial_days"`
	RenewalReminderDays      int    `json:"renewal_reminder_days"`
	AllowVendorSignup        bool   `json:"allow_vendor_signup"`
	RequireEmailVerification bool   `json:"require_email_verification"`
	MaintenanceMode          bool   `json:"maintenance_mode"`
	MaintenanceMessage       string `json:"maintenance_message"`

	// General / branding
	ContactAddress string `json:"contact_address"`
	WebsiteURL     string `json:"website_url"`
	Timezone       string `json:"timezone"` // IANA name; the default for new businesses

	// How businesses connect their WhatsApp number
	EmbeddedSignupEnabled bool   `json:"embedded_signup_enabled"` // Meta "Connect with Facebook" popup
	ManualSignupEnabled   bool   `json:"manual_signup_enabled"`   // type in phone ID, WABA ID and token
	MetaAppID             string `json:"meta_app_id"`
	MetaConfigID          string `json:"meta_config_id"`
	// Button text businesses see on Settings → Accounts (editable by the super admin)
	EmbeddedButtonLabel string `json:"embedded_button_label"`
	ManualButtonLabel   string `json:"manual_button_label"`
	// Read-only in responses; the secret itself is stored encrypted under its own key.
	HasMetaAppSecret bool `json:"has_meta_app_secret"`
}

func defaultPlatformConfig() PlatformConfig {
	return PlatformConfig{
		PlatformName:          "onesuit",
		DefaultCurrency:       "USD",
		TrialDays:             14,
		RenewalReminderDays:   7,
		AllowVendorSignup:     true,
		MaintenanceMessage:    "We are performing scheduled maintenance. Please try again shortly.",
		Timezone:              "UTC",
		ManualSignupEnabled:   true,
		EmbeddedSignupEnabled: true, // only offered once Meta app keys exist
	}
}

// loadPlatformConfig reads the stored config over the defaults. A missing row
// (or an unreadable one) yields the defaults.
func (a *App) loadPlatformConfig() PlatformConfig {
	cfg := defaultPlatformConfig()
	var row models.PlatformSetting
	if err := a.DB.Where("key = ?", platformConfigKey).First(&row).Error; err != nil {
		return cfg
	}
	if raw, err := json.Marshal(row.Value); err == nil {
		_ = json.Unmarshal(raw, &cfg)
	}
	if cfg.PlatformName == "" || cfg.PlatformName == "Whatomate" {
		cfg.PlatformName = "onesuit"
	}
	return cfg
}

func (a *App) savePlatformConfig(cfg PlatformConfig) error {
	raw, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	value := models.JSONB{}
	if err := json.Unmarshal(raw, &value); err != nil {
		return err
	}
	row := models.PlatformSetting{Key: platformConfigKey, Value: value}
	return a.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(&row).Error
}

// SuperAdminGetConfig returns the platform configuration.
func (a *App) SuperAdminGetConfig(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	cfg := a.loadPlatformConfig()
	cfg.HasMetaAppSecret = a.platformMetaSecret() != ""
	return r.SendEnvelope(cfg)
}

// SuperAdminUpdateConfig updates the platform configuration. Fields missing
// from the request body keep their current value.
func (a *App) SuperAdminUpdateConfig(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}

	cfg := a.loadPlatformConfig()
	if err := json.Unmarshal(r.RequestCtx.PostBody(), &cfg); err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid request body", nil, "")
	}
	// Write-only secret fields travel beside the config.
	var secretReq struct {
		MetaAppSecret      *string `json:"meta_app_secret"`
		ClearMetaAppSecret bool    `json:"clear_meta_app_secret"`
	}
	_ = json.Unmarshal(r.RequestCtx.PostBody(), &secretReq)

	cfg.ContactAddress = strings.TrimSpace(cfg.ContactAddress)
	cfg.WebsiteURL = strings.TrimSpace(cfg.WebsiteURL)
	cfg.Timezone = strings.TrimSpace(cfg.Timezone)
	cfg.MetaAppID = strings.TrimSpace(cfg.MetaAppID)
	cfg.MetaConfigID = strings.TrimSpace(cfg.MetaConfigID)
	cfg.SupportPhone = strings.TrimSpace(cfg.SupportPhone)
	if cfg.Timezone == "" {
		cfg.Timezone = "UTC"
	}
	if _, err := time.LoadLocation(cfg.Timezone); err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Time zone must be a valid name such as Asia/Kolkata", nil, "")
	}
	if cfg.WebsiteURL != "" && !validWebURL(cfg.WebsiteURL) {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Website must start with http:// or https://", nil, "")
	}
	if len(cfg.ContactAddress) > 500 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Contact address must be 500 characters or fewer", nil, "")
	}
	cfg.EmbeddedButtonLabel = strings.TrimSpace(cfg.EmbeddedButtonLabel)
	cfg.ManualButtonLabel = strings.TrimSpace(cfg.ManualButtonLabel)
	if len(cfg.EmbeddedButtonLabel) > 40 || len(cfg.ManualButtonLabel) > 40 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Button text must be 40 characters or fewer", nil, "")
	}
	if !cfg.EmbeddedSignupEnabled && !cfg.ManualSignupEnabled {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Keep at least one way for businesses to connect WhatsApp turned on", nil, "")
	}

	cfg.PlatformName = strings.TrimSpace(cfg.PlatformName)
	cfg.SupportEmail = strings.TrimSpace(cfg.SupportEmail)
	cfg.DefaultCurrency = strings.ToUpper(strings.TrimSpace(cfg.DefaultCurrency))
	cfg.DefaultPlanID = strings.TrimSpace(cfg.DefaultPlanID)

	switch {
	case cfg.PlatformName == "":
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Platform name is required", nil, "")
	case cfg.SupportEmail != "" && !validEmail(cfg.SupportEmail):
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Support email is not a valid email address", nil, "")
	case !validCurrency(cfg.DefaultCurrency):
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Currency must be a 3-letter code such as USD", nil, "")
	case cfg.TrialDays < 0 || cfg.TrialDays > 365:
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Trial days must be between 0 and 365", nil, "")
	case cfg.RenewalReminderDays < 0 || cfg.RenewalReminderDays > 365:
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Renewal reminder days must be between 0 and 365", nil, "")
	}
	if cfg.DefaultPlanID != "" {
		if _, err := a.findPlan(cfg.DefaultPlanID); err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Default plan not found", nil, "")
		}
	}

	switch {
	case secretReq.ClearMetaAppSecret:
		if err := a.savePlatformMetaSecret(""); err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save configuration", nil, "")
		}
	case secretReq.MetaAppSecret != nil && strings.TrimSpace(*secretReq.MetaAppSecret) != "":
		if err := a.savePlatformMetaSecret(strings.TrimSpace(*secretReq.MetaAppSecret)); err != nil {
			a.Log.Error("Failed to save Meta app secret", "error", err)
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save configuration", nil, "")
		}
	}

	cfg.HasMetaAppSecret = false // never stored in the config row
	if err := a.savePlatformConfig(cfg); err != nil {
		a.Log.Error("Failed to save platform config", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save configuration", nil, "")
	}
	cfg.HasMetaAppSecret = a.platformMetaSecret() != ""
	return r.SendEnvelope(cfg)
}

// orgAccessBlocked reports whether a user may not sign in to (or keep
// refreshing a session for) orgID right now, because of maintenance mode or a
// suspended vendor. Super admins are never blocked. Returns status 0 when
// access is allowed.
func (a *App) orgAccessBlocked(user *models.User, orgID uuid.UUID) (int, string) {
	if user.IsSuperAdmin {
		return 0, ""
	}
	if cfg := a.loadPlatformConfig(); cfg.MaintenanceMode {
		msg := cfg.MaintenanceMessage
		if msg == "" {
			msg = defaultPlatformConfig().MaintenanceMessage
		}
		return fasthttp.StatusServiceUnavailable, msg
	}
	var sub models.OrganizationSubscription
	if err := a.DB.Select("status", "renewal_date").Where("organization_id = ?", orgID).First(&sub).Error; err == nil {
		if sub.Status == models.VendorStatusSuspended {
			return fasthttp.StatusForbidden, "This organization has been suspended. Please contact support."
		}
		if sub.Status == models.VendorStatusTrial && sub.RenewalDate != nil && sub.RenewalDate.Before(time.Now()) {
			return fasthttp.StatusForbidden, "Your free trial has ended. Please contact support to subscribe."
		}
	}
	return 0, ""
}

// ============================================================================
// Vendors (organizations)
// ============================================================================

// VendorResponse is a vendor (organization) as shown in the Super Admin panel.
type VendorResponse struct {
	ID            uuid.UUID  `json:"id"`
	Name          string     `json:"name"`
	Slug          string     `json:"slug"`
	OwnerName     string     `json:"owner_name"`
	OwnerEmail    string     `json:"owner_email"`
	Phone         string     `json:"phone"`
	Status        string     `json:"status"`
	PlanID        *uuid.UUID `json:"plan_id"`
	PlanName      string     `json:"plan_name"`
	UsersCount    int64      `json:"users_count"`
	ContactsCount int64      `json:"contacts_count"`
	CreatedAt     time.Time  `json:"created_at"`
	RenewalDate   *time.Time `json:"renewal_date"`
}

type orgCount struct {
	OrganizationID uuid.UUID
	N              int64
}

// loadVendors builds vendor rows for all organizations, or only the given ones.
func (a *App) loadVendors(ids ...uuid.UUID) ([]VendorResponse, error) {
	var rows []struct {
		ID          uuid.UUID
		Name        string
		Slug        string
		CreatedAt   time.Time
		Status      *string
		PlanID      *uuid.UUID
		PlanName    *string
		RenewalDate *time.Time
		OwnerName   *string
		OwnerEmail  *string
		OwnerPhone  *string
	}
	q := a.DB.Table("organizations o").
		Select(`o.id, o.name, o.slug, o.created_at, s.status, s.plan_id, p.name AS plan_name,
			s.renewal_date, s.owner_name, s.owner_email, s.owner_phone`).
		Joins("LEFT JOIN organization_subscriptions s ON s.organization_id = o.id AND s.deleted_at IS NULL").
		Joins("LEFT JOIN subscription_plans p ON p.id = s.plan_id").
		Where("o.deleted_at IS NULL")
	if len(ids) > 0 {
		q = q.Where("o.id IN ?", ids)
	} else if demoID := a.demoOrgID(); demoID != uuid.Nil {
		q = q.Where("o.id <> ?", demoID) // the shared demo workspace isn't a customer
	}
	if err := q.Order("o.name ASC").Scan(&rows).Error; err != nil {
		return nil, err
	}

	scope := func(q *gorm.DB) *gorm.DB {
		if len(ids) > 0 {
			return q.Where("organization_id IN ?", ids)
		}
		return q
	}

	var userCounts, contactCounts []orgCount
	if err := scope(a.DB.Table("user_organizations").Select("organization_id, COUNT(*) AS n").
		Where("deleted_at IS NULL")).Group("organization_id").Scan(&userCounts).Error; err != nil {
		return nil, err
	}
	if err := scope(a.DB.Table("contacts").Select("organization_id, COUNT(*) AS n").
		Where("deleted_at IS NULL")).Group("organization_id").Scan(&contactCounts).Error; err != nil {
		return nil, err
	}

	// Fallback owner: the first user created in the org.
	var owners []struct {
		OrganizationID uuid.UUID
		FullName       string
		Email          string
	}
	ownerQuery := `SELECT DISTINCT ON (organization_id) organization_id, full_name, email
		FROM users WHERE deleted_at IS NULL`
	ownerArgs := []any{}
	if len(ids) > 0 {
		ownerQuery += " AND organization_id IN ?"
		ownerArgs = append(ownerArgs, ids)
	}
	ownerQuery += " ORDER BY organization_id, created_at ASC"
	if err := a.DB.Raw(ownerQuery, ownerArgs...).Scan(&owners).Error; err != nil {
		return nil, err
	}

	users := countMap(userCounts)
	contacts := countMap(contactCounts)
	ownerByOrg := make(map[uuid.UUID]int, len(owners))
	for i, o := range owners {
		ownerByOrg[o.OrganizationID] = i
	}

	out := make([]VendorResponse, 0, len(rows))
	for _, row := range rows {
		v := VendorResponse{
			ID:            row.ID,
			Name:          row.Name,
			Slug:          row.Slug,
			Status:        models.VendorStatusActive,
			PlanID:        row.PlanID,
			UsersCount:    users[row.ID],
			ContactsCount: contacts[row.ID],
			CreatedAt:     row.CreatedAt,
			RenewalDate:   row.RenewalDate,
			OwnerName:     deref(row.OwnerName),
			OwnerEmail:    deref(row.OwnerEmail),
			Phone:         deref(row.OwnerPhone),
			PlanName:      deref(row.PlanName),
		}
		if row.Status != nil && *row.Status != "" {
			v.Status = *row.Status
		}
		if i, ok := ownerByOrg[row.ID]; ok {
			if v.OwnerName == "" {
				v.OwnerName = owners[i].FullName
			}
			if v.OwnerEmail == "" {
				v.OwnerEmail = owners[i].Email
			}
		}
		out = append(out, v)
	}
	return out, nil
}

func (a *App) loadVendor(id uuid.UUID) (*VendorResponse, error) {
	vendors, err := a.loadVendors(id)
	if err != nil {
		return nil, err
	}
	if len(vendors) == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return &vendors[0], nil
}

// SuperAdminListVendors returns every organization with its subscription details.
func (a *App) SuperAdminListVendors(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	vendors, err := a.loadVendors()
	if err != nil {
		a.Log.Error("Failed to list vendors", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list vendors", nil, "")
	}
	return r.SendEnvelope(vendors)
}

// VendorRequest is the body for creating or updating a vendor. Pointer fields
// are optional on update; an empty plan_id or renewal_date clears the value.
type VendorRequest struct {
	Name          *string `json:"name"`
	OwnerName     *string `json:"owner_name"`
	OwnerEmail    *string `json:"owner_email"`
	Phone         *string `json:"phone"`
	Status        *string `json:"status"`
	PlanID        *string `json:"plan_id"`
	RenewalDate   *string `json:"renewal_date"`
	OwnerPassword string  `json:"owner_password"` // create only: also creates the owner's admin login
}

// applyVendorRequest validates the request and copies it onto sub.
// Returns a user-facing error message, or "" on success.
func (a *App) applyVendorRequest(req *VendorRequest, sub *models.OrganizationSubscription) string {
	if req.OwnerName != nil {
		sub.OwnerName = strings.TrimSpace(*req.OwnerName)
	}
	if req.OwnerEmail != nil {
		email := strings.TrimSpace(*req.OwnerEmail)
		if email != "" && !validEmail(email) {
			return "Owner email is not a valid email address"
		}
		sub.OwnerEmail = email
	}
	if req.Phone != nil {
		sub.OwnerPhone = strings.TrimSpace(*req.Phone)
	}
	if req.Status != nil {
		switch *req.Status {
		case models.VendorStatusActive, models.VendorStatusTrial, models.VendorStatusSuspended:
			sub.Status = *req.Status
		default:
			return "Status must be active, trial or suspended"
		}
	}
	if req.PlanID != nil {
		if *req.PlanID == "" {
			sub.PlanID = nil
		} else {
			plan, err := a.findPlan(*req.PlanID)
			if err != nil {
				return "Plan not found"
			}
			sub.PlanID = &plan.ID
		}
	}
	if req.RenewalDate != nil {
		if *req.RenewalDate == "" {
			sub.RenewalDate = nil
		} else {
			t, ok := parseFlexibleDate(*req.RenewalDate)
			if !ok {
				return "Renewal date must be a date such as 2026-12-31"
			}
			sub.RenewalDate = &t
		}
	}
	return ""
}

// SuperAdminCreateVendor creates a new organization with its subscription.
// When owner_email and owner_password are given, it also creates the owner's
// admin login for the new organization.
func (a *App) SuperAdminCreateVendor(r *fastglue.Request) error {
	userID, err := a.requireSuperAdmin(r)
	if err != nil {
		return nil
	}

	var req VendorRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	name := ""
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
	}
	if name == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Vendor name is required", nil, "")
	}

	cfg := a.loadPlatformConfig()
	sub := models.OrganizationSubscription{Status: models.VendorStatusTrial}
	if cfg.DefaultPlanID != "" {
		if plan, err := a.findPlan(cfg.DefaultPlanID); err == nil {
			sub.PlanID = &plan.ID
		}
	}
	if msg := a.applyVendorRequest(&req, &sub); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	if sub.RenewalDate == nil && sub.Status == models.VendorStatusTrial {
		trialEnds := time.Now().AddDate(0, 0, cfg.TrialDays)
		sub.RenewalDate = &trialEnds
	}

	createOwner := req.OwnerPassword != ""
	if createOwner {
		if sub.OwnerEmail == "" {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Owner email is required to create their login", nil, "")
		}
		if len(req.OwnerPassword) < 8 {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Owner password must be at least 8 characters", nil, "")
		}
		var count int64
		a.DB.Model(&models.User{}).Where("email = ?", sub.OwnerEmail).Count(&count)
		if count > 0 {
			return r.SendErrorEnvelope(fasthttp.StatusConflict, "A user with this email already exists", nil, "")
		}
	}

	var org *models.Organization
	txErr := a.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		if org, err = createVendorOrganization(tx, name, cfg.Timezone); err != nil {
			return err
		}
		if err := database.SeedDefaultWidgetsForOrg(tx, org.ID, userID); err != nil {
			return err
		}
		sub.OrganizationID = org.ID
		if err := tx.Create(&sub).Error; err != nil {
			return err
		}
		if createOwner {
			_, err := createVendorOwner(tx, org.ID, sub.OwnerName, sub.OwnerEmail, req.OwnerPassword)
			return err
		}
		return nil
	})
	if txErr != nil {
		a.Log.Error("Failed to create vendor", "error", txErr, "name", name)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to create vendor", nil, "")
	}

	a.Log.Info("Super admin created vendor", "org_id", org.ID, "name", org.Name, "created_by", userID)
	a.logAudit(org.ID, userID, "organization", org.ID, models.AuditActionCreated, nil,
		map[string]any{"name": org.Name, "status": sub.Status, "plan_id": sub.PlanID})

	vendor, err := a.loadVendor(org.ID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Vendor created but could not be loaded", nil, "")
	}
	return r.SendEnvelope(vendor)
}

// createVendorOrganization creates an organization with the system roles and
// chatbot settings every organization needs. Callers add widgets, the
// subscription row and users.
func createVendorOrganization(tx *gorm.DB, name, timezone string) (*models.Organization, error) {
	settings := models.JSONB{}
	if timezone != "" {
		settings["timezone"] = timezone
	}
	org := models.Organization{Name: name, Slug: generateSlug(name), Settings: settings}
	if err := tx.Create(&org).Error; err != nil {
		return nil, err
	}
	if err := database.SeedSystemRolesForOrg(tx, org.ID); err != nil {
		return nil, err
	}
	if err := tx.Create(&models.ChatbotSettings{OrganizationID: org.ID, SessionTimeoutMins: 30}).Error; err != nil {
		return nil, err
	}
	return &org, nil
}

// createVendorOwner creates the vendor owner's login as an admin of orgID.
func createVendorOwner(tx *gorm.DB, orgID uuid.UUID, fullName, email, password string) (*models.User, error) {
	var adminRole models.CustomRole
	if err := tx.Where("organization_id = ? AND name = ? AND is_system = ?", orgID, "admin", true).
		First(&adminRole).Error; err != nil {
		return nil, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	if fullName == "" {
		fullName = email
	}
	owner := models.User{
		OrganizationID: orgID,
		Email:          email,
		PasswordHash:   string(hash),
		FullName:       fullName,
		RoleID:         &adminRole.ID,
		IsActive:       true,
		IsAvailable:    true,
		Settings:       models.JSONB{},
	}
	if err := tx.Create(&owner).Error; err != nil {
		return nil, err
	}
	if err := tx.Create(&models.UserOrganization{
		UserID:         owner.ID,
		OrganizationID: orgID,
		RoleID:         &adminRole.ID,
		IsDefault:      true,
	}).Error; err != nil {
		return nil, err
	}
	owner.Role = &adminRole
	return &owner, nil
}

// SuperAdminUpdateVendor updates a vendor's name and subscription details.
func (a *App) SuperAdminUpdateVendor(r *fastglue.Request) error {
	userID, err := a.requireSuperAdmin(r)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "vendor")
	if err != nil {
		return nil
	}

	var req VendorRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}

	var org models.Organization
	if err := a.DB.Where("id = ?", id).First(&org).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Vendor not found", nil, "")
	}

	var sub models.OrganizationSubscription
	if err := a.DB.Where("organization_id = ?", id).
		Attrs(models.OrganizationSubscription{OrganizationID: id, Status: models.VendorStatusActive}).
		FirstOrInit(&sub).Error; err != nil {
		a.Log.Error("Failed to load vendor subscription", "error", err, "org_id", id)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update vendor", nil, "")
	}
	before := sub
	beforeName := org.Name

	if msg := a.applyVendorRequest(&req, &sub); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Vendor name is required", nil, "")
		}
		org.Name = name
	}

	txErr := a.DB.Transaction(func(tx *gorm.DB) error {
		if org.Name != beforeName {
			if err := tx.Model(&org).Update("name", org.Name).Error; err != nil {
				return err
			}
		}
		return tx.Save(&sub).Error
	})
	if txErr != nil {
		a.Log.Error("Failed to update vendor", "error", txErr, "org_id", id)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update vendor", nil, "")
	}

	a.logAudit(id, userID, "organization", id, models.AuditActionUpdated,
		map[string]any{"name": beforeName, "status": before.Status, "plan_id": before.PlanID, "renewal_date": before.RenewalDate},
		map[string]any{"name": org.Name, "status": sub.Status, "plan_id": sub.PlanID, "renewal_date": sub.RenewalDate})

	vendor, err := a.loadVendor(id)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Vendor updated but could not be loaded", nil, "")
	}
	return r.SendEnvelope(vendor)
}

// ============================================================================
// Subscription plans
// ============================================================================

func (a *App) findPlan(id string) (*models.SubscriptionPlan, error) {
	planID, err := uuid.Parse(id)
	if err != nil {
		return nil, err
	}
	var plan models.SubscriptionPlan
	if err := a.DB.Where("id = ?", planID).First(&plan).Error; err != nil {
		return nil, err
	}
	return &plan, nil
}

// PlanRequest is the body for creating or updating a plan. Pointer fields are
// optional on update.
type PlanRequest struct {
	Name        *string   `json:"name"`
	Description *string   `json:"description"`
	Price       *float64  `json:"price"`
	Currency    *string   `json:"currency"`
	Interval    *string   `json:"interval"`
	MaxUsers    *int      `json:"max_users"`
	MaxContacts *int      `json:"max_contacts"`
	MaxAccounts *int      `json:"max_accounts"`
	Features    *[]string `json:"features"`
	IsActive    *bool     `json:"is_active"`
}

// apply validates the request and copies it onto plan. Returns a user-facing
// error message, or "" on success.
func (req *PlanRequest) apply(plan *models.SubscriptionPlan) string {
	if req.Name != nil {
		plan.Name = strings.TrimSpace(*req.Name)
	}
	if req.Description != nil {
		plan.Description = strings.TrimSpace(*req.Description)
	}
	if req.Price != nil {
		plan.Price = *req.Price
	}
	if req.Currency != nil {
		plan.Currency = strings.ToUpper(strings.TrimSpace(*req.Currency))
	}
	if req.Interval != nil {
		plan.Interval = *req.Interval
	}
	if req.MaxUsers != nil {
		plan.MaxUsers = *req.MaxUsers
	}
	if req.MaxContacts != nil {
		plan.MaxContacts = *req.MaxContacts
	}
	if req.MaxAccounts != nil {
		plan.MaxAccounts = *req.MaxAccounts
	}
	if req.Features != nil {
		features := make(models.StringArray, 0, len(*req.Features))
		for _, f := range *req.Features {
			if f = strings.TrimSpace(f); f != "" {
				features = append(features, f)
			}
		}
		plan.Features = features
	}
	if req.IsActive != nil {
		plan.IsActive = *req.IsActive
	}
	if plan.Features == nil {
		plan.Features = models.StringArray{}
	}

	switch {
	case plan.Name == "":
		return "Plan name is required"
	case plan.Price < 0:
		return "Price cannot be negative"
	case !validCurrency(plan.Currency):
		return "Currency must be a 3-letter code such as USD"
	case plan.Interval != models.BillingIntervalMonthly && plan.Interval != models.BillingIntervalYearly:
		return "Billing interval must be monthly or yearly"
	case plan.MaxUsers < 0 || plan.MaxContacts < 0 || plan.MaxAccounts < 0:
		return "Limits cannot be negative (use 0 for unlimited)"
	}
	return ""
}

// SuperAdminListPlans returns all subscription plans.
func (a *App) SuperAdminListPlans(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	plans := []models.SubscriptionPlan{} // non-nil so an empty list encodes as [], not null
	if err := a.DB.Order("price ASC, name ASC").Find(&plans).Error; err != nil {
		a.Log.Error("Failed to list plans", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list plans", nil, "")
	}
	return r.SendEnvelope(plans)
}

// SuperAdminCreatePlan creates a subscription plan.
func (a *App) SuperAdminCreatePlan(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	var req PlanRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	plan := models.SubscriptionPlan{
		Currency: a.loadPlatformConfig().DefaultCurrency,
		Interval: models.BillingIntervalMonthly,
		IsActive: true,
	}
	if msg := req.apply(&plan); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	if err := a.DB.Create(&plan).Error; err != nil {
		a.Log.Error("Failed to create plan", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to create plan", nil, "")
	}
	return r.SendEnvelope(plan)
}

// SuperAdminUpdatePlan updates a subscription plan.
func (a *App) SuperAdminUpdatePlan(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "plan")
	if err != nil {
		return nil
	}
	var req PlanRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	plan, err := a.findPlan(id.String())
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Plan not found", nil, "")
	}
	if msg := req.apply(plan); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	if err := a.DB.Save(plan).Error; err != nil {
		a.Log.Error("Failed to update plan", "error", err, "plan_id", id)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update plan", nil, "")
	}
	return r.SendEnvelope(plan)
}

// SuperAdminDeletePlan deletes a plan that no vendor is on.
func (a *App) SuperAdminDeletePlan(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "plan")
	if err != nil {
		return nil
	}
	plan, err := a.findPlan(id.String())
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Plan not found", nil, "")
	}

	var inUse int64
	a.DB.Model(&models.OrganizationSubscription{}).Where("plan_id = ?", plan.ID).Count(&inUse)
	if inUse > 0 {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "This plan still has vendors on it. Move them to another plan first.", nil, "")
	}
	if a.loadPlatformConfig().DefaultPlanID == plan.ID.String() {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "This is the default plan for new vendors. Choose another default in Configuration first.", nil, "")
	}

	if err := a.DB.Delete(plan).Error; err != nil {
		a.Log.Error("Failed to delete plan", "error", err, "plan_id", id)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete plan", nil, "")
	}
	return r.SendEnvelope(map[string]any{"success": true})
}

// ============================================================================
// Pages (CMS)
// ============================================================================

var pageSlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
var nonSlugChars = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	return strings.Trim(nonSlugChars.ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), "-"), "-")
}

// PageRequest is the body for creating or updating a page.
type PageRequest struct {
	Title       *string `json:"title"`
	Slug        *string `json:"slug"`
	Content     *string `json:"content"`
	IsPublished *bool   `json:"is_published"`
}

// applyPageRequest validates the request and copies it onto page. Returns a
// status and user-facing message on failure, or 0 on success.
func (a *App) applyPageRequest(req *PageRequest, page *models.CMSPage) (int, string) {
	if req.Title != nil {
		page.Title = strings.TrimSpace(*req.Title)
	}
	if req.Content != nil {
		page.Content = *req.Content
	}
	if req.IsPublished != nil {
		page.IsPublished = *req.IsPublished
	}
	if req.Slug != nil && strings.TrimSpace(*req.Slug) != "" {
		page.Slug = slugify(*req.Slug)
	} else if page.Slug == "" {
		page.Slug = slugify(page.Title)
	}

	if page.Title == "" {
		return fasthttp.StatusBadRequest, "Page title is required"
	}
	if !pageSlugPattern.MatchString(page.Slug) || len(page.Slug) > 150 {
		return fasthttp.StatusBadRequest, "URL slug may only contain lowercase letters, numbers and dashes"
	}
	var taken int64
	q := a.DB.Model(&models.CMSPage{}).Where("slug = ?", page.Slug)
	if page.ID != uuid.Nil {
		q = q.Where("id <> ?", page.ID)
	}
	q.Count(&taken)
	if taken > 0 {
		return fasthttp.StatusConflict, "Another page already uses /" + page.Slug
	}
	return 0, ""
}

// SuperAdminListPages returns all pages, newest first.
func (a *App) SuperAdminListPages(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	pages := []models.CMSPage{} // non-nil so an empty list encodes as [], not null
	if err := a.DB.Order("updated_at DESC").Find(&pages).Error; err != nil {
		a.Log.Error("Failed to list pages", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list pages", nil, "")
	}
	return r.SendEnvelope(pages)
}

// SuperAdminCreatePage creates a page.
func (a *App) SuperAdminCreatePage(r *fastglue.Request) error {
	userID, err := a.requireSuperAdmin(r)
	if err != nil {
		return nil
	}
	var req PageRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	page := models.CMSPage{UpdatedByID: &userID}
	if status, msg := a.applyPageRequest(&req, &page); status != 0 {
		return r.SendErrorEnvelope(status, msg, nil, "")
	}
	if err := a.DB.Create(&page).Error; err != nil {
		a.Log.Error("Failed to create page", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to create page", nil, "")
	}
	return r.SendEnvelope(page)
}

// SuperAdminUpdatePage updates a page.
func (a *App) SuperAdminUpdatePage(r *fastglue.Request) error {
	userID, err := a.requireSuperAdmin(r)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "page")
	if err != nil {
		return nil
	}
	var req PageRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	var page models.CMSPage
	if err := a.DB.Where("id = ?", id).First(&page).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Page not found", nil, "")
	}
	if status, msg := a.applyPageRequest(&req, &page); status != 0 {
		return r.SendErrorEnvelope(status, msg, nil, "")
	}
	page.UpdatedByID = &userID
	if err := a.DB.Save(&page).Error; err != nil {
		a.Log.Error("Failed to update page", "error", err, "page_id", id)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update page", nil, "")
	}
	return r.SendEnvelope(page)
}

// SuperAdminDeletePage deletes a page.
func (a *App) SuperAdminDeletePage(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "page")
	if err != nil {
		return nil
	}
	res := a.DB.Where("id = ?", id).Delete(&models.CMSPage{})
	if res.Error != nil {
		a.Log.Error("Failed to delete page", "error", res.Error, "page_id", id)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete page", nil, "")
	}
	if res.RowsAffected == 0 {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Page not found", nil, "")
	}
	return r.SendEnvelope(map[string]any{"success": true})
}

// GetPublicPage returns a published page by slug. No login required.
func (a *App) GetPublicPage(r *fastglue.Request) error {
	slug, _ := r.RequestCtx.UserValue("slug").(string)
	var page models.CMSPage
	if err := a.DB.Where("slug = ? AND is_published = ?", slug, true).First(&page).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Page not found", nil, "")
	}
	return r.SendEnvelope(map[string]any{
		"title":      page.Title,
		"slug":       page.Slug,
		"content":    page.Content,
		"updated_at": page.UpdatedAt,
	})
}

// ============================================================================
// Support tickets
// ============================================================================

// SupportTicketResponse is a ticket with vendor and creator details and conversation replies.
type SupportTicketResponse struct {
	models.SupportTicket
	VendorName   string                      `json:"vendor_name"`
	CreatorName  string                      `json:"creator_name,omitempty"`
	CreatorEmail string                      `json:"creator_email,omitempty"`
	Replies      []models.SupportTicketReply `gorm:"-" json:"replies"`
}

func (a *App) listTickets(orgID *uuid.UUID, status string) ([]SupportTicketResponse, error) {
	q := a.DB.Table("support_tickets t").
		Select("t.*, o.name AS vendor_name, u.full_name AS creator_name, u.email AS creator_email").
		Joins("LEFT JOIN organizations o ON o.id = t.organization_id").
		Joins("LEFT JOIN users u ON u.id = t.created_by_id").
		Where("t.deleted_at IS NULL")
	if orgID != nil {
		q = q.Where("t.organization_id = ?", *orgID)
	}
	if status != "" {
		q = q.Where("t.status = ?", status)
	}
	tickets := []SupportTicketResponse{} // non-nil so an empty list encodes as [], not null
	if err := q.Order("t.created_at DESC").Scan(&tickets).Error; err != nil {
		return nil, err
	}
	for i := range tickets {
		var replies []models.SupportTicketReply
		if err := a.DB.Where("ticket_id = ? AND deleted_at IS NULL", tickets[i].ID).Order("created_at ASC").Find(&replies).Error; err == nil {
			tickets[i].Replies = replies
		} else {
			tickets[i].Replies = []models.SupportTicketReply{}
		}
	}
	return tickets, nil
}

func validTicketPriority(p string) bool {
	return p == models.TicketPriorityLow || p == models.TicketPriorityMedium || p == models.TicketPriorityHigh
}

// SuperAdminListTickets lists tickets from all vendors. Optional ?status=open|solved.
func (a *App) SuperAdminListTickets(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	status := string(r.RequestCtx.QueryArgs().Peek("status"))
	if status != "" && status != models.TicketStatusOpen && status != models.TicketStatusSolved {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Status must be open or solved", nil, "")
	}
	tickets, err := a.listTickets(nil, status)
	if err != nil {
		a.Log.Error("Failed to list tickets", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list tickets", nil, "")
	}
	return r.SendEnvelope(tickets)
}

// UpdateTicketRequest is the body for changing a ticket's status or priority.
type UpdateTicketRequest struct {
	Status   *string `json:"status"`
	Priority *string `json:"priority"`
}

// SuperAdminUpdateTicket marks a ticket solved/open or changes its priority.
func (a *App) SuperAdminUpdateTicket(r *fastglue.Request) error {
	userID, err := a.requireSuperAdmin(r)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "ticket")
	if err != nil {
		return nil
	}
	var req UpdateTicketRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	var ticket models.SupportTicket
	if err := a.DB.Where("id = ?", id).First(&ticket).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Ticket not found", nil, "")
	}

	if req.Priority != nil {
		if !validTicketPriority(*req.Priority) {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Priority must be low, medium or high", nil, "")
		}
		ticket.Priority = *req.Priority
	}
	if req.Status != nil && *req.Status != ticket.Status {
		switch *req.Status {
		case models.TicketStatusSolved:
			now := time.Now()
			ticket.SolvedAt = &now
			ticket.SolvedByID = &userID
		case models.TicketStatusOpen:
			ticket.SolvedAt = nil
			ticket.SolvedByID = nil
		default:
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Status must be open or solved", nil, "")
		}
		ticket.Status = *req.Status
	}

	if err := a.DB.Save(&ticket).Error; err != nil {
		a.Log.Error("Failed to update ticket", "error", err, "ticket_id", id)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update ticket", nil, "")
	}
	return r.SendEnvelope(ticket)
}

// GetSupportTicket returns a single ticket with full details and all conversation replies.
func (a *App) GetSupportTicket(r *fastglue.Request) error {
	id, err := parsePathUUID(r, "id", "ticket")
	if err != nil {
		return nil
	}
	var ticket SupportTicketResponse
	err = a.DB.Table("support_tickets t").
		Select("t.*, o.name AS vendor_name, u.full_name AS creator_name, u.email AS creator_email").
		Joins("LEFT JOIN organizations o ON o.id = t.organization_id").
		Joins("LEFT JOIN users u ON u.id = t.created_by_id").
		Where("t.id = ? AND t.deleted_at IS NULL", id).
		Scan(&ticket).Error
	if err != nil || ticket.ID == uuid.Nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Ticket not found", nil, "")
	}

	userID, _ := r.RequestCtx.UserValue("user_id").(uuid.UUID)
	if !a.IsSuperAdmin(userID) {
		orgID, _, err := a.getOrgAndUserID(r)
		if err != nil || orgID != ticket.OrganizationID {
			return r.SendErrorEnvelope(fasthttp.StatusForbidden, "Access denied", nil, "")
		}
	}

	var replies []models.SupportTicketReply
	if err := a.DB.Where("ticket_id = ? AND deleted_at IS NULL", ticket.ID).Order("created_at ASC").Find(&replies).Error; err == nil {
		ticket.Replies = replies
	} else {
		ticket.Replies = []models.SupportTicketReply{}
	}

	return r.SendEnvelope(ticket)
}

// ListMySupportTickets lists the current organization's tickets.
func (a *App) ListMySupportTickets(r *fastglue.Request) error {
	orgID, _, err := a.getOrgAndUserID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	tickets, err := a.listTickets(&orgID, "")
	if err != nil {
		a.Log.Error("Failed to list tickets", "error", err, "org_id", orgID)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list tickets", nil, "")
	}
	return r.SendEnvelope(tickets)
}

// CreateSupportTicketRequest is the body for raising a support ticket.
type CreateSupportTicketRequest struct {
	Subject     string `json:"subject"`
	Description string `json:"description"`
	Priority    string `json:"priority"`
	ImageURL    string `json:"image_url"`
}

// CreateSupportTicket raises a ticket for the current organization. Any
// signed-in member of the organization can raise one.
func (a *App) CreateSupportTicket(r *fastglue.Request) error {
	orgID, userID, err := a.getOrgAndUserID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	var req CreateSupportTicketRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	req.Subject = strings.TrimSpace(req.Subject)
	if req.Subject == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Subject is required", nil, "")
	}
	if len(req.Subject) > 255 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Subject must be 255 characters or fewer", nil, "")
	}
	if req.Priority == "" {
		req.Priority = models.TicketPriorityMedium
	}
	if !validTicketPriority(req.Priority) {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Priority must be low, medium or high", nil, "")
	}

	ticket := models.SupportTicket{
		OrganizationID: orgID,
		CreatedByID:    &userID,
		Subject:        req.Subject,
		Description:    strings.TrimSpace(req.Description),
		ImageURL:       strings.TrimSpace(req.ImageURL),
		Priority:       req.Priority,
		Status:         models.TicketStatusOpen,
	}
	if err := a.DB.Create(&ticket).Error; err != nil {
		a.Log.Error("Failed to create ticket", "error", err, "org_id", orgID)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to create ticket", nil, "")
	}
	return r.SendEnvelope(ticket)
}

// TicketReplyRequest is the payload for adding a reply to a support ticket.
type TicketReplyRequest struct {
	Message  string `json:"message"`
	ImageURL string `json:"image_url"`
}

// AddSupportTicketReply posts a new reply message and/or image to a ticket.
func (a *App) AddSupportTicketReply(r *fastglue.Request) error {
	id, err := parsePathUUID(r, "id", "ticket")
	if err != nil {
		return nil
	}
	var ticket models.SupportTicket
	if err := a.DB.Where("id = ? AND deleted_at IS NULL", id).First(&ticket).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Ticket not found", nil, "")
	}

	var req TicketReplyRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	req.Message = strings.TrimSpace(req.Message)
	req.ImageURL = strings.TrimSpace(req.ImageURL)
	if req.Message == "" && req.ImageURL == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Message or image is required", nil, "")
	}

	userID, _ := r.RequestCtx.UserValue("user_id").(uuid.UUID)
	var senderRole string
	var senderName string

	if a.IsSuperAdmin(userID) {
		senderRole = "super_admin"
		senderName = "Super Admin (Platform Support)"
		var u models.User
		if err := a.DB.Where("id = ?", userID).First(&u).Error; err == nil && u.FullName != "" {
			senderName = u.FullName + " (Platform Support)"
		}
	} else {
		orgID, _, err := a.getOrgAndUserID(r)
		if err != nil || orgID != ticket.OrganizationID {
			return r.SendErrorEnvelope(fasthttp.StatusForbidden, "Access denied", nil, "")
		}
		senderRole = "user"
		senderName = "Client"
		var u models.User
		if err := a.DB.Where("id = ?", userID).First(&u).Error; err == nil {
			if u.FullName != "" {
				senderName = u.FullName
			} else if u.Email != "" {
				senderName = u.Email
			}
		}
	}

	reply := models.SupportTicketReply{
		TicketID:   ticket.ID,
		UserID:     &userID,
		SenderRole: senderRole,
		SenderName: senderName,
		Message:    req.Message,
		ImageURL:   req.ImageURL,
	}
	if err := a.DB.Create(&reply).Error; err != nil {
		a.Log.Error("Failed to save ticket reply", "error", err, "ticket_id", ticket.ID)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save reply", nil, "")
	}

	now := time.Now()
	_ = a.DB.Model(&ticket).Update("updated_at", now)

	return r.SendEnvelope(reply)
}

// UploadTicketImage handles uploading images for support tickets (PNG, JPEG, WebP, GIF up to 10MB).
func (a *App) UploadTicketImage(r *fastglue.Request) error {
	fh, err := r.RequestCtx.FormFile("file")
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Please choose an image to upload", nil, "")
	}
	const maxTicketImageBytes = 10 * 1024 * 1024 // 10MB
	if fh.Size > maxTicketImageBytes {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "The image must be 10 MB or smaller", nil, "")
	}
	f, err := fh.Open()
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Couldn't read the file", nil, "")
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxTicketImageBytes+1))
	if err != nil || len(data) == 0 || int64(len(data)) > maxTicketImageBytes {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Couldn't read the file", nil, "")
	}

	mime := http.DetectContentType(data)
	ext := ""
	switch {
	case strings.HasPrefix(mime, "image/jpeg"):
		ext = ".jpg"
	case strings.HasPrefix(mime, "image/png"):
		ext = ".png"
	case strings.HasPrefix(mime, "image/webp"):
		ext = ".webp"
	case strings.HasPrefix(mime, "image/gif"):
		ext = ".gif"
	default:
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Allowed formats: PNG, JPEG, WebP, GIF", nil, "")
	}

	mediaDir := filepath.Join(a.getMediaStoragePath(), "tickets")
	if err := os.MkdirAll(mediaDir, 0755); err != nil {
		a.Log.Error("Failed to create tickets media directory", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Storage error", nil, "")
	}

	filename := fmt.Sprintf("%s%s", uuid.New().String(), ext)
	filePath := filepath.Join(mediaDir, filename)
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		a.Log.Error("Failed to save ticket image", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save file", nil, "")
	}

	imageURL := fmt.Sprintf("/api/support-tickets/media/%s", filename)
	return r.SendEnvelope(map[string]string{
		"url":      imageURL,
		"filename": filename,
		"mime":     mime,
	})
}

// ServeTicketMedia serves uploaded ticket images safely.
func (a *App) ServeTicketMedia(r *fastglue.Request) error {
	filename := r.RequestCtx.UserValue("filename")
	if filename == nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Filename missing", nil, "")
	}
	cleanName := filepath.Base(fmt.Sprint(filename))
	if cleanName == "." || cleanName == "/" || strings.Contains(cleanName, "..") {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid filename", nil, "")
	}

	baseDir, err := filepath.Abs(filepath.Join(a.getMediaStoragePath(), "tickets"))
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Storage configuration error", nil, "")
	}
	fullPath := filepath.Join(baseDir, cleanName)

	data, err := os.ReadFile(fullPath)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Image not found", nil, "")
	}

	ext := strings.ToLower(filepath.Ext(cleanName))
	contentType := "image/jpeg"
	switch ext {
	case ".png":
		contentType = "image/png"
	case ".webp":
		contentType = "image/webp"
	case ".gif":
		contentType = "image/gif"
	}

	r.RequestCtx.Response.Header.Set("Content-Type", contentType)
	r.RequestCtx.Response.Header.Set("Cache-Control", "public, max-age=86400")
	r.RequestCtx.Response.Header.Set("X-Content-Type-Options", "nosniff")
	r.RequestCtx.SetStatusCode(fasthttp.StatusOK)
	r.RequestCtx.SetBody(data)
	return nil
}

// ============================================================================
// Dashboard
// ============================================================================

// SuperAdminDashboardPlan is a plan with the number of vendors on it.
type SuperAdminDashboardPlan struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Price       float64   `json:"price"`
	Currency    string    `json:"currency"`
	Interval    string    `json:"interval"`
	IsActive    bool      `json:"is_active"`
	VendorCount int       `json:"vendor_count"`
}

// SuperAdminDashboardResponse is the payload for the Super Admin dashboard.
type SuperAdminDashboardResponse struct {
	TotalVendors       int                       `json:"total_vendors"`
	ActiveVendors      int                       `json:"active_vendors"`
	TrialVendors       int                       `json:"trial_vendors"`
	SuspendedVendors   int                       `json:"suspended_vendors"`
	NextRenewal        *VendorResponse           `json:"next_renewal"`
	RenewalsNext30Days int                       `json:"renewals_next_30_days"`
	UpcomingRenewals   []VendorResponse          `json:"upcoming_renewals"`
	Plans              []SuperAdminDashboardPlan `json:"plans"`
	TicketsSolved      int64                     `json:"tickets_solved"`
	TicketsNew         int64                     `json:"tickets_new"`
	RecentTickets      []SupportTicketResponse   `json:"recent_tickets"`
}

// SuperAdminDashboard returns platform-wide totals for the dashboard.
func (a *App) SuperAdminDashboard(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}

	vendors, err := a.loadVendors()
	if err != nil {
		a.Log.Error("Failed to load vendors for dashboard", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load dashboard", nil, "")
	}
	var plans []models.SubscriptionPlan
	if err := a.DB.Order("price ASC, name ASC").Find(&plans).Error; err != nil {
		a.Log.Error("Failed to load plans for dashboard", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load dashboard", nil, "")
	}

	resp := SuperAdminDashboardResponse{
		TotalVendors:     len(vendors),
		UpcomingRenewals: []VendorResponse{},
		Plans:            make([]SuperAdminDashboardPlan, 0, len(plans)),
	}

	now := time.Now()
	in30Days := now.AddDate(0, 0, 30)
	perPlan := map[uuid.UUID]int{}
	var upcoming []VendorResponse
	for _, v := range vendors {
		switch v.Status {
		case models.VendorStatusActive:
			resp.ActiveVendors++
		case models.VendorStatusTrial:
			resp.TrialVendors++
		case models.VendorStatusSuspended:
			resp.SuspendedVendors++
		}
		if v.PlanID != nil {
			perPlan[*v.PlanID]++
		}
		if v.Status != models.VendorStatusSuspended && v.RenewalDate != nil && !v.RenewalDate.Before(now) {
			upcoming = append(upcoming, v)
			if v.RenewalDate.Before(in30Days) {
				resp.RenewalsNext30Days++
			}
		}
	}
	sort.Slice(upcoming, func(i, j int) bool { return upcoming[i].RenewalDate.Before(*upcoming[j].RenewalDate) })
	if len(upcoming) > 0 {
		resp.NextRenewal = &upcoming[0]
		resp.UpcomingRenewals = upcoming[:min(5, len(upcoming))]
	}

	for _, p := range plans {
		resp.Plans = append(resp.Plans, SuperAdminDashboardPlan{
			ID: p.ID, Name: p.Name, Price: p.Price, Currency: p.Currency,
			Interval: p.Interval, IsActive: p.IsActive, VendorCount: perPlan[p.ID],
		})
	}

	a.DB.Model(&models.SupportTicket{}).Where("status = ?", models.TicketStatusSolved).Count(&resp.TicketsSolved)
	a.DB.Model(&models.SupportTicket{}).Where("status = ?", models.TicketStatusOpen).Count(&resp.TicketsNew)
	openTickets, err := a.listTickets(nil, models.TicketStatusOpen)
	if err != nil {
		a.Log.Error("Failed to load tickets for dashboard", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load dashboard", nil, "")
	}
	resp.RecentTickets = openTickets[:min(10, len(openTickets))]
	if resp.RecentTickets == nil {
		resp.RecentTickets = []SupportTicketResponse{}
	}

	return r.SendEnvelope(resp)
}

// ============================================================================
// Small helpers
// ============================================================================

func validEmail(s string) bool {
	addr, err := mail.ParseAddress(s)
	return err == nil && addr.Address == s
}

func validCurrency(s string) bool {
	if len(s) != 3 {
		return false
	}
	for _, c := range s {
		if c < 'A' || c > 'Z' {
			return false
		}
	}
	return true
}

// parseFlexibleDate accepts RFC 3339 timestamps or plain YYYY-MM-DD dates.
func parseFlexibleDate(s string) (time.Time, bool) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, true
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t, true
	}
	return time.Time{}, false
}

func countMap(rows []orgCount) map[uuid.UUID]int64 {
	m := make(map[uuid.UUID]int64, len(rows))
	for _, r := range rows {
		m[r.OrganizationID] = r.N
	}
	return m
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
