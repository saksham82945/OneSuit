package whatsapp_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/shridarpatil/whatomate/pkg/whatsapp"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildInteractivePayload_ChatbotShapes(t *testing.T) {
	t.Parallel()

	t.Run("reply buttons with image header and footer", func(t *testing.T) {
		got, err := whatsapp.BuildInteractivePayload(whatsapp.InteractiveMessage{
			Type:    "button",
			Header:  &whatsapp.InteractiveHeader{Type: "image", MediaID: "m1"},
			Body:    "Pick one",
			Footer:  "OneSuit",
			Buttons: []whatsapp.Button{{ID: "a", Title: "A"}, {ID: "b", Title: "B"}},
		})
		require.NoError(t, err)
		assert.Equal(t, "button", got["type"])
		assert.Equal(t, map[string]any{"type": "image", "image": map[string]any{"id": "m1"}}, got["header"])
		assert.Equal(t, map[string]any{"text": "OneSuit"}, got["footer"])
		buttons := got["action"].(map[string]any)["buttons"].([]map[string]any)
		require.Len(t, buttons, 2)
		assert.Equal(t, map[string]any{"id": "a", "title": "A"}, buttons[0]["reply"])
	})

	t.Run("list with sections, descriptions and custom button", func(t *testing.T) {
		got, err := whatsapp.BuildInteractivePayload(whatsapp.InteractiveMessage{
			Type:           "list",
			Header:         &whatsapp.InteractiveHeader{Type: "text", Text: "Menu"},
			Body:           "Choose",
			ListButtonText: "View options",
			Sections: []whatsapp.ListSection{
				{Title: "Shop", Rows: []whatsapp.ListRow{{ID: "r1", Title: "Products", Description: "Our catalog"}}},
				{Rows: []whatsapp.ListRow{{ID: "r2", Title: "Support"}}},
			},
		})
		require.NoError(t, err)
		action := got["action"].(map[string]any)
		assert.Equal(t, "View options", action["button"])
		sections := action["sections"].([]map[string]any)
		require.Len(t, sections, 2)
		assert.Equal(t, "Section 2", sections[1]["title"], "untitled sections get a title when there are several")
		rows := sections[0]["rows"].([]map[string]any)
		assert.Equal(t, "Our catalog", rows[0]["description"])
	})

	t.Run("list rejects media header and more than 10 rows", func(t *testing.T) {
		_, err := whatsapp.BuildInteractivePayload(whatsapp.InteractiveMessage{
			Type: "list", Body: "x",
			Header:   &whatsapp.InteractiveHeader{Type: "image", MediaID: "m"},
			Sections: []whatsapp.ListSection{{Rows: []whatsapp.ListRow{{ID: "1", Title: "1"}}}},
		})
		require.Error(t, err)

		rows := make([]whatsapp.ListRow, 11)
		for i := range rows {
			rows[i] = whatsapp.ListRow{ID: string(rune('a' + i)), Title: "r"}
		}
		_, err = whatsapp.BuildInteractivePayload(whatsapp.InteractiveMessage{
			Type: "list", Body: "x", Sections: []whatsapp.ListSection{{Rows: rows}},
		})
		require.Error(t, err)
	})

	t.Run("cta url with document header", func(t *testing.T) {
		got, err := whatsapp.BuildInteractivePayload(whatsapp.InteractiveMessage{
			Type:           "cta_url",
			Header:         &whatsapp.InteractiveHeader{Type: "document", MediaID: "d1", Filename: "menu.pdf"},
			Body:           "See the site",
			CTADisplayText: "Open",
			CTAURL:         "https://example.com",
		})
		require.NoError(t, err)
		assert.Equal(t, map[string]any{"type": "document", "document": map[string]any{"id": "d1", "filename": "menu.pdf"}}, got["header"])
		assert.Equal(t, map[string]any{
			"name":       "cta_url",
			"parameters": map[string]any{"display_text": "Open", "url": "https://example.com"},
		}, got["action"])
	})

	t.Run("four reply buttons is an error", func(t *testing.T) {
		_, err := whatsapp.BuildInteractivePayload(whatsapp.InteractiveMessage{
			Type: "button", Body: "x",
			Buttons: []whatsapp.Button{{ID: "1"}, {ID: "2"}, {ID: "3"}, {ID: "4"}},
		})
		require.Error(t, err)
	})
}

func TestClient_SendInteractive_ChatbotPostsPayload(t *testing.T) {
	t.Parallel()

	var captured map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&captured)
		_ = json.NewEncoder(w).Encode(map[string]any{"messages": []map[string]string{{"id": "wamid.x"}}})
	}))
	defer server.Close()

	client := whatsapp.NewWithBaseURL(testutil.NopLogger(), server.URL)
	account := &whatsapp.Account{PhoneID: "1", APIVersion: "v21.0", AccessToken: "t"}
	id, err := client.SendInteractive(testutil.TestContext(t), account, whatsapp.Recipient{Phone: "911234567890"},
		whatsapp.InteractiveMessage{Type: "button", Body: "Hi", Buttons: []whatsapp.Button{{ID: "y", Title: "Yes"}}})
	require.NoError(t, err)
	assert.Equal(t, "wamid.x", id)
	assert.Equal(t, "interactive", captured["type"])
	assert.Equal(t, "911234567890", captured["to"])
}
