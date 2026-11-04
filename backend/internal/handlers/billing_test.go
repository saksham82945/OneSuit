package handlers_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

type billingResp struct {
	Plan *struct {
		Name   string `json:"name"`
		Status string `json:"status"`
	} `json:"plan"`
	BillingCycle      string                  `json:"billing_cycle"`
	CyclePrice        float64                 `json:"cycle_price"`
	MessagesThisMonth int64                   `json:"messages_this_month"`
	Invoices          []models.BillingInvoice `json:"invoices"`
}

func (f *superAdminFixture) billing(t *testing.T, orgID uuid.UUID) billingResp {
	t.Helper()
	req := testutil.NewGETRequest(t)
	testutil.SetFullAuthContext(req, orgID, f.superAdmin.ID, nil, true)
	require.NoError(t, f.app.GetBilling(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var out billingResp
	testutil.ParseEnvelopeResponse(t, req, &out)
	return out
}

func (f *superAdminFixture) updateVendor(t *testing.T, id uuid.UUID, body map[string]any) {
	t.Helper()
	req := f.asSuperAdmin(testutil.NewJSONRequest(t, body))
	testutil.SetPathParam(req, "id", id.String())
	require.NoError(t, f.app.SuperAdminUpdateVendor(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
}

func TestApp_Billing_InvoiceForEachPaidPlanPeriod(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	plan := f.createPlan(t, "Growth "+uuid.NewString()[:6])
	renew := time.Now().AddDate(0, 1, 0).Format("2006-01-02")

	vendor := f.createVendor(t, map[string]any{
		"name": "Billing Vendor " + uuid.NewString()[:6], "plan_id": plan.ID.String(),
		"status": "active", "renewal_date": renew, "billing_cycle": "monthly",
	})

	b := f.billing(t, vendor.ID)
	require.NotNil(t, b.Plan)
	assert.Equal(t, plan.Name, b.Plan.Name)
	assert.Equal(t, 49.0, b.CyclePrice)
	require.Len(t, b.Invoices, 1, "activating a paid plan issues an invoice")
	inv := b.Invoices[0]
	assert.Equal(t, models.InvoiceStatusPaid, inv.Status)
	assert.Equal(t, 49.0, inv.Amount)
	assert.Equal(t, "INR", inv.Currency)
	assert.Contains(t, inv.Description, plan.Name)
	assert.NotEmpty(t, inv.Number)

	// Saving without changing the plan period doesn't bill again.
	f.updateVendor(t, vendor.ID, map[string]any{"name": vendor.Name + " Ltd"})
	assert.Len(t, f.billing(t, vendor.ID).Invoices, 1)

	// Renewing for the next period issues the next invoice.
	f.updateVendor(t, vendor.ID, map[string]any{"renewal_date": time.Now().AddDate(0, 2, 0).Format("2006-01-02")})
	assert.Len(t, f.billing(t, vendor.ID).Invoices, 2)

	// A trial isn't billed.
	trial := f.createVendor(t, map[string]any{"name": "Trial Vendor " + uuid.NewString()[:6], "plan_id": plan.ID.String(), "status": "trial"})
	assert.Empty(t, f.billing(t, trial.ID).Invoices)

	// Another workspace's invoices never show.
	assert.Empty(t, f.billing(t, f.org.ID).Invoices)
}

func TestApp_Billing_ApprovedAdCreditIssuesOneInvoice(t *testing.T) {
	t.Parallel()
	f := newAdsFixture(t)
	req := f.call(t, f.app.TopupAdWallet, map[string]any{"pack": "growth"}, "")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var topup struct {
		Transaction models.AdCreditTransaction `json:"transaction"`
	}
	testutil.ParseEnvelopeResponse(t, req, &topup)

	countInvoices := func() int64 {
		var n int64
		f.app.DB.Model(&models.BillingInvoice{}).Where("organization_id = ?", f.org.ID).Count(&n)
		return n
	}
	assert.Equal(t, int64(0), countInvoices(), "a pending top-up isn't invoiced")

	super := testutil.CreateTestUser(t, f.app.DB, f.org.ID, testutil.WithSuperAdmin())
	for i := 0; i < 2; i++ {
		r := testutil.NewJSONRequest(t, map[string]any{})
		testutil.SetFullAuthContext(r, f.org.ID, super.ID, nil, true)
		testutil.SetPathParam(r, "id", topup.Transaction.ID.String())
		require.NoError(t, f.app.SuperAdminApproveAdCredit(r))
	}
	assert.Equal(t, int64(1), countInvoices())
	var inv models.BillingInvoice
	require.NoError(t, f.app.DB.Where("organization_id = ?", f.org.ID).First(&inv).Error)
	assert.Equal(t, models.InvoiceKindAdCredit, inv.Kind)
	assert.Equal(t, 10000.0, inv.Amount)
}
