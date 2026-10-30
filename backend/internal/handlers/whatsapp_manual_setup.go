package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"
)

// Manual WhatsApp setup: the client pastes their own Facebook App ID / Secret,
// an access token and the WhatsApp Business Account ID. We check them with
// Meta, find the phone number on that account and connect it.

// ManualSetupRequest is the body of POST /api/whatsapp-setup/manual.
type ManualSetupRequest struct {
	Name        string `json:"name"`
	AppID       string `json:"app_id"`
	AppSecret   string `json:"app_secret"`
	AccessToken string `json:"access_token"`
	BusinessID  string `json:"business_id"`
	// PhoneID picks one number when the WhatsApp Business Account has several.
	PhoneID string `json:"phone_id"`
}

// manualPhone is one phone number Meta returned for the account.
type manualPhone struct {
	PhoneID            string `json:"phone_id"`
	DisplayPhoneNumber string `json:"display_phone_number"`
	VerifiedName       string `json:"verified_name"`
	QualityRating      string `json:"quality_rating"`
	Status             string `json:"status"`
}

// webhookURL is the address Meta sends WhatsApp events to.
func (a *App) webhookURL(r *fastglue.Request) string {
	if a.Config.Server.PublicURL != "" {
		return strings.TrimRight(a.Config.Server.PublicURL, "/") + "/api/webhook"
	}
	scheme := "https"
	if !r.RequestCtx.IsTLS() && a.Config.App.Environment == "development" {
		scheme = "http"
	}
	return fmt.Sprintf("%s://%s%s/api/webhook", scheme, string(r.RequestCtx.Host()),
		sanitizeRedirectPath(a.Config.Server.BasePath))
}

// ManualWhatsAppSetup connects (or reconnects) a number from details the
// client typed in. When the account has more than one number and none was
// picked, it returns the list so the client can choose.
func (a *App) ManualWhatsAppSetup(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceAccounts, models.ActionWrite)
	if err != nil {
		return nil
	}
	if err := a.requireSignupMethod(r, userID, false); err != nil {
		return nil
	}

	var req ManualSetupRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	req.AppID = strings.TrimSpace(req.AppID)
	req.AppSecret = strings.TrimSpace(req.AppSecret)
	req.AccessToken = strings.TrimSpace(req.AccessToken)
	req.BusinessID = strings.TrimSpace(req.BusinessID)
	req.PhoneID = strings.TrimSpace(req.PhoneID)
	req.Name = strings.TrimSpace(req.Name)

	if req.AccessToken == "" || req.BusinessID == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Access token and WhatsApp Business Account ID are required", nil, "")
	}

	apiVersion := a.defaultAPIVersion()
	url := fmt.Sprintf("%s/%s/%s/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status",
		strings.TrimRight(a.Config.WhatsApp.BaseURL, "/"), apiVersion, req.BusinessID)
	body, status, err := a.fetchMetaJSON(url, req.AccessToken)
	if err != nil {
		a.Log.Error("Manual setup: Meta request failed", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusBadGateway, "Couldn't reach Meta. Try again in a minute.", nil, "")
	}
	if status != http.StatusOK {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest,
			"Meta didn't accept these details: "+metaErrorMessage(body, "check the access token and WhatsApp Business Account ID"), nil, "")
	}

	phones := make([]manualPhone, 0)
	if list, ok := body["data"].([]any); ok {
		for _, item := range list {
			n, ok := item.(map[string]any)
			if !ok {
				continue
			}
			p := manualPhone{}
			p.PhoneID, _ = n["id"].(string)
			p.DisplayPhoneNumber, _ = n["display_phone_number"].(string)
			p.VerifiedName, _ = n["verified_name"].(string)
			p.QualityRating, _ = n["quality_rating"].(string)
			p.Status, _ = n["status"].(string)
			if p.PhoneID != "" {
				phones = append(phones, p)
			}
		}
	}
	if len(phones) == 0 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest,
			"This WhatsApp Business Account has no phone numbers yet. Add one in WhatsApp Manager first.", nil, "")
	}

	var chosen *manualPhone
	if req.PhoneID != "" {
		for i := range phones {
			if phones[i].PhoneID == req.PhoneID {
				chosen = &phones[i]
			}
		}
		if chosen == nil {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "That phone number isn't on this WhatsApp Business Account", nil, "")
		}
	} else if len(phones) == 1 {
		chosen = &phones[0]
	} else {
		return r.SendEnvelope(map[string]any{"status": "choose_phone", "phone_numbers": phones})
	}

	// A number can belong to only one workspace.
	var other int64
	a.DB.Model(&models.WhatsAppAccount{}).
		Where("phone_id = ? AND organization_id <> ?", chosen.PhoneID, orgID).Count(&other)
	if other > 0 {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "This number is already connected to another workspace", nil, "")
	}

	name := req.Name
	if name == "" {
		name = chosen.VerifiedName
	}
	if name == "" {
		name = chosen.DisplayPhoneNumber
	}

	var account models.WhatsAppAccount
	// Include numbers disconnected earlier (soft-deleted): they still hold their
	// name, so bring the old record back instead of adding a clashing one.
	existing := a.DB.Unscoped().Where("organization_id = ? AND phone_id = ?", orgID, chosen.PhoneID).
		Order("deleted_at IS NOT NULL, updated_at DESC").First(&account).Error == nil
	if existing {
		account.DeletedAt = gorm.DeletedAt{}
		// Decrypt first so the saved PIN isn't encrypted twice.
		a.decryptAccountSecrets(&account)
		account.AccessToken = req.AccessToken
		account.BusinessID = req.BusinessID
		if req.AppID != "" {
			account.AppID = req.AppID
		}
		if req.AppSecret != "" {
			account.AppSecret = req.AppSecret
		}
		account.Status = "active"
		account.UpdatedByID = &userID
	} else {
		var count int64
		a.DB.Model(&models.WhatsAppAccount{}).Where("organization_id = ?", orgID).Count(&count)
		name = a.uniqueAccountName(name, chosen.DisplayPhoneNumber)
		account = models.WhatsAppAccount{
			OrganizationID:     orgID,
			Name:               name,
			AppID:              req.AppID,
			PhoneID:            chosen.PhoneID,
			BusinessID:         req.BusinessID,
			AccessToken:        req.AccessToken,
			AppSecret:          req.AppSecret,
			WebhookVerifyToken: generateVerifyToken(),
			APIVersion:         apiVersion,
			IsDefaultIncoming:  count == 0,
			IsDefaultOutgoing:  count == 0,
			Status:             "active",
			CreatedByID:        &userID,
			UpdatedByID:        &userID,
		}
	}

	ctx := context.Background()

	// Meta shows a number as "Offline" until it is registered for the Cloud API,
	// and an unregistered number can't send or receive. Register it now.
	registered := strings.EqualFold(chosen.Status, "CONNECTED")
	registrationError := ""
	if registered {
		account.Status = "active"
	} else {
		info, _ := a.WhatsApp.GetPhoneNumberInfo(ctx, chosen.PhoneID, req.AccessToken, apiVersion)
		if info != nil {
			account.IsSMB = info.IsOnBizApp || info.PlatformType == "SMB" || info.PlatformType == "SMB_CLOUD_API"
		}
		if regErr := a.attemptAutoRegistration(ctx, &account, info, req.AccessToken, ""); regErr != nil {
			registrationError = regErr.Error()
		} else {
			registered = true
		}
	}

	newPin := ""
	if registered && !strings.EqualFold(chosen.Status, "CONNECTED") {
		newPin = account.Pin // shown once so the client can keep it
	}

	// Subscribe our app to the account's events while the token is still plain.
	subscribed := a.WhatsApp.SubscribeApp(ctx, a.toWhatsAppAccount(&account)) == nil

	if err := a.encryptAccountSecrets(&account); err != nil {
		a.Log.Error("Manual setup: encrypt failed", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Could not save the number", nil, "")
	}
	if existing {
		err = a.DB.Unscoped().Save(&account).Error
		a.InvalidateWhatsAppAccountCache(account.PhoneID)
	} else {
		err = a.DB.Create(&account).Error
	}
	if err != nil {
		a.Log.Error("Manual setup: save failed", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Could not save the number", nil, "")
	}
	action := models.AuditActionCreated
	if existing {
		action = models.AuditActionUpdated
	}
	a.logAudit(orgID, userID, "account", account.ID, action, nil, &account)

	return r.SendEnvelope(map[string]any{
		"status":               "connected",
		"updated":              existing,
		"account":              accountToResponse(account),
		"display_phone_number": chosen.DisplayPhoneNumber,
		"webhook_subscribed":   subscribed,
		"registered":           registered,
		"registration_error":   registrationError,
		"pin":                  newPin,
		"webhook_url":          a.webhookURL(r),
		"verify_token":         account.WebhookVerifyToken,
	})
}

// uniqueAccountName keeps account names unique across the whole platform
// (messages refer to the account by name).
func (a *App) uniqueAccountName(name, phone string) string {
	taken := func(n string) bool {
		var c int64
		// Unscoped: disconnected numbers keep their name in the unique index.
		a.DB.Unscoped().Model(&models.WhatsAppAccount{}).Where("name = ?", n).Count(&c)
		return c > 0
	}
	if !taken(name) {
		return name
	}
	if phone != "" {
		if n := fmt.Sprintf("%s (%s)", name, phone); !taken(n) {
			return n
		}
	}
	for i := 2; i < 1000; i++ {
		if n := fmt.Sprintf("%s %d", name, i); !taken(n) {
			return n
		}
	}
	return fmt.Sprintf("%s %s", name, generateVerifyToken()[:6])
}
