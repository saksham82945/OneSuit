package handlers_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

// uniq makes phone IDs unique per run; the test database keeps old rows.
func uniq(id string) string { return id + "-" + uuid.NewString()[:8] }

func manualSetupResp(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var resp struct {
		Data map[string]any `json:"data"`
	}
	require.NoError(t, json.Unmarshal(body, &resp))
	return resp.Data
}

func TestApp_ManualWhatsAppSetup_ConnectsSingleNumber(t *testing.T) {
	phone := uniq("ph")
	meta := newFakeMetaServer(t)
	meta.listFn = func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"id":"` + phone + `","display_phone_number":"+91 98765 43210","verified_name":"Acme"}]}`))
	}
	app := newAppWithMeta(t, meta)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := createAdminUser(t, app, org.ID)

	req := testutil.NewJSONRequest(t, map[string]any{
		"app_id": "app-1", "app_secret": "sec", "access_token": "tok", "business_id": "waba-1",
	})
	testutil.SetAuthContext(req, org.ID, user.ID)
	require.NoError(t, app.ManualWhatsAppSetup(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))

	data := manualSetupResp(t, testutil.GetResponseBody(req))
	assert.Equal(t, "connected", data["status"])
	assert.Equal(t, true, data["webhook_subscribed"])
	assert.Contains(t, data["webhook_url"], "/api/webhook")
	assert.NotEmpty(t, data["verify_token"])
	// The number wasn't CONNECTED in Meta, so it gets registered with a new PIN.
	assert.Equal(t, true, data["registered"])
	assert.Len(t, data["pin"], 6)
	assert.Greater(t, meta.hits["/v18.0/"+phone+"/register"], 0, "expected the number to be registered")

	var acc models.WhatsAppAccount
	require.NoError(t, app.DB.Where("organization_id = ? AND phone_id = ?", org.ID, phone).First(&acc).Error)
	assert.True(t, strings.HasPrefix(acc.Name, "Acme"), acc.Name)
	assert.Equal(t, "waba-1", acc.BusinessID)
	assert.Equal(t, "app-1", acc.AppID)
	assert.True(t, acc.IsDefaultOutgoing)

	// Saving again updates the same number instead of adding a second one.
	req2 := testutil.NewJSONRequest(t, map[string]any{"access_token": "tok2", "business_id": "waba-1"})
	testutil.SetAuthContext(req2, org.ID, user.ID)
	require.NoError(t, app.ManualWhatsAppSetup(req2))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req2))
	assert.Equal(t, true, manualSetupResp(t, testutil.GetResponseBody(req2))["updated"])
	var count int64
	app.DB.Model(&models.WhatsAppAccount{}).Where("organization_id = ?", org.ID).Count(&count)
	assert.Equal(t, int64(1), count)
}

func TestApp_ManualWhatsAppSetup_AsksToChooseNumber(t *testing.T) {
	phoneA := uniq("ph-a")
	phoneB := uniq("ph-b")
	meta := newFakeMetaServer(t)
	meta.listFn = func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"id":"` + phoneA + `","display_phone_number":"1"},{"id":"` + phoneB + `","display_phone_number":"2"}]}`))
	}
	app := newAppWithMeta(t, meta)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := createAdminUser(t, app, org.ID)

	req := testutil.NewJSONRequest(t, map[string]any{"access_token": "tok", "business_id": "waba-2"})
	testutil.SetAuthContext(req, org.ID, user.ID)
	require.NoError(t, app.ManualWhatsAppSetup(req))
	data := manualSetupResp(t, testutil.GetResponseBody(req))
	assert.Equal(t, "choose_phone", data["status"])
	assert.Len(t, data["phone_numbers"], 2)

	req2 := testutil.NewJSONRequest(t, map[string]any{"access_token": "tok", "business_id": "waba-2", "phone_id": phoneB})
	testutil.SetAuthContext(req2, org.ID, user.ID)
	require.NoError(t, app.ManualWhatsAppSetup(req2))
	assert.Equal(t, "connected", manualSetupResp(t, testutil.GetResponseBody(req2))["status"])
}

func TestApp_ManualWhatsAppSetup_BadTokenAndMissingFields(t *testing.T) {
	meta := newFakeMetaServer(t)
	meta.listFn = func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"Invalid OAuth access token"}}`))
	}
	app := newAppWithMeta(t, meta)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := createAdminUser(t, app, org.ID)

	req := testutil.NewJSONRequest(t, map[string]any{"access_token": "bad", "business_id": "waba-3"})
	testutil.SetAuthContext(req, org.ID, user.ID)
	require.NoError(t, app.ManualWhatsAppSetup(req))
	assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(req))
	assert.Contains(t, string(testutil.GetResponseBody(req)), "Invalid OAuth access token")

	req2 := testutil.NewJSONRequest(t, map[string]any{"business_id": "waba-3"})
	testutil.SetAuthContext(req2, org.ID, user.ID)
	require.NoError(t, app.ManualWhatsAppSetup(req2))
	assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(req2))
}

func TestApp_ManualWhatsAppSetup_ConnectedNumberSkipsRegistration(t *testing.T) {
	phone := uniq("ph")
	meta := newFakeMetaServer(t)
	meta.listFn = func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"id":"` + phone + `","display_phone_number":"1","status":"CONNECTED"}]}`))
	}
	app := newAppWithMeta(t, meta)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := createAdminUser(t, app, org.ID)

	req := testutil.NewJSONRequest(t, map[string]any{"access_token": "tok", "business_id": "waba-live"})
	testutil.SetAuthContext(req, org.ID, user.ID)
	require.NoError(t, app.ManualWhatsAppSetup(req))
	data := manualSetupResp(t, testutil.GetResponseBody(req))
	assert.Equal(t, true, data["registered"])
	assert.Equal(t, "", data["pin"])
	assert.Equal(t, 0, meta.hits["/v18.0/"+phone+"/register"])
}

func TestApp_ManualWhatsAppSetup_RegistrationFailureIsReported(t *testing.T) {
	phone := uniq("ph")
	meta := newFakeMetaServer(t)
	meta.listFn = func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"id":"` + phone + `","display_phone_number":"1","status":"PENDING"}]}`))
	}
	meta.phoneFn = func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":{"message":"Two-step verification PIN mismatch"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"display_phone_number":"1","platform_type":"CLOUD_API"}`))
	}
	app := newAppWithMeta(t, meta)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := createAdminUser(t, app, org.ID)

	req := testutil.NewJSONRequest(t, map[string]any{"access_token": "tok", "business_id": "waba-pin"})
	testutil.SetAuthContext(req, org.ID, user.ID)
	require.NoError(t, app.ManualWhatsAppSetup(req))
	data := manualSetupResp(t, testutil.GetResponseBody(req))
	assert.Equal(t, "connected", data["status"])
	assert.Equal(t, false, data["registered"])
	assert.Contains(t, data["registration_error"], "PIN mismatch")

	var acc models.WhatsAppAccount
	require.NoError(t, app.DB.Where("phone_id = ?", phone).First(&acc).Error)
	assert.Equal(t, "pending_registration", acc.Status)
}

func TestApp_ManualWhatsAppSetup_ReconnectAfterDisconnect(t *testing.T) {
	phone := uniq("ph-re")
	name := uniq("Aits")
	meta := newFakeMetaServer(t)
	meta.listFn = func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"id":"` + phone + `","display_phone_number":"+91 85059 17890","verified_name":"` + name + `","status":"CONNECTED"}]}`))
	}
	app := newAppWithMeta(t, meta)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := createAdminUser(t, app, org.ID)

	connect := func() map[string]any {
		req := testutil.NewJSONRequest(t, map[string]any{"access_token": "tok", "business_id": "waba-re"})
		testutil.SetAuthContext(req, org.ID, user.ID)
		require.NoError(t, app.ManualWhatsAppSetup(req))
		require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
		return manualSetupResp(t, testutil.GetResponseBody(req))
	}
	first := connect()
	firstID := first["account"].(map[string]any)["id"]

	// "Disconnect Account" soft-deletes the number; it still holds its name.
	require.NoError(t, app.DB.Where("phone_id = ?", phone).Delete(&models.WhatsAppAccount{}).Error)

	again := connect()
	assert.Equal(t, firstID, again["account"].(map[string]any)["id"], "the old record comes back")
	var acc models.WhatsAppAccount
	require.NoError(t, app.DB.Where("phone_id = ?", phone).First(&acc).Error) // visible again
	assert.Equal(t, name, acc.Name)
}

func TestApp_ManualWhatsAppSetup_NameHeldByDisconnectedNumberElsewhere(t *testing.T) {
	phone := uniq("ph-new")
	name := uniq("Shared")
	other := testutil.CreateTestOrganization(t, newTestApp(t).DB)
	meta := newFakeMetaServer(t)
	meta.listFn = func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"id":"` + phone + `","display_phone_number":"99","verified_name":"` + name + `","status":"CONNECTED"}]}`))
	}
	app := newAppWithMeta(t, meta)
	gone := &models.WhatsAppAccount{
		BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: other.ID, Name: name,
		PhoneID: uniq("old"), BusinessID: "b", AccessToken: "t", WebhookVerifyToken: "v", APIVersion: "v18.0", Status: "active",
	}
	require.NoError(t, app.DB.Create(gone).Error)
	require.NoError(t, app.DB.Delete(gone).Error)

	org := testutil.CreateTestOrganization(t, app.DB)
	user := createAdminUser(t, app, org.ID)
	req := testutil.NewJSONRequest(t, map[string]any{"access_token": "tok", "business_id": "waba-n"})
	testutil.SetAuthContext(req, org.ID, user.ID)
	require.NoError(t, app.ManualWhatsAppSetup(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	assert.Equal(t, name+" (99)", manualSetupResp(t, testutil.GetResponseBody(req))["account"].(map[string]any)["name"])
}

func TestApp_AccountHealth_WebhookURLIsHTTPSBehindProxy(t *testing.T) {
	meta := newFakeMetaServer(t)
	app := newAppWithMeta(t, meta)
	app.Config.App.Environment = "development" // what Render runs with by default
	org := testutil.CreateTestOrganization(t, app.DB)
	user := createAdminUser(t, app, org.ID)
	acc := createTestAccountForValidation(t, app.DB, org.ID, uniq("ph-h"), "biz-h")

	for _, tc := range []struct{ host, proto, want string }{
		{"onesuit.onrender.com", "", "https://onesuit.onrender.com/api/webhook"},
		{"onesuit.onrender.com", "https", "https://onesuit.onrender.com/api/webhook"},
		{"localhost:8080", "", "http://localhost:8080/api/webhook"},
	} {
		req := testutil.NewGETRequest(t)
		req.RequestCtx.Request.Header.SetHost(tc.host)
		if tc.proto != "" {
			req.RequestCtx.Request.Header.Set("X-Forwarded-Proto", tc.proto)
		}
		testutil.SetAuthContext(req, org.ID, user.ID)
		testutil.SetPathParam(req, "id", acc.ID.String())
		require.NoError(t, app.GetAccountHealth(req))
		require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
		assert.Equal(t, tc.want, manualSetupResp(t, testutil.GetResponseBody(req))["webhook_url"], tc.host)
	}
}
