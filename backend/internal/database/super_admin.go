package database

import (
	"errors"
	"fmt"
	"strings"

	"github.com/shridarpatil/whatomate/internal/config"
	"github.com/shridarpatil/whatomate/internal/models"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const minSuperAdminPasswordLength = 8

// EnsureSuperAdmin makes sure the account named in [super_admin] exists, is
// active and is a super admin. It runs on every start and is idempotent:
//   - If the account exists, it is (re)granted super admin and reactivated.
//     Its password is left alone, so a password changed in the app survives.
//   - Otherwise it is created with the configured password, as an admin of the
//     first organization (its home organization).
//
// It never removes super admin rights from anyone else; do that in the app.
func EnsureSuperAdmin(db *gorm.DB, cfg *config.SuperAdminConfig) error {
	if !cfg.Configured() {
		return nil
	}
	email := strings.ToLower(strings.TrimSpace(cfg.Email))

	var user models.User
	err := db.Unscoped().Where("LOWER(email) = ?", email).First(&user).Error
	switch {
	case err == nil:
		return db.Unscoped().Model(&user).Updates(map[string]any{
			"is_super_admin": true,
			"is_active":      true,
			"deleted_at":     nil,
		}).Error
	case !errors.Is(err, gorm.ErrRecordNotFound):
		return fmt.Errorf("failed to look up super admin: %w", err)
	}

	if len(cfg.Password) < minSuperAdminPasswordLength {
		return fmt.Errorf("super_admin.password must be at least %d characters to create %s", minSuperAdminPasswordLength, email)
	}

	return db.Transaction(func(tx *gorm.DB) error {
		var org models.Organization
		if err := tx.Order("created_at ASC").First(&org).Error; err != nil {
			org = models.Organization{Name: "Default Organization", Slug: "default", Settings: models.JSONB{}}
			if err := tx.Create(&org).Error; err != nil {
				return fmt.Errorf("failed to create home organization: %w", err)
			}
		}
		if err := SeedSystemRolesForOrg(tx, org.ID); err != nil {
			return err
		}
		var adminRole models.CustomRole
		if err := tx.Where("organization_id = ? AND name = ? AND is_system = ?", org.ID, "admin", true).
			First(&adminRole).Error; err != nil {
			return fmt.Errorf("failed to find admin role: %w", err)
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(cfg.Password), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("failed to hash super admin password: %w", err)
		}
		fullName := strings.TrimSpace(cfg.FullName)
		if fullName == "" {
			fullName = "Super Admin"
		}
		user = models.User{
			OrganizationID: org.ID,
			Email:          email,
			PasswordHash:   string(hash),
			FullName:       fullName,
			RoleID:         &adminRole.ID,
			IsActive:       true,
			IsAvailable:    true,
			IsSuperAdmin:   true,
			Settings:       models.JSONB{},
		}
		if err := tx.Create(&user).Error; err != nil {
			return fmt.Errorf("failed to create super admin: %w", err)
		}
		return tx.Create(&models.UserOrganization{
			UserID:         user.ID,
			OrganizationID: org.ID,
			RoleID:         &adminRole.ID,
			IsDefault:      true,
		}).Error
	})
}
