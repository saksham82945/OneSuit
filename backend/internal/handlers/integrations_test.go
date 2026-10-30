package handlers_test

import (
	"testing"

	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

func TestApp_IntegrationLeads(t *testing.T) {
	app := newTestApp(t)
	require.NoError(t, handlers.EnsureIntegrationDefinitions(app.DB))
	org := testutil.CreateTestOrganization(t, app.DB)
	role := testutil.CreateAdminRole(t, app.DB, org.ID)
	admin := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&role.ID))

	connect := func(key, tag string) handlers.ConnectionResponse {
		req := testutil.NewJSONRequest(t, map[string]any{"definition_key": key, "tag": tag})
		testutil.SetFullAuthContext(req, org.ID, admin.ID, &role.ID, false)
		require.NoError(t, app.CreateIntegrationConnection(req))
		require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
		var c handlers.ConnectionResponse
		testutil.ParseEnvelopeResponse(t, req, &c)
		return c
	}
	tokenOf := func(c handlers.ConnectionResponse) string {
		var conn models.IntegrationConnection
		require.NoError(t, app.DB.First(&conn, "id = ?", c.ID).Error)
		return conn.Token
	}

	// IndiaMART Push API shape.
	im := connect("indiamart", "")
	assert.Contains(t, im.LeadURL, "/api/public/integrations/")
	push := func(token string, body any) *fasthttpReq {
		req := testutil.NewJSONRequest(t, body)
		testutil.SetPathParam(req, "token", token)
		require.NoError(t, app.ReceiveIntegrationLead(req))
		return &fasthttpReq{code: testutil.GetResponseStatusCode(req), body: string(testutil.GetResponseBody(req))}
	}
	payload := map[string]any{"CODE": 200, "STATUS": "SUCCESS", "RESPONSE": map[string]any{
		"UNIQUE_QUERY_ID": "Q123", "SENDER_NAME": "Ravi Kumar", "SENDER_MOBILE": "+91-9876543210",
		"SENDER_EMAIL": "ravi@example.com", "SENDER_CITY": "Pune", "QUERY_PRODUCT_NAME": "Steel pipes", "QUERY_MESSAGE": "Need 200 units",
	}}
	r := push(tokenOf(im), payload)
	require.Equal(t, fasthttp.StatusOK, r.code, r.body)
	assert.Contains(t, r.body, `"received":1`)

	var lead models.IntegrationLead
	require.NoError(t, app.DB.First(&lead, "organization_id = ? AND external_id = ?", org.ID, "Q123").Error)
	assert.Equal(t, "Ravi Kumar", lead.Name)
	assert.Equal(t, "919876543210", lead.Phone)
	assert.Equal(t, "Steel pipes", lead.Subject)
	require.NotNil(t, lead.ContactID)
	var contact models.Contact
	require.NoError(t, app.DB.First(&contact, "id = ?", *lead.ContactID).Error)
	assert.Contains(t, contact.Tags, "IndiaMART")
	assert.Equal(t, "IndiaMART", contact.Metadata["lead_source"])

	// The same lead again is skipped.
	r = push(tokenOf(im), payload)
	assert.Contains(t, r.body, `"received":0`)

	// JustDial-style query string, with a custom tag.
	jd := connect("justdial", "JD leads")
	req := testutil.NewGETRequest(t)
	testutil.SetPathParam(req, "token", tokenOf(jd))
	req.RequestCtx.QueryArgs().Set("leadid", "JD9")
	req.RequestCtx.QueryArgs().Set("name", "Meena")
	req.RequestCtx.QueryArgs().Set("mobile", "09811122233")
	req.RequestCtx.QueryArgs().Set("category", "Interior designers")
	require.NoError(t, app.ReceiveIntegrationLead(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	lead = models.IntegrationLead{}
	require.NoError(t, app.DB.First(&lead, "external_id = ?", "JD9").Error)
	assert.Equal(t, "919811122233", lead.Phone)
	assert.Equal(t, "Interior designers", lead.Subject)

	// A lead with no phone or email is skipped; a paused connection refuses leads.
	r = push(tokenOf(jd), map[string]any{"name": "Nobody"})
	assert.Contains(t, r.body, `"received":0`)
	pause := testutil.NewJSONRequest(t, map[string]any{"is_active": false})
	testutil.SetFullAuthContext(pause, org.ID, admin.ID, &role.ID, false)
	testutil.SetPathParam(pause, "id", jd.ID.String())
	require.NoError(t, app.UpdateIntegrationConnection(pause))
	r = push(tokenOf(jd), map[string]any{"name": "X", "mobile": "9811122299"})
	assert.Equal(t, fasthttp.StatusForbidden, r.code)

	// Unknown link.
	r = push("not-a-real-token-1234567890", payload)
	assert.Equal(t, fasthttp.StatusNotFound, r.code)

	var conn models.IntegrationConnection
	require.NoError(t, app.DB.First(&conn, "id = ?", im.ID).Error)
	assert.Equal(t, int64(1), conn.LeadCount)
}

func TestApp_SuperAdminIntegrationCatalog(t *testing.T) {
	f := newSuperAdminFixture(t)
	require.NoError(t, handlers.EnsureIntegrationDefinitions(f.app.DB))

	create := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"name": "My CRM " + testutil.UniqueEmail("x")[:10], "category": "CRM",
		"field_map": map[string][]string{"name": {"lead.full_name"}, "phone": {"lead.cell"}, "bogus": {"x"}},
	}))
	require.NoError(t, f.app.SuperAdminCreateIntegration(create))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(create), string(testutil.GetResponseBody(create)))
	var def models.IntegrationDefinition
	testutil.ParseEnvelopeResponse(t, create, &def)
	assert.NotEmpty(t, def.Key)
	assert.NotContains(t, def.FieldMap, "bogus")

	// Members can't change the catalog.
	deny := f.asMember(testutil.NewJSONRequest(t, map[string]any{"is_enabled": false}))
	testutil.SetPathParam(deny, "key", def.Key)
	require.NoError(t, f.app.SuperAdminUpdateIntegration(deny))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(deny))

	// Built-ins can't be deleted; custom ones can.
	del := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{}))
	testutil.SetPathParam(del, "key", "indiamart")
	require.NoError(t, f.app.SuperAdminDeleteIntegration(del))
	assert.Equal(t, fasthttp.StatusConflict, testutil.GetResponseStatusCode(del))
	del2 := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{}))
	testutil.SetPathParam(del2, "key", def.Key)
	require.NoError(t, f.app.SuperAdminDeleteIntegration(del2))
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(del2))
}

func TestApp_SocialLoginSettings(t *testing.T) {
	f := newSuperAdminFixture(t)
	t.Cleanup(func() { f.app.DB.Where("key = ?", "social_login").Delete(&models.PlatformSetting{}) })

	put := func(provider string, body map[string]any) *fasthttpReq {
		req := f.asSuperAdmin(testutil.NewJSONRequest(t, body))
		testutil.SetPathParam(req, "provider", provider)
		require.NoError(t, f.app.SuperAdminUpdateSocialLogin(req))
		return &fasthttpReq{code: testutil.GetResponseStatusCode(req), body: string(testutil.GetResponseBody(req))}
	}
	// Can't turn on without keys.
	r := put("google", map[string]any{"enabled": true})
	assert.Equal(t, fasthttp.StatusBadRequest, r.code)

	r = put("google", map[string]any{"client_id": "gid.apps.googleusercontent.com", "client_secret": "s3cret", "enabled": true, "show_on_login": true})
	require.Equal(t, fasthttp.StatusOK, r.code, r.body)
	assert.NotContains(t, r.body, "s3cret", "the secret is never sent back")
	assert.Contains(t, r.body, `"keys_set":true`)

	pub := testutil.NewGETRequest(t)
	require.NoError(t, f.app.GetPublicSSOProviders(pub))
	assert.Contains(t, string(testutil.GetResponseBody(pub)), `"provider":"google"`)

	// Hidden from the login page.
	r = put("google", map[string]any{"show_on_login": false})
	require.Equal(t, fasthttp.StatusOK, r.code, r.body)
	pub = testutil.NewGETRequest(t)
	require.NoError(t, f.app.GetPublicSSOProviders(pub))
	assert.NotContains(t, string(testutil.GetResponseBody(pub)), `"provider":"google"`)

	r = put("twitter", map[string]any{"enabled": true})
	assert.Equal(t, fasthttp.StatusBadRequest, r.code)
}
