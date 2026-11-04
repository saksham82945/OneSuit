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

func TestApp_PlanModulesAndCustomFeatures(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)

	// Create a plan with Ads Manager and API integration off and two custom features.
	req := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"name": "Starter " + uuid.NewString()[:6], "price": 499, "interval": "monthly",
		"max_users": 3, "max_contacts": -1, "max_accounts": 1,
		"modules": map[string]bool{"ads_manager": false, "api_integration": false, "webhooks": true},
		"custom_features": []map[string]any{
			{"name": "AI integration", "enabled": true},
			{"name": "  Priority support ", "enabled": false},
			{"name": "ai integration", "enabled": true}, // duplicate, dropped
			{"name": " ", "enabled": true},             // empty, dropped
		},
	}))
	require.NoError(t, f.app.SuperAdminCreatePlan(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var plan models.SubscriptionPlan
	testutil.ParseEnvelopeResponse(t, req, &plan)
	assert.Equal(t, models.StringArray{"AI integration"}, plan.Features, "only enabled features are listed publicly")
	require.Len(t, plan.CustomFeatures, 2)
	assert.Equal(t, false, plan.Modules["ads_manager"])

	// Unknown module keys are refused.
	bad := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"name": "Bad", "price": 1, "interval": "monthly", "modules": map[string]bool{"teleport": true}}))
	require.NoError(t, f.app.SuperAdminCreatePlan(bad))
	assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(bad))

	vendor := f.createVendor(t, map[string]any{"name": "Mod Vendor " + uuid.NewString()[:6], "plan_id": plan.ID.String(), "status": "active"})
	member := testutil.CreateTestUser(t, f.app.DB, vendor.ID)

	call := func(path string, userID uuid.UUID, super bool) int {
		r := testutil.NewGETRequest(t)
		r.RequestCtx.Request.SetRequestURI(path)
		testutil.SetFullAuthContext(r, vendor.ID, userID, nil, super)
		if f.app.PlanModuleGuard(r) == nil {
			return testutil.GetResponseStatusCode(r)
		}
		return 0 // passed through
	}
	assert.Equal(t, fasthttp.StatusForbidden, call("/api/ads/wallet", member.ID, false))
	assert.Equal(t, fasthttp.StatusForbidden, call("/api/api-keys", member.ID, false))
	assert.Equal(t, 0, call("/api/webhooks", member.ID, false), "switched on")
	assert.Equal(t, 0, call("/api/campaigns", member.ID, false), "not mentioned = on")
	assert.Equal(t, 0, call("/api/adsx", member.ID, false), "prefix must match a whole segment")
	assert.Equal(t, 0, call("/api/ads/wallet", f.superAdmin.ID, true), "super admins are never blocked")

	// The menu endpoint reports the same switches.
	r := testutil.NewGETRequest(t)
	testutil.SetAuthContext(r, vendor.ID, member.ID)
	require.NoError(t, f.app.GetPlanModules(r))
	var out struct {
		Modules map[string]bool `json:"modules"`
	}
	testutil.ParseEnvelopeResponse(t, r, &out)
	assert.False(t, out.Modules["ads_manager"])
	assert.True(t, out.Modules["campaigns"])

	// Switching Ads Manager back on takes effect immediately.
	upd := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"modules": map[string]bool{"ads_manager": true, "api_integration": false}}))
	testutil.SetPathParam(upd, "id", plan.ID.String())
	require.NoError(t, f.app.SuperAdminUpdatePlan(upd))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(upd), string(testutil.GetResponseBody(upd)))
	assert.Equal(t, 0, call("/api/ads/wallet", member.ID, false))
}
