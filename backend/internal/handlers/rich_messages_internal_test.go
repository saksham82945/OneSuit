package handlers

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type richWebhookEnv struct {
	app     *App
	org     models.Organization
	account models.WhatsAppAccount
	contact *models.Contact
}

func newRichWebhookEnv(t *testing.T) *richWebhookEnv {
	t.Helper()
	app := webhookTestApp(t)
	uid := uuid.New().String()[:8]
	org := models.Organization{BaseModel: models.BaseModel{ID: uuid.New()}, Name: "rich-" + uid, Slug: "rich-" + uid}
	require.NoError(t, app.DB.Create(&org).Error)
	account := models.WhatsAppAccount{
		BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: org.ID, Name: "rich-acct-" + uid,
		PhoneID: "phone-rich-" + uid, BusinessID: "biz-rich-" + uid, AccessToken: "token",
	}
	require.NoError(t, app.DB.Create(&account).Error)
	contact := testutil.CreateTestContactWith(t, app.DB, org.ID,
		testutil.WithContactAccount(account.Name), testutil.WithPhoneNumber("9177"+uid[:6]))
	return &richWebhookEnv{app: app, org: org, account: account, contact: contact}
}

// deliver posts one incoming message (raw JSON object) through the webhook.
func (e *richWebhookEnv) deliver(t *testing.T, message map[string]any) {
	t.Helper()
	message["from"] = e.contact.PhoneNumber
	message["timestamp"] = "1716152000"
	payload := map[string]any{
		"object": "whatsapp_business_account",
		"entry": []any{map[string]any{
			"id": e.account.BusinessID,
			"changes": []any{map[string]any{
				"field": "messages",
				"value": map[string]any{
					"messaging_product": "whatsapp",
					"metadata":          map[string]any{"display_phone_number": "1555", "phone_number_id": e.account.PhoneID},
					"contacts":          []any{map[string]any{"wa_id": e.contact.PhoneNumber, "profile": map[string]any{"name": "Cust"}}},
					"messages":          []any{message},
				},
			}},
		}},
	}
	body, err := json.Marshal(payload)
	require.NoError(t, err)
	req := testutil.NewRequest(t)
	req.RequestCtx.Request.Header.SetMethod("POST")
	req.RequestCtx.Request.Header.SetContentType("application/json")
	req.RequestCtx.Request.SetBody(body)
	require.NoError(t, e.app.WebhookHandler(req))
}

func (e *richWebhookEnv) waitMessage(t *testing.T, wamid string) models.Message {
	t.Helper()
	var m models.Message
	require.Eventually(t, func() bool {
		return e.app.DB.Where("whats_app_message_id = ?", wamid).First(&m).Error == nil
	}, 3*time.Second, 20*time.Millisecond)
	return m
}

func TestPollVote_WebhookRepliesAreCounted(t *testing.T) {
	e := newRichWebhookEnv(t)
	pollID := "pq" + uuid.New().String()[:8]
	poll := models.Message{
		BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: e.org.ID, WhatsAppAccount: e.account.Name,
		ContactID: e.contact.ID, WhatsAppMessageID: "wamid.poll-" + pollID, Direction: models.DirectionOutgoing,
		MessageType: models.MessageTypeInteractive, Content: "Which slot?", Status: models.MessageStatusSent,
		InteractiveData: models.JSONB{
			"type": "poll", "poll_id": pollID, "question": "Which slot?",
			"options": []any{
				map[string]any{"id": "poll:" + pollID + ":0", "title": "Morning"},
				map[string]any{"id": "poll:" + pollID + ":1", "title": "Evening"},
			},
			"votes": map[string]any{}, "total_votes": 0,
		},
	}
	require.NoError(t, e.app.DB.Create(&poll).Error)

	e.deliver(t, map[string]any{
		"id": "wamid.vote1-" + pollID, "type": "interactive",
		"context":     map[string]any{"id": poll.WhatsAppMessageID},
		"interactive": map[string]any{"type": "button_reply", "button_reply": map[string]any{"id": "poll:" + pollID + ":0", "title": "Morning"}},
	})
	readPoll := func() models.JSONB {
		var m models.Message
		require.NoError(t, e.app.DB.First(&m, "id = ?", poll.ID).Error)
		return m.InteractiveData
	}
	require.Eventually(t, func() bool { return readPoll()["total_votes"] == float64(1) }, 3*time.Second, 20*time.Millisecond)
	assert.Equal(t, float64(1), readPoll()["votes"].(map[string]any)["poll:"+pollID+":0"])

	// Changing the answer moves the vote instead of adding one.
	e.deliver(t, map[string]any{
		"id": "wamid.vote2-" + pollID, "type": "interactive",
		"interactive": map[string]any{"type": "list_reply", "list_reply": map[string]any{"id": "poll:" + pollID + ":1", "title": "Evening"}},
	})
	require.Eventually(t, func() bool {
		v := readPoll()["votes"].(map[string]any)
		return v["poll:"+pollID+":1"] == float64(1) && v["poll:"+pollID+":0"] == nil
	}, 3*time.Second, 20*time.Millisecond)
	assert.Equal(t, float64(1), readPoll()["total_votes"])
	assert.Equal(t, "poll:"+pollID+":1", readPoll()["last_vote"])

	var n int64
	e.app.DB.Model(&models.PollVote{}).Where("message_id = ?", poll.ID).Count(&n)
	assert.Equal(t, int64(1), n)

	// Unknown ids are not treated as votes.
	assert.False(t, e.app.recordPollVote(e.org.ID, e.contact.ID, "menu_1", "x"))
	assert.False(t, e.app.recordPollVote(e.org.ID, e.contact.ID, "poll:nope:0", "x"))
}

func TestWebhook_IncomingLocationContactsOrderStored(t *testing.T) {
	e := newRichWebhookEnv(t)
	uid := uuid.New().String()[:8]

	e.deliver(t, map[string]any{
		"id": "wamid.loc-" + uid, "type": "location",
		"location": map[string]any{"latitude": 19.07, "longitude": 72.87, "name": "Gateway", "address": "Mumbai"},
	})
	m := e.waitMessage(t, "wamid.loc-"+uid)
	assert.Equal(t, models.MessageTypeLocation, m.MessageType)
	var loc map[string]any
	require.NoError(t, json.Unmarshal([]byte(m.Content), &loc))
	assert.Equal(t, "Gateway", loc["name"])

	e.deliver(t, map[string]any{
		"id": "wamid.ct-" + uid, "type": "contacts",
		"contacts": []any{map[string]any{
			"name":   map[string]any{"formatted_name": "Meera Iyer"},
			"phones": []any{map[string]any{"phone": "+91 98000 11111", "wa_id": "919800011111"}},
			"emails": []any{map[string]any{"email": "meera@example.com"}},
			"org":    map[string]any{"company": "Acme"},
		}},
	})
	m = e.waitMessage(t, "wamid.ct-"+uid)
	assert.Equal(t, models.MessageTypeContacts, m.MessageType)
	var cards []map[string]any
	require.NoError(t, json.Unmarshal([]byte(m.Content), &cards))
	require.Len(t, cards, 1)
	assert.Equal(t, "Meera Iyer", cards[0]["name"])
	assert.Equal(t, []any{"meera@example.com"}, cards[0]["emails"])
	assert.Equal(t, "Acme", cards[0]["company"])

	e.deliver(t, map[string]any{
		"id": "wamid.ord-" + uid, "type": "order",
		"order": map[string]any{
			"catalog_id": "cat-1", "text": "Please deliver fast",
			"product_items": []any{
				map[string]any{"product_retailer_id": "sku-1", "quantity": 2, "item_price": 250.5, "currency": "INR"},
				map[string]any{"product_retailer_id": "sku-2", "quantity": "1", "item_price": "99", "currency": "INR"},
			},
		},
	})
	m = e.waitMessage(t, "wamid.ord-"+uid)
	assert.Equal(t, models.MessageTypeOrder, m.MessageType)
	var order map[string]any
	require.NoError(t, json.Unmarshal([]byte(m.Content), &order))
	assert.Equal(t, "cat-1", order["catalog_id"])
	assert.Len(t, order["items"], 2)
	assert.InDelta(t, 600.0, order["total"], 0.001)
	assert.Equal(t, "INR", order["currency"])
}
