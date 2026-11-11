package handlers_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

func TestApp_SuperAdminAuditLogs(t *testing.T) {
	e := newPayEnv(t)
	app := e.f.app

	// A plan change and a payment approval are both recorded.
	_, d := e.asAdmin(t, app.CreatePaymentCheckout, map[string]any{"plan_id": e.plan.ID.String(), "method": "upi"}, "")
	require.Equal(t, fasthttp.StatusOK, e.asSuper(t, app.SuperAdminApprovePayment, nil, d["payment_id"].(string)))
	req := e.f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"name": e.plan.Name, "price": 99}))
	testutil.SetPathParam(req, "id", e.plan.ID.String())
	require.NoError(t, app.SuperAdminUpdatePlan(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))

	list := func(params map[string]string) (int, map[string]any) {
		req := e.f.asSuperAdmin(testutil.NewGETRequest(t))
		for k, v := range params {
			testutil.SetQueryParam(req, k, v)
		}
		require.NoError(t, app.SuperAdminListAuditLogs(req))
		var out struct {
			Data map[string]any `json:"data"`
		}
		_ = json.Unmarshal(testutil.GetResponseBody(req), &out)
		return testutil.GetResponseStatusCode(req), out.Data
	}

	// Entries are written in the background.
	require.Eventually(t, func() bool {
		_, data := list(map[string]string{"organization_id": e.vendor.ID.String(), "action": "approved"})
		return data["total"] == float64(1)
	}, 3*time.Second, 50*time.Millisecond)
	_, data := list(map[string]string{"organization_id": e.vendor.ID.String(), "action": "approved"})
	row := data["audit_logs"].([]any)[0].(map[string]any)
	assert.Equal(t, "payment", row["resource_type"])
	assert.Equal(t, e.vendor.Name, row["organization_name"])

	require.Eventually(t, func() bool {
		_, data := list(map[string]string{"resource_type": "plan", "search": e.f.superAdmin.FullName})
		return data["total"].(float64) >= 1
	}, 3*time.Second, 50*time.Millisecond)
	assert.Contains(t, data["resource_types"], "payment")

	// CSV export.
	req = e.f.asSuperAdmin(testutil.NewGETRequest(t))
	testutil.SetQueryParam(req, "format", "csv")
	testutil.SetQueryParam(req, "organization_id", e.vendor.ID.String())
	require.NoError(t, app.SuperAdminListAuditLogs(req))
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	assert.Contains(t, string(testutil.GetResponseBody(req)), "Time,Workspace,User,Action")
	assert.Contains(t, string(testutil.GetResponseBody(req)), "approved")

	// Only super admins.
	member := e.f.asMember(testutil.NewGETRequest(t))
	require.NoError(t, app.SuperAdminListAuditLogs(member))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(member))
	_ = models.AuditActionApproved
}
