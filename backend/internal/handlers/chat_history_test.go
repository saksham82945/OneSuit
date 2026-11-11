package handlers_test

import (
	"encoding/csv"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

type historyFixture struct {
	app             *handlers.App
	org             *models.Organization
	admin           *models.User
	agent           *models.User
	alice           *models.Contact // assigned to agent, tagged VIP
	bob             *models.Contact // unassigned
	otherOrgContact *models.Contact
	base            time.Time
	aliceHi         uuid.UUID
}

func newHistoryFixture(t *testing.T) *historyFixture {
	t.Helper()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	adminRole := testutil.CreateAdminRole(t, app.DB, org.ID)
	admin := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&adminRole.ID))
	// Restricted agent: chat access but no contacts:read, so only assigned chats.
	agentRole := testutil.CreateTestRoleWithKeys(t, app.DB, org.ID, "history-agent", []string{"chat:read", "chat:write"})
	agent := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&agentRole.ID))
	account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)

	alice := testutil.CreateTestContactWith(t, app.DB, org.ID, func(c *models.Contact) {
		c.ProfileName = "Alice Wonder"
		c.AssignedUserID = &agent.ID
		c.Tags = models.JSONBArray{"VIP"}
	})
	bob := testutil.CreateTestContactWith(t, app.DB, org.ID, func(c *models.Contact) {
		c.ProfileName = "Bob Builder"
	})

	otherOrg := testutil.CreateTestOrganization(t, app.DB)
	otherAccount := testutil.CreateTestWhatsAppAccount(t, app.DB, otherOrg.ID)
	otherContact := testutil.CreateTestContactWith(t, app.DB, otherOrg.ID, func(c *models.Contact) {
		c.ProfileName = "Mallory"
	})

	base := time.Date(2026, 3, 10, 9, 0, 0, 0, time.UTC)
	add := func(orgID uuid.UUID, acc string, c *models.Contact, dir models.Direction, content string, at time.Time) uuid.UUID {
		m := &models.Message{
			BaseModel:       models.BaseModel{ID: uuid.New(), CreatedAt: at},
			OrganizationID:  orgID,
			WhatsAppAccount: acc,
			ContactID:       c.ID,
			Direction:       dir,
			MessageType:     models.MessageTypeText,
			Content:         content,
			Status:          models.MessageStatusDelivered,
		}
		if dir == models.DirectionOutgoing {
			m.SentByUserID = &admin.ID
		}
		require.NoError(t, app.DB.Create(m).Error)
		return m.ID
	}
	// Alice: in range on 10 and 11 March, plus one old message on 1 March.
	add(org.ID, account.Name, alice, models.DirectionIncoming, "old refund question", base.AddDate(0, 0, -9))
	hi := add(org.ID, account.Name, alice, models.DirectionIncoming, "Hello, where is my parcel?", base)
	add(org.ID, account.Name, alice, models.DirectionOutgoing, "=SUM(A1) it ships today", base.Add(4*time.Minute))
	add(org.ID, account.Name, alice, models.DirectionIncoming, "thanks!", base.AddDate(0, 0, 1))
	// Bob: one incoming in range mentioning parcel, reply after 10 minutes.
	add(org.ID, account.Name, bob, models.DirectionIncoming, "Parcel damaged", base.Add(2*time.Hour))
	add(org.ID, account.Name, bob, models.DirectionOutgoing, "Sorry about that", base.Add(2*time.Hour+10*time.Minute))
	// Other org, same day, same keyword.
	add(otherOrg.ID, otherAccount.Name, otherContact, models.DirectionIncoming, "parcel secret", base.Add(time.Hour))

	return &historyFixture{app: app, org: org, admin: admin, agent: agent, alice: alice, bob: bob,
		otherOrgContact: otherContact, base: base, aliceHi: hi}
}

func historyGET(t *testing.T, orgID, userID uuid.UUID, params map[string]string) *fastglue.Request {
	t.Helper()
	req := testutil.NewGETRequest(t)
	testutil.SetAuthContext(req, orgID, userID)
	for k, v := range params {
		testutil.SetQueryParam(req, k, v)
	}
	return req
}

func historyRangeParams(extra map[string]string) map[string]string {
	p := map[string]string{"from": "2026-03-10", "to": "2026-03-11"}
	for k, v := range extra {
		p[k] = v
	}
	return p
}

type historyConvResp struct {
	Data struct {
		Conversations []handlers.HistoryConversation `json:"conversations"`
		Total         int64                          `json:"total"`
	} `json:"data"`
}

func listHistoryConversations(t *testing.T, f *historyFixture, userID uuid.UUID, params map[string]string) historyConvResp {
	t.Helper()
	req := historyGET(t, f.org.ID, userID, params)
	require.NoError(t, f.app.ListHistoryConversations(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var resp historyConvResp
	require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &resp))
	return resp
}

func TestHistory_ConversationsRangeFiltering(t *testing.T) {
	f := newHistoryFixture(t)

	resp := listHistoryConversations(t, f, f.admin.ID, historyRangeParams(nil))
	require.Equal(t, int64(2), resp.Data.Total)
	byID := map[uuid.UUID]handlers.HistoryConversation{}
	for _, c := range resp.Data.Conversations {
		byID[c.ContactID] = c
	}
	a := byID[f.alice.ID]
	assert.Equal(t, int64(2), a.IncomingCount, "the 1 March message is outside the range")
	assert.Equal(t, int64(1), a.OutgoingCount)
	assert.Equal(t, "thanks!", a.LastMessagePreview)
	assert.Equal(t, []string{"VIP"}, a.Tags)
	assert.True(t, a.FirstMessageAt.Equal(f.base))
	// Alice's last message (11 March) is newer than Bob's, so she comes first.
	assert.Equal(t, f.alice.ID, resp.Data.Conversations[0].ContactID)

	// Only 10 March: Alice's "thanks!" drops out.
	resp = listHistoryConversations(t, f, f.admin.ID, map[string]string{"from": "2026-03-10", "to": "2026-03-10"})
	for _, c := range resp.Data.Conversations {
		if c.ContactID == f.alice.ID {
			assert.Equal(t, int64(1), c.IncomingCount)
		}
	}

	// RFC3339 window that only covers Bob's messages.
	resp = listHistoryConversations(t, f, f.admin.ID, map[string]string{
		"from": f.base.Add(time.Hour).Format(time.RFC3339), "to": f.base.Add(3 * time.Hour).Format(time.RFC3339)})
	require.Len(t, resp.Data.Conversations, 1)
	assert.Equal(t, f.bob.ID, resp.Data.Conversations[0].ContactID)

	// Filters: tags, direction, search on message text and on name.
	resp = listHistoryConversations(t, f, f.admin.ID, historyRangeParams(map[string]string{"tags": "VIP"}))
	require.Len(t, resp.Data.Conversations, 1)
	assert.Equal(t, f.alice.ID, resp.Data.Conversations[0].ContactID)

	resp = listHistoryConversations(t, f, f.admin.ID, historyRangeParams(map[string]string{"direction": "outgoing"}))
	for _, c := range resp.Data.Conversations {
		assert.Zero(t, c.IncomingCount)
	}

	resp = listHistoryConversations(t, f, f.admin.ID, historyRangeParams(map[string]string{"search": "damaged"}))
	require.Len(t, resp.Data.Conversations, 1)
	assert.Equal(t, f.bob.ID, resp.Data.Conversations[0].ContactID)
	assert.Equal(t, int64(2), resp.Data.Conversations[0].MessageCount, "search picks contacts, counts stay whole")

	resp = listHistoryConversations(t, f, f.admin.ID, historyRangeParams(map[string]string{"search": "alice"}))
	require.Len(t, resp.Data.Conversations, 1)

	// Bad range.
	req := historyGET(t, f.org.ID, f.admin.ID, map[string]string{"from": "2026-03-12", "to": "2026-03-10"})
	require.NoError(t, f.app.ListHistoryConversations(req))
	assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(req))
}

func TestHistory_Stats(t *testing.T) {
	f := newHistoryFixture(t)
	req := historyGET(t, f.org.ID, f.admin.ID, historyRangeParams(nil))
	require.NoError(t, f.app.GetHistoryStats(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	var resp struct {
		Data handlers.HistoryStats `json:"data"`
	}
	require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &resp))
	assert.Equal(t, int64(2), resp.Data.Conversations)
	assert.Equal(t, int64(3), resp.Data.MessagesIn)
	assert.Equal(t, int64(2), resp.Data.MessagesOut)
	require.NotNil(t, resp.Data.MedianFirstResponseSeconds)
	// First responses: 4 min (Alice) and 10 min (Bob) → median 7 min.
	assert.InDelta(t, 420, *resp.Data.MedianFirstResponseSeconds, 1)
}

func TestHistory_MessagesAndJump(t *testing.T) {
	f := newHistoryFixture(t)
	req := historyGET(t, f.org.ID, f.admin.ID, historyRangeParams(map[string]string{"contact_id": f.alice.ID.String()}))
	require.NoError(t, f.app.ListHistoryMessages(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	var resp struct {
		Data struct {
			Messages []struct {
				ID         uuid.UUID         `json:"id"`
				Content    map[string]string `json:"content"`
				SenderName string            `json:"sender_name"`
			} `json:"messages"`
			Total int64 `json:"total"`
			Page  int   `json:"page"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &resp))
	require.Equal(t, int64(3), resp.Data.Total)
	assert.Equal(t, "Hello, where is my parcel?", resp.Data.Messages[0].Content["body"], "oldest first")
	assert.Equal(t, "thanks!", resp.Data.Messages[2].Content["body"])
	assert.NotEmpty(t, resp.Data.Messages[1].SenderName)

	// around= returns the page that holds the message.
	req = historyGET(t, f.org.ID, f.admin.ID, historyRangeParams(map[string]string{
		"contact_id": f.alice.ID.String(), "limit": "1", "around": f.aliceHi.String()}))
	require.NoError(t, f.app.ListHistoryMessages(req))
	require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &resp))
	assert.Equal(t, 1, resp.Data.Page)
	require.Len(t, resp.Data.Messages, 1)
	assert.Equal(t, f.aliceHi, resp.Data.Messages[0].ID)
}

func TestHistory_Search(t *testing.T) {
	f := newHistoryFixture(t)
	req := historyGET(t, f.org.ID, f.admin.ID, historyRangeParams(map[string]string{"q": "parcel"}))
	require.NoError(t, f.app.SearchHistory(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	var resp struct {
		Data struct {
			Results []handlers.HistorySearchHit `json:"results"`
			Total   int64                       `json:"total"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &resp))
	require.Equal(t, int64(2), resp.Data.Total, "case-insensitive, other org excluded")
	assert.Equal(t, f.bob.ID, resp.Data.Results[0].ContactID, "newest first")
	assert.Equal(t, "Bob Builder", resp.Data.Results[0].ContactName)
	assert.Contains(t, resp.Data.Results[1].Snippet, "parcel")

	// LIKE wildcards are literal.
	req = historyGET(t, f.org.ID, f.admin.ID, historyRangeParams(map[string]string{"q": "%%"}))
	require.NoError(t, f.app.SearchHistory(req))
	require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &resp))
	assert.Zero(t, resp.Data.Total)

	// Too short.
	req = historyGET(t, f.org.ID, f.admin.ID, map[string]string{"q": "p"})
	require.NoError(t, f.app.SearchHistory(req))
	assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(req))
}

func TestHistory_Export(t *testing.T) {
	f := newHistoryFixture(t)
	req := historyGET(t, f.org.ID, f.admin.ID, historyRangeParams(map[string]string{"contact_id": f.alice.ID.String(), "format": "csv"}))
	require.NoError(t, f.app.ExportHistoryTranscript(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	assert.Contains(t, string(req.RequestCtx.Response.Header.Peek("Content-Disposition")), ".csv")
	body := strings.TrimPrefix(string(testutil.GetResponseBody(req)), "\xEF\xBB\xBF")
	rows, err := csv.NewReader(strings.NewReader(body)).ReadAll()
	require.NoError(t, err)
	require.Len(t, rows, 4, "header + 3 messages in range")
	assert.Equal(t, []string{"time", "direction", "sender", "type", "text", "media_filename", "status"}, rows[0])
	assert.Equal(t, "incoming", rows[1][1])
	assert.Equal(t, "Alice Wonder", rows[1][2])
	assert.Equal(t, "Hello, where is my parcel?", rows[1][4])
	assert.Equal(t, "'=SUM(A1) it ships today", rows[2][4], "formula cells are neutralised")
	assert.Equal(t, "delivered", rows[3][6])

	req = historyGET(t, f.org.ID, f.admin.ID, historyRangeParams(map[string]string{"contact_id": f.alice.ID.String(), "format": "txt"}))
	require.NoError(t, f.app.ExportHistoryTranscript(req))
	txt := string(testutil.GetResponseBody(req))
	assert.Contains(t, txt, "Alice Wonder: Hello, where is my parcel?")
	assert.Contains(t, txt, "--- Wednesday, 11 March 2026 ---")
	assert.NotContains(t, txt, "old refund question")

	req = historyGET(t, f.org.ID, f.admin.ID, historyRangeParams(map[string]string{"contact_id": f.alice.ID.String(), "format": "pdf"}))
	require.NoError(t, f.app.ExportHistoryTranscript(req))
	assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(req))
}

func TestHistory_OrgIsolation(t *testing.T) {
	f := newHistoryFixture(t)
	resp := listHistoryConversations(t, f, f.admin.ID, historyRangeParams(nil))
	for _, c := range resp.Data.Conversations {
		assert.NotEqual(t, f.otherOrgContact.ID, c.ContactID)
	}
	for _, call := range []func(*fastglue.Request) error{f.app.ListHistoryMessages, f.app.ExportHistoryTranscript} {
		req := historyGET(t, f.org.ID, f.admin.ID, historyRangeParams(map[string]string{"contact_id": f.otherOrgContact.ID.String()}))
		require.NoError(t, call(req))
		assert.Equal(t, fasthttp.StatusNotFound, testutil.GetResponseStatusCode(req))
	}
}

func TestHistory_AgentAccessRestriction(t *testing.T) {
	f := newHistoryFixture(t)

	resp := listHistoryConversations(t, f, f.agent.ID, historyRangeParams(nil))
	require.Len(t, resp.Data.Conversations, 1)
	assert.Equal(t, f.alice.ID, resp.Data.Conversations[0].ContactID)

	req := historyGET(t, f.org.ID, f.agent.ID, historyRangeParams(map[string]string{"q": "parcel"}))
	require.NoError(t, f.app.SearchHistory(req))
	var sresp struct {
		Data struct {
			Results []handlers.HistorySearchHit `json:"results"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &sresp))
	require.Len(t, sresp.Data.Results, 1)
	assert.Equal(t, f.alice.ID, sresp.Data.Results[0].ContactID)

	for _, call := range []func(*fastglue.Request) error{f.app.ListHistoryMessages, f.app.ExportHistoryTranscript} {
		req := historyGET(t, f.org.ID, f.agent.ID, historyRangeParams(map[string]string{"contact_id": f.bob.ID.String()}))
		require.NoError(t, call(req))
		assert.Equal(t, fasthttp.StatusNotFound, testutil.GetResponseStatusCode(req))
	}

	// A user without chat:read is refused outright.
	noRole := testutil.CreateTestRoleWithKeys(t, f.app.DB, f.org.ID, "no-chat", []string{"templates:read"})
	outsider := testutil.CreateTestUser(t, f.app.DB, f.org.ID, testutil.WithRoleID(&noRole.ID))
	req = historyGET(t, f.org.ID, outsider.ID, historyRangeParams(nil))
	require.NoError(t, f.app.ListHistoryConversations(req))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(req))
}
