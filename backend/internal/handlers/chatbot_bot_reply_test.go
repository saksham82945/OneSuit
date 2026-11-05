package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/config"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/pkg/whatsapp"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChatbotFindLink(t *testing.T) {
	t.Parallel()
	links := []string{
		"see https://example.com/x", "http://a.b", "go to www.shop.test", "visit onesuit.in today",
		"chat wa.me/919999999999", "bit.ly/abc", "mail me at sales@example.com",
	}
	for _, s := range links {
		assert.NotEmpty(t, findLink(s), s)
	}
	clean := []string{"Hello {first_name}!", "Price is 3.50 today", "e.g. our menu", "Opening hours: 9.30 - 18.00", "Version 2.0"}
	for _, s := range clean {
		assert.Empty(t, findLink(s), s)
	}
}

func chatbotReplyNode(cfg map[string]any) map[string]any {
	return map[string]any{"nodes": []any{map[string]any{"id": "r", "type": "reply", "label": "Menu", "config": cfg}}}
}

func TestValidateChatbotFlowGraph_FlowTypes(t *testing.T) {
	t.Parallel()

	ctaReply := map[string]any{
		"body": "See our site", "interactive": "cta_url",
		"cta": map[string]any{"display_text": "Open", "url": "https://example.com"},
	}
	mediaReply := map[string]any{"body": "Our menu", "header": map[string]any{"type": "document", "media_path": "chatbot/o/f.pdf"}}
	webhook := map[string]any{"nodes": []any{map[string]any{"id": "w", "type": "webhook", "config": map[string]any{"url": "https://x.com"}}}}

	cases := []struct {
		name     string
		flowType string
		graph    map[string]any
		wantErr  string
	}{
		{"advanced allows cta url", "advanced", chatbotReplyNode(ctaReply), ""},
		{"advanced allows webhook", "advanced", webhook, ""},
		{"advanced allows links in text", "advanced", chatbotReplyNode(map[string]any{"body": "https://x.com"}), ""},
		{"media blocks cta url", "media", chatbotReplyNode(ctaReply), "can't have a CTA URL button"},
		{"simple blocks cta url", "simple", chatbotReplyNode(ctaReply), "can't have a CTA URL button"},
		{"media blocks webhook", "media", webhook, "can't use webhook steps"},
		{"simple blocks transfer", "simple", map[string]any{"nodes": []any{map[string]any{"id": "t", "type": "transfer"}}}, "can't use transfer steps"},
		{"media allows media", "media", chatbotReplyNode(mediaReply), ""},
		{"simple blocks media", "simple", chatbotReplyNode(mediaReply), "Simple bots can't send media"},
		{"media blocks link in button", "media", chatbotReplyNode(map[string]any{
			"body": "Pick", "interactive": "buttons",
			"buttons": []any{map[string]any{"id": "a", "title": "shop.com"}},
		}), "Media bots can't contain links"},
		{"simple blocks link in list row", "simple", chatbotReplyNode(map[string]any{
			"body": "Pick", "interactive": "list",
			"list": map[string]any{"button_text": "Menu", "sections": []any{map[string]any{"rows": []any{
				map[string]any{"id": "1", "title": "Info", "description": "see www.x.org"},
			}}}},
		}), "Simple bots can't contain links"},
		{"media blocks url button on legacy buttons step", "media", map[string]any{"nodes": []any{map[string]any{
			"id": "b", "type": "buttons", "config": map[string]any{"body": "x", "buttons": []any{map[string]any{"id": "u", "title": "Site", "type": "url"}}},
		}}}, "only support reply buttons"},
		{"four reply buttons", "advanced", chatbotReplyNode(map[string]any{
			"body": "Pick", "interactive": "buttons",
			"buttons": []any{
				map[string]any{"id": "1", "title": "A"}, map[string]any{"id": "2", "title": "B"},
				map[string]any{"id": "3", "title": "C"}, map[string]any{"id": "4", "title": "D"},
			},
		}), "1 to 3 reply buttons"},
		{"button title over 20", "advanced", chatbotReplyNode(map[string]any{
			"body": "Pick", "interactive": "buttons",
			"buttons": []any{map[string]any{"id": "1", "title": strings.Repeat("x", 21)}},
		}), "longer than 20"},
		{"eleven list rows", "advanced", chatbotReplyNode(map[string]any{
			"body": "Pick", "interactive": "list",
			"list": map[string]any{"button_text": "Menu", "sections": []any{map[string]any{"rows": func() []any {
				rows := []any{}
				for i := range 11 {
					rows = append(rows, map[string]any{"id": string(rune('a' + i)), "title": string(rune('a' + i))})
				}
				return rows
			}()}}},
		}), "1 to 10 rows"},
		{"row description over 72", "advanced", chatbotReplyNode(map[string]any{
			"body": "Pick", "interactive": "list",
			"list": map[string]any{"button_text": "Menu", "sections": []any{map[string]any{"rows": []any{
				map[string]any{"id": "1", "title": "A", "description": strings.Repeat("d", 73)},
			}}}},
		}), "longer than 72"},
		{"body over 1024 with buttons", "advanced", chatbotReplyNode(map[string]any{
			"body": strings.Repeat("b", 1025), "interactive": "buttons",
			"buttons": []any{map[string]any{"id": "1", "title": "A"}},
		}), "WhatsApp allows 1024"},
		{"list with image header", "advanced", chatbotReplyNode(map[string]any{
			"body": "Pick", "interactive": "list", "header": map[string]any{"type": "image", "media_path": "chatbot/o/a.jpg"},
			"list": map[string]any{"button_text": "Menu", "sections": []any{map[string]any{"rows": []any{map[string]any{"id": "1", "title": "A"}}}}},
		}), "only have a text header"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateChatbotFlowGraph(tc.flowType, tc.graph)
			if tc.wantErr == "" {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.Contains(t, err.Error(), tc.wantErr)
		})
	}
}

// captureWhatsApp points app.WhatsApp at a server that records each
// message payload (and answers media uploads with a media id).
func captureWhatsApp(t *testing.T, app *App) func() []map[string]any {
	t.Helper()
	var mu sync.Mutex
	var sent []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/media") {
			_, _ = io.Copy(io.Discard, r.Body)
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "media-123"})
			return
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		mu.Lock()
		sent = append(sent, body)
		mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"messages": []map[string]string{{"id": "wamid." + uuid.NewString()[:8]}}})
	}))
	t.Cleanup(server.Close)
	app.WhatsApp = whatsapp.NewWithBaseURL(testutil.NopLogger(), server.URL)
	return func() []map[string]any {
		mu.Lock()
		defer mu.Unlock()
		return append([]map[string]any(nil), sent...)
	}
}

func replyFlow(t *testing.T, app *App, org *models.Organization, account *models.WhatsAppAccount, cfg map[string]any, next bool) *models.ChatbotFlow {
	t.Helper()
	nodes := []any{
		map[string]any{"id": "__start__", "type": "start", "config": map[string]any{}},
		map[string]any{"id": "r1", "type": "reply", "label": "Menu", "config": cfg},
	}
	edges := []any{map[string]any{"from": "__start__", "to": "r1", "condition": "default"}}
	if next {
		nodes = append(nodes, map[string]any{"id": "r2", "type": "reply", "label": "Sales", "config": map[string]any{"body": "Sales here"}})
		edges = append(edges, map[string]any{"from": "r1", "to": "r2", "condition": "button:sales"})
	}
	flow := &models.ChatbotFlow{
		BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: org.ID, WhatsAppAccount: account.Name,
		Name: "reply", IsEnabled: true, FlowType: ChatFlowTypeAdvanced,
		Graph: models.JSONB{"version": 2, "entry_node": "__start__", "nodes": nodes, "edges": edges},
	}
	require.NoError(t, app.DB.Create(flow).Error)
	return flow
}

func TestRunChatGraph_ReplyText_ReplacesContactVariables(t *testing.T) {
	app, org, account, contact, session := newGraphTestFixtures(t)
	sent := captureWhatsApp(t, app)
	require.NoError(t, app.DB.Model(contact).Updates(map[string]any{
		"profile_name": "Asha Verma", "metadata": models.JSONB{"email": "asha@example.com"},
	}).Error)
	require.NoError(t, app.DB.First(contact, contact.ID).Error)

	flow := replyFlow(t, app, org, account, map[string]any{
		"body": "Hi {first_name} {last_name} ({full_name}) – {email} {{first_name}}",
	}, false)
	require.NoError(t, app.runChatGraph(account, contact, session, flow, "hi", "", nil))

	msgs := sent()
	require.Len(t, msgs, 1)
	assert.Equal(t, "text", msgs[0]["type"])
	assert.Equal(t, "Hi Asha Verma (Asha Verma) – asha@example.com Asha", msgs[0]["text"].(map[string]any)["body"])
	assert.Equal(t, models.SessionStatusCompleted, session.Status)
}

func TestRunChatGraph_ReplyButtons_WithImageHeader_ThenRoutes(t *testing.T) {
	app, org, account, contact, session := newGraphTestFixtures(t)
	sent := captureWhatsApp(t, app)
	dir := t.TempDir()
	app.Config = &config.Config{}
	app.Config.Storage.LocalPath = dir
	mediaDir := filepath.Join(dir, "chatbot", org.ID.String())
	require.NoError(t, os.MkdirAll(mediaDir, 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(mediaDir, "banner.jpg"), []byte("jpg"), 0o644))

	flow := replyFlow(t, app, org, account, map[string]any{
		"body":        "Pick one",
		"footer":      "OneSuit",
		"interactive": "buttons",
		"header":      map[string]any{"type": "image", "media_path": "chatbot/" + org.ID.String() + "/banner.jpg", "mime_type": "image/jpeg"},
		"buttons":     []any{map[string]any{"id": "sales", "title": "Sales"}, map[string]any{"id": "help", "title": "Help"}},
	}, true)

	require.NoError(t, app.runChatGraph(account, contact, session, flow, "hi", "", nil))
	msgs := sent()
	require.Len(t, msgs, 1)
	interactive := msgs[0]["interactive"].(map[string]any)
	assert.Equal(t, "button", interactive["type"])
	assert.Equal(t, map[string]any{"type": "image", "image": map[string]any{"id": "media-123"}}, interactive["header"])
	assert.Equal(t, map[string]any{"text": "OneSuit"}, interactive["footer"])
	assert.Equal(t, "r1", session.CurrentStep, "waits for a tap")

	// Typing the button's title counts as tapping it.
	require.NoError(t, app.runChatGraph(account, contact, session, flow, "sales", "", nil))
	msgs = sent()
	require.Len(t, msgs, 2)
	assert.Equal(t, "Sales here", msgs[1]["text"].(map[string]any)["body"])
}

func TestRunChatGraph_ReplyList_And_CTA_And_Media(t *testing.T) {
	t.Run("list", func(t *testing.T) {
		app, org, account, contact, session := newGraphTestFixtures(t)
		sent := captureWhatsApp(t, app)
		flow := replyFlow(t, app, org, account, map[string]any{
			"body": "Our services", "interactive": "list",
			"header": map[string]any{"type": "text", "text": "Menu"},
			"list": map[string]any{"button_text": "View", "sections": []any{map[string]any{"title": "Main", "rows": []any{
				map[string]any{"id": "sales", "title": "Sales", "description": "Talk to sales"},
				map[string]any{"id": "orders", "title": "Order status"},
			}}}},
		}, true)
		require.NoError(t, app.runChatGraph(account, contact, session, flow, "hi", "", nil))
		interactive := sent()[0]["interactive"].(map[string]any)
		assert.Equal(t, "list", interactive["type"])
		assert.Equal(t, map[string]any{"type": "text", "text": "Menu"}, interactive["header"])
		action := interactive["action"].(map[string]any)
		assert.Equal(t, "View", action["button"])
		rows := action["sections"].([]any)[0].(map[string]any)["rows"].([]any)
		assert.Equal(t, "Talk to sales", rows[0].(map[string]any)["description"])

		require.NoError(t, app.runChatGraph(account, contact, session, flow, "Sales", "sales", nil))
		assert.Equal(t, "Sales here", sent()[1]["text"].(map[string]any)["body"])
	})

	t.Run("cta url", func(t *testing.T) {
		app, org, account, contact, session := newGraphTestFixtures(t)
		sent := captureWhatsApp(t, app)
		flow := replyFlow(t, app, org, account, map[string]any{
			"body": "Visit us", "interactive": "cta_url",
			"cta": map[string]any{"display_text": "Open site", "url": "https://example.com/{{phone_number}}"},
		}, false)
		require.NoError(t, app.runChatGraph(account, contact, session, flow, "hi", "", nil))
		interactive := sent()[0]["interactive"].(map[string]any)
		assert.Equal(t, "cta_url", interactive["type"])
		params := interactive["action"].(map[string]any)["parameters"].(map[string]any)
		assert.Equal(t, "Open site", params["display_text"])
		assert.Equal(t, "https://example.com/"+contact.PhoneNumber, params["url"])
		assert.Equal(t, models.SessionStatusCompleted, session.Status, "cta url does not wait")
	})

	t.Run("media message with caption and audio before text", func(t *testing.T) {
		app, org, account, contact, session := newGraphTestFixtures(t)
		sent := captureWhatsApp(t, app)
		dir := t.TempDir()
		app.Config = &config.Config{}
		app.Config.Storage.LocalPath = dir
		mediaDir := filepath.Join(dir, "chatbot", org.ID.String())
		require.NoError(t, os.MkdirAll(mediaDir, 0o755))
		require.NoError(t, os.WriteFile(filepath.Join(mediaDir, "menu.pdf"), []byte("%PDF"), 0o644))
		require.NoError(t, os.WriteFile(filepath.Join(mediaDir, "hello.mp3"), []byte("ID3"), 0o644))

		flow := replyFlow(t, app, org, account, map[string]any{
			"body":   "Our menu",
			"header": map[string]any{"type": "document", "media_path": "chatbot/" + org.ID.String() + "/menu.pdf", "filename": "Menu.pdf", "mime_type": "application/pdf"},
		}, false)
		require.NoError(t, app.runChatGraph(account, contact, session, flow, "hi", "", nil))
		msgs := sent()
		require.Len(t, msgs, 1)
		assert.Equal(t, "document", msgs[0]["type"])
		doc := msgs[0]["document"].(map[string]any)
		assert.Equal(t, "media-123", doc["id"])
		assert.Equal(t, "Menu.pdf", doc["filename"])
		assert.Equal(t, "Our menu", doc["caption"])

		session2 := *session
		session2.ID = uuid.New()
		session2.CurrentStep = ""
		session2.Status = models.SessionStatusActive
		session2.SessionData = models.JSONB{}
		require.NoError(t, app.DB.Create(&session2).Error)
		audio := replyFlow(t, app, org, account, map[string]any{
			"body":   "Listen above",
			"header": map[string]any{"type": "audio", "media_path": "chatbot/" + org.ID.String() + "/hello.mp3"},
		}, false)
		require.NoError(t, app.runChatGraph(account, contact, &session2, audio, "hi", "", nil))
		msgs = sent()
		require.Len(t, msgs, 3)
		assert.Equal(t, "audio", msgs[1]["type"])
		assert.Equal(t, "Listen above", msgs[2]["text"].(map[string]any)["body"])
	})

	t.Run("media outside the org folder is refused", func(t *testing.T) {
		app, org, account, contact, session := newGraphTestFixtures(t)
		_ = captureWhatsApp(t, app)
		app.Config = &config.Config{}
		app.Config.Storage.LocalPath = t.TempDir()
		flow := replyFlow(t, app, org, account, map[string]any{
			"body":   "x",
			"header": map[string]any{"type": "image", "media_path": "chatbot/" + uuid.NewString() + "/a.jpg"},
		}, false)
		require.Error(t, app.runChatGraph(account, contact, session, flow, "hi", "", nil))
	})
}
