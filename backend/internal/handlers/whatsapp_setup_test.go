package handlers_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

type waSetupFixture struct {
	app     *handlers.App
	org     *models.Organization
	admin   *models.User
	role    *models.CustomRole
	account *models.WhatsAppAccount
}

// newWASetupFixture points the app at a fake Meta Graph API.
func newWASetupFixture(t *testing.T, meta http.HandlerFunc) *waSetupFixture {
	t.Helper()
	srv := httptest.NewServer(meta)
	t.Cleanup(srv.Close)
	app := newTestApp(t)
	app.Config.WhatsApp.BaseURL = srv.URL
	org := testutil.CreateTestOrganization(t, app.DB)
	role := testutil.CreateAdminRole(t, app.DB, org.ID)
	admin := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&role.ID))
	acc := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)
	return &waSetupFixture{app: app, org: org, admin: admin, role: role, account: acc}
}

func (f *waSetupFixture) call(t *testing.T, h func(*fastglue.Request) error, body any, id string) *fastglue.Request {
	t.Helper()
	var req *fastglue.Request
	if body == nil {
		req = testutil.NewGETRequest(t)
	} else {
		req = testutil.NewJSONRequest(t, body)
	}
	testutil.SetFullAuthContext(req, f.org.ID, f.admin.ID, &f.role.ID, false)
	if id != "" {
		testutil.SetPathParam(req, "id", id)
	}
	require.NoError(t, h(req))
	return req
}

func TestApp_WhatsAppSetup_Health(t *testing.T) {
	t.Parallel()
	f := newWASetupFixture(t, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "Bearer test-token", r.Header.Get("Authorization"))
		if strings.Contains(r.URL.Path, "business-") {
			_, _ = w.Write([]byte(`{"name":"Acme","account_review_status":"APPROVED","health_status":{"can_send_message":"LIMITED"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"display_phone_number":"+91 98200 11223","verified_name":"Acme","quality_rating":"GREEN","status":"CONNECTED","health_status":{"can_send_message":"AVAILABLE"}}`))
	})

	req := f.call(t, f.app.GetAccountHealth, nil, f.account.ID.String())
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var out map[string]any
	testutil.ParseEnvelopeResponse(t, req, &out)
	assert.Equal(t, "LIMITED", out["overall_health"], "the business account's health wins")
	assert.Equal(t, f.account.BusinessID, out["business_id"])
	assert.Equal(t, "GREEN", out["quality_rating"])
	assert.Equal(t, "APPROVED", out["account_review_status"])
	assert.NotEmpty(t, out["checked_at"])
}

func TestApp_WhatsAppSetup_HealthMetaError(t *testing.T) {
	t.Parallel()
	f := newWASetupFixture(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"Error validating access token"}}`))
	})
	req := f.call(t, f.app.GetAccountHealth, nil, f.account.ID.String())
	testutil.AssertErrorResponse(t, req, fasthttp.StatusBadGateway, "Error validating access token")
}

func TestApp_WhatsAppSetup_SyncPhoneNumbers(t *testing.T) {
	t.Parallel()
	var f *waSetupFixture
	f = newWASetupFixture(t, func(w http.ResponseWriter, r *http.Request) {
		assert.True(t, strings.HasSuffix(r.URL.Path, "/phone_numbers"))
		_, _ = w.Write([]byte(`{"data":[{"id":"` + f.account.PhoneID + `","display_phone_number":"+91 1","status":"CONNECTED"},{"id":"other-123","display_phone_number":"+91 2","status":"PENDING"}]}`))
	})

	req := f.call(t, f.app.SyncAccountPhoneNumbers, map[string]any{}, f.account.ID.String())
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var out struct {
		PhoneNumbers []struct {
			PhoneID     string `json:"phone_id"`
			Connected   bool   `json:"connected"`
			AccountName string `json:"account_name"`
		} `json:"phone_numbers"`
	}
	testutil.ParseEnvelopeResponse(t, req, &out)
	require.Len(t, out.PhoneNumbers, 2)
	assert.True(t, out.PhoneNumbers[0].Connected)
	assert.Equal(t, f.account.Name, out.PhoneNumbers[0].AccountName)
	assert.False(t, out.PhoneNumbers[1].Connected)
}

func TestApp_WhatsAppSetup_TestContact(t *testing.T) {
	t.Parallel()
	f := newWASetupFixture(t, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) })

	var out struct {
		Phone      string `json:"phone"`
		Configured bool   `json:"configured"`
	}
	testutil.ParseEnvelopeResponse(t, f.call(t, f.app.GetTestContact, nil, ""), &out)
	assert.False(t, out.Configured)

	testutil.AssertErrorResponse(t, f.call(t, f.app.UpdateTestContact, map[string]any{"phone": "12"}, ""), fasthttp.StatusBadRequest, "country code")

	req := f.call(t, f.app.UpdateTestContact, map[string]any{"phone": "+91 98200-11223"}, "")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	testutil.ParseEnvelopeResponse(t, f.call(t, f.app.GetTestContact, nil, ""), &out)
	assert.Equal(t, "919820011223", out.Phone)
	assert.True(t, out.Configured)

	// Other organization settings survive.
	var org models.Organization
	require.NoError(t, f.app.DB.First(&org, "id = ?", f.org.ID).Error)
	assert.Equal(t, "919820011223", org.Settings["test_contact_phone"])

	// Clearing it.
	f.call(t, f.app.UpdateTestContact, map[string]any{"phone": ""}, "")
	testutil.ParseEnvelopeResponse(t, f.call(t, f.app.GetTestContact, nil, ""), &out)
	assert.False(t, out.Configured)
}

func TestApp_WhatsAppSetup_AgentCannotChangeTestContact(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	agentRole := testutil.CreateAgentRole(t, app.DB, org.ID)
	agent := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&agentRole.ID))
	req := testutil.NewJSONRequest(t, map[string]any{"phone": "919820011223"})
	testutil.SetFullAuthContext(req, org.ID, agent.ID, &agentRole.ID, false)
	require.NoError(t, app.UpdateTestContact(req))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(req))
}

func TestApp_ConnectButton_VisibilityAndLink(t *testing.T) {
	f := newSuperAdminFixture(t)
	t.Cleanup(func() {
		f.app.DB.Where("key = ?", "platform_config").Delete(&models.PlatformSetting{})
	})
	f.app.Config.WhatsApp.AppID = ""
	f.app.Config.WhatsApp.ConfigID = ""
	adminRole := testutil.CreateAdminRole(t, f.app.DB, f.org.ID)
	admin := testutil.CreateTestUser(t, f.app.DB, f.org.ID, testutil.WithRoleID(&adminRole.ID))

	read := func(asSuper bool) (bool, string) {
		req := testutil.NewGETRequest(t)
		if asSuper {
			f.asSuperAdmin(req)
		} else {
			testutil.SetFullAuthContext(req, f.org.ID, admin.ID, &adminRole.ID, false)
		}
		require.NoError(t, f.app.GetEmbeddedSignupConfig(req))
		var out struct {
			Visible bool   `json:"connect_button_visible"`
			URL     string `json:"connect_url"`
		}
		testutil.ParseEnvelopeResponse(t, req, &out)
		return out.Visible, out.URL
	}

	visible, link := read(false)
	assert.True(t, visible, "shown by default")
	assert.Contains(t, link, "business.facebook.com/messaging/whatsapp/onboard/?app_id=1732716131427334")

	bad := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"connect_url": "http://example.com"}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(bad))
	testutil.AssertErrorResponse(t, bad, fasthttp.StatusBadRequest, "https://")

	upd := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"hide_connect_button": true, "connect_url": "https://business.facebook.com/messaging/whatsapp/onboard/?app_id=1&config_id=2",
		"embedded_signup_enabled": true, "manual_signup_enabled": true,
	}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(upd))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(upd), string(testutil.GetResponseBody(upd)))

	visible, link = read(false)
	assert.False(t, visible, "hidden for business users")
	assert.Equal(t, "https://business.facebook.com/messaging/whatsapp/onboard/?app_id=1&config_id=2", link)
	visible, _ = read(true)
	assert.True(t, visible, "super admins still see it")
}
