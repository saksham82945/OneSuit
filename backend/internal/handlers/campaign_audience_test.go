package handlers_test

import (
	"context"
	"encoding/json"
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

type audienceEnv struct {
	app      *handlers.App
	queue    *testutil.MockQueue
	org      *models.Organization
	user     *models.User
	account  *models.WhatsAppAccount
	template *models.Template
}

func newAudienceEnv(t *testing.T) *audienceEnv {
	t.Helper()
	mq := testutil.NewMockQueue()
	app := newTestApp(t, withQueue(mq))
	org := testutil.CreateTestOrganization(t, app.DB)
	user := createAdminUser(t, app, org.ID)
	account := testutil.CreateTestWhatsAppAccountWith(t, app.DB, org.ID, testutil.WithAccountName("aud-"+uuid.NewString()[:8]))
	template := testutil.CreateTestTemplate(t, app.DB, org.ID, account.Name)
	return &audienceEnv{app: app, queue: mq, org: org, user: user, account: account, template: template}
}

func (e *audienceEnv) contact(t *testing.T, name string, tags []string, optedOut bool, lang string) *models.Contact {
	t.Helper()
	c := testutil.CreateTestContactWith(t, e.app.DB, e.org.ID, testutil.WithPhoneNumber("91"+uuid.NewString()[:8]))
	tagArr := models.JSONBArray{}
	for _, tg := range tags {
		tagArr = append(tagArr, tg)
	}
	meta := models.JSONB{}
	if lang != "" {
		meta["language"] = lang
	}
	require.NoError(t, e.app.DB.Model(c).Updates(map[string]any{
		"profile_name": name, "tags": tagArr, "marketing_opt_out": optedOut, "metadata": meta,
	}).Error)
	c.ProfileName = name
	return c
}

func (e *audienceEnv) post(t *testing.T, fn func(*fastglue.Request) error, body map[string]any) (int, []byte) {
	t.Helper()
	req := testutil.NewJSONRequest(t, body)
	testutil.SetAuthContext(req, e.org.ID, e.user.ID)
	require.NoError(t, fn(req))
	return testutil.GetResponseStatusCode(req), testutil.GetResponseBody(req)
}

func TestApp_CampaignAudience_MixesSourcesAndFilters(t *testing.T) {
	t.Parallel()
	e := newAudienceEnv(t)
	vip := e.contact(t, "Vip", []string{"VIP"}, false, "en")
	vipOptOut := e.contact(t, "VipOptOut", []string{"VIP"}, true, "en")
	inGroup := e.contact(t, "Grouped", nil, false, "hi")
	inList := e.contact(t, "Listed", []string{"Junk"}, false, "en_US")
	picked := e.contact(t, "Picked", nil, false, "")
	_ = e.contact(t, "Nobody", nil, false, "en") // not selected

	group := models.ContactGroup{OrganizationID: e.org.ID, Name: "G " + uuid.NewString()[:6]}
	require.NoError(t, e.app.DB.Create(&group).Error)
	require.NoError(t, e.app.DB.Create(&models.ContactGroupMember{GroupID: group.ID, ContactID: inGroup.ID, OrganizationID: e.org.ID}).Error)
	list := models.BroadcastList{OrganizationID: e.org.ID, Name: "L " + uuid.NewString()[:6]}
	require.NoError(t, e.app.DB.Create(&list).Error)
	// The VIP contact is in the list too: it must only be counted once.
	for _, c := range []*models.Contact{inList, vip} {
		require.NoError(t, e.app.DB.Create(&models.BroadcastListMember{ListID: list.ID, ContactID: c.ID, OrganizationID: e.org.ID}).Error)
	}

	audience := map[string]any{
		"tags": []string{"VIP"}, "group_ids": []string{group.ID.String()},
		"list_ids": []string{list.ID.String()}, "contact_ids": []string{picked.ID.String()},
	}
	preview := func(extra map[string]any) map[string]any {
		body := map[string]any{}
		for k, v := range audience {
			body[k] = v
		}
		for k, v := range extra {
			body[k] = v
		}
		code, raw := e.post(t, e.app.PreviewCampaignAudience, body)
		require.Equal(t, fasthttp.StatusOK, code, string(raw))
		var out struct{ Data map[string]any }
		require.NoError(t, json.Unmarshal(raw, &out))
		return out.Data
	}

	all := preview(nil)
	assert.EqualValues(t, 5, all["count"], "union of tag, group, list and picked contacts, no duplicates")
	assert.EqualValues(t, 1, all["opted_out"])
	assert.EqualValues(t, 4, preview(map[string]any{"exclude_opted_out": true})["count"])
	assert.EqualValues(t, 4, preview(map[string]any{"exclude_tags": []string{"Junk"}})["count"])
	assert.EqualValues(t, 3, preview(map[string]any{"language": "en_US"})["count"], "en, en and en_US match en_US")

	// Creating the campaign with that audience adds exactly those recipients.
	code, raw := e.post(t, e.app.CreateCampaign, map[string]any{
		"name": "Mixed", "whatsapp_account": e.account.Name, "template_id": e.template.ID.String(),
		"audience": map[string]any{
			"tags": []string{"VIP"}, "group_ids": []string{group.ID.String()}, "list_ids": []string{list.ID.String()},
			"contact_ids": []string{picked.ID.String()}, "exclude_opted_out": true,
		},
	})
	require.Equal(t, fasthttp.StatusOK, code, string(raw))
	var created struct{ Data handlers.CampaignResponse }
	require.NoError(t, json.Unmarshal(raw, &created))
	assert.Equal(t, 4, created.Data.TotalRecipients)
	var phones []string
	e.app.DB.Model(&models.BulkMessageRecipient{}).Where("campaign_id = ?", created.Data.ID).Pluck("phone_number", &phones)
	assert.ElementsMatch(t, []string{vip.PhoneNumber, inGroup.PhoneNumber, inList.PhoneNumber, picked.PhoneNumber}, phones)
	assert.NotContains(t, phones, vipOptOut.PhoneNumber)

	// An audience nobody matches is refused.
	code, _ = e.post(t, e.app.CreateCampaign, map[string]any{
		"name": "Empty", "whatsapp_account": e.account.Name, "template_id": e.template.ID.String(),
		"audience": map[string]any{"tags": []string{"does-not-exist"}},
	})
	assert.Equal(t, fasthttp.StatusBadRequest, code)

	// Another workspace's contacts are never included.
	other := newAudienceEnv(t)
	code, raw = other.post(t, other.app.PreviewCampaignAudience, map[string]any{"contact_ids": []string{picked.ID.String()}})
	require.Equal(t, fasthttp.StatusOK, code)
	var o struct{ Data map[string]any }
	require.NoError(t, json.Unmarshal(raw, &o))
	assert.EqualValues(t, 0, o.Data["count"])
}

func TestApp_ScheduledCampaignStartsWhenDue(t *testing.T) {
	t.Parallel()
	e := newAudienceEnv(t)
	c := e.contact(t, "Sched", []string{"Sched"}, false, "")

	create := func(at time.Time) handlers.CampaignResponse {
		code, raw := e.post(t, e.app.CreateCampaign, map[string]any{
			"name": "Later", "whatsapp_account": e.account.Name, "template_id": e.template.ID.String(),
			"scheduled_at": at.Format(time.RFC3339), "audience": map[string]any{"contact_ids": []string{c.ID.String()}},
		})
		require.Equal(t, fasthttp.StatusOK, code, string(raw))
		var out struct{ Data handlers.CampaignResponse }
		require.NoError(t, json.Unmarshal(raw, &out))
		return out.Data
	}
	future := create(time.Now().Add(2 * time.Hour))
	assert.Equal(t, models.CampaignStatusScheduled, future.Status)

	soon := create(time.Now().Add(2 * time.Second))
	require.Equal(t, models.CampaignStatusScheduled, soon.Status)
	time.Sleep(2100 * time.Millisecond)

	e.app.StartDueCampaigns(context.Background())
	e.app.StartDueCampaigns(context.Background()) // a second run must not start it again

	var got models.BulkMessageCampaign
	require.NoError(t, e.app.DB.First(&got, "id = ?", soon.ID).Error)
	assert.Equal(t, models.CampaignStatusProcessing, got.Status)
	var later models.BulkMessageCampaign
	require.NoError(t, e.app.DB.First(&later, "id = ?", future.ID).Error)
	assert.Equal(t, models.CampaignStatusScheduled, later.Status, "not due yet")
	n := 0
	for _, j := range e.queue.GetJobs() {
		if j.CampaignID == soon.ID {
			n++
		}
	}
	assert.Equal(t, 1, n, "queued exactly once")
}
