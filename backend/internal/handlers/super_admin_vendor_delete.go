package handlers

import (
	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"

	"github.com/shridarpatil/whatomate/internal/models"
)

// SuperAdminDeleteVendor removes a client's workspace: it soft-deletes the
// organization, its subscription and WhatsApp accounts (so incoming webhooks no
// longer route to it), removes every membership in it and deletes the users
// whose only workspace it was. Their sessions stop working because the
// organization (and, for removed users, the user) no longer loads.
//
// Any client can be deleted except the shared demo workspace. Super admins in
// it are never deleted: they move to the platform's own workspace.
func (a *App) SuperAdminDeleteVendor(r *fastglue.Request) error {
	userID, err := a.requireSuperAdmin(r)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "vendor")
	if err != nil {
		return nil
	}

	var org models.Organization
	if err := a.DB.Where("id = ?", id).First(&org).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Vendor not found", nil, "")
	}

	if demoID := a.demoOrgID(); demoID != uuid.Nil && id == demoID {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "The demo workspace can't be deleted", nil, "")
	}
	if org.Name == platformOrgName {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "The platform workspace can't be deleted", nil, "")
	}

	// Super admins in this workspace are kept: they move to the platform's own
	// workspace (made on first need) so their login keeps working.
	var superAdminIDs []uuid.UUID
	if err := a.DB.Model(&models.User{}).
		Where("is_super_admin = ? AND (organization_id = ? OR id IN (?))", true, id,
			a.DB.Model(&models.UserOrganization{}).Select("user_id").Where("organization_id = ?", id)).
		Pluck("id", &superAdminIDs).Error; err != nil {
		a.Log.Error("Failed to check vendor super admins", "error", err, "org_id", id)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete vendor", nil, "")
	}
	isSuperAdmin := map[uuid.UUID]bool{}
	for _, sid := range superAdminIDs {
		isSuperAdmin[sid] = true
	}

	// Everyone who belongs to the organization, by home org or membership.
	var memberIDs []uuid.UUID
	if err := a.DB.Model(&models.User{}).
		Where("organization_id = ? OR id IN (?)", id,
			a.DB.Model(&models.UserOrganization{}).Select("user_id").Where("organization_id = ?", id)).
		Pluck("id", &memberIDs).Error; err != nil {
		a.Log.Error("Failed to load vendor users", "error", err, "org_id", id)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete vendor", nil, "")
	}

	suffix := "-deleted-" + id.String()[:8]
	var removedUsers, keptUsers int
	txErr := a.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("organization_id = ?", id).Delete(&models.UserOrganization{}).Error; err != nil {
			return err
		}
		for _, uid := range memberIDs {
			if isSuperAdmin[uid] {
				keptUsers++
				if err := a.relocateSuperAdmin(tx, uid, id); err != nil {
					return err
				}
				continue
			}
			// Users who belong to another workspace keep their login; move
			// their home organization there if it was this one.
			var other models.UserOrganization
			err := tx.Where("user_id = ? AND organization_id <> ?", uid, id).
				Order("is_default DESC, created_at ASC").First(&other).Error
			if err == nil {
				keptUsers++
				if err := tx.Model(&models.User{}).Where("id = ? AND organization_id = ?", uid, id).
					Updates(map[string]any{"organization_id": other.OrganizationID, "role_id": other.RoleID}).Error; err != nil {
					return err
				}
				continue
			}
			if err != gorm.ErrRecordNotFound {
				return err
			}
			// Free the email so the person can sign up or be added again.
			removedUsers++
			if err := tx.Model(&models.User{}).Where("id = ?", uid).Updates(map[string]any{
				"is_active": false,
				"email":     gorm.Expr("LEFT(email, 200) || ?", suffix+"-"+uid.String()[:8]),
			}).Error; err != nil {
				return err
			}
			if err := tx.Where("id = ?", uid).Delete(&models.User{}).Error; err != nil {
				return err
			}
		}
		// WhatsApp account names are unique, so free them too.
		if err := tx.Model(&models.WhatsAppAccount{}).Where("organization_id = ?", id).
			Update("name", gorm.Expr("LEFT(name, 80) || ?", suffix)).Error; err != nil {
			return err
		}
		if err := tx.Where("organization_id = ?", id).Delete(&models.WhatsAppAccount{}).Error; err != nil {
			return err
		}
		if err := tx.Where("organization_id = ?", id).Delete(&models.OrganizationSubscription{}).Error; err != nil {
			return err
		}
		if err := tx.Model(&org).Update("slug", gorm.Expr("LEFT(slug, 80) || ?", suffix)).Error; err != nil {
			return err
		}
		return tx.Delete(&org).Error
	})
	if txErr != nil {
		a.Log.Error("Failed to delete vendor", "error", txErr, "org_id", id)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete vendor", nil, "")
	}

	for _, uid := range memberIDs {
		a.InvalidateUserPermissionsCache(uid)
	}
	clearOrgModulesCache()
	a.Log.Info("Super admin deleted vendor", "org_id", id, "name", org.Name, "deleted_by", userID,
		"users_removed", removedUsers, "users_kept", keptUsers)
	a.logAudit(id, userID, "organization", id, models.AuditActionDeleted,
		map[string]any{"name": org.Name, "slug": org.Slug},
		map[string]any{"users_removed": removedUsers, "users_kept": keptUsers})

	return r.SendEnvelope(map[string]any{
		"message":       "Client deleted",
		"users_removed": removedUsers,
		"users_kept":    keptUsers,
	})
}

// platformOrgName is the workspace super admins live in when theirs is deleted.
const platformOrgName = "OneSuit Platform"

// relocateSuperAdmin gives a super admin a home outside the workspace being
// deleted: another workspace they belong to, else the platform workspace.
func (a *App) relocateSuperAdmin(tx *gorm.DB, userID, deletingOrgID uuid.UUID) error {
	var other models.UserOrganization
	err := tx.Where("user_id = ? AND organization_id <> ?", userID, deletingOrgID).
		Order("is_default DESC, created_at ASC").First(&other).Error
	if err == nil {
		return tx.Model(&models.User{}).Where("id = ? AND organization_id = ?", userID, deletingOrgID).
			Updates(map[string]any{"organization_id": other.OrganizationID, "role_id": other.RoleID}).Error
	}
	if err != gorm.ErrRecordNotFound {
		return err
	}
	var platform models.Organization
	if err := tx.Where("name = ?", platformOrgName).First(&platform).Error; err != nil {
		if err != gorm.ErrRecordNotFound {
			return err
		}
		org, err := createVendorOrganization(tx, platformOrgName, a.loadPlatformConfig().Timezone)
		if err != nil {
			return err
		}
		platform = *org
	}
	var adminRole models.CustomRole
	if err := tx.Where("organization_id = ? AND name = ? AND is_system = ?", platform.ID, "admin", true).
		First(&adminRole).Error; err != nil {
		return err
	}
	if err := tx.Create(&models.UserOrganization{
		UserID: userID, OrganizationID: platform.ID, RoleID: &adminRole.ID, IsDefault: true,
	}).Error; err != nil {
		return err
	}
	return tx.Model(&models.User{}).Where("id = ?", userID).
		Updates(map[string]any{"organization_id": platform.ID, "role_id": adminRole.ID}).Error
}
