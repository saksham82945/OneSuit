package whatsapp_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/shridarpatil/whatomate/pkg/whatsapp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClient_SubmitTemplate_ButtonShapes(t *testing.T) {
	t.Parallel()

	var buttons []any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		for _, c := range body["components"].([]any) {
			comp := c.(map[string]any)
			if comp["type"] == "BUTTONS" {
				buttons = comp["buttons"].([]any)
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"id": "tmpl-btn"})
	}))
	defer server.Close()

	client := newTestClient(t, server)
	_, err := client.SubmitTemplate(context.Background(), testAccount(server.URL), &whatsapp.TemplateSubmission{
		Name:        "buttons",
		Language:    "en",
		Category:    "MARKETING",
		BodyContent: "Hello",
		Buttons: []any{
			map[string]any{"type": "QUICK_REPLY", "text": "Yes"},
			map[string]any{"type": "URL", "text": "Shop", "url": "https://example.com"},
			map[string]any{"type": "URL", "text": "Track", "url": "https://example.com/t/{{1}}", "example": []any{"https://example.com/t/42"}},
			map[string]any{"type": "PHONE_NUMBER", "text": "Call us", "phone_number": "+919876543210"},
			map[string]any{"type": "COPY_CODE", "text": "Copy offer code", "example": "SAVE10"},
		},
	})
	require.NoError(t, err)
	require.Len(t, buttons, 5)

	assert.Equal(t, map[string]any{"type": "QUICK_REPLY", "text": "Yes"}, buttons[0])
	assert.Equal(t, map[string]any{"type": "URL", "text": "Shop", "url": "https://example.com"}, buttons[1])
	assert.Equal(t, map[string]any{"type": "URL", "text": "Track", "url": "https://example.com/t/{{1}}", "example": []any{"https://example.com/t/42"}}, buttons[2])
	assert.Equal(t, map[string]any{"type": "PHONE_NUMBER", "text": "Call us", "phone_number": "+919876543210"}, buttons[3])
	assert.Equal(t, map[string]any{"type": "COPY_CODE", "example": "SAVE10"}, buttons[4])
}
