package handlers_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

type adWalletResp struct {
	Balance             float64 `json:"balance"`
	Currency            string  `json:"currency"`
	FreeGenerationsLeft int     `json:"free_generations_left"`
	PendingAmount       float64 `json:"pending_amount"`
	Transactions        []struct {
		ID     uuid.UUID `json:"id"`
		Amount float64   `json:"amount"`
		Status string    `json:"status"`
	} `json:"transactions"`
}

func TestApp_Ads_WalletTopupStaysPending(t *testing.T) {
	t.Parallel()
	f := newAdsFixture(t)

	req := f.call(t, f.app.GetAdWallet, nil, "")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var w adWalletResp
	testutil.ParseEnvelopeResponse(t, req, &w)
	assert.Equal(t, 0.0, w.Balance)
	assert.Equal(t, "INR", w.Currency)
	assert.Equal(t, 5, w.FreeGenerationsLeft)

	testutil.AssertErrorResponse(t, f.call(t, f.app.TopupAdWallet, map[string]any{"amount": 10}, ""), fasthttp.StatusBadRequest, "Amount must be")
	testutil.AssertErrorResponse(t, f.call(t, f.app.TopupAdWallet, map[string]any{"pack": "gold"}, ""), fasthttp.StatusBadRequest, "Pack")

	req = f.call(t, f.app.TopupAdWallet, map[string]any{"pack": "growth"}, "")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var topup struct {
		Message     string                     `json:"message"`
		Transaction models.AdCreditTransaction `json:"transaction"`
	}
	testutil.ParseEnvelopeResponse(t, req, &topup)
	assert.Contains(t, topup.Message, "contact you")
	assert.Equal(t, "pending", topup.Transaction.Status)
	assert.Equal(t, 10000.0, topup.Transaction.Amount)

	req = f.call(t, f.app.GetAdWallet, nil, "")
	testutil.ParseEnvelopeResponse(t, req, &w)
	assert.Equal(t, 0.0, w.Balance, "a pending top-up does not add credit")
	assert.Equal(t, 10000.0, w.PendingAmount)
	require.Len(t, w.Transactions, 1)

	// Only a super admin can approve; approval credits the balance once.
	testutil.AssertErrorResponse(t, f.call(t, f.app.SuperAdminApproveAdCredit, map[string]any{}, topup.Transaction.ID.String()), fasthttp.StatusForbidden, "Super admin")
	super := testutil.CreateTestUser(t, f.app.DB, f.org.ID, testutil.WithSuperAdmin())
	approve := func() *fasthttp.RequestCtx {
		r := testutil.NewJSONRequest(t, map[string]any{})
		testutil.SetFullAuthContext(r, f.org.ID, super.ID, nil, true)
		testutil.SetPathParam(r, "id", topup.Transaction.ID.String())
		require.NoError(t, f.app.SuperAdminApproveAdCredit(r))
		return r.RequestCtx
	}
	assert.Equal(t, fasthttp.StatusOK, approve().Response.StatusCode())
	assert.Equal(t, fasthttp.StatusConflict, approve().Response.StatusCode())

	req = f.call(t, f.app.GetAdWallet, nil, "")
	testutil.ParseEnvelopeResponse(t, req, &w)
	assert.Equal(t, 10000.0, w.Balance)
	assert.Equal(t, 0.0, w.PendingAmount)
}

func TestApp_Ads_GenerateUsesFreeGenerations(t *testing.T) {
	t.Parallel()
	f := newAdsFixture(t)

	testutil.AssertErrorResponse(t, f.call(t, f.app.GenerateAds, map[string]any{"business_name": " "}, ""), fasthttp.StatusBadRequest, "Business name")
	testutil.AssertErrorResponse(t, f.call(t, f.app.GenerateAds, map[string]any{"business_name": "Test Cafe", "website_url": "ftp://x"}, ""), fasthttp.StatusBadRequest, "Website URL")
	testutil.AssertErrorResponse(t, f.call(t, f.app.GenerateAds, map[string]any{"business_name": "Test Cafe", "count": 6}, ""), fasthttp.StatusBadRequest, "between 1 and 5")
	testutil.AssertErrorResponse(t, f.call(t, f.app.GenerateAds, map[string]any{"business_name": "Test Cafe", "size": "2:1"}, ""), fasthttp.StatusBadRequest, "Size")

	var out struct {
		Variants []struct {
			Headline          string `json:"headline"`
			PrimaryText       string `json:"primary_text"`
			CTA               string `json:"cta"`
			SuggestedAdType   string `json:"suggested_ad_type"`
			SuggestedAudience string `json:"suggested_audience"`
		} `json:"variants"`
		FreeGenerationsLeft int `json:"free_generations_left"`
	}
	for i := 0; i < 5; i++ {
		req := f.call(t, f.app.GenerateAds, map[string]any{
			"business_name": "Test Cafe", "website_url": "https://testcafe.example.com", "audience": "coffee lovers",
			"ad_type": "auto", "media_type": "image", "size": "1:1", "count": 3,
		}, "")
		require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
		testutil.ParseEnvelopeResponse(t, req, &out)
		assert.Equal(t, 4-i, out.FreeGenerationsLeft)
	}
	require.Len(t, out.Variants, 3)
	assert.NotEqual(t, out.Variants[0].Headline, out.Variants[1].Headline)
	assert.NotEqual(t, out.Variants[0].SuggestedAdType, out.Variants[1].SuggestedAdType, "auto mode varies the objective")
	assert.Contains(t, out.Variants[0].PrimaryText, "Test Cafe")
	assert.Equal(t, "coffee lovers", out.Variants[0].SuggestedAudience)

	testutil.AssertErrorResponse(t, f.call(t, f.app.GenerateAds, map[string]any{"business_name": "Test Cafe"}, ""), fasthttp.StatusPaymentRequired, "free AI ad generations")
}

func TestApp_Ads_SummaryFetchedAndSync(t *testing.T) {
	t.Parallel()
	f := newAdsFixture(t)

	req := f.call(t, f.app.AdsSummary, nil, "")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var sum map[string]any
	testutil.ParseEnvelopeResponse(t, req, &sum)
	for _, k := range []string{"leads", "ctr", "cost_per_lead", "total_spend", "capi_signals"} {
		assert.EqualValues(t, 0, sum[k], k)
	}

	// A lead counts, and records a CAPI signal.
	f.call(t, f.app.CreateAdLead, map[string]any{"name": "Test Lead", "phone": "919820011223"}, "")
	list := testutil.NewGETRequest(t)
	testutil.SetFullAuthContext(list, f.org.ID, f.admin.ID, &f.role.ID, false)
	testutil.SetQueryParam(list, "from", "2000-01-01")
	require.NoError(t, f.app.AdsSummary(list))
	testutil.ParseEnvelopeResponse(t, list, &sum)
	assert.EqualValues(t, 1, sum["leads"])
	assert.EqualValues(t, 1, sum["capi_signals"])

	req = f.call(t, f.app.ListFetchedAds, nil, "")
	var fetched struct {
		Ads           []any `json:"ads"`
		MetaConnected bool  `json:"meta_connected"`
	}
	testutil.ParseEnvelopeResponse(t, req, &fetched)
	assert.Empty(t, fetched.Ads)
	assert.False(t, fetched.MetaConnected)

	testutil.AssertErrorResponse(t, f.call(t, f.app.SyncAds, map[string]any{}, ""), fasthttp.StatusConflict, "Connect your Facebook account first")
}

func TestApp_Ads_EventDefinitions(t *testing.T) {
	t.Parallel()
	f := newAdsFixture(t)

	testutil.AssertErrorResponse(t, f.call(t, f.app.CreateAdEventDefinition, map[string]any{"name": "bad name"}, ""), fasthttp.StatusBadRequest, "letters, numbers")
	testutil.AssertErrorResponse(t, f.call(t, f.app.CreateAdEventDefinition, map[string]any{"name": "Booked", "source": "tv"}, ""), fasthttp.StatusBadRequest, "Source")
	req := f.call(t, f.app.CreateAdEventDefinition, map[string]any{"name": "Booked_Demo", "description": "Demo booked", "source": "website"}, "")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var def struct {
		ID   uuid.UUID `json:"id"`
		Name string    `json:"name"`
	}
	testutil.ParseEnvelopeResponse(t, req, &def)
	testutil.AssertErrorResponse(t, f.call(t, f.app.CreateAdEventDefinition, map[string]any{"name": "booked_demo"}, ""), fasthttp.StatusConflict, "already exists")

	testutil.AssertErrorResponse(t, f.call(t, f.app.RecordAdEvent, map[string]any{"event_name": "Nope"}, ""), fasthttp.StatusBadRequest, "Unknown event")
	req = f.call(t, f.app.RecordAdEvent, map[string]any{"event_name": "Booked_Demo", "value": 99}, "")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))

	req = f.call(t, f.app.ListAdEventDefinitions, nil, "")
	var list struct {
		Events []struct {
			Name       string `json:"name"`
			CountToday int64  `json:"count_today"`
			Count30d   int64  `json:"count_30d"`
		} `json:"events"`
	}
	testutil.ParseEnvelopeResponse(t, req, &list)
	require.Len(t, list.Events, 1)
	assert.Equal(t, int64(1), list.Events[0].CountToday)
	assert.Equal(t, int64(1), list.Events[0].Count30d)

	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(f.call(t, f.app.DeleteAdEventDefinition, map[string]any{}, def.ID.String())))
	req = f.call(t, f.app.ListAdEventDefinitions, nil, "")
	testutil.ParseEnvelopeResponse(t, req, &list)
	assert.Empty(t, list.Events)
	// The name can be reused after deleting.
	req = f.call(t, f.app.CreateAdEventDefinition, map[string]any{"name": "Booked_Demo"}, "")
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
}

func TestApp_Ads_AudienceTypeFilter(t *testing.T) {
	t.Parallel()
	f := newAdsFixture(t)

	testutil.AssertErrorResponse(t, f.call(t, f.app.CreateAdAudience, map[string]any{"name": "x", "source": "all_contacts", "type": "tv"}, ""), fasthttp.StatusBadRequest, "Audience type")
	for _, a := range []map[string]any{
		{"name": "Test Custom", "source": "all_contacts"},
		{"name": "Test Lookalike", "source": "leads", "type": "lookalike"},
		{"name": "Test Website", "source": "all_contacts", "type": "website"},
	} {
		req := f.call(t, f.app.CreateAdAudience, a, "")
		require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	}
	listType := func(typ string) []string {
		r := testutil.NewGETRequest(t)
		testutil.SetFullAuthContext(r, f.org.ID, f.admin.ID, &f.role.ID, false)
		if typ != "" {
			testutil.SetQueryParam(r, "type", typ)
		}
		require.NoError(t, f.app.ListAdAudiences(r))
		var out struct {
			Audiences []struct {
				Name string `json:"name"`
				Type string `json:"type"`
			} `json:"audiences"`
		}
		testutil.ParseEnvelopeResponse(t, r, &out)
		names := []string{}
		for _, a := range out.Audiences {
			names = append(names, a.Name+":"+a.Type)
		}
		return names
	}
	assert.Len(t, listType(""), 3)
	assert.Equal(t, []string{"Test Custom:custom"}, listType("custom"))
	assert.Equal(t, []string{"Test Lookalike:lookalike"}, listType("lookalike"))
	assert.Equal(t, []string{"Test Website:website"}, listType("website"))

	req := f.call(t, f.app.ListFetchedAudiences, nil, "")
	var fetched struct {
		Audiences     []any `json:"audiences"`
		MetaConnected bool  `json:"meta_connected"`
	}
	testutil.ParseEnvelopeResponse(t, req, &fetched)
	assert.Empty(t, fetched.Audiences)
	assert.False(t, fetched.MetaConnected)
}
