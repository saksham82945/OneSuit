package handlers_test

import (
	"testing"

	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

func TestSubscriptionPlan_PriceFor(t *testing.T) {
	t.Parallel()
	p := models.SubscriptionPlan{Price: 1000, Interval: models.BillingIntervalMonthly,
		QuarterlyDiscount: 5, HalfYearlyDiscount: 10, YearlyDiscount: 20}
	assert.Equal(t, 1000.0, p.PriceFor("monthly"))
	assert.Equal(t, 2850.0, p.PriceFor("quarterly"))
	assert.Equal(t, 5400.0, p.PriceFor("half_yearly"))
	assert.Equal(t, 9600.0, p.PriceFor("yearly"))
	assert.Equal(t, 1000.0, p.PriceFor("weekly"), "unknown cycles bill monthly")

	legacy := models.SubscriptionPlan{Price: 12000, Interval: models.BillingIntervalYearly}
	assert.Equal(t, 1000.0, legacy.MonthlyPrice())
}

func TestApp_SuperAdmin_PlanOffersAndClientCycle(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)

	// Plans are always in rupees, whatever currency is sent.
	plan := f.createPlan(t, "Offer plan")
	assert.Equal(t, "INR", plan.Currency)

	upd := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"price": 1000, "quarterly_discount": 5, "half_yearly_discount": 10, "yearly_discount": 20,
	}))
	testutil.SetPathParam(upd, "id", plan.ID.String())
	require.NoError(t, f.app.SuperAdminUpdatePlan(upd))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(upd), string(testutil.GetResponseBody(upd)))
	testutil.ParseEnvelopeResponse(t, upd, &plan)
	assert.Equal(t, 20.0, plan.YearlyDiscount)

	bad := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"yearly_discount": 95}))
	testutil.SetPathParam(bad, "id", plan.ID.String())
	require.NoError(t, f.app.SuperAdminUpdatePlan(bad))
	testutil.AssertErrorResponse(t, bad, fasthttp.StatusBadRequest, "between 0% and 90%")

	client := f.createVendor(t, map[string]any{
		"name": "Cycle client", "owner_name": "Asha", "owner_email": "asha@cycle.test",
		"plan_id": plan.ID.String(), "status": "active", "billing_cycle": "yearly",
	})
	assert.Equal(t, "yearly", client.BillingCycle)
	assert.Equal(t, 9600.0, client.PlanAmount)

	badCycle := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"billing_cycle": "weekly"}))
	testutil.SetPathParam(badCycle, "id", client.ID.String())
	require.NoError(t, f.app.SuperAdminUpdateVendor(badCycle))
	testutil.AssertErrorResponse(t, badCycle, fasthttp.StatusBadRequest, "Billing cycle")

	// Clients created without a cycle bill monthly.
	plain := f.createVendor(t, map[string]any{"name": "Monthly client", "plan_id": plan.ID.String()})
	assert.Equal(t, "monthly", plain.BillingCycle)
	assert.Equal(t, 1000.0, plain.PlanAmount)

	// The dashboard reports revenue in INR from each client's cycle price.
	dash := f.asSuperAdmin(testutil.NewGETRequest(t))
	require.NoError(t, f.app.SuperAdminDashboard(dash))
	var out handlers.SuperAdminDashboardResponse
	testutil.ParseEnvelopeResponse(t, dash, &out)
	assert.Equal(t, "INR", out.Currency)
	for _, p := range out.Plans {
		if p.ID == plan.ID {
			assert.Equal(t, 2850.0, p.QuarterlyPrice)
			assert.Equal(t, 9600.0, p.YearlyPrice)
		}
	}
}
