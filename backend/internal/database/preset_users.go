package database

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// PresetAccount defines a built-in login credential for local development and testing.
type PresetAccount struct {
	Email        string
	FullName     string
	RoleName     string // "admin", "manager", "agent", "explorer"
	IsSuperAdmin bool
	UseDemoOrg   bool
}

// DefaultPresetAccounts defines standard logins with password "admin123".
var DefaultPresetAccounts = []PresetAccount{
	{
		Email:        "superadmin@login.com",
		FullName:     "Super Admin",
		RoleName:     "admin",
		IsSuperAdmin: true,
		UseDemoOrg:   false,
	},
	{
		Email:        "admin@login.com",
		FullName:     "Admin User",
		RoleName:     "admin",
		IsSuperAdmin: false,
		UseDemoOrg:   false,
	},
	{
		Email:        "manager@login.com",
		FullName:     "Manager User",
		RoleName:     "manager",
		IsSuperAdmin: false,
		UseDemoOrg:   false,
	},
	{
		Email:        "agent@login.com",
		FullName:     "Support Agent",
		RoleName:     "agent",
		IsSuperAdmin: false,
		UseDemoOrg:   false,
	},
	{
		Email:        "user@login.com",
		FullName:     "Standard User",
		RoleName:     "agent",
		IsSuperAdmin: false,
		UseDemoOrg:   false,
	},
	{
		Email:        "explorer@login.com",
		FullName:     "Demo Explorer",
		RoleName:     "explorer",
		IsSuperAdmin: false,
		UseDemoOrg:   true,
	},
}

// EnsurePresetLoginUsers ensures all standard test/login accounts exist and have password "admin123".
func EnsurePresetLoginUsers(db *gorm.DB) error {
	defaultPass := "admin123"
	hash, err := bcrypt.GenerateFromPassword([]byte(defaultPass), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}
	hashStr := string(hash)

	// Get primary organization
	var defaultOrg models.Organization
	if err := db.Order("created_at ASC").First(&defaultOrg).Error; err != nil {
		defaultOrg = models.Organization{Name: "Default Organization", Slug: "default", Settings: models.JSONB{}}
		if err := db.Create(&defaultOrg).Error; err != nil {
			return fmt.Errorf("failed to get or create organization: %w", err)
		}
	}
	_ = SeedSystemRolesForOrg(db, defaultOrg.ID)

	demoOrgID := DemoWorkspaceID(db)

	for _, preset := range DefaultPresetAccounts {
		email := strings.ToLower(strings.TrimSpace(preset.Email))
		orgID := defaultOrg.ID
		if preset.UseDemoOrg && demoOrgID != uuid.Nil {
			orgID = demoOrgID
		}

		var role models.CustomRole
		if err := db.Where("organization_id = ? AND name = ?", orgID, preset.RoleName).First(&role).Error; err != nil {
			if err := db.Where("organization_id = ? AND name = ?", defaultOrg.ID, preset.RoleName).First(&role).Error; err != nil {
				_ = db.Where("organization_id = ? AND name = 'admin'", defaultOrg.ID).First(&role)
			}
		}

		var existing models.User
		err := db.Unscoped().Where("LOWER(email) = ?", email).First(&existing).Error
		if err == nil {
			updates := map[string]any{
				"password_hash":  hashStr,
				"is_active":      true,
				"is_super_admin": preset.IsSuperAdmin,
				"deleted_at":     nil,
			}
			if role.ID != uuid.Nil {
				updates["role_id"] = role.ID
			}
			if err := db.Unscoped().Model(&existing).Updates(updates).Error; err != nil {
				return fmt.Errorf("failed to update preset user %s: %w", email, err)
			}

			// Ensure user_organization entry
			var userOrg models.UserOrganization
			if db.Where("user_id = ? AND organization_id = ?", existing.ID, orgID).First(&userOrg).Error != nil {
				db.Create(&models.UserOrganization{
					BaseModel:      models.BaseModel{ID: uuid.New()},
					UserID:         existing.ID,
					OrganizationID: orgID,
					RoleID:         &role.ID,
					IsDefault:      true,
				})
			}
		} else {
			newUser := models.User{
				BaseModel:      models.BaseModel{ID: uuid.New()},
				OrganizationID: orgID,
				Email:          email,
				PasswordHash:   hashStr,
				FullName:       preset.FullName,
				IsActive:       true,
				IsAvailable:    true,
				IsSuperAdmin:   preset.IsSuperAdmin,
				Settings:       models.JSONB{},
			}
			if role.ID != uuid.Nil {
				newUser.RoleID = &role.ID
			}
			if err := db.Create(&newUser).Error; err != nil {
				return fmt.Errorf("failed to create preset user %s: %w", email, err)
			}

			db.Create(&models.UserOrganization{
				BaseModel:      models.BaseModel{ID: uuid.New()},
				UserID:         newUser.ID,
				OrganizationID: orgID,
				RoleID:         newUser.RoleID,
				IsDefault:      true,
			})
		}
	}

	// Update legacy admin accounts to admin123
	_ = db.Model(&models.User{}).Where("email IN ?", []string{
		"admin@admin.com",
		"superadmin@whatomate.local",
	}).Updates(map[string]any{
		"password_hash": hashStr,
		"is_active":     true,
	})

	return nil
}
