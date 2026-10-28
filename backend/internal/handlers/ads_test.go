package handlers_test

import (
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

type adsFixture struct {
	app   *handlers.App
	org   *models.Organization
	admin *models.User
	role  *models.CustomRole
}

func newAdsFixture(t *testing.T) *adsFixture {
	t.Helper()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	role := testutil.CreateAdminRole(t, app.DB, org.ID)
	admin := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&role.ID))
	return &adsFixture{app: app, org: org, admin: admin, role: role}
}

func (f *adsFixture) call(t *testing.T, h func(*fastglue.Request) error, body any, id string) *fastglue.Request {
	t.Helper()
	var req *fastglue.Request
	if body == nil {
		req = testutil.NewGETRequest(t)
	} else {
		req = testutil.NewJSONRequest(t, body)
	}
	testutil.SetFullAuthContext(req, f.org.ID, f.admin.ID, &f.role.ID, false)
	if id != "" {
		testutil.SetPathParam(req, "id", id)
	}
	require.NoError(t, h(req))
	return req
}

func TestApp_Ads_SetupSteps(t *testing.T) {
	t.Parallel()
	f := newAdsFixture(t)

	req := f.call(t, f.app.GetAdsSetup, nil, "")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	var setup struct {
		FacebookConnected bool            `json:"facebook_connected"`
		Steps             map[string]bool `json:"steps"`
	}
	testutil.ParseEnvelopeResponse(t, req, &setup)
	assert.False(t, setup.FacebookConnected)
	assert.False(t, setup.Steps["accept_terms"])

	// Facebook can't be connected until Meta is set up for ads.
	testutil.AssertErrorResponse(t, f.call(t, f.app.ConnectAdsFacebook, map[string]any{}, ""), fasthttp.StatusConflict, "Meta app")

	// A page needs Facebook first; an unknown WhatsApp number is refused.
	testutil.AssertErrorResponse(t, f.call(t, f.app.UpdateAdsSetup, map[string]any{"page_id": "123"}, ""), fasthttp.StatusConflict, "Facebook")
	testutil.AssertErrorResponse(t, f.call(t, f.app.UpdateAdsSetup, map[string]any{"whatsapp_account": "nope"}, ""), fasthttp.StatusBadRequest, "isn't connected")

	acct := testutil.CreateTestWhatsAppAccount(t, f.app.DB, f.org.ID)
	req = f.call(t, f.app.UpdateAdsSetup, map[string]any{"whatsapp_account": acct.Name}, "")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))

	req = f.call(t, f.app.AcceptAdsLeadTerms, map[string]any{}, "")
	testutil.ParseEnvelopeResponse(t, req, &setup)
	assert.True(t, setup.Steps["link_whatsapp"])
	assert.True(t, setup.Steps["accept_terms"])
}

func TestApp_Ads_CampaignsFormsAudiences(t *testing.T) {
	t.Parallel()
	f := newAdsFixture(t)

	// Lead form: publishing needs questions and a privacy link.
	bad := f.call(t, f.app.CreateAdForm, map[string]any{"name": "Test form", "status": "published"}, "")
	testutil.AssertErrorResponse(t, bad, fasthttp.StatusBadRequest, "at least one question")
	req := f.call(t, f.app.CreateAdForm, map[string]any{
		"name": "Test form", "status": "published", "privacy_url": "https://example.com/privacy",
		"questions": []map[string]any{{"key": "name", "label": "Your name", "type": "full_name"}, {"key": "phone", "label": "Phone", "type": "phone"}},
	}, "")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var form models.AdLeadForm
	testutil.ParseEnvelopeResponse(t, req, &form)

	// Audience by tag counts matching contacts.
	c1 := testutil.CreateTestContact(t, f.app.DB, f.org.ID)
	require.NoError(t, f.app.DB.Model(c1).Update("tags", models.JSONBArray{"VIP"}).Error)
	testutil.CreateTestContact(t, f.app.DB, f.org.ID)
	req = f.call(t, f.app.CreateAdAudience, map[string]any{"name": "Test VIPs", "source": "contacts_tag", "tags": []string{"VIP"}}, "")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var aud struct {
		ID   uuid.UUID `json:"id"`
		Size int64     `json:"size"`
	}
	testutil.ParseEnvelopeResponse(t, req, &aud)
	assert.Equal(t, int64(1), aud.Size)

	// Campaign draft with validation.
	testutil.AssertErrorResponse(t, f.call(t, f.app.CreateAdCampaign, map[string]any{"name": "x", "type": "tv"}, ""), fasthttp.StatusBadRequest, "Ad type")
	req = f.call(t, f.app.CreateAdCampaign, map[string]any{
		"name": "Test lead ad", "type": "lead_form", "daily_budget": 500, "currency": "INR",
		"form_id": form.ID.String(), "audience_id": aud.ID.String(), "creative": map[string]any{"headline": "Hi"},
	}, "")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var ad models.AdCampaign
	testutil.ParseEnvelopeResponse(t, req, &ad)
	assert.Equal(t, "draft", ad.Status)

	// Launch explains what's missing.
	testutil.AssertErrorResponse(t, f.call(t, f.app.LaunchAdCampaign, map[string]any{}, ad.ID.String()), fasthttp.StatusConflict, "connect your Facebook account")

	// Forms and audiences in use can't be deleted.
	testutil.AssertErrorResponse(t, f.call(t, f.app.DeleteAdForm, map[string]any{}, form.ID.String()), fasthttp.StatusConflict, "uses this form")
	testutil.AssertErrorResponse(t, f.call(t, f.app.DeleteAdAudience, map[string]any{}, aud.ID.String()), fasthttp.StatusConflict, "targets this audience")

	// List with a type filter.
	list := testutil.NewGETRequest(t)
	testutil.SetFullAuthContext(list, f.org.ID, f.admin.ID, &f.role.ID, false)
	testutil.SetQueryParam(list, "type", "lead_form")
	require.NoError(t, f.app.ListAdCampaigns(list))
	var listed struct {
		Campaigns []models.AdCampaign `json:"campaigns"`
	}
	testutil.ParseEnvelopeResponse(t, list, &listed)
	require.Len(t, listed.Campaigns, 1)

	// Delete the ad, then the form goes too.
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(f.call(t, f.app.DeleteAdCampaign, map[string]any{}, ad.ID.String())))
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(f.call(t, f.app.DeleteAdForm, map[string]any{}, form.ID.String())))
}

func TestApp_Ads_LeadsToContactAndEvents(t *testing.T) {
	t.Parallel()
	f := newAdsFixture(t)

	testutil.AssertErrorResponse(t, f.call(t, f.app.CreateAdLead, map[string]any{"email": "x@example.com"}, ""), fasthttp.StatusBadRequest, "name or phone")
	req := f.call(t, f.app.CreateAdLead, map[string]any{"name": "Test Lead", "phone": "+91 98200-11223"}, "")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var lead models.AdLead
	testutil.ParseEnvelopeResponse(t, req, &lead)
	assert.Equal(t, "919820011223", lead.Phone, "phone is stored as digits")

	req = f.call(t, f.app.AdLeadToContact, map[string]any{}, lead.ID.String())
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var contact models.Contact
	require.NoError(t, f.app.DB.Where("organization_id = ? AND phone_number = ?", f.org.ID, "919820011223").First(&contact).Error)
	assert.Equal(t, "Test Lead", contact.ProfileName)

	req = f.call(t, f.app.ListAdEvents, nil, "")
	var events struct {
		Events []struct {
			Name    string `json:"name"`
			Count7d int64  `json:"count_7d"`
		} `json:"events"`
	}
	testutil.ParseEnvelopeResponse(t, req, &events)
	for _, e := range events.Events {
		if e.Name == "Lead" {
			assert.Equal(t, int64(1), e.Count7d, "a new lead records a Lead event")
		}
	}
}

func TestApp_Ads_NeedsCampaignPermission(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	agentRole := testutil.CreateAgentRole(t, app.DB, org.ID)
	agent := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&agentRole.ID))

	req := testutil.NewJSONRequest(t, map[string]any{"name": "x", "type": "website"})
	testutil.SetFullAuthContext(req, org.ID, agent.ID, &agentRole.ID, false)
	require.NoError(t, app.CreateAdCampaign(req))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(req))
}
