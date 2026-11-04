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
	"github.com/zerodha/fastglue"
)

type collectionsEnv struct {
	app  *handlers.App
	org  *models.Organization
	user *models.User
}

func newCollectionsEnv(t *testing.T) collectionsEnv {
	t.Helper()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	role := testutil.CreateAdminRole(t, app.DB, org.ID)
	user := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&role.ID))
	return collectionsEnv{app: app, org: org, user: user}
}

func (e collectionsEnv) call(t *testing.T, h func(*fastglue.Request) error, body any, path map[string]string, query map[string]string) (int, []byte) {
	t.Helper()
	var req *fastglue.Request
	if body != nil {
		req = testutil.NewJSONRequest(t, body)
	} else {
		req = testutil.NewGETRequest(t)
	}
	testutil.SetAuthContext(req, e.org.ID, e.user.ID)
	for k, v := range path {
		testutil.SetPathParam(req, k, v)
	}
	for k, v := range query {
		testutil.SetQueryParam(req, k, v)
	}
	require.NoError(t, h(req))
	return testutil.GetResponseStatusCode(req), testutil.GetResponseBody(req)
}

func idsOf(cs ...*models.Contact) []string {
	out := make([]string, len(cs))
	for i, c := range cs {
		out[i] = c.ID.String()
	}
	return out
}

func createGroup(t *testing.T, e collectionsEnv, name string) handlers.ContactGroupResponse {
	t.Helper()
	code, body := e.call(t, e.app.CreateContactGroup, map[string]any{"name": name, "color": "teal"}, nil, nil)
	require.Equal(t, fasthttp.StatusOK, code, string(body))
	var resp struct{ Data handlers.ContactGroupResponse }
	require.NoError(t, json.Unmarshal(body, &resp))
	return resp.Data
}

func createList(t *testing.T, e collectionsEnv, name string) handlers.BroadcastListResponse {
	t.Helper()
	code, body := e.call(t, e.app.CreateBroadcastList, map[string]any{"name": name}, nil, nil)
	require.Equal(t, fasthttp.StatusOK, code, string(body))
	var resp struct{ Data handlers.BroadcastListResponse }
	require.NoError(t, json.Unmarshal(body, &resp))
	return resp.Data
}

func memberIDs(t *testing.T, body []byte) []uuid.UUID {
	t.Helper()
	var resp struct {
		Data struct {
			Contacts []handlers.CollectionMember `json:"contacts"`
			Total    int64                       `json:"total"`
		}
	}
	require.NoError(t, json.Unmarshal(body, &resp))
	out := make([]uuid.UUID, len(resp.Data.Contacts))
	for i, c := range resp.Data.Contacts {
		out[i] = c.ID
	}
	return out
}

func TestContactGroups_CRUDAndMembership(t *testing.T) {
	e := newCollectionsEnv(t)
	c1 := testutil.CreateTestContact(t, e.app.DB, e.org.ID)
	c2 := testutil.CreateTestContact(t, e.app.DB, e.org.ID)

	g := createGroup(t, e, "VIP customers")
	assert.Equal(t, "teal", g.Color)

	// Duplicate name (case-insensitive) conflicts
	code, _ := e.call(t, e.app.CreateContactGroup, map[string]any{"name": "vip CUSTOMERS"}, nil, nil)
	assert.Equal(t, fasthttp.StatusConflict, code)
	// Invalid colour rejected
	code, _ = e.call(t, e.app.CreateContactGroup, map[string]any{"name": "X", "color": "neon"}, nil, nil)
	assert.Equal(t, fasthttp.StatusBadRequest, code)

	path := map[string]string{"id": g.ID.String()}

	// Add twice: idempotent
	code, body := e.call(t, e.app.AddContactGroupMembers, map[string]any{"contact_ids": idsOf(c1, c2)}, path, nil)
	require.Equal(t, fasthttp.StatusOK, code, string(body))
	code, body = e.call(t, e.app.AddContactGroupMembers, map[string]any{"contact_ids": idsOf(c1, c2, c1)}, path, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	var addResp struct {
		Data struct {
			Added       int64 `json:"added"`
			MemberCount int64 `json:"member_count"`
		}
	}
	require.NoError(t, json.Unmarshal(body, &addResp))
	assert.Equal(t, int64(0), addResp.Data.Added)
	assert.Equal(t, int64(2), addResp.Data.MemberCount)

	// One contact in many groups
	g2 := createGroup(t, e, "Leads")
	code, _ = e.call(t, e.app.AddContactGroupMembers, map[string]any{"contact_ids": idsOf(c1)}, map[string]string{"id": g2.ID.String()}, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	code, body = e.call(t, e.app.ListContactGroups, nil, nil, map[string]string{"contact_id": c1.ID.String()})
	require.Equal(t, fasthttp.StatusOK, code)
	var listResp struct {
		Data struct{ Groups []handlers.ContactGroupResponse }
	}
	require.NoError(t, json.Unmarshal(body, &listResp))
	assert.Len(t, listResp.Data.Groups, 2)

	// Members listing
	code, body = e.call(t, e.app.ListContactGroupMembers, nil, path, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	assert.ElementsMatch(t, []uuid.UUID{c1.ID, c2.ID}, memberIDs(t, body))

	// Remove twice: idempotent
	code, _ = e.call(t, e.app.RemoveContactGroupMembers, map[string]any{"contact_ids": idsOf(c2)}, path, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	code, _ = e.call(t, e.app.RemoveContactGroupMembers, map[string]any{"contact_ids": idsOf(c2)}, path, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	code, body = e.call(t, e.app.ListContactGroupMembers, nil, path, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	assert.Equal(t, []uuid.UUID{c1.ID}, memberIDs(t, body))

	// Soft-deleting a contact hides it from members and counts without errors
	require.NoError(t, e.app.DB.Delete(c1).Error)
	code, body = e.call(t, e.app.ListContactGroupMembers, nil, path, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	assert.Empty(t, memberIDs(t, body))
	code, body = e.call(t, e.app.GetContactGroup, nil, path, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	var getResp struct{ Data handlers.ContactGroupResponse }
	require.NoError(t, json.Unmarshal(body, &getResp))
	assert.Equal(t, int64(0), getResp.Data.MemberCount)

	// Rename
	code, body = e.call(t, e.app.UpdateContactGroup, map[string]any{"name": "Gold"}, path, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	require.NoError(t, json.Unmarshal(body, &getResp))
	assert.Equal(t, "Gold", getResp.Data.Name)
	assert.Equal(t, "teal", getResp.Data.Color)

	// Delete removes memberships too
	code, _ = e.call(t, e.app.DeleteContactGroup, nil, path, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	var n int64
	e.app.DB.Model(&models.ContactGroupMember{}).Where("group_id = ?", g.ID).Count(&n)
	assert.Zero(t, n)
	code, _ = e.call(t, e.app.GetContactGroup, nil, path, nil)
	assert.Equal(t, fasthttp.StatusNotFound, code)
}

func TestContactGroups_OrgIsolation(t *testing.T) {
	e := newCollectionsEnv(t)
	other := testutil.CreateTestOrganization(t, e.app.DB)
	foreign := testutil.CreateTestContact(t, e.app.DB, other.ID)
	own := testutil.CreateTestContact(t, e.app.DB, e.org.ID)

	g := createGroup(t, e, "Mine")
	path := map[string]string{"id": g.ID.String()}

	// Foreign contact id is rejected, and nothing is added
	code, _ := e.call(t, e.app.AddContactGroupMembers, map[string]any{"contact_ids": idsOf(own, foreign)}, path, nil)
	assert.Equal(t, fasthttp.StatusBadRequest, code)
	var n int64
	e.app.DB.Model(&models.ContactGroupMember{}).Where("group_id = ?", g.ID).Count(&n)
	assert.Zero(t, n)

	// Another org cannot see or touch this group
	otherRole := testutil.CreateAdminRole(t, e.app.DB, other.ID)
	otherUser := testutil.CreateTestUser(t, e.app.DB, other.ID, testutil.WithRoleID(&otherRole.ID))
	oe := collectionsEnv{app: e.app, org: other, user: otherUser}
	code, _ = oe.call(t, oe.app.GetContactGroup, nil, path, nil)
	assert.Equal(t, fasthttp.StatusNotFound, code)
	code, _ = oe.call(t, oe.app.ListContactGroupMembers, nil, path, nil)
	assert.Equal(t, fasthttp.StatusNotFound, code)
	code, _ = oe.call(t, oe.app.AddContactGroupMembers, map[string]any{"contact_ids": idsOf(foreign)}, path, nil)
	assert.Equal(t, fasthttp.StatusNotFound, code)
	code, _ = oe.call(t, oe.app.DeleteContactGroup, nil, path, nil)
	assert.Equal(t, fasthttp.StatusNotFound, code)
	code, body := oe.call(t, oe.app.ListContactGroups, nil, nil, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	var listResp struct {
		Data struct{ Groups []handlers.ContactGroupResponse }
	}
	require.NoError(t, json.Unmarshal(body, &listResp))
	assert.Empty(t, listResp.Data.Groups)
}

func TestContactGroups_RequiresPermission(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	role := testutil.CreateTestRoleWithKeys(t, app.DB, org.ID, "readonly", []string{"contacts:read"})
	user := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&role.ID))
	e := collectionsEnv{app: app, org: org, user: user}

	code, _ := e.call(t, app.ListContactGroups, nil, nil, nil)
	assert.Equal(t, fasthttp.StatusOK, code)
	code, _ = e.call(t, app.CreateContactGroup, map[string]any{"name": "x"}, nil, nil)
	assert.Equal(t, fasthttp.StatusForbidden, code)
	code, _ = e.call(t, app.CreateBroadcastList, map[string]any{"name": "x"}, nil, nil)
	assert.Equal(t, fasthttp.StatusForbidden, code)
}

func TestBroadcastLists_MembershipSources(t *testing.T) {
	e := newCollectionsEnv(t)
	c1 := testutil.CreateTestContact(t, e.app.DB, e.org.ID)
	c2 := testutil.CreateTestContact(t, e.app.DB, e.org.ID)
	c3 := testutil.CreateTestContact(t, e.app.DB, e.org.ID)
	require.NoError(t, e.app.DB.Model(c3).Update("tags", models.JSONBArray{"vip"}).Error)
	other := testutil.CreateTestOrganization(t, e.app.DB)
	foreign := testutil.CreateTestContact(t, e.app.DB, other.ID)

	l := createList(t, e, "Diwali offer")
	path := map[string]string{"id": l.ID.String()}

	// By ids (idempotent)
	for i := 0; i < 2; i++ {
		code, body := e.call(t, e.app.AddBroadcastListMembers, map[string]any{"contact_ids": idsOf(c1)}, path, nil)
		require.Equal(t, fasthttp.StatusOK, code, string(body))
	}
	// Foreign rejected
	code, _ := e.call(t, e.app.AddBroadcastListMembers, map[string]any{"contact_ids": idsOf(foreign)}, path, nil)
	assert.Equal(t, fasthttp.StatusBadRequest, code)

	// From a group
	g := createGroup(t, e, "Group A")
	code, _ = e.call(t, e.app.AddContactGroupMembers, map[string]any{"contact_ids": idsOf(c1, c2)}, map[string]string{"id": g.ID.String()}, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	code, body := e.call(t, e.app.AddBroadcastListMembers, map[string]any{"group_id": g.ID.String()}, path, nil)
	require.Equal(t, fasthttp.StatusOK, code, string(body))
	var addResp struct {
		Data struct {
			Added       int64 `json:"added"`
			MemberCount int64 `json:"member_count"`
		}
	}
	require.NoError(t, json.Unmarshal(body, &addResp))
	assert.Equal(t, int64(1), addResp.Data.Added)
	assert.Equal(t, int64(2), addResp.Data.MemberCount)

	// From a tag
	code, body = e.call(t, e.app.AddBroadcastListMembers, map[string]any{"tag": "vip"}, path, nil)
	require.Equal(t, fasthttp.StatusOK, code, string(body))
	code, body = e.call(t, e.app.ListBroadcastListMembers, nil, path, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	assert.ElementsMatch(t, []uuid.UUID{c1.ID, c2.ID, c3.ID}, memberIDs(t, body))

	// Foreign group rejected
	og := models.ContactGroup{OrganizationID: other.ID, Name: "theirs"}
	require.NoError(t, e.app.DB.Create(&og).Error)
	code, _ = e.call(t, e.app.AddBroadcastListMembers, map[string]any{"group_id": og.ID.String()}, path, nil)
	assert.Equal(t, fasthttp.StatusNotFound, code)

	// Remove idempotent
	for i := 0; i < 2; i++ {
		code, _ = e.call(t, e.app.RemoveBroadcastListMembers, map[string]any{"contact_ids": idsOf(c2)}, path, nil)
		require.Equal(t, fasthttp.StatusOK, code)
	}
	code, body = e.call(t, e.app.ListBroadcastListMembers, nil, path, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	assert.ElementsMatch(t, []uuid.UUID{c1.ID, c3.ID}, memberIDs(t, body))
}

func TestCreateCampaign_WithListID(t *testing.T) {
	e := newCollectionsEnv(t)
	account := testutil.CreateTestWhatsAppAccountWith(t, e.app.DB, e.org.ID, testutil.WithAccountName("list-campaign-acct"))
	template := testutil.CreateTestTemplate(t, e.app.DB, e.org.ID, account.Name)

	in1 := testutil.CreateTestContact(t, e.app.DB, e.org.ID)
	in2 := testutil.CreateTestContact(t, e.app.DB, e.org.ID)
	deleted := testutil.CreateTestContact(t, e.app.DB, e.org.ID)
	_ = testutil.CreateTestContact(t, e.app.DB, e.org.ID) // not in list

	l := createList(t, e, "Audience")
	code, _ := e.call(t, e.app.AddBroadcastListMembers, map[string]any{"contact_ids": idsOf(in1, in2, deleted)}, map[string]string{"id": l.ID.String()}, nil)
	require.Equal(t, fasthttp.StatusOK, code)
	require.NoError(t, e.app.DB.Delete(deleted).Error)

	code, body := e.call(t, e.app.CreateCampaign, map[string]any{
		"name": "List campaign", "whatsapp_account": account.Name,
		"template_id": template.ID.String(), "list_id": l.ID.String(),
	}, nil, nil)
	require.Equal(t, fasthttp.StatusOK, code, string(body))
	var resp struct{ Data handlers.CampaignResponse }
	require.NoError(t, json.Unmarshal(body, &resp))
	assert.Equal(t, 2, resp.Data.TotalRecipients)

	var phones []string
	e.app.DB.Model(&models.BulkMessageRecipient{}).Where("campaign_id = ?", resp.Data.ID).Pluck("phone_number", &phones)
	assert.ElementsMatch(t, []string{in1.PhoneNumber, in2.PhoneNumber}, phones)

	// Adding the same list again to the draft adds nobody new
	code, body = e.call(t, e.app.AddCampaignRecipientsFromList, map[string]any{"list_id": l.ID.String()},
		map[string]string{"id": resp.Data.ID.String()}, nil)
	require.Equal(t, fasthttp.StatusOK, code, string(body))
	var fromList struct {
		Data struct {
			AddedCount      int   `json:"added_count"`
			TotalRecipients int64 `json:"total_recipients"`
		}
	}
	require.NoError(t, json.Unmarshal(body, &fromList))
	assert.Equal(t, 0, fromList.Data.AddedCount)
	assert.Equal(t, int64(2), fromList.Data.TotalRecipients)
}

func TestCreateCampaign_ForeignListRejected(t *testing.T) {
	e := newCollectionsEnv(t)
	account := testutil.CreateTestWhatsAppAccountWith(t, e.app.DB, e.org.ID, testutil.WithAccountName("foreign-list-acct"))
	template := testutil.CreateTestTemplate(t, e.app.DB, e.org.ID, account.Name)
	other := testutil.CreateTestOrganization(t, e.app.DB)
	ol := models.BroadcastList{OrganizationID: other.ID, Name: "theirs"}
	require.NoError(t, e.app.DB.Create(&ol).Error)

	code, _ := e.call(t, e.app.CreateCampaign, map[string]any{
		"name": "Nope", "whatsapp_account": account.Name,
		"template_id": template.ID.String(), "list_id": ol.ID.String(),
	}, nil, nil)
	assert.Equal(t, fasthttp.StatusBadRequest, code)
	var n int64
	e.app.DB.Model(&models.BulkMessageCampaign{}).Where("organization_id = ? AND name = ?", e.org.ID, "Nope").Count(&n)
	assert.Zero(t, n)
}
