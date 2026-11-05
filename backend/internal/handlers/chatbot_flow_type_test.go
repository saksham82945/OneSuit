package handlers_test

import (
	"encoding/json"
	"testing"

	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

func replyGraph(config map[string]any) map[string]any {
	return map[string]any{
		"version":    2,
		"entry_node": "__start__",
		"nodes": []any{
			map[string]any{"id": "__start__", "type": "start", "label": "Start", "config": map[string]any{}},
			map[string]any{"id": "r1", "type": "reply", "label": "Welcome", "config": config},
		},
		"edges": []any{map[string]any{"from": "__start__", "to": "r1", "condition": "default"}},
	}
}

func TestApp_ChatbotFlowType_CreateAndValidate(t *testing.T) {
	t.Parallel()

	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	role := testutil.CreateTestRole(t, app.DB, org.ID, "flow-admin", getChatbotFlowPermissions(t, app))
	user := testutil.CreateTestUser(t, app.DB, org.ID,
		testutil.WithEmail(testutil.UniqueEmail("flow-type")),
		testutil.WithRoleID(&role.ID),
	)

	create := func(body map[string]any) (int, string, string) {
		req := testutil.NewJSONRequest(t, body)
		testutil.SetAuthContext(req, org.ID, user.ID)
		require.NoError(t, app.CreateChatbotFlow(req))
		var resp struct {
			Message string `json:"message"`
			Data    struct {
				ID string `json:"id"`
			} `json:"data"`
		}
		_ = json.Unmarshal(testutil.GetResponseBody(req), &resp)
		return testutil.GetResponseStatusCode(req), resp.Data.ID, resp.Message
	}

	t.Run("no type defaults to advanced", func(t *testing.T) {
		status, id, _ := create(map[string]any{"name": "Old style"})
		require.Equal(t, fasthttp.StatusOK, status)
		var flow models.ChatbotFlow
		require.NoError(t, app.DB.First(&flow, "id = ?", id).Error)
		assert.Equal(t, "advanced", flow.FlowType)
	})

	t.Run("media bot with a link in the reply text is rejected", func(t *testing.T) {
		status, _, msg := create(map[string]any{
			"name": "Media", "flow_type": "media",
			"graph": replyGraph(map[string]any{"body": "Visit www.example.com for more"}),
		})
		assert.Equal(t, fasthttp.StatusBadRequest, status)
		assert.Contains(t, msg, "Media bots can't contain links")
	})

	t.Run("simple bot with a media header is rejected", func(t *testing.T) {
		status, _, msg := create(map[string]any{
			"name": "Simple", "flow_type": "simple",
			"graph": replyGraph(map[string]any{
				"body":   "Hi",
				"header": map[string]any{"type": "image", "media_path": "chatbot/x/y.jpg"},
			}),
		})
		assert.Equal(t, fasthttp.StatusBadRequest, status)
		assert.Contains(t, msg, "Simple bots can't send media")
	})

	t.Run("simple bot with buttons is stored with its type", func(t *testing.T) {
		status, id, msg := create(map[string]any{
			"name": "Simple ok", "flow_type": "simple",
			"graph": replyGraph(map[string]any{
				"body": "Hi {first_name}, pick one", "interactive": "buttons",
				"buttons": []any{map[string]any{"id": "a", "title": "Sales"}, map[string]any{"id": "b", "title": "Support"}},
			}),
		})
		require.Equal(t, fasthttp.StatusOK, status, msg)
		var flow models.ChatbotFlow
		require.NoError(t, app.DB.First(&flow, "id = ?", id).Error)
		assert.Equal(t, "simple", flow.FlowType)
	})

	t.Run("unknown type is rejected", func(t *testing.T) {
		status, _, _ := create(map[string]any{"name": "Bad", "flow_type": "fancy"})
		assert.Equal(t, fasthttp.StatusBadRequest, status)
	})

	t.Run("switching an advanced flow with a link to media is rejected", func(t *testing.T) {
		status, id, _ := create(map[string]any{
			"name": "Adv", "flow_type": "advanced",
			"graph": replyGraph(map[string]any{
				"body": "Open the site", "interactive": "cta_url",
				"cta": map[string]any{"display_text": "Open", "url": "https://example.com"},
			}),
		})
		require.Equal(t, fasthttp.StatusOK, status)

		req := testutil.NewJSONRequest(t, map[string]any{"flow_type": "media"})
		testutil.SetAuthContext(req, org.ID, user.ID)
		testutil.SetPathParam(req, "id", id)
		require.NoError(t, app.UpdateChatbotFlow(req))
		assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(req))
	})
}
