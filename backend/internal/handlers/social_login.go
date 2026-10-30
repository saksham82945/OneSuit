package handlers

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm/clause"

	appcrypto "github.com/shridarpatil/whatomate/internal/crypto"
	"github.com/shridarpatil/whatomate/internal/models"
)

// Platform social login: "Sign in with Google / Facebook" on the main login
// page, set up by the super admin with the platform's own OAuth keys. It
// signs in existing accounts by email; new visitors are sent to sign-up.

const (
	socialLoginKey = "social_login"
	// platformSSOOrg marks OAuth state started with the platform's keys.
	platformSSOOrg = "platform"
)

// socialProviders are the providers the super admin can turn on.
var socialProviders = []string{"google", "facebook"}

// SocialProviderSettings is one provider's platform keys and switches.
type SocialProviderSettings struct {
	Enabled     bool   `json:"enabled"`       // people can sign in with it
	ShowOnLogin bool   `json:"show_on_login"` // its button is shown on the login page
	ClientID    string `json:"client_id"`
	SecretEnc   string `json:"secret_enc,omitempty"` // encrypted client secret; never sent to the browser
}

type socialLoginSettings map[string]SocialProviderSettings

func (a *App) loadSocialLogin() socialLoginSettings {
	s := socialLoginSettings{}
	var row models.PlatformSetting
	if err := a.DB.Where("key = ?", socialLoginKey).First(&row).Error; err == nil {
		if raw, err := json.Marshal(row.Value); err == nil {
			_ = json.Unmarshal(raw, &s)
		}
	}
	return s
}

func (a *App) saveSocialLogin(s socialLoginSettings) error {
	raw, err := json.Marshal(s)
	if err != nil {
		return err
	}
	value := models.JSONB{}
	if err := json.Unmarshal(raw, &value); err != nil {
		return err
	}
	return a.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(&models.PlatformSetting{Key: socialLoginKey, Value: value}).Error
}

// platformSSOProvider returns the platform's keys for a provider as an
// SSOProvider (secret still encrypted), when that provider is on and has keys.
func (a *App) platformSSOProvider(provider string) (*models.SSOProvider, bool) {
	p, ok := a.loadSocialLogin()[provider]
	if !ok || !p.Enabled || p.ClientID == "" || p.SecretEnc == "" {
		return nil, false
	}
	return &models.SSOProvider{Provider: provider, ClientID: p.ClientID, ClientSecret: p.SecretEnc, IsEnabled: true}, true
}

// socialCallbackURL is the redirect URL to register with Google / Facebook.
func (a *App) socialCallbackURL(r *fastglue.Request, provider string) string {
	if a.Config.Server.PublicURL != "" {
		return fmt.Sprintf("%s/api/auth/sso/%s/callback", a.Config.Server.PublicURL, provider)
	}
	scheme := "https"
	if !r.RequestCtx.IsTLS() && a.Config.App.Environment == "development" {
		scheme = "http"
	}
	return fmt.Sprintf("%s://%s%s/api/auth/sso/%s/callback", scheme, string(r.RequestCtx.Host()),
		sanitizeRedirectPath(a.Config.Server.BasePath), provider)
}

// SocialProviderResponse is a provider's settings as the super admin sees them.
type SocialProviderResponse struct {
	Provider    string `json:"provider"`
	Name        string `json:"name"`
	Enabled     bool   `json:"enabled"`
	ShowOnLogin bool   `json:"show_on_login"`
	ClientID    string `json:"client_id"`
	HasSecret   bool   `json:"has_secret"`
	KeysSet     bool   `json:"keys_set"`
	CallbackURL string `json:"callback_url"`
}

func (a *App) socialLoginResponse(r *fastglue.Request) []SocialProviderResponse {
	s := a.loadSocialLogin()
	out := make([]SocialProviderResponse, 0, len(socialProviders))
	for _, name := range socialProviders {
		p := s[name]
		out = append(out, SocialProviderResponse{
			Provider: name, Name: providerDisplayNames[name], Enabled: p.Enabled, ShowOnLogin: p.ShowOnLogin,
			ClientID: p.ClientID, HasSecret: p.SecretEnc != "", KeysSet: p.ClientID != "" && p.SecretEnc != "",
			CallbackURL: a.socialCallbackURL(r, name),
		})
	}
	return out
}

// SuperAdminGetSocialLogin returns the platform's social login settings.
func (a *App) SuperAdminGetSocialLogin(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	return r.SendEnvelope(map[string]any{"providers": a.socialLoginResponse(r)})
}

// SuperAdminUpdateSocialLogin changes one provider (PUT /api/super-admin/social-login/{provider}).
// Fields left out keep their value; an empty client_secret keeps the saved one.
func (a *App) SuperAdminUpdateSocialLogin(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	provider, _ := r.RequestCtx.UserValue("provider").(string)
	known := false
	for _, p := range socialProviders {
		known = known || p == provider
	}
	if !known {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Unknown login provider", nil, "")
	}
	var req struct {
		Enabled      *bool   `json:"enabled"`
		ShowOnLogin  *bool   `json:"show_on_login"`
		ClientID     *string `json:"client_id"`
		ClientSecret string  `json:"client_secret"`
		ClearKeys    bool    `json:"clear_keys"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}

	s := a.loadSocialLogin()
	p := s[provider]
	if req.ClearKeys {
		p.ClientID, p.SecretEnc = "", ""
	}
	if req.ClientID != nil {
		p.ClientID = strings.TrimSpace(*req.ClientID)
	}
	if secret := strings.TrimSpace(req.ClientSecret); secret != "" {
		enc, err := appcrypto.Encrypt(secret, a.Config.App.EncryptionKey)
		if err != nil {
			a.Log.Error("Failed to encrypt social login secret", "error", err)
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save the keys", nil, "")
		}
		p.SecretEnc = enc
	}
	if req.Enabled != nil {
		p.Enabled = *req.Enabled
	}
	if req.ShowOnLogin != nil {
		p.ShowOnLogin = *req.ShowOnLogin
	}
	if p.Enabled && (p.ClientID == "" || p.SecretEnc == "") {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Add the Client ID and Client Secret before turning this login on", nil, "")
	}
	if len(p.ClientID) > 500 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Client ID is too long", nil, "")
	}
	s[provider] = p
	if err := a.saveSocialLogin(s); err != nil {
		a.Log.Error("Failed to save social login", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save social login", nil, "")
	}
	return r.SendEnvelope(map[string]any{"providers": a.socialLoginResponse(r)})
}

// platformLoginButtons are the platform providers shown on the login page.
func (a *App) platformLoginButtons() []SSOProviderPublic {
	s := a.loadSocialLogin()
	out := []SSOProviderPublic{}
	for _, name := range socialProviders {
		p := s[name]
		if p.Enabled && p.ShowOnLogin && p.ClientID != "" && p.SecretEnc != "" {
			out = append(out, SSOProviderPublic{Provider: name, Name: providerDisplayNames[name]})
		}
	}
	return out
}
