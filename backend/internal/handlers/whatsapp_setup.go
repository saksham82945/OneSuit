package handlers

import (
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// WhatsApp Cloud API Setup page: number health, phone-number re-sync from Meta
// and the test contact used for campaign test sends.

const testContactSettingKey = "test_contact_phone"

var testContactPhoneRe = regexp.MustCompile(`^[0-9]{8,15}$`)

// metaErrorMessage pulls Meta's error text out of a Graph API error body.
func metaErrorMessage(body map[string]any, fallback string) string {
	if e, ok := body["error"].(map[string]any); ok {
		if msg, ok := e["message"].(string); ok && msg != "" {
			return msg
		}
	}
	return fallback
}

// GetAccountHealth returns the number's and the WhatsApp Business Account's
// current health from Meta (GET /api/accounts/{id}/health).
func (a *App) GetAccountHealth(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceAccounts, models.ActionRead)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "account")
	if err != nil {
		return nil
	}
	account, err := a.resolveWhatsAppAccountByID(r, id, orgID)
	if err != nil {
		return nil
	}

	base := strings.TrimRight(a.Config.WhatsApp.BaseURL, "/")
	phoneURL := fmt.Sprintf("%s/%s/%s?fields=display_phone_number,verified_name,quality_rating,status,name_status,messaging_limit_tier,health_status",
		base, account.APIVersion, account.PhoneID)
	phone, status, err := a.fetchMetaJSON(phoneURL, account.AccessToken)
	if err != nil {
		a.Log.Error("Health check: Meta request failed", "error", err, "account", account.Name)
		return r.SendErrorEnvelope(fasthttp.StatusBadGateway, "Couldn't reach Meta. Try again in a minute.", nil, "")
	}
	if status != http.StatusOK {
		return r.SendErrorEnvelope(fasthttp.StatusBadGateway, metaErrorMessage(phone, "Meta rejected the request"), nil, "")
	}

	// The WABA's health is the overall answer when Meta returns it.
	var waba map[string]any
	if account.BusinessID != "" {
		wabaURL := fmt.Sprintf("%s/%s/%s?fields=name,health_status,account_review_status",
			base, account.APIVersion, account.BusinessID)
		if res, st, werr := a.fetchMetaJSON(wabaURL, account.AccessToken); werr == nil && st == http.StatusOK {
			waba = res
		}
	}

	overall := canSendMessage(waba)
	if overall == "" {
		overall = canSendMessage(phone)
	}
	if overall == "" {
		overall = "UNKNOWN"
	}

	resp := map[string]any{
		"account_id":           account.ID,
		"business_id":          account.BusinessID,
		"phone_id":             account.PhoneID,
		"checked_at":           time.Now().UTC().Format(time.RFC3339),
		"overall_health":       overall,
		"display_phone_number": phone["display_phone_number"],
		"verified_name":        phone["verified_name"],
		"quality_rating":       phone["quality_rating"],
		"phone_status":         phone["status"],
		"name_status":          phone["name_status"],
		"messaging_limit_tier": phone["messaging_limit_tier"],
	}
	if waba != nil {
		resp["business_name"] = waba["name"]
		resp["account_review_status"] = waba["account_review_status"]
	}
	return r.SendEnvelope(resp)
}

// canSendMessage reads health_status.can_send_message (AVAILABLE, LIMITED, BLOCKED).
func canSendMessage(body map[string]any) string {
	hs, ok := body["health_status"].(map[string]any)
	if !ok {
		return ""
	}
	v, _ := hs["can_send_message"].(string)
	return v
}

// SyncAccountPhoneNumbers lists every phone number on the account's WhatsApp
// Business Account from Meta and marks the ones already connected here
// (POST /api/accounts/{id}/sync-phone-numbers).
func (a *App) SyncAccountPhoneNumbers(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceAccounts, models.ActionRead)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "account")
	if err != nil {
		return nil
	}
	account, err := a.resolveWhatsAppAccountByID(r, id, orgID)
	if err != nil {
		return nil
	}
	if account.BusinessID == "" {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "This number has no WhatsApp Business Account ID saved", nil, "")
	}

	url := fmt.Sprintf("%s/%s/%s/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status,code_verification_status",
		strings.TrimRight(a.Config.WhatsApp.BaseURL, "/"), account.APIVersion, account.BusinessID)
	body, status, err := a.fetchMetaJSON(url, account.AccessToken)
	if err != nil {
		a.Log.Error("Phone number sync: Meta request failed", "error", err, "account", account.Name)
		return r.SendErrorEnvelope(fasthttp.StatusBadGateway, "Couldn't reach Meta. Try again in a minute.", nil, "")
	}
	if status != http.StatusOK {
		return r.SendErrorEnvelope(fasthttp.StatusBadGateway, metaErrorMessage(body, "Meta rejected the request"), nil, "")
	}

	var connected []models.WhatsAppAccount
	a.DB.Select("name", "phone_id").Where("organization_id = ?", orgID).Find(&connected)
	byPhone := make(map[string]string, len(connected))
	for _, c := range connected {
		byPhone[c.PhoneID] = c.Name
	}

	numbers := make([]map[string]any, 0)
	if list, ok := body["data"].([]any); ok {
		for _, item := range list {
			n, ok := item.(map[string]any)
			if !ok {
				continue
			}
			pid, _ := n["id"].(string)
			name, isConnected := byPhone[pid]
			numbers = append(numbers, map[string]any{
				"phone_id":                 pid,
				"display_phone_number":     n["display_phone_number"],
				"verified_name":            n["verified_name"],
				"quality_rating":           n["quality_rating"],
				"status":                   n["status"],
				"code_verification_status": n["code_verification_status"],
				"connected":                isConnected,
				"account_name":             name,
			})
		}
	}
	return r.SendEnvelope(map[string]any{
		"business_id":   account.BusinessID,
		"phone_numbers": numbers,
		"synced_at":     time.Now().UTC().Format(time.RFC3339),
	})
}

// GetTestContact returns the phone number used for campaign test sends
// (GET /api/whatsapp-setup/test-contact).
func (a *App) GetTestContact(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceAccounts, models.ActionRead)
	if err != nil {
		return nil
	}
	var org models.Organization
	if err := a.DB.Select("id", "settings").First(&org, "id = ?", orgID).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Organization not found", nil, "")
	}
	phone, _ := org.Settings[testContactSettingKey].(string)
	return r.SendEnvelope(map[string]any{"phone": phone, "configured": phone != ""})
}

// UpdateTestContact saves (or clears, with an empty phone) the test contact
// (PUT /api/whatsapp-setup/test-contact).
func (a *App) UpdateTestContact(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceAccounts, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req struct {
		Phone string `json:"phone"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	phone := strings.Map(func(c rune) rune {
		if c >= '0' && c <= '9' {
			return c
		}
		return -1
	}, req.Phone)
	if phone != "" && !testContactPhoneRe.MatchString(phone) {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Enter the number with country code, 8 to 15 digits (e.g. 919876543210)", nil, "")
	}

	var org models.Organization
	if err := a.DB.Select("id", "settings").First(&org, "id = ?", orgID).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Organization not found", nil, "")
	}
	settings := org.Settings
	if settings == nil {
		settings = models.JSONB{}
	}
	if phone == "" {
		delete(settings, testContactSettingKey)
	} else {
		settings[testContactSettingKey] = phone
	}
	if err := a.DB.Model(&models.Organization{}).Where("id = ?", orgID).Update("settings", settings).Error; err != nil {
		a.Log.Error("Failed to save test contact", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save the test contact", nil, "")
	}
	return r.SendEnvelope(map[string]any{"phone": phone, "configured": phone != ""})
}

// defaultWhatsAppConnectURL is Meta's hosted WhatsApp onboarding page for the
// platform's Meta app, used when nothing else is configured.
const defaultWhatsAppConnectURL = "https://business.facebook.com/messaging/whatsapp/onboard/?app_id=1732716131427334&config_id=860928616411834&extras=%7B%22featureType%22%3A%22whatsapp_business_app_onboarding%22%2C%22sessionInfoVersion%22%3A%223%22%2C%22version%22%3A%22v4%22%2C%22features%22%3A[]%7D"

// whatsAppConnectURL picks the link for "Connect WhatsApp with Facebook": the
// super admin's own link, else one built from the Meta app's IDs, else the default.
func whatsAppConnectURL(custom, appID, configID string) string {
	if custom != "" {
		return custom
	}
	if appID != "" && configID != "" {
		return "https://business.facebook.com/messaging/whatsapp/onboard/?app_id=" + url.QueryEscape(appID) +
			"&config_id=" + url.QueryEscape(configID) +
			"&extras=%7B%22featureType%22%3A%22whatsapp_business_app_onboarding%22%2C%22sessionInfoVersion%22%3A%223%22%2C%22version%22%3A%22v4%22%2C%22features%22%3A[]%7D"
	}
	return defaultWhatsAppConnectURL
}
