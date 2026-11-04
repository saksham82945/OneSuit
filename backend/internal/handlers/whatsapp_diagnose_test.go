package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/pkg/whatsapp"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/logf"
)

// fakeGraph is a small stateful stand-in for Meta's Graph API.
type fakeGraph struct {
	mu            sync.Mutex
	phoneJSON     string
	wabaApps      []string // app ids linked to the WABA
	webhookObject string   // object saved on the app's webhook ("user" or "whatsapp_business_account")
	callback      string
	fields        []string
	posted        map[string]string
}

func (g *fakeGraph) handler(t *testing.T, appID, wabaID, phoneID string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		g.mu.Lock()
		defer g.mu.Unlock()
		p := r.URL.Path
		switch {
		case strings.HasSuffix(p, "/"+phoneID) && r.Method == http.MethodGet:
			_, _ = w.Write([]byte(g.phoneJSON))
		case strings.HasSuffix(p, "/"+wabaID+"/subscribed_apps") && r.Method == http.MethodGet:
			var items []string
			for _, id := range g.wabaApps {
				items = append(items, `{"whatsapp_business_api_data":{"id":"`+id+`","name":"One Suit-AITS"}}`)
			}
			_, _ = w.Write([]byte(`{"data":[` + strings.Join(items, ",") + `]}`))
		case strings.HasSuffix(p, "/"+wabaID+"/subscribed_apps") && r.Method == http.MethodPost:
			g.wabaApps = []string{appID}
			_, _ = w.Write([]byte(`{"success":true}`))
		case strings.HasSuffix(p, "/"+appID+"/subscriptions") && r.Method == http.MethodGet:
			assert.Equal(t, "Bearer "+appID+"|app-secret", r.Header.Get("Authorization"))
			f, _ := json.Marshal(g.fields)
			_, _ = w.Write([]byte(`{"data":[{"object":"` + g.webhookObject + `","callback_url":"` + g.callback + `","active":true,"fields":` + string(f) + `}]}`))
		case strings.HasSuffix(p, "/"+appID+"/subscriptions") && r.Method == http.MethodPost:
			_ = r.ParseForm()
			g.posted = map[string]string{}
			for k := range r.PostForm {
				g.posted[k] = r.PostForm.Get(k)
			}
			g.webhookObject = r.PostForm.Get("object")
			g.callback = r.PostForm.Get("callback_url")
			g.fields = strings.Split(r.PostForm.Get("fields"), ",")
			_, _ = w.Write([]byte(`{"success":true}`))
		default:
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":{"message":"unexpected ` + r.Method + ` ` + p + `"}}`))
		}
	})
}

func checksByKey(t *testing.T, body []byte) map[string]map[string]any {
	t.Helper()
	var resp struct {
		Data struct {
			Checks []map[string]any `json:"checks"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(body, &resp), string(body))
	out := map[string]map[string]any{}
	for _, c := range resp.Data.Checks {
		out[c["key"].(string)] = c
	}
	return out
}

func TestApp_DiagnoseAccount_FindsAndFixesWebhook(t *testing.T) {
	appID, wabaID, phoneID := "app-"+uuid.NewString()[:6], "waba-"+uuid.NewString()[:6], "ph-"+uuid.NewString()[:6]
	g := &fakeGraph{
		// Like the real number: only in the WhatsApp Business app, webhook saved under "User".
		phoneJSON:     `{"display_phone_number":"+91 85059 17890","status":"DISCONNECTED","platform_type":"NOT_APPLICABLE","is_on_biz_app":true}`,
		wabaApps:      []string{appID},
		webhookObject: "user",
		callback:      "https://onesuit.onrender.com/api/webhook",
		fields:        []string{"about", "feed"},
	}
	srv := httptest.NewServer(g.handler(t, appID, wabaID, phoneID))
	t.Cleanup(srv.Close)

	app := newAppWithMeta(t, newFakeMetaServer(t))
	app.WhatsApp = whatsapp.NewWithBaseURL(logf.New(logf.Opts{Level: logf.ErrorLevel}), srv.URL)
	app.Config.WhatsApp.BaseURL = srv.URL
	org := testutil.CreateTestOrganization(t, app.DB)
	user := createAdminUser(t, app, org.ID)
	acc := &models.WhatsAppAccount{
		BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: org.ID, Name: "diag-" + uuid.NewString()[:6],
		AppID: appID, AppSecret: "app-secret", PhoneID: phoneID, BusinessID: wabaID, AccessToken: "tok",
		WebhookVerifyToken: "verify-me", APIVersion: "v18.0", Status: "active",
	}
	require.NoError(t, app.DB.Create(acc).Error)
	super := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithSuperAdmin())

	// Workspace admins can't run it: Meta webhook settings belong to the platform team.
	{
		req := testutil.NewGETRequest(t)
		testutil.SetAuthContext(req, org.ID, user.ID)
		testutil.SetPathParam(req, "id", acc.ID.String())
		require.NoError(t, app.DiagnoseAccount(req))
		assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(req))
	}

	diagnose := func() map[string]map[string]any {
		req := testutil.NewGETRequest(t)
		req.RequestCtx.Request.Header.SetHost("onesuit.onrender.com")
		testutil.SetFullAuthContext(req, org.ID, super.ID, nil, true)
		testutil.SetPathParam(req, "id", acc.ID.String())
		require.NoError(t, app.DiagnoseAccount(req))
		require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
		return checksByKey(t, testutil.GetResponseBody(req))
	}

	c := diagnose()
	assert.Equal(t, "ok", c["token"]["status"])
	assert.Equal(t, "fail", c["cloud_api"]["status"])
	assert.Contains(t, c["cloud_api"]["detail"], "only runs in the WhatsApp Business phone app")
	assert.Equal(t, "ok", c["waba_app"]["status"])
	assert.Equal(t, "fail", c["app_webhook"]["status"])
	assert.Contains(t, c["app_webhook"]["detail"], "has no “Whatsapp Business Account” webhook")
	assert.Equal(t, "configure_webhook", c["app_webhook"]["fix"])
	assert.Equal(t, "warn", c["received"]["status"])

	// Run the fix: OneSuit sets the app's WhatsApp webhook itself.
	fix := testutil.NewJSONRequest(t, map[string]any{"action": "configure_webhook"})
	fix.RequestCtx.Request.Header.SetHost("onesuit.onrender.com")
	testutil.SetFullAuthContext(fix, org.ID, super.ID, nil, true)
	testutil.SetPathParam(fix, "id", acc.ID.String())
	require.NoError(t, app.FixAccountConnection(fix))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(fix), string(testutil.GetResponseBody(fix)))
	assert.Equal(t, "whatsapp_business_account", g.posted["object"])
	assert.Equal(t, "https://onesuit.onrender.com/api/webhook", g.posted["callback_url"])
	assert.Equal(t, "verify-me", g.posted["verify_token"])
	assert.Contains(t, g.posted["fields"], "messages")

	assert.Equal(t, "ok", diagnose()["app_webhook"]["status"])
}

func TestApp_DiagnoseAccount_BadTokenStopsEarly(t *testing.T) {
	meta := newFakeMetaServer(t)
	meta.phoneFn = func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"Error validating access token: Session has expired"}}`))
	}
	app := newAppWithMeta(t, meta)
	org := testutil.CreateTestOrganization(t, app.DB)
	super := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithSuperAdmin())
	acc := createTestAccountForValidation(t, app.DB, org.ID, "ph-"+uuid.NewString()[:6], "biz")

	req := testutil.NewGETRequest(t)
	testutil.SetFullAuthContext(req, org.ID, super.ID, nil, true)
	testutil.SetPathParam(req, "id", acc.ID.String())
	require.NoError(t, app.DiagnoseAccount(req))
	c := checksByKey(t, testutil.GetResponseBody(req))
	assert.Len(t, c, 1)
	assert.Equal(t, "fail", c["token"]["status"])
	assert.Contains(t, c["token"]["detail"], "Session has expired")
}
