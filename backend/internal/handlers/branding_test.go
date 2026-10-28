package handlers_test

import (
	"strings"
	"bytes"
	"fmt"
	"mime/multipart"
	"testing"

	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/pkg/whatsapp"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// Helper to create a multipart file upload request in fasthttp
func newMultipartUploadRequest(t *testing.T, fieldName, filename, contentType string, content []byte) *fastglue.Request {
	t.Helper()
	var b bytes.Buffer
	w := multipart.NewWriter(&b)
	part, err := w.CreateFormFile(fieldName, filename)
	require.NoError(t, err)
	_, err = part.Write(content)
	require.NoError(t, err)
	require.NoError(t, w.Close())

	ctx := &fasthttp.RequestCtx{}
	ctx.Request.Header.SetMethod("POST")
	ctx.Request.Header.SetContentType(w.FormDataContentType())
	ctx.Request.SetBody(b.Bytes())

	return &fastglue.Request{RequestCtx: ctx}
}

// 1x1 67-byte valid PNG
var tinyPNG = []byte{
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
	0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
	0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
	0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
	0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
}

func TestApp_Branding_PublicBranding(t *testing.T) {
	f := newSuperAdminFixture(t)
	t.Cleanup(func() {
		f.app.DB.Where("key IN ?", []string{"platform_config", "platform_logo"}).Delete(&models.PlatformSetting{})
	})

	req := testutil.NewGETRequest(t)
	require.NoError(t, f.app.GetPublicBranding(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))

	var b handlers.BrandingResponse
	testutil.ParseEnvelopeResponse(t, req, &b)
	assert.Equal(t, "onesuit", b.PlatformName)
	assert.Equal(t, "UTC", b.Timezone)
}

func TestApp_Branding_LogoLifecycle(t *testing.T) {
	f := newSuperAdminFixture(t)
	t.Cleanup(func() {
		f.app.DB.Where("key = ?", "platform_logo").Delete(&models.PlatformSetting{})
	})

	// 1. Plain member cannot upload logo
	memberReq := f.asMember(newMultipartUploadRequest(t, "file", "logo.png", "image/png", tinyPNG))
	require.NoError(t, f.app.SuperAdminUploadLogo(memberReq))
	testutil.AssertErrorResponse(t, memberReq, fasthttp.StatusForbidden, "Super admin access required")

	// 2. Refuse SVG
	svgContent := []byte(`<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>`)
	badTypeReq := f.asSuperAdmin(newMultipartUploadRequest(t, "file", "logo.svg", "image/svg+xml", svgContent))
	require.NoError(t, f.app.SuperAdminUploadLogo(badTypeReq))
	testutil.AssertErrorResponse(t, badTypeReq, fasthttp.StatusBadRequest, "PNG, JPEG or WebP")

	// 3. Refuse renamed text file posing as PNG
	fakePNG := []byte("plain text content here not an image")
	fakeReq := f.asSuperAdmin(newMultipartUploadRequest(t, "file", "logo.png", "image/png", fakePNG))
	require.NoError(t, f.app.SuperAdminUploadLogo(fakeReq))
	testutil.AssertErrorResponse(t, fakeReq, fasthttp.StatusBadRequest, "PNG, JPEG or WebP")

	// 4. Refuse > 512 KB
	oversized := make([]byte, 513*1024)
	copy(oversized, tinyPNG)
	oversizedReq := f.asSuperAdmin(newMultipartUploadRequest(t, "file", "huge.png", "image/png", oversized))
	require.NoError(t, f.app.SuperAdminUploadLogo(oversizedReq))
	testutil.AssertErrorResponse(t, oversizedReq, fasthttp.StatusBadRequest, "512 KB")

	// 5. Successful PNG upload
	uploadReq := f.asSuperAdmin(newMultipartUploadRequest(t, "file", "logo.png", "image/png", tinyPNG))
	require.NoError(t, f.app.SuperAdminUploadLogo(uploadReq))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(uploadReq))

	var brandResp handlers.BrandingResponse
	testutil.ParseEnvelopeResponse(t, uploadReq, &brandResp)
	assert.Contains(t, brandResp.LogoURL, "/api/public/branding/logo")

	// 6. Serve logo publicly
	serveReq := testutil.NewGETRequest(t)
	require.NoError(t, f.app.GetPlatformLogo(serveReq))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(serveReq))
	assert.Equal(t, "image/png", string(serveReq.RequestCtx.Response.Header.ContentType()))
	assert.Equal(t, "nosniff", string(serveReq.RequestCtx.Response.Header.Peek("X-Content-Type-Options")))
	assert.Equal(t, tinyPNG, testutil.GetResponseBody(serveReq))

	// 7. Delete logo
	delReq := f.asSuperAdmin(testutil.NewRequest(t))
	delReq.RequestCtx.Request.Header.SetMethod("DELETE")
	require.NoError(t, f.app.SuperAdminDeleteLogo(delReq))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(delReq))

	// 8. Serve logo now returns 404
	serveAgain := testutil.NewGETRequest(t)
	require.NoError(t, f.app.GetPlatformLogo(serveAgain))
	require.Equal(t, fasthttp.StatusNotFound, testutil.GetResponseStatusCode(serveAgain))
}

func TestApp_Branding_ConfigFieldsAndSecrets(t *testing.T) {
	f := newSuperAdminFixture(t)
	t.Cleanup(func() {
		f.app.DB.Where("key IN ?", []string{"platform_config", "platform_meta_secret"}).Delete(&models.PlatformSetting{})
	})

	// 1. Refuse both signup methods disabled
	bothOff := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"embedded_signup_enabled": false,
		"manual_signup_enabled":   false,
	}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(bothOff))
	testutil.AssertErrorResponse(t, bothOff, fasthttp.StatusBadRequest, "Keep at least one way")

	// 2. Refuse invalid website URL
	badWeb := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"website_url": "ftp://not-http.example.com",
	}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(badWeb))
	testutil.AssertErrorResponse(t, badWeb, fasthttp.StatusBadRequest, "http:// or https://")

	// 3. Refuse invalid timezone
	badTZ := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"timezone": "Invalid/Timezone_Name",
	}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(badTZ))
	testutil.AssertErrorResponse(t, badTZ, fasthttp.StatusBadRequest, "Time zone must be a valid name")

	// 4. Refuse long address (> 500 chars)
	longAddr := string(make([]byte, 501))
	badAddr := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"contact_address": longAddr,
	}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(badAddr))
	testutil.AssertErrorResponse(t, badAddr, fasthttp.StatusBadRequest, "500 characters or fewer")

	// 5. Successful update with all new fields and Meta app secret
	secretVal := "meta-super-secret-12345"
	upd := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"platform_name":           "Custom Brand",
		"contact_address":         "123 Tech Park, Suite 400",
		"website_url":             "https://example.com",
		"timezone":                "Asia/Kolkata",
		"support_phone":           "+91 98200 55501",
		"meta_app_id":             "app-id-123",
		"meta_config_id":          "cfg-id-456",
		"meta_app_secret":         secretVal,
		"embedded_signup_enabled": true,
		"manual_signup_enabled":   true,
	}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(upd))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(upd))

	var savedCfg handlers.PlatformConfig
	testutil.ParseEnvelopeResponse(t, upd, &savedCfg)
	assert.Equal(t, "Custom Brand", savedCfg.PlatformName)
	assert.Equal(t, "Asia/Kolkata", savedCfg.Timezone)
	assert.Equal(t, "https://example.com", savedCfg.WebsiteURL)
	assert.Equal(t, "+91 98200 55501", savedCfg.SupportPhone)
	assert.Equal(t, "123 Tech Park, Suite 400", savedCfg.ContactAddress)
	assert.Equal(t, "app-id-123", savedCfg.MetaAppID)
	assert.Equal(t, "cfg-id-456", savedCfg.MetaConfigID)
	assert.True(t, savedCfg.HasMetaAppSecret)
	// Verify secret is NEVER returned in PUT response JSON
	rawBody := string(testutil.GetResponseBody(upd))
	assert.NotContains(t, rawBody, secretVal)
	assert.NotContains(t, rawBody, `"meta_app_secret":`)

	// Verify secret is NEVER returned in GET response JSON either
	getReq := f.asSuperAdmin(testutil.NewGETRequest(t))
	require.NoError(t, f.app.SuperAdminGetConfig(getReq))
	var getCfg handlers.PlatformConfig
	testutil.ParseEnvelopeResponse(t, getReq, &getCfg)
	assert.True(t, getCfg.HasMetaAppSecret)
	getRawBody := string(testutil.GetResponseBody(getReq))
	assert.NotContains(t, getRawBody, secretVal)
	assert.NotContains(t, getRawBody, `"meta_app_secret":`)

	// Verify public branding reflects new fields
	pubReq := testutil.NewGETRequest(t)
	require.NoError(t, f.app.GetPublicBranding(pubReq))
	var pubBrand handlers.BrandingResponse
	testutil.ParseEnvelopeResponse(t, pubReq, &pubBrand)
	assert.Equal(t, "Custom Brand", pubBrand.PlatformName)
	assert.Equal(t, "Asia/Kolkata", pubBrand.Timezone)
	assert.Equal(t, "https://example.com", pubBrand.WebsiteURL)

	// 6. Clear Meta App Secret
	clearReq := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"clear_meta_app_secret": true,
	}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(clearReq))
	var afterClear handlers.PlatformConfig
	testutil.ParseEnvelopeResponse(t, clearReq, &afterClear)
	assert.False(t, afterClear.HasMetaAppSecret)
}

func TestApp_Branding_SignupGuards(t *testing.T) {
	f := newSuperAdminFixture(t)
	t.Cleanup(func() {
		f.app.DB.Where("key = ?", "platform_config").Delete(&models.PlatformSetting{})
	})
	f.app.WhatsApp = whatsapp.NewWithBaseURL(testutil.NopLogger(), "https://graph.facebook.com")

	// 1. Turn off manual signup
	offManual := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"manual_signup_enabled":   false,
		"embedded_signup_enabled": true,
	}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(offManual))

	adminRole := testutil.CreateAdminRole(t, f.app.DB, f.org.ID)
	customerAdmin := testutil.CreateTestUser(t, f.app.DB, f.org.ID, testutil.WithRoleID(&adminRole.ID))
	asCustomerAdmin := func(req *fastglue.Request) *fastglue.Request {
		testutil.SetFullAuthContext(req, f.org.ID, customerAdmin.ID, nil, false)
		return req
	}

	// Plain member trying to create account manually gets 403
	manualReq := asCustomerAdmin(testutil.NewJSONRequest(t, map[string]any{
		"phone_number": "+1234567890",
		"phone_id":     "12345",
		"waba_id":      "67890",
		"access_token": "token123",
	}))
	require.NoError(t, f.app.CreateAccount(manualReq))
	testutil.AssertErrorResponse(t, manualReq, fasthttp.StatusForbidden, "Manual connection is turned off")

	// Super admin trying to create account manually is permitted past guard
	superManualReq := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"phone_number": "+1234567890",
		"phone_id":     "12345",
		"waba_id":      "67890",
		"access_token": "token123",
	}))
	// May fail downstream (e.g. meta validation), but NOT 403
	_ = f.app.CreateAccount(superManualReq)
	assert.NotEqual(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(superManualReq))

	// 2. Turn off embedded signup
	offEmbedded := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"manual_signup_enabled":   true,
		"embedded_signup_enabled": false,
	}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(offEmbedded))

	// Customer admin trying exchange-token gets 403
	embeddedReq := asCustomerAdmin(testutil.NewJSONRequest(t, map[string]any{
		"code": "sample_auth_code",
	}))
	require.NoError(t, f.app.ExchangeToken(embeddedReq))
	testutil.AssertErrorResponse(t, embeddedReq, fasthttp.StatusForbidden, "Connect with Facebook is turned off")

	// Super admin trying exchange-token is permitted past guard
	superEmbReq := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"code": "sample_auth_code",
	}))
	_ = f.app.ExchangeToken(superEmbReq)
	assert.NotEqual(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(superEmbReq))
}

func TestApp_Branding_NewBusinessGetsDefaultTimezone(t *testing.T) {
	f := newSuperAdminFixture(t)
	t.Cleanup(func() {
		f.app.DB.Where("key = ?", "platform_config").Delete(&models.PlatformSetting{})
	})

	// Existing organization with America/New_York timezone
	existingOrg := testutil.CreateTestOrganization(t, f.app.DB)
	existingOrg.Settings = models.JSONB{"timezone": "America/New_York"}
	require.NoError(t, f.app.DB.Save(&existingOrg).Error)

	// Set platform timezone to Asia/Kolkata
	setTZ := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"timezone": "Asia/Kolkata",
	}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(setTZ))

	// Super admin creates a new vendor
	vReq := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"name": "New Kolkata Vendor",
	}))
	require.NoError(t, f.app.SuperAdminCreateVendor(vReq))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(vReq))

	var v handlers.VendorResponse
	testutil.ParseEnvelopeResponse(t, vReq, &v)

	var org models.Organization
	require.NoError(t, f.app.DB.Where("id = ?", v.ID).First(&org).Error)
	assert.Equal(t, "Asia/Kolkata", fmt.Sprint(org.Settings["timezone"]))

	// Existing business's timezone remains unchanged
	var existingCheck models.Organization
	require.NoError(t, f.app.DB.Where("id = ?", existingOrg.ID).First(&existingCheck).Error)
	assert.Equal(t, "America/New_York", fmt.Sprint(existingCheck.Settings["timezone"]))
}

func TestApp_Branding_CredentialFallbackOrder(t *testing.T) {
	f := newSuperAdminFixture(t)
	t.Cleanup(func() {
		f.app.DB.Where("key IN ?", []string{"platform_config", "platform_meta_secret"}).Delete(&models.PlatformSetting{})
	})

	// 1. Fallback to config.toml [whatsapp]
	f.app.Config.WhatsApp.AppID = "toml-app-111"
	f.app.Config.WhatsApp.ConfigID = "toml-cfg-222"
	f.app.Config.WhatsApp.AppSecret = "toml-sec-333"

	// Customer admin request
	adminRole := testutil.CreateAdminRole(t, f.app.DB, f.org.ID)
	customerAdmin := testutil.CreateTestUser(t, f.app.DB, f.org.ID, testutil.WithRoleID(&adminRole.ID))

	cfgReq1 := testutil.NewGETRequest(t)
	testutil.SetAuthContext(cfgReq1, f.org.ID, customerAdmin.ID)
	require.NoError(t, f.app.GetEmbeddedSignupConfig(cfgReq1))

	var resp1 struct {
		WhatsAppAppID    string `json:"whatsapp_app_id"`
		WhatsAppConfigID string `json:"whatsapp_config_id"`
		EmbeddedEnabled  bool   `json:"embedded_enabled"`
	}
	testutil.ParseEnvelopeResponse(t, cfgReq1, &resp1)
	assert.Equal(t, "toml-app-111", resp1.WhatsAppAppID)
	assert.Equal(t, "toml-cfg-222", resp1.WhatsAppConfigID)

	// 2. Platform Configuration overrides config.toml
	upd := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"meta_app_id":             "platform-app-444",
		"meta_config_id":          "platform-cfg-555",
		"meta_app_secret":         "platform-sec-666",
		"embedded_signup_enabled": true,
	}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(upd))

	cfgReq2 := testutil.NewGETRequest(t)
	testutil.SetAuthContext(cfgReq2, f.org.ID, customerAdmin.ID)
	require.NoError(t, f.app.GetEmbeddedSignupConfig(cfgReq2))

	var resp2 struct {
		WhatsAppAppID    string `json:"whatsapp_app_id"`
		WhatsAppConfigID string `json:"whatsapp_config_id"`
	}
	testutil.ParseEnvelopeResponse(t, cfgReq2, &resp2)
	assert.Equal(t, "platform-app-444", resp2.WhatsAppAppID)
	assert.Equal(t, "platform-cfg-555", resp2.WhatsAppConfigID)

	// 3. Organization's own Meta App in Settings overrides platform Configuration
	customOrg := testutil.CreateTestOrganization(t, f.app.DB)
	customRole := testutil.CreateAdminRole(t, f.app.DB, customOrg.ID)
	customUser := testutil.CreateTestUser(t, f.app.DB, customOrg.ID, testutil.WithRoleID(&customRole.ID))

	// Update org settings with custom meta app
	orgUpdReq := testutil.NewJSONRequest(t, map[string]any{
		"meta_app_id":     "org-app-777",
		"meta_config_id":  "org-cfg-888",
		"meta_app_secret": "org-sec-999",
	})
	testutil.SetFullAuthContext(orgUpdReq, customOrg.ID, customUser.ID, nil, false)
	require.NoError(t, f.app.UpdateOrganizationSettings(orgUpdReq))

	cfgReq3 := testutil.NewGETRequest(t)
	testutil.SetAuthContext(cfgReq3, customOrg.ID, customUser.ID)
	require.NoError(t, f.app.GetEmbeddedSignupConfig(cfgReq3))

	var resp3 struct {
		WhatsAppAppID    string `json:"whatsapp_app_id"`
		WhatsAppConfigID string `json:"whatsapp_config_id"`
	}
	testutil.ParseEnvelopeResponse(t, cfgReq3, &resp3)
	assert.Equal(t, "org-app-777", resp3.WhatsAppAppID)
	assert.Equal(t, "org-cfg-888", resp3.WhatsAppConfigID)

	// 4. Default org without custom settings still gets platform Configuration
	cfgReq4 := testutil.NewGETRequest(t)
	testutil.SetAuthContext(cfgReq4, f.org.ID, customerAdmin.ID)
	require.NoError(t, f.app.GetEmbeddedSignupConfig(cfgReq4))
	var resp4 struct {
		WhatsAppAppID    string `json:"whatsapp_app_id"`
		WhatsAppConfigID string `json:"whatsapp_config_id"`
	}
	testutil.ParseEnvelopeResponse(t, cfgReq4, &resp4)
	assert.Equal(t, "platform-app-444", resp4.WhatsAppAppID)
}


func TestApp_Branding_SignupButtonLabels(t *testing.T) {
	f := newSuperAdminFixture(t)
	t.Cleanup(func() {
		f.app.DB.Where("key = ?", "platform_config").Delete(&models.PlatformSetting{})
	})
	org := testutil.CreateTestOrganization(t, f.app.DB)
	user := createAdminUser(t, f.app, org.ID)

	readLabels := func() (string, string) {
		req := testutil.NewGETRequest(t)
		testutil.SetAuthContext(req, org.ID, user.ID)
		require.NoError(t, f.app.GetEmbeddedSignupConfig(req))
		var out struct {
			EmbeddedLabel string `json:"embedded_label"`
			ManualLabel   string `json:"manual_label"`
		}
		testutil.ParseEnvelopeResponse(t, req, &out)
		return out.EmbeddedLabel, out.ManualLabel
	}

	// Defaults when the super admin hasn't set any text.
	e, m := readLabels()
	assert.Equal(t, "Connect with Facebook", e)
	assert.Equal(t, "Configure WABA API", m)

	tooLong := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"embedded_button_label": strings.Repeat("x", 41),
	}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(tooLong))
	testutil.AssertErrorResponse(t, tooLong, fasthttp.StatusBadRequest, "40 characters")

	upd := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"embedded_button_label": "  Sign up with Meta ",
		"manual_button_label":   "Add API details",
	}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(upd))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(upd), string(testutil.GetResponseBody(upd)))

	e, m = readLabels()
	assert.Equal(t, "Sign up with Meta", e)
	assert.Equal(t, "Add API details", m)
}
