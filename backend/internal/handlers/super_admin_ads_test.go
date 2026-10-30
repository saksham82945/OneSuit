package handlers_test

import (
	"testing"

	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

func TestApp_SuperAdminAds(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	client := testutil.CreateTestOrganization(t, f.app.DB)
	require.NoError(t, f.app.DB.Create(&models.AdsSetup{OrganizationID: client.ID, FacebookConnected: true, PageID: "p1", PageName: "Acme Page"}).Error)
	active := models.AdCampaign{OrganizationID: client.ID, Name: "Diwali sale", Type: "click_to_whatsapp", Status: "active", Currency: "INR", Spend: 120, Leads: 4}
	draft := models.AdCampaign{OrganizationID: client.ID, Name: "Draft ad", Type: "website", Status: "draft", Currency: "INR"}
	require.NoError(t, f.app.DB.Create(&active).Error)
	require.NoError(t, f.app.DB.Create(&draft).Error)

	// Members can't see it.
	deny := f.asMember(testutil.NewGETRequest(t))
	require.NoError(t, f.app.SuperAdminListAds(deny))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(deny))

	list := f.asSuperAdmin(testutil.NewGETRequest(t))
	list.RequestCtx.QueryArgs().Set("org_id", client.ID.String())
	require.NoError(t, f.app.SuperAdminListAds(list))
	var out struct {
		Ads []struct {
			ID         string `json:"id"`
			ClientName string `json:"client_name"`
			PageName   string `json:"page_name"`
		} `json:"ads"`
		Clients []struct {
			OrganizationID string `json:"organization_id"`
			PageName       string `json:"page_name"`
			ActiveAds      int64  `json:"active_ads"`
		} `json:"clients"`
	}
	testutil.ParseEnvelopeResponse(t, list, &out)
	require.Len(t, out.Ads, 2)
	assert.Equal(t, client.Name, out.Ads[0].ClientName)
	assert.Equal(t, "Acme Page", out.Ads[0].PageName)
	found := false
	for _, c := range out.Clients {
		if c.OrganizationID == client.ID.String() {
			found = true
			assert.Equal(t, int64(1), c.ActiveAds)
		}
	}
	assert.True(t, found)

	setStatus := func(id, status string) *fasthttpReq {
		req := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"status": status}))
		testutil.SetPathParam(req, "id", id)
		require.NoError(t, f.app.SuperAdminSetAdStatus(req))
		return &fasthttpReq{code: testutil.GetResponseStatusCode(req), body: string(testutil.GetResponseBody(req))}
	}
	assert.Equal(t, fasthttp.StatusOK, setStatus(active.ID.String(), "paused").code)
	assert.Equal(t, fasthttp.StatusOK, setStatus(active.ID.String(), "active").code)
	r := setStatus(draft.ID.String(), "active")
	assert.Equal(t, fasthttp.StatusConflict, r.code)
	assert.Contains(t, r.body, "launched by the client")

	// Can't delete a running ad.
	del := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{}))
	testutil.SetPathParam(del, "id", active.ID.String())
	require.NoError(t, f.app.SuperAdminDeleteAd(del))
	assert.Equal(t, fasthttp.StatusConflict, testutil.GetResponseStatusCode(del))

	// Disconnecting the page pauses running ads.
	dis := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{}))
	testutil.SetPathParam(dis, "id", client.ID.String())
	require.NoError(t, f.app.SuperAdminDisconnectAdsPage(dis))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(dis), string(testutil.GetResponseBody(dis)))
	var ad models.AdCampaign
	require.NoError(t, f.app.DB.First(&ad, "id = ?", active.ID).Error)
	assert.Equal(t, "paused", ad.Status)
	var setup models.AdsSetup
	require.NoError(t, f.app.DB.First(&setup, "organization_id = ?", client.ID).Error)
	assert.False(t, setup.FacebookConnected)
	assert.Empty(t, setup.PageName)

	// Now it can be deleted.
	del2 := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{}))
	testutil.SetPathParam(del2, "id", active.ID.String())
	require.NoError(t, f.app.SuperAdminDeleteAd(del2))
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(del2))
}

type fasthttpReq struct {
	code int
	body string
}
