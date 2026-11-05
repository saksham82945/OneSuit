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
// It refuses the caller's own organization, the shared demo workspace and any
// organization that still has a super admin in it.
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

	ctxOrgID, _ := r.RequestCtx.UserValue("organization_id").(uuid.UUID)
	var homeOrgID uuid.UUID
	_ = a.DB.Model(&models.User{}).Select("organization_id").Where("id = ?", userID).Row().Scan(&homeOrgID)
	if id == ctxOrgID || id == homeOrgID {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "You can't delete your own organization", nil, "")
	}
	if demoID := a.demoOrgID(); demoID != uuid.Nil && id == demoID {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "The demo workspace can't be deleted", nil, "")
	}
	var superAdmins int64
	if err := a.DB.Model(&models.User{}).
		Where("is_super_admin = ? AND (organization_id = ? OR id IN (?))", true, id,
			a.DB.Model(&models.UserOrganization{}).Select("user_id").Where("organization_id = ?", id)).
		Count(&superAdmins).Error; err != nil {
		a.Log.Error("Failed to check vendor super admins", "error", err, "org_id", id)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete vendor", nil, "")
	}
	if superAdmins > 0 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest,
			"This organization has a super admin in it. Move or remove the super admin first", nil, "")
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
