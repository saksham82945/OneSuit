package handlers_test

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

// botTransferUser creates an org member allowed to read and write flows and keyword bots.
func botTransferUser(t *testing.T, app *handlers.App) (orgID, userID uuid.UUID) {
	t.Helper()
	org := testutil.CreateTestOrganization(t, app.DB)
	var perms []models.Permission
	for _, p := range testutil.GetOrCreateTestPermissions(t, app.DB) {
		if p.Resource == models.ResourceFlowsChatbot || p.Resource == models.ResourceChatbotKeywords {
			perms = append(perms, p)
		}
	}
	role := testutil.CreateTestRole(t, app.DB, org.ID, "bot-admin", perms)
	user := testutil.CreateTestUser(t, app.DB, org.ID,
		testutil.WithEmail(testutil.UniqueEmail("bot-transfer")),
		testutil.WithRoleID(&role.ID),
	)
	return org.ID, user.ID
}

func simpleBotGraph(body string) map[string]any {
	return map[string]any{
		"version":    2,
		"entry_node": "__start__",
		"nodes": []any{
			map[string]any{"id": "__start__", "type": "start", "label": "Inbound Message", "config": map[string]any{}},
			map[string]any{"id": "welcome", "type": "reply", "label": "Welcome", "config": map[string]any{
				"body": body, "interactive": "buttons",
				"buttons": []any{map[string]any{"id": "a", "title": "Prices"}, map[string]any{"id": "b", "title": "Hours"}},
			}},
		},
		"edges": []any{map[string]any{"from": "__start__", "to": "welcome", "condition": "default"}},
	}
}

func runExport(t *testing.T, app *handlers.App, orgID, userID uuid.UUID, query map[string]string) []byte {
	t.Helper()
	req := testutil.NewGETRequest(t)
	testutil.SetAuthContext(req, orgID, userID)
	for k, v := range query {
		testutil.SetQueryParam(req, k, v)
	}
	require.NoError(t, app.ExportBots(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	return append([]byte(nil), testutil.GetResponseBody(req)...)
}

func runImport(t *testing.T, app *handlers.App, orgID, userID uuid.UUID, body []byte, preview bool) (int, handlers.BotImportReport) {
	t.Helper()
	req := testutil.NewJSONRequest(t, nil)
	req.RequestCtx.Request.SetBody(body)
	testutil.SetAuthContext(req, orgID, userID)
	if preview {
		testutil.SetQueryParam(req, "mode", "preview")
	}
	require.NoError(t, app.ImportBots(req))
	var resp struct {
		Data handlers.BotImportReport `json:"data"`
	}
	require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &resp), string(testutil.GetResponseBody(req)))
	return testutil.GetResponseStatusCode(req), resp.Data
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	return b
}

func countFlows(t *testing.T, app *handlers.App, orgID uuid.UUID) int64 {
	var n int64
	require.NoError(t, app.DB.Model(&models.ChatbotFlow{}).Where("organization_id = ?", orgID).Count(&n).Error)
	return n
}

func countRules(t *testing.T, app *handlers.App, orgID uuid.UUID) int64 {
	var n int64
	require.NoError(t, app.DB.Model(&models.KeywordRule{}).Where("organization_id = ?", orgID).Count(&n).Error)
	return n
}

func TestApp_BotTransfer_ExportImportRoundTrip(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	srcOrg, srcUser := botTransferUser(t, app)

	flow := &models.ChatbotFlow{
		BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: srcOrg, Name: "Sales bot",
		Description: "Answers sales questions", TriggerKeywords: models.StringArray{"sales"},
		FlowType: "simple", IsEnabled: true, Graph: models.JSONB(simpleBotGraph("Hi! What do you need?")),
	}
	require.NoError(t, app.DB.Create(flow).Error)
	rule := &models.KeywordRule{
		BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: srcOrg, Name: "Start sales",
		Keywords: models.StringArray{"buy"}, MatchType: models.MatchTypeExact, ResponseType: models.ResponseTypeFlow,
		ResponseContent: models.JSONB{"flow_id": flow.ID.String(), "flow_name": flow.Name}, Priority: 7, IsEnabled: true,
	}
	require.NoError(t, app.DB.Create(rule).Error)
	createTestKeywordRule(t, app, srcOrg, "Price", []string{"price"})

	body := runExport(t, app, srcOrg, srcUser, nil)
	var file handlers.BotFile
	require.NoError(t, json.Unmarshal(body, &file))
	assert.Equal(t, 1, file.Format)
	require.Len(t, file.Flows, 1)
	require.Len(t, file.KeywordBots, 2)
	var flowBot *handlers.BotFileKeyword
	for i := range file.KeywordBots {
		if file.KeywordBots[i].ResponseType == "flow" {
			flowBot = &file.KeywordBots[i]
		}
	}
	require.NotNil(t, flowBot)
	assert.Equal(t, "Sales bot", flowBot.FlowRef)
	assert.NotContains(t, flowBot.ResponseContent, "flow_id", "files reference flows by name, not id")

	// Import into another workspace.
	dstOrg, dstUser := botTransferUser(t, app)
	status, rep := runImport(t, app, dstOrg, dstUser, body, false)
	require.Equal(t, fasthttp.StatusOK, status, "%+v", rep)
	assert.True(t, rep.Imported)
	assert.Equal(t, 1, rep.Created["flows"])
	assert.Equal(t, 2, rep.Created["keyword_bots"])

	var imported models.ChatbotFlow
	require.NoError(t, app.DB.Where("organization_id = ? AND name = ?", dstOrg, "Sales bot").First(&imported).Error)
	assert.Equal(t, "simple", imported.FlowType)
	assert.Equal(t, models.StringArray{"sales"}, imported.TriggerKeywords)
	assert.Len(t, imported.Graph["nodes"], 2)

	var importedRule models.KeywordRule
	require.NoError(t, app.DB.Where("organization_id = ? AND name = ?", dstOrg, "Start sales").First(&importedRule).Error)
	assert.Equal(t, imported.ID.String(), importedRule.ResponseContent["flow_id"], "flow_ref resolves to the imported flow")
	assert.Equal(t, models.MatchTypeExact, importedRule.MatchType)
	assert.Equal(t, 7, importedRule.Priority)
}

func TestApp_BotTransfer_ImportNameClashRenames(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	orgID, userID := botTransferUser(t, app)
	createTestChatbotFlow(t, app, orgID, "Welcome")
	createTestKeywordRule(t, app, orgID, "Hello", []string{"hello"})

	file := map[string]any{
		"onesuit_bot_format": 1,
		"flows": []any{
			map[string]any{"name": "Welcome", "flow_type": "simple", "graph": simpleBotGraph("Hi")},
			map[string]any{"name": "Welcome", "flow_type": "simple", "graph": simpleBotGraph("Hi again")},
		},
		"keyword_bots": []any{
			map[string]any{"name": "Hello", "keywords": []string{"hey"}, "response_type": "text", "response_content": map[string]any{"body": "Hey there"}},
		},
	}
	status, rep := runImport(t, app, orgID, userID, mustJSON(t, file), false)
	require.Equal(t, fasthttp.StatusOK, status, "%+v", rep)
	assert.Equal(t, "Welcome (2)", rep.Flows[0].FinalName)
	assert.Equal(t, "rename", rep.Flows[0].Action)
	assert.Equal(t, "Welcome (3)", rep.Flows[1].FinalName)
	assert.Equal(t, "Hello (2)", rep.KeywordBots[0].FinalName)

	var original models.ChatbotFlow
	require.NoError(t, app.DB.Where("organization_id = ? AND name = ?", orgID, "Welcome").First(&original).Error)
	assert.Equal(t, "Test flow", original.Description, "existing bots are never overwritten")
	assert.Equal(t, int64(3), countFlows(t, app, orgID))
	assert.Equal(t, int64(2), countRules(t, app, orgID))
}

func TestApp_BotTransfer_FlowRefResolution(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	orgID, userID := botTransferUser(t, app)
	existing := createTestChatbotFlow(t, app, orgID, "Support")

	file := map[string]any{
		"onesuit_bot_format": 1,
		"flows": []any{
			map[string]any{"name": "Orders", "flow_type": "simple", "graph": simpleBotGraph("Your order?")},
		},
		"keyword_bots": []any{
			map[string]any{"name": "Orders kw", "keywords": []string{"order"}, "response_type": "flow", "flow_ref": "orders"},
			map[string]any{"name": "Support kw", "keywords": []string{"help"}, "response_type": "flow", "flow_ref": "Support"},
			map[string]any{"name": "Missing kw", "keywords": []string{"x"}, "response_type": "flow", "flow_ref": "Nope"},
		},
	}
	status, rep := runImport(t, app, orgID, userID, mustJSON(t, file), true)
	require.Equal(t, fasthttp.StatusOK, status)
	assert.False(t, rep.Valid)
	assert.Equal(t, "file", rep.KeywordBots[0].FlowResolved)
	assert.Equal(t, "existing", rep.KeywordBots[1].FlowResolved)
	require.NotEmpty(t, rep.KeywordBots[2].Errors)
	assert.Contains(t, rep.KeywordBots[2].Errors[0], "Nope")

	// Without the broken one it imports, and refs point at the right flows.
	file["keyword_bots"] = file["keyword_bots"].([]any)[:2]
	status, rep = runImport(t, app, orgID, userID, mustJSON(t, file), false)
	require.Equal(t, fasthttp.StatusOK, status, "%+v", rep)
	var orders models.ChatbotFlow
	require.NoError(t, app.DB.Where("organization_id = ? AND name = ?", orgID, "Orders").First(&orders).Error)
	var kw1, kw2 models.KeywordRule
	require.NoError(t, app.DB.Where("organization_id = ? AND name = ?", orgID, "Orders kw").First(&kw1).Error)
	require.NoError(t, app.DB.Where("organization_id = ? AND name = ?", orgID, "Support kw").First(&kw2).Error)
	assert.Equal(t, orders.ID.String(), kw1.ResponseContent["flow_id"])
	assert.Equal(t, existing.ID.String(), kw2.ResponseContent["flow_id"])
}

func TestApp_BotTransfer_InvalidFileErrors(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	orgID, userID := botTransferUser(t, app)

	t.Run("not JSON", func(t *testing.T) {
		status, rep := runImport(t, app, orgID, userID, []byte("{not json"), false)
		assert.Equal(t, fasthttp.StatusBadRequest, status)
		require.NotEmpty(t, rep.Errors)
		assert.Contains(t, rep.Errors[0], "valid JSON")
	})
	t.Run("not a bot file", func(t *testing.T) {
		status, rep := runImport(t, app, orgID, userID, []byte(`{"hello":"world"}`), false)
		assert.Equal(t, fasthttp.StatusBadRequest, status)
		assert.Contains(t, rep.Errors[0], "OneSuit bot file")
	})
	t.Run("newer format", func(t *testing.T) {
		status, rep := runImport(t, app, orgID, userID, []byte(`{"onesuit_bot_format":9,"flows":[]}`), false)
		assert.Equal(t, fasthttp.StatusBadRequest, status)
		assert.Contains(t, rep.Errors[0], "newer")
	})
	t.Run("per-item errors and nothing saved", func(t *testing.T) {
		file := map[string]any{
			"onesuit_bot_format": 1,
			"flows": []any{
				map[string]any{"name": "Good", "flow_type": "simple", "graph": simpleBotGraph("Hi")},
				map[string]any{"name": "Linky", "flow_type": "simple", "graph": simpleBotGraph("Visit example.com")},
				map[string]any{"name": "Weird", "flow_type": "fancy"},
				map[string]any{"name": "Broken graph", "graph": map[string]any{"version": 2, "entry_node": "nope", "nodes": []any{}}},
			},
			"keyword_bots": []any{
				map[string]any{"name": "No keywords", "keywords": []string{}, "response_type": "text", "response_content": map[string]any{"body": "x"}},
				map[string]any{"name": "Bad regex", "keywords": []string{"("}, "match_type": "regex", "response_type": "text", "response_content": map[string]any{"body": "x"}},
				map[string]any{"name": "No body", "keywords": []string{"a"}, "response_type": "text"},
				map[string]any{"name": "Bad type", "keywords": []string{"a"}, "response_type": "script"},
				map[string]any{"name": "Wrong shape", "keywords": "a"},
			},
		}
		status, rep := runImport(t, app, orgID, userID, mustJSON(t, file), false)
		assert.Equal(t, fasthttp.StatusBadRequest, status)
		assert.False(t, rep.Imported)
		assert.Empty(t, rep.Flows[0].Errors)
		for i := 1; i < 4; i++ {
			assert.NotEmpty(t, rep.Flows[i].Errors, "flow %d", i)
		}
		assert.Contains(t, rep.Flows[1].Errors[0], "links")
		for i, k := range rep.KeywordBots {
			assert.NotEmpty(t, k.Errors, "keyword bot %d", i)
		}
		assert.Contains(t, rep.KeywordBots[4].Errors[0], "keywords")
		assert.Equal(t, int64(0), countFlows(t, app, orgID))
		assert.Equal(t, int64(0), countRules(t, app, orgID))
	})
}

func TestApp_BotTransfer_PreviewSavesNothing(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	orgID, userID := botTransferUser(t, app)
	file := map[string]any{
		"onesuit_bot_format": 1,
		"flows": []any{map[string]any{"name": "Preview me", "flow_type": "media", "graph": map[string]any{
			"version": 2, "entry_node": "__start__",
			"nodes": []any{
				map[string]any{"id": "__start__", "type": "start", "config": map[string]any{}},
				map[string]any{"id": "pic", "type": "reply", "label": "Menu photo", "config": map[string]any{
					"body": "Our menu", "header": map[string]any{"type": "image", "media_path": "chatbot/" + uuid.NewString() + "/menu.jpg"},
				}},
			},
			"edges": []any{map[string]any{"from": "__start__", "to": "pic", "condition": "default"}},
		}}},
		"keyword_bots": []any{map[string]any{"keywords": []string{"hi"}, "response_type": "text", "response_content": map[string]any{"body": "Hello!"}}},
	}
	status, rep := runImport(t, app, orgID, userID, mustJSON(t, file), true)
	require.Equal(t, fasthttp.StatusOK, status)
	assert.True(t, rep.Preview)
	assert.True(t, rep.Valid)
	assert.False(t, rep.Imported)
	assert.Equal(t, "hi", rep.KeywordBots[0].FinalName, "a nameless keyword bot is named after its first keyword")
	require.NotEmpty(t, rep.Flows[0].Warnings)
	assert.Contains(t, rep.Flows[0].Warnings[0], `Re-upload media for step "Menu photo"`)
	assert.Equal(t, int64(0), countFlows(t, app, orgID))
	assert.Equal(t, int64(0), countRules(t, app, orgID))
}

func TestApp_BotTransfer_LegacySingleFlowFile(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	orgID, userID := botTransferUser(t, app)
	legacy := map[string]any{
		"$schema": "https://whatomate.com/schemas/flow-v1.json", "version": 1,
		"name": "Old export", "description": "from the old button", "trigger_keywords": []string{"old"},
		"flow_type": "simple", "graph": simpleBotGraph("Hello"), "exported_at": "2026-01-01T00:00:00Z",
	}
	status, rep := runImport(t, app, orgID, userID, mustJSON(t, legacy), false)
	require.Equal(t, fasthttp.StatusOK, status, "%+v", rep)
	assert.True(t, rep.LegacyFile)
	var f models.ChatbotFlow
	require.NoError(t, app.DB.Where("organization_id = ? AND name = ?", orgID, "Old export").First(&f).Error)
	assert.True(t, f.IsEnabled)
}

func TestApp_BotTransfer_OrgIsolation(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	orgA, userA := botTransferUser(t, app)
	orgB, userB := botTransferUser(t, app)
	flowB := createTestChatbotFlow(t, app, orgB, "B secret flow")
	createTestKeywordRule(t, app, orgB, "B secret rule", []string{"b"})
	createTestChatbotFlow(t, app, orgA, "A flow")

	// A asking for B's flow by id gets nothing of B's.
	body := runExport(t, app, orgA, userA, map[string]string{"flows": flowB.ID.String()})
	var file handlers.BotFile
	require.NoError(t, json.Unmarshal(body, &file))
	assert.Empty(t, file.Flows)

	body = runExport(t, app, orgA, userA, nil)
	require.NoError(t, json.Unmarshal(body, &file))
	require.Len(t, file.Flows, 1)
	assert.Equal(t, "A flow", file.Flows[0].Name)
	assert.Empty(t, file.KeywordBots)

	// A keyword bot in A can't be pointed at B's flow by id.
	bad := map[string]any{"onesuit_bot_format": 1, "keyword_bots": []any{map[string]any{
		"keywords": []string{"go"}, "response_type": "flow", "response_content": map[string]any{"flow_id": flowB.ID.String()},
	}}}
	status, rep := runImport(t, app, orgA, userA, mustJSON(t, bad), true)
	require.Equal(t, fasthttp.StatusOK, status)
	assert.False(t, rep.Valid)

	// Importing into A leaves B untouched and doesn't rename against B's names.
	status, rep = runImport(t, app, orgA, userA, mustJSON(t, map[string]any{"onesuit_bot_format": 1,
		"flows": []any{map[string]any{"name": "B secret flow", "flow_type": "simple", "graph": simpleBotGraph("x")}}}), false)
	require.Equal(t, fasthttp.StatusOK, status, "%+v", rep)
	assert.Equal(t, "B secret flow", rep.Flows[0].FinalName)
	assert.Equal(t, int64(1), countFlows(t, app, orgB))
	_ = userB
}

func TestApp_BotTransfer_ImportNeedsPermission(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithEmail(testutil.UniqueEmail("no-perm")))
	req := testutil.NewJSONRequest(t, map[string]any{"onesuit_bot_format": 1,
		"flows": []any{map[string]any{"name": "x", "graph": simpleBotGraph("x")}}})
	testutil.SetAuthContext(req, org.ID, user.ID)
	require.NoError(t, app.ImportBots(req))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(req))
	assert.Equal(t, int64(0), countFlows(t, app, org.ID))
}
