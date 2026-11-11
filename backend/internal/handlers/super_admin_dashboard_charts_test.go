package handlers_test

import (
	"math/rand"
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

func superAdminCharts(t *testing.T, f *superAdminFixture, from, to string) (*fastglue.Request, handlers.SuperAdminChartsResponse) {
	t.Helper()
	req := f.asSuperAdmin(testutil.NewGETRequest(t))
	if from != "" {
		req.RequestCtx.QueryArgs().Set("from", from)
	}
	if to != "" {
		req.RequestCtx.QueryArgs().Set("to", to)
	}
	require.NoError(t, f.app.SuperAdminDashboardCharts(req))
	var resp handlers.SuperAdminChartsResponse
	if testutil.GetResponseStatusCode(req) == fasthttp.StatusOK {
		testutil.ParseEnvelopeResponse(t, req, &resp)
	}
	return req, resp
}

func TestApp_SuperAdminDashboardCharts(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	db := f.app.DB

	// A random day long ago, so rows from other tests can't land in the window.
	day := time.Date(2001, 1, 1, 12, 0, 0, 0, time.UTC).AddDate(0, 0, rand.Intn(3000))
	dayS := day.Format("2006-01-02")

	clientA := testutil.CreateTestOrganization(t, db)
	clientB := testutil.CreateTestOrganization(t, db)
	planID := uuid.New()

	// Razorpay payment with its invoice: counted once, as razorpay.
	inv := models.BillingInvoice{
		OrganizationID: clientA.ID, Number: "T-" + uuid.NewString()[:12], Kind: models.InvoiceKindSubscription,
		Description: "Pro", Amount: 1000, Currency: "INR", Status: models.InvoiceStatusPaid, IssuedAt: day, PaidAt: &day,
	}
	require.NoError(t, db.Create(&inv).Error)
	pay := func(org uuid.UUID, amount float64, method, status string, invoiceID *uuid.UUID) {
		p := models.Payment{
			BaseModel:      models.BaseModel{CreatedAt: day},
			OrganizationID: org, PlanID: planID, BillingCycle: "monthly", Amount: amount, Currency: "INR",
			Method: method, Status: status, InvoiceID: invoiceID,
		}
		if status == models.PaymentStatusPaid {
			p.PaidAt = &day
		}
		require.NoError(t, db.Create(&p).Error)
	}
	pay(clientA.ID, 1000, models.PaymentMethodRazorpay, models.PaymentStatusPaid, &inv.ID)
	// Paid UPI payment whose invoice wasn't made: still counted.
	pay(clientA.ID, 500, models.PaymentMethodUPI, models.PaymentStatusPaid, nil)
	// Waiting for approval: in the funnel, not revenue.
	pay(clientB.ID, 700, models.PaymentMethodUPI, models.PaymentStatusPendingVerification, nil)
	// Invoice raised by the platform team with no payment: manual.
	require.NoError(t, db.Create(&models.BillingInvoice{
		OrganizationID: clientB.ID, Number: "T-" + uuid.NewString()[:12], Kind: models.InvoiceKindSubscription,
		Description: "Manual", Amount: 300, Currency: "INR", Status: models.InvoiceStatusPaid, IssuedAt: day, PaidAt: &day,
	}).Error)

	contactA := testutil.CreateTestContact(t, db, clientA.ID)
	contactB := testutil.CreateTestContact(t, db, clientB.ID)
	for i := 0; i < 3; i++ {
		createTestMessage(t, f.app, clientA.ID, contactA.ID, models.DirectionOutgoing, day)
	}
	createTestMessage(t, f.app, clientA.ID, contactA.ID, models.DirectionIncoming, day)
	createTestMessage(t, f.app, clientB.ID, contactB.ID, models.DirectionIncoming, day)

	solved := day.Add(time.Hour)
	require.NoError(t, db.Create(&models.SupportTicket{
		BaseModel: models.BaseModel{CreatedAt: day}, OrganizationID: clientA.ID, Subject: "Help",
		Priority: models.TicketPriorityLow, Status: models.TicketStatusSolved, SolvedAt: &solved,
	}).Error)

	req, resp := superAdminCharts(t, f, dayS, dayS)
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))

	assert.Equal(t, "day", resp.Granularity)
	require.Len(t, resp.Revenue, 1)
	assert.Equal(t, dayS, resp.Revenue[0].Bucket)
	assert.InDelta(t, 1000, resp.Revenue[0].Razorpay, 0.01)
	assert.InDelta(t, 500, resp.Revenue[0].UPI, 0.01)
	assert.InDelta(t, 300, resp.Revenue[0].Manual, 0.01)
	assert.InDelta(t, 1800, resp.KPIs.RevenueCollected.Value, 0.01, "no double counting of invoiced payments")
	assert.Equal(t, float64(3), resp.KPIs.PaidPayments.Value)
	require.NotNil(t, resp.KPIs.RevenueCollected.Previous)
	assert.Zero(t, *resp.KPIs.RevenueCollected.Previous)

	assert.Equal(t, int64(3), resp.PaymentFunnel.Started)
	assert.Equal(t, int64(2), resp.PaymentFunnel.Paid)
	assert.Equal(t, int64(1), resp.PaymentFunnel.PendingVerification)

	require.Len(t, resp.Messages, 1)
	assert.Equal(t, int64(3), resp.Messages[0].Sent)
	assert.Equal(t, int64(2), resp.Messages[0].Received)
	assert.Equal(t, float64(5), resp.KPIs.Messages.Value)
	require.Len(t, resp.TopClients, 2)
	assert.Equal(t, clientA.ID, resp.TopClients[0].ID)
	assert.Equal(t, int64(4), resp.TopClients[0].Messages)

	require.Len(t, resp.Tickets, 1)
	assert.Equal(t, int64(1), resp.Tickets[0].Opened)
	assert.Equal(t, int64(1), resp.Tickets[0].Solved)

	// Current-state breakdowns include the new clients.
	assert.GreaterOrEqual(t, resp.KPIs.TotalClients.Value, float64(2))
	assert.NotEmpty(t, resp.ClientsByStatus)
	assert.NotEmpty(t, resp.ClientsByPlan)
}

func TestApp_SuperAdminDashboardCharts_Ranges(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)

	req, resp := superAdminCharts(t, f, "", "")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	assert.Equal(t, "day", resp.Granularity)
	assert.Len(t, resp.Signups, 30)
	assert.Len(t, resp.MRRTrend, 30)

	req, resp = superAdminCharts(t, f, "2024-01-01", "2024-12-31")
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	assert.Equal(t, "month", resp.Granularity)
	assert.Len(t, resp.Revenue, 12)
	assert.Equal(t, "2022-12-31", resp.PrevFrom)

	for _, bad := range [][2]string{{"2024-02-01", "2024-01-01"}, {"nope", ""}, {"2020-01-01", "2024-01-01"}} {
		req, _ = superAdminCharts(t, f, bad[0], bad[1])
		assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(req), bad)
	}

	member := f.asMember(testutil.NewGETRequest(t))
	require.NoError(t, f.app.SuperAdminDashboardCharts(member))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(member))
}
