package handlers_test

import (
	"encoding/json"
	"testing"

	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

func qr(text string) map[string]any { return map[string]any{"type": "QUICK_REPLY", "text": text} }

func TestTemplateButtons_Validate(t *testing.T) {
	t.Parallel()

	tenQuick := make([]any, 10)
	for i := range tenQuick {
		tenQuick[i] = qr("Option")
	}

	cases := []struct {
		name     string
		category string
		buttons  []any
		wantErr  string
	}{
		{"none", "MARKETING", nil, ""},
		{"ten quick replies", "MARKETING", tenQuick, ""},
		{"eleven buttons", "MARKETING", append(append([]any{}, tenQuick...), qr("x")), "at most 10 buttons"},
		{"8 quick + 2 urls", "MARKETING", append(append([]any{}, tenQuick[:8]...),
			map[string]any{"type": "URL", "text": "Shop", "url": "https://shop.example.com"},
			map[string]any{"type": "URL", "text": "Track", "url": "https://example.com/t/{{1}}", "example": []any{"https://example.com/t/123"}},
		), ""},
		{"three urls", "MARKETING", []any{
			map[string]any{"type": "URL", "text": "A", "url": "https://a.example.com"},
			map[string]any{"type": "URL", "text": "B", "url": "https://b.example.com"},
			map[string]any{"type": "URL", "text": "C", "url": "https://c.example.com"},
		}, "at most 2 website"},
		{"two phones", "UTILITY", []any{
			map[string]any{"type": "PHONE_NUMBER", "text": "Call", "phone_number": "+919876543210"},
			map[string]any{"type": "PHONE_NUMBER", "text": "Call 2", "phone_number": "+919876543211"},
		}, "at most 1 phone"},
		{"two copy codes", "MARKETING", []any{
			map[string]any{"type": "COPY_CODE", "example": "SAVE10"},
			map[string]any{"type": "COPY_CODE", "example": "SAVE20"},
		}, "at most 1 copy code"},
		{"empty text", "MARKETING", []any{qr("  ")}, "needs a label"},
		{"long text", "MARKETING", []any{qr("abcdefghijklmnopqrstuvwxyz")}, "at most 25"},
		{"bad url", "MARKETING", []any{map[string]any{"type": "URL", "text": "Go", "url": "not a url"}}, "valid http(s)"},
		{"var not at end", "MARKETING", []any{map[string]any{"type": "URL", "text": "Go", "url": "https://x.com/{{1}}/a", "example": "https://x.com/1/a"}}, "at the end"},
		{"dynamic url without example", "MARKETING", []any{map[string]any{"type": "URL", "text": "Go", "url": "https://x.com/{{1}}"}}, "example URL"},
		{"bad phone", "MARKETING", []any{map[string]any{"type": "PHONE_NUMBER", "text": "Call", "phone_number": "12ab"}}, "international format"},
		{"phone with spaces ok", "MARKETING", []any{map[string]any{"type": "PHONE_NUMBER", "text": "Call", "phone_number": "+91 98765-43210"}}, ""},
		{"copy code needs example", "MARKETING", []any{map[string]any{"type": "COPY_CODE"}}, "example offer code"},
		{"otp on marketing", "MARKETING", []any{map[string]any{"type": "OTP", "otp_type": "COPY_CODE"}}, "authentication"},
		{"auth skipped", "AUTHENTICATION", []any{map[string]any{"type": "OTP", "otp_type": "COPY_CODE"}}, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := handlers.ValidateTemplateButtons(tc.category, tc.buttons)
			if tc.wantErr == "" {
				assert.NoError(t, err)
			} else {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.wantErr)
			}
		})
	}
}

func TestTemplateButtons_NormalizeGroupsQuickReplies(t *testing.T) {
	t.Parallel()

	url := map[string]any{"type": "URL", "text": "Shop", "url": "https://example.com"}
	phone := map[string]any{"type": "PHONE_NUMBER", "text": "Call", "phone_number": "+91 98765 43210"}

	// First button is a quick reply -> quick replies first.
	out := handlers.NormalizeTemplateButtons([]any{qr("A"), url, qr("B"), phone})
	types := []string{}
	for _, b := range out {
		types = append(types, b.(map[string]any)["type"].(string))
	}
	assert.Equal(t, []string{"QUICK_REPLY", "QUICK_REPLY", "URL", "PHONE_NUMBER"}, types)
	assert.Equal(t, "B", out[1].(map[string]any)["text"])
	assert.Equal(t, "+919876543210", out[3].(map[string]any)["phone_number"])

	// First button is a call-to-action -> call-to-action buttons first.
	out = handlers.NormalizeTemplateButtons([]any{url, qr("A"), phone})
	assert.Equal(t, "URL", out[0].(map[string]any)["type"])
	assert.Equal(t, "PHONE_NUMBER", out[1].(map[string]any)["type"])
	assert.Equal(t, "QUICK_REPLY", out[2].(map[string]any)["type"])
}

func TestApp_CreateTemplate_RejectsTooManyURLButtons(t *testing.T) {
	t.Parallel()

	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := testutil.CreateTestUser(t, app.DB, org.ID)
	account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)

	body := map[string]any{
		"whatsapp_account": account.Name,
		"name":             "three_links",
		"language":         "en",
		"category":         "MARKETING",
		"body_content":     "Hi",
		"buttons": []any{
			map[string]any{"type": "URL", "text": "A", "url": "https://a.example.com"},
			map[string]any{"type": "URL", "text": "B", "url": "https://b.example.com"},
			map[string]any{"type": "URL", "text": "C", "url": "https://c.example.com"},
		},
	}
	req := testutil.NewJSONRequest(t, body)
	testutil.SetAuthContext(req, org.ID, user.ID)

	require.NoError(t, app.CreateTemplate(req))
	testutil.AssertErrorResponse(t, req, fasthttp.StatusBadRequest, "at most 2 website")
}

func TestApp_CreateTemplate_StoresGroupedButtons(t *testing.T) {
	t.Parallel()

	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := testutil.CreateTestUser(t, app.DB, org.ID)
	account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)

	body := map[string]any{
		"whatsapp_account": account.Name,
		"name":             "grouped_buttons",
		"language":         "en",
		"category":         "MARKETING",
		"body_content":     "Hi",
		"buttons": []any{
			map[string]any{"type": "QUICK_REPLY", "text": "Yes"},
			map[string]any{"type": "URL", "text": "Shop", "url": "https://example.com/p/{{1}}", "example": []any{"https://example.com/p/42"}},
			map[string]any{"type": "QUICK_REPLY", "text": "No"},
			map[string]any{"type": "COPY_CODE", "example": "SAVE10"},
		},
	}
	req := testutil.NewJSONRequest(t, body)
	testutil.SetAuthContext(req, org.ID, user.ID)

	require.NoError(t, app.CreateTemplate(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))

	var resp struct {
		Data handlers.TemplateResponse `json:"data"`
	}
	require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &resp))

	var stored models.Template
	require.NoError(t, app.DB.Where("id = ?", resp.Data.ID).First(&stored).Error)
	require.Len(t, stored.Buttons, 4)
	got := []string{}
	for _, b := range stored.Buttons {
		got = append(got, b.(map[string]any)["type"].(string))
	}
	assert.Equal(t, []string{"QUICK_REPLY", "QUICK_REPLY", "URL", "COPY_CODE"}, got)
}
