package handlers_test

import (
	"testing"

	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

func TestApp_SuperAdminListWebhooks(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	acc := createTestAccountForValidation(t, f.app.DB, f.org.ID, uniq("ph-wh"), "biz-wh")

	// Workspace members are refused.
	req := f.asMember(testutil.NewGETRequest(t))
	require.NoError(t, f.app.SuperAdminListWebhooks(req))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(req))

	req = f.asSuperAdmin(testutil.NewGETRequest(t))
	req.RequestCtx.Request.Header.SetHost("onesuit.onrender.com")
	require.NoError(t, f.app.SuperAdminListWebhooks(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var out struct {
		CallbackURL string `json:"callback_url"`
		Accounts    []struct {
			ID                 string `json:"id"`
			OrganizationName   string `json:"organization_name"`
			WebhookVerifyToken string `json:"webhook_verify_token"`
		} `json:"accounts"`
	}
	testutil.ParseEnvelopeResponse(t, req, &out)
	assert.Equal(t, "https://onesuit.onrender.com/api/webhook", out.CallbackURL)
	found := false
	for _, a := range out.Accounts {
		if a.ID == acc.ID.String() {
			found = true
			assert.Equal(t, f.org.Name, a.OrganizationName)
			assert.Equal(t, acc.WebhookVerifyToken, a.WebhookVerifyToken)
		}
	}
	assert.True(t, found, "the number is listed with its verify token")
}
