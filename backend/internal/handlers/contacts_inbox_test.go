package handlers_test

import (
	"encoding/json"
	"sort"
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

// TestApp_ListContacts_InboxFilters covers the Live Chat filters on
// GET /api/contacts: assigned, has_messages, unread, window, tags and the
// include_counts tab totals.
func TestApp_ListContacts_InboxFilters(t *testing.T) {
	t.Parallel()

	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	adminRole := testutil.CreateAdminRole(t, app.DB, org.ID)
	me := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&adminRole.ID))
	other := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&adminRole.ID))
	account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)

	now := time.Now()
	recent := now.Add(-1 * time.Hour)
	old := now.Add(-48 * time.Hour)
	set := func(assignee *uuid.UUID, lastMsg, lastInbound *time.Time, tags ...any) testutil.ContactOption {
		return func(c *models.Contact) {
			c.AssignedUserID = assignee
			c.LastMessageAt = lastMsg
			c.LastInboundAt = lastInbound
			c.Tags = models.JSONBArray(tags)
		}
	}

	// mine: assigned to me, chatted within 24h, tagged Hot, has an unread message.
	mine := testutil.CreateTestContactWith(t, app.DB, org.ID, set(&me.ID, &recent, &recent, "Hot"))
	// theirs: assigned to someone else, window expired, tagged Lost.
	theirs := testutil.CreateTestContactWith(t, app.DB, org.ID, set(&other.ID, &old, &old, "Lost"))
	// open: unassigned conversation, tagged Hot and Junk.
	open := testutil.CreateTestContactWith(t, app.DB, org.ID, set(nil, &old, &old, "Hot", "Junk"))
	// fresh: unassigned contact with no conversation yet.
	fresh := testutil.CreateTestContactWith(t, app.DB, org.ID, set(nil, nil, nil))

	require.NoError(t, app.DB.Create(&models.Message{
		BaseModel:       models.BaseModel{ID: uuid.New()},
		OrganizationID:  org.ID,
		WhatsAppAccount: account.Name,
		ContactID:       mine.ID,
		Direction:       models.DirectionIncoming,
		MessageType:     models.MessageTypeText,
		Content:         "hello",
		Status:          models.MessageStatusDelivered,
	}).Error)

	type listResp struct {
		Data struct {
			Contacts []handlers.ContactResponse `json:"contacts"`
			Total    int64                      `json:"total"`
			Counts   map[string]int64           `json:"counts"`
		} `json:"data"`
	}
	list := func(t *testing.T, params map[string]string) (listResp, int) {
		t.Helper()
		req := testutil.NewGETRequest(t)
		testutil.SetAuthContext(req, org.ID, me.ID)
		for k, v := range params {
			testutil.SetQueryParam(req, k, v)
		}
		require.NoError(t, app.ListContacts(req))
		var resp listResp
		status := testutil.GetResponseStatusCode(req)
		if status == fasthttp.StatusOK {
			require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &resp))
		}
		return resp, status
	}
	ids := func(resp listResp) []uuid.UUID {
		out := make([]uuid.UUID, 0, len(resp.Data.Contacts))
		for _, c := range resp.Data.Contacts {
			out = append(out, c.ID)
		}
		sort.Slice(out, func(i, j int) bool { return out[i].String() < out[j].String() })
		return out
	}
	want := func(cs ...*models.Contact) []uuid.UUID {
		out := make([]uuid.UUID, 0, len(cs))
		for _, c := range cs {
			out = append(out, c.ID)
		}
		sort.Slice(out, func(i, j int) bool { return out[i].String() < out[j].String() })
		return out
	}

	cases := []struct {
		name   string
		params map[string]string
		want   []uuid.UUID
	}{
		{"no filters", nil, want(mine, theirs, open, fresh)},
		{"assigned=me", map[string]string{"assigned": "me"}, want(mine)},
		{"assigned=unassigned", map[string]string{"assigned": "unassigned"}, want(open, fresh)},
		{"assigned=others", map[string]string{"assigned": "others"}, want(theirs)},
		{"assigned=<user id>", map[string]string{"assigned": other.ID.String()}, want(theirs)},
		{"has_messages", map[string]string{"has_messages": "true"}, want(mine, theirs, open)},
		{"unread", map[string]string{"unread": "true"}, want(mine)},
		{"window=open", map[string]string{"window": "open"}, want(mine)},
		{"window=expired", map[string]string{"window": "expired"}, want(theirs, open, fresh)},
		{"tags with unassigned", map[string]string{"tags": "Hot", "assigned": "unassigned"}, want(open)},
		{"tags any of", map[string]string{"tags": "Junk,Lost"}, want(theirs, open)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp, status := list(t, tc.params)
			require.Equal(t, fasthttp.StatusOK, status)
			assert.Equal(t, tc.want, ids(resp))
			assert.Equal(t, int64(len(tc.want)), resp.Data.Total)
			assert.Nil(t, resp.Data.Counts, "counts are only sent when asked for")
		})
	}

	t.Run("include_counts reports every tab under the other filters", func(t *testing.T) {
		resp, status := list(t, map[string]string{"include_counts": "true", "has_messages": "true", "assigned": "me"})
		require.Equal(t, fasthttp.StatusOK, status)
		assert.Equal(t, want(mine), ids(resp))
		assert.Equal(t, map[string]int64{"all": 3, "mine": 1, "unassigned": 1, "others": 1, "unread": 1}, resp.Data.Counts)
	})

	t.Run("include_counts follows the tag filter", func(t *testing.T) {
		resp, status := list(t, map[string]string{"include_counts": "true", "tags": "Hot"})
		require.Equal(t, fasthttp.StatusOK, status)
		assert.Equal(t, map[string]int64{"all": 2, "mine": 1, "unassigned": 1, "others": 0, "unread": 1}, resp.Data.Counts)
	})

	t.Run("invalid assigned value is rejected", func(t *testing.T) {
		_, status := list(t, map[string]string{"assigned": "someone"})
		assert.Equal(t, fasthttp.StatusBadRequest, status)
	})
}
