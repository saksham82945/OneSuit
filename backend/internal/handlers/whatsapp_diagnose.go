package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// Connection check for a WhatsApp number: asks Meta, step by step, everything
// that has to be true before incoming messages reach Live Chat, and offers a
// fix where OneSuit can make the change itself.

// webhookFields are the WhatsApp Business Account fields OneSuit needs.
var webhookFields = []string{"messages", "smb_message_echoes", "smb_app_state_sync", "message_template_status_update"}

// DiagnoseCheck is one line of the connection check.
type DiagnoseCheck struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Status string `json:"status"` // ok, fail, warn, unknown
	Detail string `json:"detail"`
	Fix    string `json:"fix,omitempty"`     // action OneSuit can run: subscribe_waba, configure_webhook, register
	FixTip string `json:"fix_tip,omitempty"` // what the person has to do when OneSuit can't
}

// metaApp is a Meta app whose secret OneSuit knows, so it can read and set its webhook.
type metaApp struct {
	ID, Secret, Source string
}

func (a *App) knownMetaApps(account *models.WhatsAppAccount) []metaApp {
	var out []metaApp
	seen := map[string]bool{}
	add := func(id, secret, source string) {
		if id != "" && secret != "" && !seen[id] {
			seen[id] = true
			out = append(out, metaApp{id, secret, source})
		}
	}
	add(account.AppID, account.AppSecret, "this number")
	if id, secret, _, err := a.resolveMetaAppCreds(account.OrganizationID); err == nil {
		add(id, secret, "platform")
	}
	return out
}

func (a *App) graphURL(version, path string) string {
	return fmt.Sprintf("%s/%s/%s", strings.TrimRight(a.Config.WhatsApp.BaseURL, "/"), version, strings.TrimLeft(path, "/"))
}

// postMetaForm sends a form POST to the Graph API.
func (a *App) postMetaForm(endpoint, token string, form url.Values) (map[string]any, int, error) {
	req, err := http.NewRequest(http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := a.HTTPClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = resp.Body.Close() }()
	body, _ := io.ReadAll(resp.Body)
	var out map[string]any
	_ = json.Unmarshal(body, &out)
	return out, resp.StatusCode, nil
}

// appWebhook is what Meta has saved as an app's WhatsApp webhook.
type appWebhook struct {
	CallbackURL string
	Active      bool
	Fields      map[string]bool
}

func (a *App) readAppWebhook(version string, app metaApp) (*appWebhook, error) {
	body, status, err := a.fetchMetaJSON(a.graphURL(version, app.ID+"/subscriptions"), app.ID+"|"+app.Secret)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("%s", metaErrorMessage(body, "Meta refused to show the app's webhook settings"))
	}
	list, _ := body["data"].([]any)
	for _, item := range list {
		s, _ := item.(map[string]any)
		if obj, _ := s["object"].(string); obj != "whatsapp_business_account" {
			continue
		}
		w := &appWebhook{Fields: map[string]bool{}}
		w.CallbackURL, _ = s["callback_url"].(string)
		w.Active, _ = s["active"].(bool)
		fields, _ := s["fields"].([]any)
		for _, f := range fields {
			switch v := f.(type) {
			case string:
				w.Fields[v] = true
			case map[string]any:
				if n, _ := v["name"].(string); n != "" {
					w.Fields[n] = true
				}
			}
		}
		return w, nil
	}
	return nil, nil // the app has no WhatsApp webhook at all
}

// DiagnoseAccount runs the connection check (GET /api/accounts/{id}/diagnose).
// Super admins only: it shows and changes Meta webhook settings.
func (a *App) DiagnoseAccount(r *fastglue.Request) error {
	account, ok := a.superAdminAccount(r)
	if !ok {
		return nil
	}
	checks := a.diagnose(r, account)
	ready := true
	for _, c := range checks {
		if c.Status == "fail" {
			ready = false
		}
	}
	return r.SendEnvelope(map[string]any{"checks": checks, "ready": ready, "webhook_url": a.webhookURL(r)})
}

func (a *App) diagnose(r *fastglue.Request, account *models.WhatsAppAccount) []DiagnoseCheck {
	version := account.APIVersion
	if version == "" {
		version = a.defaultAPIVersion()
	}
	var checks []DiagnoseCheck

	// 1. Token and number.
	phone, status, err := a.fetchMetaJSON(a.graphURL(version, account.PhoneID+
		"?fields=display_phone_number,status,platform_type,is_on_biz_app,code_verification_status,account_mode"), account.AccessToken)
	tokenOK := err == nil && status == http.StatusOK
	if !tokenOK {
		msg := "Couldn't reach Meta"
		if err == nil {
			msg = metaErrorMessage(phone, "Meta rejected the access token")
		}
		checks = append(checks, DiagnoseCheck{Key: "token", Label: "Access token works", Status: "fail", Detail: msg,
			FixTip: "Use “Manual setup with Facebook” again with a new permanent (System User) token."})
		return checks // nothing else can be checked without a working token
	}
	checks = append(checks, DiagnoseCheck{Key: "token", Label: "Access token works", Status: "ok", Detail: "Meta accepted the saved token."})

	// 2. Number is live on the Cloud API.
	st, _ := phone["status"].(string)
	platform, _ := phone["platform_type"].(string)
	onApp, _ := phone["is_on_biz_app"].(bool)
	c := DiagnoseCheck{Key: "cloud_api", Label: "Number is on the WhatsApp Cloud API"}
	switch {
	case strings.EqualFold(platform, "CLOUD_API") && (st == "" || strings.EqualFold(st, "CONNECTED")):
		c.Status, c.Detail = "ok", "Status CONNECTED on the Cloud API"
		if onApp {
			c.Detail += ", also running in the WhatsApp Business app (coexistence)."
		} else {
			c.Detail += "."
		}
	case onApp:
		c.Status = "fail"
		c.Detail = fmt.Sprintf("Meta says status %s, platform %s: the number only runs in the WhatsApp Business phone app, so Meta sends no messages to OneSuit.", orDash(st), orDash(platform))
		c.FixTip = "Connect it with “Connect WhatsApp with Facebook” (popup) and choose to connect your existing WhatsApp Business app; the phone app keeps working. “Register number” also works but takes the number off the phone app."
	default:
		c.Status = "fail"
		c.Detail = fmt.Sprintf("Meta says status %s, platform %s: the number isn't registered for the Cloud API.", orDash(st), orDash(platform))
		c.Fix = "register"
	}
	checks = append(checks, c)

	// 3. The WhatsApp Business Account sends its events to an app.
	subs, sStatus, sErr := a.fetchMetaJSON(a.graphURL(version, account.BusinessID+"/subscribed_apps"), account.AccessToken)
	subscribed := map[string]string{} // app id -> name
	if sErr == nil && sStatus == http.StatusOK {
		list, _ := subs["data"].([]any)
		for _, item := range list {
			m, _ := item.(map[string]any)
			d, _ := m["whatsapp_business_api_data"].(map[string]any)
			if d == nil {
				d = m
			}
			appID, _ := d["id"].(string)
			name, _ := d["name"].(string)
			if appID != "" {
				subscribed[appID] = name
			}
		}
	}
	known := a.knownMetaApps(account)
	c = DiagnoseCheck{Key: "waba_app", Label: "WhatsApp Business Account is linked to your app", Fix: "subscribe_waba"}
	switch {
	case sErr != nil || sStatus != http.StatusOK:
		c.Status, c.Detail = "unknown", "Meta didn't list the linked apps: "+metaErrorMessage(subs, "no answer")
	case len(subscribed) == 0:
		c.Status, c.Detail = "fail", "No app is linked, so Meta sends this account's messages nowhere."
	default:
		names := make([]string, 0, len(subscribed))
		for id, n := range subscribed {
			names = append(names, fmt.Sprintf("%s (%s)", orDash(n), id))
		}
		c.Status, c.Detail, c.Fix = "ok", "Linked to "+strings.Join(names, ", ")+".", ""
		if len(known) > 0 {
			match := false
			for _, k := range known {
				if _, ok := subscribed[k.ID]; ok {
					match = true
				}
			}
			if !match {
				c.Status = "warn"
				c.Detail += " None of these is the app whose keys OneSuit has, so its webhook can't be checked here."
				c.Fix = "subscribe_waba"
			}
		}
	}
	checks = append(checks, c)

	// 4. That app's webhook points at OneSuit with the right fields.
	want := a.webhookURL(r)
	var target *metaApp
	for i := range known {
		if _, ok := subscribed[known[i].ID]; ok || len(subscribed) == 0 {
			target = &known[i]
			break
		}
	}
	c = DiagnoseCheck{Key: "app_webhook", Label: "App webhook sends WhatsApp messages to OneSuit", Fix: "configure_webhook"}
	if target == nil {
		c.Status, c.Fix = "unknown", ""
		c.Detail = "OneSuit doesn't have the App ID and App Secret of the linked app, so it can't read its webhook."
		c.FixTip = "In Meta → your app → Webhooks, choose “Whatsapp Business Account” (not “User”), set the callback URL to " + want + ", verify, and subscribe to “messages”. Or save the App ID and Secret in Manual setup so OneSuit can do it."
	} else if w, werr := a.readAppWebhook(version, *target); werr != nil {
		c.Status, c.Detail = "unknown", werr.Error()
	} else if w == nil {
		c.Status = "fail"
		c.Detail = fmt.Sprintf("App %s has no “Whatsapp Business Account” webhook. (A webhook under “User” or “Page” doesn't carry WhatsApp messages.)", target.ID)
	} else {
		var problems []string
		if !strings.EqualFold(strings.TrimRight(w.CallbackURL, "/"), strings.TrimRight(want, "/")) {
			problems = append(problems, fmt.Sprintf("callback URL is %s, should be %s", orDash(w.CallbackURL), want))
		}
		if !w.Fields["messages"] {
			problems = append(problems, "the “messages” field isn't subscribed")
		}
		if !w.Active {
			problems = append(problems, "the webhook isn't active")
		}
		if len(problems) == 0 {
			c.Status, c.Fix = "ok", ""
			c.Detail = fmt.Sprintf("App %s sends messages to %s.", target.ID, want)
		} else {
			c.Status = "fail"
			c.Detail = fmt.Sprintf("App %s: %s.", target.ID, strings.Join(problems, "; "))
		}
	}
	checks = append(checks, c)

	// 5. Something actually arrived.
	c = DiagnoseCheck{Key: "received", Label: "OneSuit has received events from Meta"}
	if last := a.lastWebhookEvent(account.PhoneID); last != nil {
		c.Detail = last["at"] + " · " + last["result"]
		if strings.HasPrefix(last["result"], "rejected") {
			c.Status = "fail"
		} else {
			c.Status = "ok"
		}
	} else {
		c.Status = "warn"
		c.Detail = "Nothing yet. After the checks above pass, send a WhatsApp message to the number and check again."
		c.FixTip = "On Render's free plan the server sleeps; open the /health page first so it is awake. In Meta, the app's mode must be Live."
	}
	checks = append(checks, c)
	return checks
}

func orDash(s string) string {
	if s == "" {
		return "—"
	}
	return s
}

// FixAccountConnection runs one fix from the connection check
// (POST /api/accounts/{id}/diagnose/fix, body {"action": "..."}).
// Super admins only.
func (a *App) FixAccountConnection(r *fastglue.Request) error {
	account, ok := a.superAdminAccount(r)
	if !ok {
		return nil
	}
	var req struct {
		Action string `json:"action"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	version := account.APIVersion
	if version == "" {
		version = a.defaultAPIVersion()
	}

	switch req.Action {
	case "subscribe_waba":
		if err := a.WhatsApp.SubscribeApp(context.Background(), a.toWhatsAppAccount(account)); err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusBadGateway, "Meta refused to link the app: "+err.Error(), nil, "")
		}
	case "configure_webhook":
		known := a.knownMetaApps(account)
		if len(known) == 0 {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest,
				"OneSuit needs the app's App ID and App Secret to set its webhook. Add them in Manual setup with Facebook.", nil, "")
		}
		app := known[0]
		form := url.Values{}
		form.Set("object", "whatsapp_business_account")
		form.Set("callback_url", a.webhookURL(r))
		form.Set("verify_token", account.WebhookVerifyToken)
		form.Set("fields", strings.Join(webhookFields, ","))
		form.Set("include_values", "true")
		body, status, err := a.postMetaForm(a.graphURL(version, app.ID+"/subscriptions"), app.ID+"|"+app.Secret, form)
		if err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusBadGateway, "Couldn't reach Meta. Try again in a minute.", nil, "")
		}
		if status != http.StatusOK {
			return r.SendErrorEnvelope(fasthttp.StatusBadGateway, "Meta refused the webhook: "+metaErrorMessage(body, "unknown error"), nil, "")
		}
		// Make sure the account sends its events to that app too.
		_ = a.WhatsApp.SubscribeApp(context.Background(), a.toWhatsAppAccount(account))
	default:
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Unknown fix", nil, "")
	}
	return r.SendEnvelope(map[string]any{"checks": a.diagnose(r, account)})
}
