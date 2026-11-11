package handlers_test

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

type payEnv struct {
	f      *superAdminFixture
	plan   models.SubscriptionPlan
	vendor handlers.VendorResponse
	admin  *models.User
}

func newPayEnv(t *testing.T) *payEnv {
	t.Helper()
	f := newSuperAdminFixture(t)
	plan := f.createPlan(t, "Pay "+uuid.NewString()[:6]) // ₹49 / month
	vendor := f.createVendor(t, map[string]any{"name": "Payer " + uuid.NewString()[:6], "plan_id": plan.ID.String(), "status": "pending_payment"})
	admin := createAdminUser(t, f.app, vendor.ID)
	return &payEnv{f: f, plan: plan, vendor: vendor, admin: admin}
}

func (e *payEnv) asAdmin(t *testing.T, fn func(*fastglue.Request) error, body any, id string) (int, map[string]any) {
	t.Helper()
	req := testutil.NewJSONRequest(t, body)
	testutil.SetAuthContext(req, e.vendor.ID, e.admin.ID)
	if id != "" {
		testutil.SetPathParam(req, "id", id)
	}
	require.NoError(t, fn(req))
	var out struct {
		Data map[string]any `json:"data"`
	}
	_ = json.Unmarshal(testutil.GetResponseBody(req), &out)
	return testutil.GetResponseStatusCode(req), out.Data
}

func (e *payEnv) asSuper(t *testing.T, fn func(*fastglue.Request) error, body any, id string) int {
	t.Helper()
	req := e.f.asSuperAdmin(testutil.NewJSONRequest(t, body))
	if id != "" {
		testutil.SetPathParam(req, "id", id)
	}
	require.NoError(t, fn(req))
	return testutil.GetResponseStatusCode(req)
}

func (e *payEnv) subscription(t *testing.T) models.OrganizationSubscription {
	t.Helper()
	var sub models.OrganizationSubscription
	require.NoError(t, e.f.app.DB.Where("organization_id = ?", e.vendor.ID).First(&sub).Error)
	return sub
}

func (e *payEnv) invoices(t *testing.T) []models.BillingInvoice {
	t.Helper()
	var inv []models.BillingInvoice
	e.f.app.DB.Where("organization_id = ?", e.vendor.ID).Find(&inv)
	return inv
}

func TestApp_Payments_UPIApproveActivatesPlan(t *testing.T) {
	e := newPayEnv(t)
	code, data := e.asAdmin(t, e.f.app.CreatePaymentCheckout, map[string]any{"plan_id": e.plan.ID.String(), "billing_cycle": "monthly", "method": "upi"}, "")
	require.Equal(t, fasthttp.StatusOK, code, data)
	id := data["payment_id"].(string)
	upi := data["upi"].(map[string]any)
	assert.Equal(t, "8999305629@kotak811", upi["upi_id"], "default UPI ID")
	assert.Contains(t, upi["uri"], "upi://pay?pa=8999305629@kotak811&")
	assert.Contains(t, upi["uri"], "am=49.00")

	code, _ = e.asAdmin(t, e.f.app.SubmitUPIPayment, map[string]any{"reference": "12"}, id)
	assert.Equal(t, fasthttp.StatusBadRequest, code, "too short")
	ref := "UTR" + uuid.NewString()[:9]
	code, data = e.asAdmin(t, e.f.app.SubmitUPIPayment, map[string]any{"reference": ref}, id)
	require.Equal(t, fasthttp.StatusOK, code, data)
	assert.Equal(t, models.PaymentStatusPendingVerification, data["status"])

	// The same UTR can't be used for a second payment.
	_, d2 := e.asAdmin(t, e.f.app.CreatePaymentCheckout, map[string]any{"plan_id": e.plan.ID.String(), "method": "upi"}, "")
	code, _ = e.asAdmin(t, e.f.app.SubmitUPIPayment, map[string]any{"reference": ref}, d2["payment_id"].(string))
	assert.Equal(t, fasthttp.StatusConflict, code)

	// Only the super admin approves.
	code, _ = e.asAdmin(t, e.f.app.SuperAdminApprovePayment, nil, id)
	assert.Equal(t, fasthttp.StatusForbidden, code)
	require.Equal(t, fasthttp.StatusOK, e.asSuper(t, e.f.app.SuperAdminApprovePayment, nil, id))
	require.Equal(t, fasthttp.StatusOK, e.asSuper(t, e.f.app.SuperAdminApprovePayment, nil, id), "approving twice is harmless")

	sub := e.subscription(t)
	assert.Equal(t, models.VendorStatusActive, sub.Status)
	require.NotNil(t, sub.RenewalDate)
	assert.WithinDuration(t, time.Now().AddDate(0, 1, 0), *sub.RenewalDate, time.Minute)
	inv := e.invoices(t)
	require.Len(t, inv, 1, "one invoice for one payment")
	assert.Equal(t, 49.0, inv[0].Amount)
	assert.Contains(t, inv[0].Description, "UPI")

	// Paying again extends from the current renewal date.
	_, d3 := e.asAdmin(t, e.f.app.CreatePaymentCheckout, map[string]any{"plan_id": e.plan.ID.String(), "method": "upi"}, "")
	_, _ = e.asAdmin(t, e.f.app.SubmitUPIPayment, map[string]any{"reference": "UTR" + uuid.NewString()[:9]}, d3["payment_id"].(string))
	require.Equal(t, fasthttp.StatusOK, e.asSuper(t, e.f.app.SuperAdminApprovePayment, nil, d3["payment_id"].(string)))
	assert.WithinDuration(t, sub.RenewalDate.AddDate(0, 1, 0), *e.subscription(t).RenewalDate, time.Minute)

	// Reject works only on pending payments.
	_, d4 := e.asAdmin(t, e.f.app.CreatePaymentCheckout, map[string]any{"plan_id": e.plan.ID.String(), "method": "upi"}, "")
	assert.Equal(t, fasthttp.StatusConflict, e.asSuper(t, e.f.app.SuperAdminRejectPayment, map[string]any{"reason": "x"}, d4["payment_id"].(string)))
	_, _ = e.asAdmin(t, e.f.app.SubmitUPIPayment, map[string]any{"reference": "UTR" + uuid.NewString()[:9]}, d4["payment_id"].(string))
	assert.Equal(t, fasthttp.StatusOK, e.asSuper(t, e.f.app.SuperAdminRejectPayment, map[string]any{"reason": "Not received"}, d4["payment_id"].(string)))
	var rejected models.Payment
	e.f.app.DB.First(&rejected, "id = ?", d4["payment_id"])
	assert.Equal(t, models.PaymentStatusRejected, rejected.Status)
	assert.Equal(t, "Not received", rejected.FailureReason)
}

func sign(secret, msg string) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(msg))
	return hex.EncodeToString(m.Sum(nil))
}

// Not parallel: it points the shared Razorpay API address at a fake server.
func TestApp_Payments_RazorpayCheckoutVerifyAndWebhook(t *testing.T) {
	var gotAuthUser string
	var gotAmount float64
	orderID := "order_" + uuid.NewString()[:12]
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuthUser, _, _ = r.BasicAuth()
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		gotAmount, _ = body["amount"].(float64)
		_, _ = w.Write([]byte(`{"id":"` + orderID + `","status":"created"}`))
	}))
	defer srv.Close()
	old := handlers.RazorpayAPIBase
	handlers.RazorpayAPIBase = srv.URL
	defer func() { handlers.RazorpayAPIBase = old }()

	e := newPayEnv(t)
	const keySecret, hookSecret = "test_key_secret", "test_webhook_secret"
	require.Equal(t, fasthttp.StatusOK, e.asSuper(t, e.f.app.SuperAdminUpdatePaymentSettings, map[string]any{
		"razorpay_enabled": true, "razorpay_key_id": "rzp_test_FAKE", "razorpay_key_secret": keySecret, "razorpay_webhook_secret": hookSecret,
	}, ""))
	t.Cleanup(func() {
		e.asSuper(t, e.f.app.SuperAdminUpdatePaymentSettings, map[string]any{"razorpay_enabled": false, "razorpay_key_id": "", "razorpay_key_secret": "", "razorpay_webhook_secret": ""}, "")
	})

	code, data := e.asAdmin(t, e.f.app.CreatePaymentCheckout, map[string]any{"plan_id": e.plan.ID.String(), "billing_cycle": "monthly", "method": "razorpay"}, "")
	require.Equal(t, fasthttp.StatusOK, code, data)
	rz := data["razorpay"].(map[string]any)
	assert.Equal(t, orderID, rz["order_id"])
	assert.Equal(t, "rzp_test_FAKE", rz["key_id"])
	assert.Equal(t, "rzp_test_FAKE", gotAuthUser)
	assert.Equal(t, 4900.0, gotAmount, "amount in paise")
	id := data["payment_id"].(string)

	// A forged signature is refused.
	code, _ = e.asAdmin(t, e.f.app.VerifyRazorpayPayment, map[string]any{
		"razorpay_order_id": orderID, "razorpay_payment_id": "pay_1", "razorpay_signature": sign("wrong", orderID+"|pay_1"),
	}, id)
	assert.Equal(t, fasthttp.StatusBadRequest, code)
	assert.Empty(t, e.invoices(t))

	code, data = e.asAdmin(t, e.f.app.VerifyRazorpayPayment, map[string]any{
		"razorpay_order_id": orderID, "razorpay_payment_id": "pay_1", "razorpay_signature": sign(keySecret, orderID+"|pay_1"),
	}, id)
	require.Equal(t, fasthttp.StatusOK, code, data)
	assert.Equal(t, models.PaymentStatusPaid, data["status"])
	assert.Equal(t, models.VendorStatusActive, e.subscription(t).Status)

	// The webhook for the same order arrives too: still one invoice.
	webhook := func(body, sig string) int {
		req := testutil.NewRequest(t)
		req.RequestCtx.Request.Header.SetMethod("POST")
		req.RequestCtx.Request.SetBody([]byte(body))
		req.RequestCtx.Request.Header.Set("X-Razorpay-Signature", sig)
		require.NoError(t, e.f.app.RazorpayWebhook(req))
		return testutil.GetResponseStatusCode(req)
	}
	evt := `{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1","order_id":"` + orderID + `","status":"captured"}}}}`
	assert.Equal(t, fasthttp.StatusUnauthorized, webhook(evt, sign("nope", evt)))
	assert.Equal(t, fasthttp.StatusOK, webhook(evt, sign(hookSecret, evt)))
	assert.Len(t, e.invoices(t), 1)

	// A webhook alone (customer closed the tab before verify) activates the plan.
	orderID = "order_" + uuid.NewString()[:12]
	_, d2 := e.asAdmin(t, e.f.app.CreatePaymentCheckout, map[string]any{"plan_id": e.plan.ID.String(), "method": "razorpay"}, "")
	evt2 := `{"event":"order.paid","payload":{"payment":{"entity":{"id":"pay_2","order_id":"` + orderID + `"}},"order":{"entity":{"id":"` + orderID + `"}}}}`
	assert.Equal(t, fasthttp.StatusOK, webhook(evt2, sign(hookSecret, evt2)))
	var p2 models.Payment
	e.f.app.DB.First(&p2, "id = ?", d2["payment_id"])
	assert.Equal(t, models.PaymentStatusPaid, p2.Status)
	assert.Equal(t, "pay_2", p2.RazorpayPaymentID)
	assert.Len(t, e.invoices(t), 2)

	// Events for orders that aren't ours are acknowledged and ignored.
	other := `{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_x","order_id":"order_unknown"}}}}`
	assert.Equal(t, fasthttp.StatusOK, webhook(other, sign(hookSecret, other)))

	// Settings never expose the secrets.
	req := e.f.asSuperAdmin(testutil.NewGETRequest(t))
	require.NoError(t, e.f.app.SuperAdminGetPaymentSettings(req))
	body := string(testutil.GetResponseBody(req))
	assert.NotContains(t, body, keySecret)
	assert.NotContains(t, body, hookSecret)
	assert.Contains(t, body, `"has_razorpay_secret":true`)
	assert.Contains(t, body, "/razorpay/order-payment-razorpay-webhook")
}

func TestApp_PendingPaymentGuard(t *testing.T) {
	e := newPayEnv(t) // the vendor is pending_payment
	call := func(method, path string) int {
		r := testutil.NewGETRequest(t)
		r.RequestCtx.Request.Header.SetMethod(method)
		r.RequestCtx.Request.SetRequestURI(path)
		testutil.SetAuthContext(r, e.vendor.ID, e.admin.ID)
		if e.f.app.PendingPaymentGuard(r) == nil {
			return testutil.GetResponseStatusCode(r)
		}
		return 0
	}
	// Explore mode: reads go through, changes need a paid plan.
	assert.Equal(t, 0, call("GET", "/api/contacts"))
	assert.Equal(t, 0, call("GET", "/api/whatsapp-accounts"))
	assert.Equal(t, fasthttp.StatusPaymentRequired, call("POST", "/api/contacts"))
	assert.Equal(t, fasthttp.StatusPaymentRequired, call("PUT", "/api/contacts/x"))
	assert.Equal(t, fasthttp.StatusPaymentRequired, call("DELETE", "/api/contacts/x"))
	assert.Equal(t, fasthttp.StatusPaymentRequired, call("POST", "/api/whatsapp-accounts"))
	assert.Equal(t, fasthttp.StatusPaymentRequired, call("POST", "/api/messages"), "/api/me must not match /api/messages")
	assert.Equal(t, fasthttp.StatusPaymentRequired, call("POST", "/api/media"))
	// Paying, signing out and the user's own account stay open.
	assert.Equal(t, 0, call("POST", "/api/payments/checkout"))
	assert.Equal(t, 0, call("POST", "/api/auth/logout"))
	assert.Equal(t, 0, call("PUT", "/api/me/settings"))
	assert.Equal(t, 0, call("PUT", "/api/me/password"))
	assert.Equal(t, 0, call("POST", "/api/support-tickets"))
	assert.Equal(t, 0, call("GET", "/api/me"))
	assert.Equal(t, 0, call("GET", "/api/public/plans"))

	// The 402 says what to do.
	r := testutil.NewGETRequest(t)
	r.RequestCtx.Request.Header.SetMethod("POST")
	r.RequestCtx.Request.SetRequestURI("/api/campaigns")
	testutil.SetAuthContext(r, e.vendor.ID, e.admin.ID)
	require.Nil(t, e.f.app.PendingPaymentGuard(r))
	assert.Contains(t, string(r.RequestCtx.Response.Body()), "exploring OneSuit")

	// Paying unlocks everything.
	_, d := e.asAdmin(t, e.f.app.CreatePaymentCheckout, map[string]any{"plan_id": e.plan.ID.String(), "method": "upi"}, "")
	_, _ = e.asAdmin(t, e.f.app.SubmitUPIPayment, map[string]any{"reference": "UTR" + uuid.NewString()[:9]}, d["payment_id"].(string))
	require.Equal(t, fasthttp.StatusOK, e.asSuper(t, e.f.app.SuperAdminApprovePayment, nil, d["payment_id"].(string)))
	assert.Equal(t, 0, call("POST", "/api/contacts"))
}
