package handlers

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm/clause"

	"github.com/shridarpatil/whatomate/internal/crypto"
	"github.com/shridarpatil/whatomate/internal/models"
)

// Platform branding (logo, name, contact details) shown across the website,
// and the platform-wide WhatsApp signup settings: whether businesses connect
// their number through Meta's Embedded Signup popup, by typing the details in
// manually, or both.

const (
	platformLogoKey       = "platform_logo"
	platformMetaSecretKey = "platform_meta_secret"
	maxLogoBytes          = 512 * 1024
)

var allowedLogoTypes = map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true}

func validWebURL(s string) bool {
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

// --- Platform Meta app (Embedded Signup) ---

func (a *App) platformMetaSecret() string {
	var row models.PlatformSetting
	if err := a.DB.Where("key = ?", platformMetaSecretKey).First(&row).Error; err != nil {
		return ""
	}
	enc, _ := row.Value["encrypted"].(string)
	if enc == "" {
		return ""
	}
	secret, err := crypto.Decrypt(enc, a.Config.App.EncryptionKey)
	if err != nil {
		a.Log.Error("Failed to decrypt platform Meta app secret", "error", err)
		return ""
	}
	return secret
}

func (a *App) savePlatformMetaSecret(secret string) error {
	if secret == "" {
		return a.DB.Where("key = ?", platformMetaSecretKey).Delete(&models.PlatformSetting{}).Error
	}
	enc, err := crypto.Encrypt(secret, a.Config.App.EncryptionKey)
	if err != nil {
		return err
	}
	return a.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(&models.PlatformSetting{Key: platformMetaSecretKey, Value: models.JSONB{"encrypted": enc}}).Error
}

// platformMetaCreds returns the platform's Meta app credentials: the values
// set in Configuration, falling back to config.toml's [whatsapp] section.
func (a *App) platformMetaCreds(cfg PlatformConfig) (appID, appSecret, configID string) {
	appID, configID = cfg.MetaAppID, cfg.MetaConfigID
	if appID == "" {
		appID = a.Config.WhatsApp.AppID
	}
	if configID == "" {
		configID = a.Config.WhatsApp.ConfigID
	}
	appSecret = a.platformMetaSecret()
	if appSecret == "" {
		appSecret = a.Config.WhatsApp.AppSecret
	}
	return appID, appSecret, configID
}

// requireSignupMethod refuses a WhatsApp connection method the super admin has
// turned off. Super admins can always use both.
func (a *App) requireSignupMethod(r *fastglue.Request, userID uuid.UUID, embedded bool) error {
	if a.IsSuperAdmin(userID) {
		return nil
	}
	cfg := a.loadPlatformConfig()
	if embedded && !cfg.EmbeddedSignupEnabled {
		_ = r.SendErrorEnvelope(fasthttp.StatusForbidden, "Connect with Facebook is turned off. Enter your number's details manually instead.", nil, "")
		return errEnvelopeSent
	}
	if !embedded && !cfg.ManualSignupEnabled {
		_ = r.SendErrorEnvelope(fasthttp.StatusForbidden, "Manual connection is turned off. Use Connect with Facebook instead.", nil, "")
		return errEnvelopeSent
	}
	return nil
}

// --- Branding ---

// BrandingResponse is the public branding shown on every page.
type BrandingResponse struct {
	PlatformName   string `json:"platform_name"`
	LogoURL        string `json:"logo_url"`
	SupportEmail   string `json:"support_email"`
	SupportPhone   string `json:"support_phone"`
	ContactAddress string `json:"contact_address"`
	WebsiteURL     string `json:"website_url"`
	Timezone       string `json:"timezone"`
}

func (a *App) branding() BrandingResponse {
	cfg := a.loadPlatformConfig()
	b := BrandingResponse{
		PlatformName: cfg.PlatformName, SupportEmail: cfg.SupportEmail, SupportPhone: cfg.SupportPhone,
		ContactAddress: cfg.ContactAddress, WebsiteURL: cfg.WebsiteURL, Timezone: cfg.Timezone,
	}
	var logo models.PlatformSetting
	if err := a.DB.Where("key = ?", platformLogoKey).First(&logo).Error; err == nil {
		b.LogoURL = fmt.Sprintf("%s/api/public/branding/logo?v=%d",
			strings.TrimRight(a.Config.Server.BasePath, "/"), logo.UpdatedAt.Unix())
	}
	return b
}

// GetPublicBranding returns the platform's name, logo and contact details. No login required.
func (a *App) GetPublicBranding(r *fastglue.Request) error {
	return r.SendEnvelope(a.branding())
}

// GetPlatformLogo serves the uploaded logo image. No login required.
func (a *App) GetPlatformLogo(r *fastglue.Request) error {
	var row models.PlatformSetting
	if err := a.DB.Where("key = ?", platformLogoKey).First(&row).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "No logo", nil, "")
	}
	mime, _ := row.Value["mime"].(string)
	data, err := base64.StdEncoding.DecodeString(fmt.Sprint(row.Value["data"]))
	if err != nil || !allowedLogoTypes[mime] {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "No logo", nil, "")
	}
	r.RequestCtx.Response.Header.Set("Content-Type", mime)
	r.RequestCtx.Response.Header.Set("Cache-Control", "public, max-age=86400")
	r.RequestCtx.Response.Header.Set("X-Content-Type-Options", "nosniff")
	r.RequestCtx.Response.Header.Set("Last-Modified", row.UpdatedAt.UTC().Format(http.TimeFormat))
	r.RequestCtx.SetStatusCode(fasthttp.StatusOK)
	r.RequestCtx.SetBody(data)
	return nil
}

// SuperAdminUploadLogo stores a new platform logo (PNG, JPEG or WebP, ≤ 512 KB).
func (a *App) SuperAdminUploadLogo(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	fh, err := r.RequestCtx.FormFile("file")
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Choose an image file to upload", nil, "")
	}
	if fh.Size > maxLogoBytes {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "The logo must be 512 KB or smaller", nil, "")
	}
	f, err := fh.Open()
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Couldn't read the file", nil, "")
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxLogoBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxLogoBytes {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Couldn't read the file", nil, "")
	}
	// Trust the bytes, not the file name or the browser's claim.
	mime := http.DetectContentType(data)
	if !allowedLogoTypes[mime] {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "The logo must be a PNG, JPEG or WebP image", nil, "")
	}
	row := models.PlatformSetting{Key: platformLogoKey, Value: models.JSONB{
		"mime": mime, "data": base64.StdEncoding.EncodeToString(data), "size": strconv.Itoa(len(data)),
	}, UpdatedAt: time.Now()}
	if err := a.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(&row).Error; err != nil {
		a.Log.Error("Failed to save logo", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save the logo", nil, "")
	}
	return r.SendEnvelope(a.branding())
}

// SuperAdminDeleteLogo removes the platform logo.
func (a *App) SuperAdminDeleteLogo(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	if err := a.DB.Where("key = ?", platformLogoKey).Delete(&models.PlatformSetting{}).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to remove the logo", nil, "")
	}
	return r.SendEnvelope(a.branding())
}
