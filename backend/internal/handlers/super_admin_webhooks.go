package handlers

import (
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// Meta webhook settings (callback URL, verify token, app webhook) are run by
// the platform team, so only super admins see them. Clients just see whether
// their number is connected and receiving messages.

// callerIsSuperAdmin reports whether the signed-in user is a super admin.
func (a *App) callerIsSuperAdmin(r *fastglue.Request) bool {
	userID, ok := r.RequestCtx.UserValue("user_id").(uuid.UUID)
	return ok && a.IsSuperAdmin(userID)
}

// accountResponseFor is accountToResponse with the webhook verify token left
// out for everyone but super admins.
func (a *App) accountResponseFor(r *fastglue.Request, acc models.WhatsAppAccount) AccountResponse {
	resp := accountToResponse(acc)
	if !a.callerIsSuperAdmin(r) {
		resp.WebhookVerifyToken = ""
	}
	return resp
}

// SuperAdminWebhookAccount is one WhatsApp number on the Webhooks page.
type SuperAdminWebhookAccount struct {
	ID                 uuid.UUID `json:"id"`
	OrganizationID     uuid.UUID `json:"organization_id"`
	OrganizationName   string    `json:"organization_name"`
	Name               string    `json:"name"`
	PhoneID            string    `json:"phone_id"`
	BusinessID         string    `json:"business_id"`
	AppID              string    `json:"app_id"`
	Status             string    `json:"status"`
	WebhookVerifyToken string    `json:"webhook_verify_token"`
	LastEventAt        string    `json:"last_event_at,omitempty"`
	LastEventResult    string    `json:"last_event_result,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
}

// SuperAdminListWebhooks lists every workspace's numbers with their Meta
// webhook details (GET /api/super-admin/webhooks).
func (a *App) SuperAdminListWebhooks(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	var rows []struct {
		models.WhatsAppAccount
		OrganizationName string
	}
	if err := a.DB.Table("whatsapp_accounts AS w").
		Select("w.*, o.name AS organization_name").
		Joins("LEFT JOIN organizations o ON o.id = w.organization_id").
		Where("w.deleted_at IS NULL").
		Order("o.name ASC, w.created_at DESC").
		Scan(&rows).Error; err != nil {
		a.Log.Error("Failed to list webhook accounts", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load numbers", nil, "")
	}
	out := make([]SuperAdminWebhookAccount, 0, len(rows))
	for _, row := range rows {
		acc := SuperAdminWebhookAccount{
			ID: row.ID, OrganizationID: row.OrganizationID, OrganizationName: row.OrganizationName,
			Name: row.Name, PhoneID: row.PhoneID, BusinessID: row.BusinessID, AppID: row.AppID,
			Status: row.Status, WebhookVerifyToken: row.WebhookVerifyToken, CreatedAt: row.CreatedAt,
		}
		if last := a.lastWebhookEvent(row.PhoneID); last != nil {
			acc.LastEventAt, acc.LastEventResult = last["at"], last["result"]
		}
		out = append(out, acc)
	}
	return r.SendEnvelope(map[string]any{
		"accounts":            out,
		"callback_url":        a.webhookURL(r),
		"global_verify_token": a.Config.WhatsApp.WebhookVerifyToken,
	})
}

// superAdminAccount loads any workspace's account for a super admin, with
// secrets decrypted. It sends the error response itself.
func (a *App) superAdminAccount(r *fastglue.Request) (*models.WhatsAppAccount, bool) {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil, false
	}
	id, err := parsePathUUID(r, "id", "account")
	if err != nil {
		return nil, false
	}
	var account models.WhatsAppAccount
	if err := a.DB.Where("id = ?", id).First(&account).Error; err != nil {
		_ = r.SendErrorEnvelope(fasthttp.StatusNotFound, "Account not found", nil, "")
		return nil, false
	}
	a.decryptAccountSecrets(&account)
	return &account, true
}
