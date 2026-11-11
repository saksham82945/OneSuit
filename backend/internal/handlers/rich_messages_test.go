package handlers_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

type richEnv struct {
	mock    *mockWhatsAppServer
	app     *handlers.App
	org     *models.Organization
	user    *models.User
	account *models.WhatsAppAccount
	contact *models.Contact
}

func newRichEnv(t *testing.T) *richEnv {
	t.Helper()
	mock := newMockWhatsAppServer()
	t.Cleanup(mock.close)
	app := newMsgTestApp(t, mock)
	org := testutil.CreateTestOrganization(t, app.DB)
	role := testutil.CreateAdminRole(t, app.DB, org.ID)
	user := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&role.ID))
	account := createTestAccount(t, app, org.ID)
	contact := testutil.CreateTestContactWith(t, app.DB, org.ID, testutil.WithContactAccount(account.Name))
	now := time.Now()
	require.NoError(t, app.DB.Model(contact).Update("last_inbound_at", now).Error)
	contact.LastInboundAt = &now
	return &richEnv{mock: mock, app: app, org: org, user: user, account: account, contact: contact}
}

// send posts body to SendMessage and waits for the payload to reach Meta.
func (e *richEnv) send(t *testing.T, body map[string]any) (int, handlers.MessageResponse, map[string]any) {
	t.Helper()
	before := len(e.mock.sentMessages)
	req := testutil.NewJSONRequest(t, body)
	testutil.SetAuthContext(req, e.org.ID, e.user.ID)
	testutil.SetPathParam(req, "id", e.contact.ID.String())
	require.NoError(t, e.app.SendMessage(req))
	status := testutil.GetResponseStatusCode(req)
	var resp struct {
		Data handlers.MessageResponse `json:"data"`
	}
	_ = json.Unmarshal(testutil.GetResponseBody(req), &resp)
	if status != fasthttp.StatusOK {
		return status, resp.Data, nil
	}
	testutil.AssertEventually(t, func() bool { return len(e.mock.sentMessages) > before }, 3*time.Second, "payload sent to Meta")
	return status, resp.Data, e.mock.sentMessages[len(e.mock.sentMessages)-1]
}

func TestSendMessage_Location(t *testing.T) {
	e := newRichEnv(t)
	status, msg, sent := e.send(t, map[string]any{
		"type":     "location",
		"location": map[string]any{"latitude": 28.6139, "longitude": 77.209, "name": "India Gate", "address": "New Delhi"},
	})
	require.Equal(t, fasthttp.StatusOK, status)
	assert.Equal(t, models.MessageTypeLocation, msg.MessageType)
	assert.Equal(t, "location", sent["type"])
	assert.Equal(t, "India Gate", sent["location"].(map[string]any)["name"])

	var stored models.Message
	require.NoError(t, e.app.DB.First(&stored, "id = ?", msg.ID).Error)
	var content map[string]any
	require.NoError(t, json.Unmarshal([]byte(stored.Content), &content), "location is stored as JSON like incoming ones")
	assert.Equal(t, "New Delhi", content["address"])

	status, _, _ = e.send(t, map[string]any{"type": "location", "location": map[string]any{"latitude": 200, "longitude": 0}})
	assert.Equal(t, fasthttp.StatusBadRequest, status)
}

func TestSendMessage_ContactCard(t *testing.T) {
	e := newRichEnv(t)
	status, msg, sent := e.send(t, map[string]any{
		"type": "contacts",
		"contacts": []map[string]any{{
			"name":   "Ravi Kumar",
			"phones": []map[string]any{{"phone": "+919811111111"}},
			"emails": []map[string]any{{"email": "ravi@example.com"}},
		}},
	})
	require.Equal(t, fasthttp.StatusOK, status)
	assert.Equal(t, models.MessageTypeContacts, msg.MessageType)
	assert.Equal(t, "contacts", sent["type"])
	card := sent["contacts"].([]any)[0].(map[string]any)
	assert.Equal(t, "Ravi Kumar", card["name"].(map[string]any)["formatted_name"])

	status, _, _ = e.send(t, map[string]any{"type": "contacts", "contacts": []map[string]any{{"name": "Nobody"}}})
	assert.Equal(t, fasthttp.StatusBadRequest, status, "a card needs a phone or email")
}

func TestSendMessage_ProductAndProductList(t *testing.T) {
	e := newRichEnv(t)
	status, msg, sent := e.send(t, map[string]any{
		"type": "interactive",
		"interactive": map[string]any{
			"type": "product", "catalog_id": "cat-9", "product_retailer_id": "sku-1", "body": "Have a look",
			"products": []map[string]any{{"product_retailer_id": "sku-1", "name": "Blue shirt", "price": "₹999"}},
		},
	})
	require.Equal(t, fasthttp.StatusOK, status)
	in := sent["interactive"].(map[string]any)
	assert.Equal(t, "product", in["type"])
	assert.Equal(t, map[string]any{"catalog_id": "cat-9", "product_retailer_id": "sku-1"}, in["action"])
	assert.Equal(t, "product", msg.InteractiveData["type"])
	assert.Len(t, msg.InteractiveData["products"], 1)

	status, msg, sent = e.send(t, map[string]any{
		"type": "interactive",
		"interactive": map[string]any{
			"type": "product_list", "catalog_id": "cat-9", "header": "Summer sale", "body": "Pick one",
			"sections": []map[string]any{{"title": "Shirts", "product_retailer_ids": []string{"sku-1", "sku-2"}}},
		},
	})
	require.Equal(t, fasthttp.StatusOK, status)
	in = sent["interactive"].(map[string]any)
	assert.Equal(t, "product_list", in["type"])
	assert.Equal(t, "Summer sale", in["header"].(map[string]any)["text"])
	assert.Equal(t, "product_list", msg.InteractiveData["type"])

	status, _, _ = e.send(t, map[string]any{
		"type":        "interactive",
		"interactive": map[string]any{"type": "product_list", "catalog_id": "cat-9", "body": "no header", "sections": []map[string]any{{"product_retailer_ids": []string{"a"}}}},
	})
	assert.Equal(t, fasthttp.StatusBadRequest, status)
}

func TestSendMessage_LocationRequest(t *testing.T) {
	e := newRichEnv(t)
	status, msg, sent := e.send(t, map[string]any{
		"type":        "interactive",
		"interactive": map[string]any{"type": "location_request", "body": "Share your delivery location"},
	})
	require.Equal(t, fasthttp.StatusOK, status)
	in := sent["interactive"].(map[string]any)
	assert.Equal(t, "location_request_message", in["type"])
	assert.Equal(t, "location_request", msg.InteractiveData["type"])
}

func TestSendMessage_PollButtonsAndList(t *testing.T) {
	e := newRichEnv(t)
	status, msg, sent := e.send(t, map[string]any{
		"type":        "interactive",
		"interactive": map[string]any{"type": "poll", "body": "Which slot works?", "options": []string{"Morning", "Evening", " morning "}},
	})
	require.Equal(t, fasthttp.StatusOK, status)
	in := sent["interactive"].(map[string]any)
	assert.Equal(t, "button", in["type"], "2-3 options become reply buttons")
	buttons := in["action"].(map[string]any)["buttons"].([]any)
	require.Len(t, buttons, 2, "duplicate options are dropped")
	id := buttons[0].(map[string]any)["reply"].(map[string]any)["id"].(string)
	assert.Contains(t, id, "poll:"+msg.InteractiveData["poll_id"].(string)+":")
	assert.Equal(t, "poll", msg.InteractiveData["type"])

	_, _, sent = e.send(t, map[string]any{
		"type":        "interactive",
		"interactive": map[string]any{"type": "poll", "body": "Favourite colour?", "options": []string{"Red", "Green", "Blue", "Black"}},
	})
	in = sent["interactive"].(map[string]any)
	assert.Equal(t, "list", in["type"], "4-10 options become a list")
	assert.Equal(t, "Vote", in["action"].(map[string]any)["button"])

	status, _, _ = e.send(t, map[string]any{
		"type":        "interactive",
		"interactive": map[string]any{"type": "poll", "body": "Q", "options": []string{"Only one"}},
	})
	assert.Equal(t, fasthttp.StatusBadRequest, status)
	status, _, _ = e.send(t, map[string]any{
		"type":        "interactive",
		"interactive": map[string]any{"type": "poll", "body": "Q", "options": []string{"This option is far too long for a button", "B"}},
	})
	assert.Equal(t, fasthttp.StatusBadRequest, status)
}

func scheduleReq(t *testing.T, e *richEnv, body map[string]any) (int, map[string]any) {
	t.Helper()
	req := testutil.NewJSONRequest(t, body)
	testutil.SetAuthContext(req, e.org.ID, e.user.ID)
	testutil.SetPathParam(req, "id", e.contact.ID.String())
	require.NoError(t, e.app.CreateScheduledMessage(req))
	var resp struct {
		Data map[string]any `json:"data"`
	}
	_ = json.Unmarshal(testutil.GetResponseBody(req), &resp)
	return testutil.GetResponseStatusCode(req), resp.Data
}

func TestScheduleMessage_CreateValidateCancel(t *testing.T) {
	e := newRichEnv(t)
	status, _ := scheduleReq(t, e, map[string]any{"body": "hi", "scheduled_at": time.Now().Add(-time.Hour).Format(time.RFC3339)})
	assert.Equal(t, fasthttp.StatusBadRequest, status, "past times are rejected")

	status, data := scheduleReq(t, e, map[string]any{"body": "Reminder: your demo is tomorrow", "scheduled_at": time.Now().Add(48 * time.Hour).Format(time.RFC3339)})
	require.Equal(t, fasthttp.StatusOK, status)
	assert.Equal(t, "scheduled", data["status"])
	assert.NotEmpty(t, data["window_warning"], "text due after the 24h window gets a warning")

	// Edit it.
	id := data["id"].(string)
	req := testutil.NewJSONRequest(t, map[string]any{"body": "Edited", "scheduled_at": time.Now().Add(2 * time.Hour).Format(time.RFC3339)})
	testutil.SetAuthContext(req, e.org.ID, e.user.ID)
	testutil.SetPathParam(req, "id", id)
	require.NoError(t, e.app.UpdateScheduledMessage(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	var sm models.ScheduledMessage
	require.NoError(t, e.app.DB.First(&sm, "id = ?", id).Error)
	assert.Equal(t, "Edited", sm.Content)

	// Cancel it.
	req = testutil.NewJSONRequest(t, map[string]any{})
	testutil.SetAuthContext(req, e.org.ID, e.user.ID)
	testutil.SetPathParam(req, "id", id)
	require.NoError(t, e.app.CancelScheduledMessage(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	require.NoError(t, e.app.DB.First(&sm, "id = ?", id).Error)
	assert.Equal(t, models.ScheduledStatusCancelled, sm.Status)
}

func TestScheduleMessage_DueJobSendsAndRespectsWindow(t *testing.T) {
	e := newRichEnv(t)
	due := time.Now().Add(-time.Minute)
	textMsg := models.ScheduledMessage{
		BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: e.org.ID, ContactID: e.contact.ID,
		WhatsAppAccount: e.account.Name, Kind: "text", Content: "Scheduled hello", ScheduledAt: due, Status: models.ScheduledStatusScheduled,
	}
	require.NoError(t, e.app.DB.Create(&textMsg).Error)

	// A contact whose window has closed: free-form text must fail clearly.
	closed := testutil.CreateTestContactWith(t, e.app.DB, e.org.ID, testutil.WithContactAccount(e.account.Name))
	old := time.Now().Add(-30 * time.Hour)
	require.NoError(t, e.app.DB.Model(closed).Update("last_inbound_at", old).Error)
	closedMsg := models.ScheduledMessage{
		BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: e.org.ID, ContactID: closed.ID,
		WhatsAppAccount: e.account.Name, Kind: "text", Content: "Too late", ScheduledAt: due, Status: models.ScheduledStatusScheduled,
	}
	require.NoError(t, e.app.DB.Create(&closedMsg).Error)

	// A template goes out even with the window closed.
	tpl := testutil.CreateTestTemplate(t, e.app.DB, e.org.ID, e.account.Name)
	tplMsg := models.ScheduledMessage{
		BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: e.org.ID, ContactID: closed.ID,
		WhatsAppAccount: e.account.Name, Kind: "template", TemplateID: &tpl.ID, TemplateName: tpl.Name,
		TemplateParams: models.JSONB{"1": "Asha"}, ScheduledAt: due, Status: models.ScheduledStatusScheduled,
	}
	require.NoError(t, e.app.DB.Create(&tplMsg).Error)

	// Not due yet: left alone.
	later := models.ScheduledMessage{
		BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: e.org.ID, ContactID: e.contact.ID,
		WhatsAppAccount: e.account.Name, Kind: "text", Content: "Later", ScheduledAt: time.Now().Add(time.Hour), Status: models.ScheduledStatusScheduled,
	}
	require.NoError(t, e.app.DB.Create(&later).Error)

	e.app.ProcessDueScheduledMessages(testutil.TestContext(t))
	e.app.ProcessDueScheduledMessages(testutil.TestContext(t)) // a second tick must not resend

	reload := func(id uuid.UUID) models.ScheduledMessage {
		var sm models.ScheduledMessage
		require.NoError(t, e.app.DB.First(&sm, "id = ?", id).Error)
		return sm
	}
	got := reload(textMsg.ID)
	assert.Equal(t, models.ScheduledStatusSent, got.Status)
	require.NotNil(t, got.MessageID)
	var sentMsg models.Message
	require.NoError(t, e.app.DB.First(&sentMsg, "id = ?", *got.MessageID).Error)
	assert.Equal(t, "Scheduled hello", sentMsg.Content)

	got = reload(closedMsg.ID)
	assert.Equal(t, models.ScheduledStatusFailed, got.Status)
	assert.Contains(t, got.ErrorMessage, "24-hour")

	assert.Equal(t, models.ScheduledStatusSent, reload(tplMsg.ID).Status)
	assert.Equal(t, models.ScheduledStatusScheduled, reload(later.ID).Status)

	texts, templates := 0, 0
	for _, m := range e.mock.sentMessages {
		switch m["type"] {
		case "text":
			if m["text"].(map[string]any)["body"] == "Scheduled hello" {
				texts++
			}
		case "template":
			if m["template"].(map[string]any)["name"] == tpl.Name {
				templates++
			}
		}
	}
	assert.Equal(t, 1, texts, "sent exactly once")
	assert.Equal(t, 1, templates)
}
