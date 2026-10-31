package handlers_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"testing"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

// importContactsCSV posts a CSV to the contact import and returns status and body.
func importContactsCSV(t *testing.T, csvText string) (int, map[string]any, uuid.UUID) {
	t.Helper()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	role := contactsExportRole(t, app.DB, org.ID)
	user := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&role.ID))

	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	require.NoError(t, w.WriteField("table", "contacts"))
	fw, err := w.CreateFormFile("file", "contacts.csv")
	require.NoError(t, err)
	_, _ = fw.Write([]byte(csvText))
	require.NoError(t, w.Close())

	req := testutil.NewRequest(t)
	req.RequestCtx.Request.Header.SetMethod("POST")
	req.RequestCtx.Request.Header.SetContentType(w.FormDataContentType())
	req.RequestCtx.Request.SetBody(body.Bytes())
	testutil.SetAuthContext(req, org.ID, user.ID)

	require.NoError(t, app.ImportData(req))
	var out map[string]any
	_ = json.Unmarshal(testutil.GetResponseBody(req), &out)

	var contacts []models.Contact
	app.DB.Where("organization_id = ?", org.ID).Find(&contacts)
	if data, ok := out["data"].(map[string]any); ok {
		data["_contacts"] = contacts
	}
	return testutil.GetResponseStatusCode(req), out, org.ID
}

func importedPhones(t *testing.T, out map[string]any) map[string]string {
	t.Helper()
	data, ok := out["data"].(map[string]any)
	require.True(t, ok, "response: %v", out)
	phones := map[string]string{}
	for _, c := range data["_contacts"].([]models.Contact) {
		phones[c.PhoneNumber] = c.ProfileName
	}
	return phones
}

func TestApp_ImportContacts_AcceptsCommonFormats(t *testing.T) {
	p1 := fmt.Sprintf("91%010d", uuid.New().ID())
	p2 := fmt.Sprintf("44%010d", uuid.New().ID())

	cases := map[string]string{
		"sample header":        "phone_number,profile_name,tags\n+" + p1 + ",Alice,VIP\n" + p2 + ",Bob,\n",
		"exported header":      "Phone Number,Name,Tags\n" + p1 + ",Alice,\n" + p2 + ",Bob,\n",
		"excel bom":            "\ufeffphone_number,profile_name\n" + p1 + ",Alice\n" + p2 + ",Bob\n",
		"other names":          "Name,Mobile No.,Labels\nAlice,+" + p1[:2] + " " + p1[2:7] + "-" + p1[7:] + ",VIP\nBob," + p2 + ",\n",
		"semicolon":            "Name;Phone\nAlice;" + p1 + "\nBob;" + p2 + "\n",
		"contact column":       "Contact,Customer Name\n" + p1 + ",Alice\n" + p2 + ",Bob\n",
		"no header row":        "Alice," + p1 + "\nBob," + p2 + "\n",
		"windows line endings": "Phone,Name\r\n" + p1 + ",Alice\r\n" + p2 + ",Bob\r\n",
	}
	for name, csvText := range cases {
		t.Run(name, func(t *testing.T) {
			status, out, _ := importContactsCSV(t, csvText)
			require.Equal(t, fasthttp.StatusOK, status, "response: %v", out)
			phones := importedPhones(t, out)
			assert.Equal(t, "Alice", phones[p1], "phones: %v", phones)
			assert.Equal(t, "Bob", phones[p2], "phones: %v", phones)
		})
	}
}

func TestApp_ImportContacts_NoPhoneColumnExplains(t *testing.T) {
	status, out, _ := importContactsCSV(t, "Name,City\nAlice,Delhi\n")
	assert.Equal(t, fasthttp.StatusBadRequest, status)
	assert.Contains(t, fmt.Sprint(out["message"]), "Mobile")
}
