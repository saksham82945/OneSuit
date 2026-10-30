package handlers_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

func TestApp_WebhookHandler_AcceptsPlatformAppSecret(t *testing.T) {
	app := newAppForWebhook(t, "")
	app.Config.WhatsApp.AppSecret = "platform-secret"
	org := testutil.CreateTestOrganization(t, app.DB)
	phone := "wh-plat-" + uuid.NewString()[:8]
	acc := &models.WhatsAppAccount{
		BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: org.ID, Name: "wh-plat-" + uuid.NewString()[:8],
		PhoneID: phone, BusinessID: "biz", AccessToken: "tok", AppSecret: "client-own-secret",
		WebhookVerifyToken: "vt", APIVersion: "v18.0", Status: "active",
	}
	require.NoError(t, app.DB.Create(acc).Error)

	body := makeMessagesPayload(phone)
	req := testutil.NewRequest(t)
	req.RequestCtx.Request.Header.SetMethod("POST")
	req.RequestCtx.Request.Header.SetContentType("application/json")
	// Meta signs with the platform app that the WhatsApp Business Account is subscribed to.
	req.RequestCtx.Request.Header.Set("X-Hub-Signature-256", signWebhook(body, "platform-secret"))
	req.RequestCtx.Request.SetBody(body)

	require.NoError(t, app.WebhookHandler(req))
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))

	last, err := app.Redis.HGetAll(context.Background(), "wa:webhook:last:"+phone).Result()
	require.NoError(t, err)
	assert.Equal(t, "event received", last["result"])
}

func TestApp_WebhookHandler_RecordsRejectedSignature(t *testing.T) {
	app := newAppForWebhook(t, "")
	org := testutil.CreateTestOrganization(t, app.DB)
	phone := "wh-bad-" + uuid.NewString()[:8]
	acc := &models.WhatsAppAccount{
		BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: org.ID, Name: "wh-bad-" + uuid.NewString()[:8],
		PhoneID: phone, BusinessID: "biz", AccessToken: "tok", AppSecret: "real-secret",
		WebhookVerifyToken: "vt", APIVersion: "v18.0", Status: "active",
	}
	require.NoError(t, app.DB.Create(acc).Error)

	body := makeMessagesPayload(phone)
	req := testutil.NewRequest(t)
	req.RequestCtx.Request.Header.SetMethod("POST")
	req.RequestCtx.Request.Header.SetContentType("application/json")
	req.RequestCtx.Request.Header.Set("X-Hub-Signature-256", signWebhook(body, "someone-else"))
	req.RequestCtx.Request.SetBody(body)

	require.NoError(t, app.WebhookHandler(req))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(req))
	last, _ := app.Redis.HGetAll(context.Background(), "wa:webhook:last:"+phone).Result()
	assert.Contains(t, last["result"], "rejected")
}
