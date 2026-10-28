package handlers_test

import (
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/database"
	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

var (
	demoOnce sync.Once
	demoID   uuid.UUID
	demoErr  error
)

// ensureDemo creates the shared demo workspace once for the whole test run.
func ensureDemo(t *testing.T, app *handlers.App) uuid.UUID {
	t.Helper()
	demoOnce.Do(func() {
		testutil.GetOrCreateTestPermissions(t, app.DB)
		demoID, demoErr = database.EnsureDemoWorkspace(app.DB)
	})
	require.NoError(t, demoErr)
	return demoID
}

func explore(t *testing.T, app *handlers.App) (*fastglue.Request, authPayload) {
	t.Helper()
	req := testutil.NewJSONRequest(t, map[string]any{
		"full_name": "Eve Explorer", "email": testutil.UniqueEmail("explorer"), "password": "explore-pass-1",
	})
	require.NoError(t, app.Explore(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var resp authPayload
	testutil.ParseEnvelopeResponse(t, req, &resp)
	return req, resp
}

func guardRequest(t *testing.T, method, path string, orgID, userID uuid.UUID) *fastglue.Request {
	t.Helper()
	req := testutil.NewJSONRequest(t, map[string]any{})
	req.RequestCtx.Request.Header.SetMethod(method)
	req.RequestCtx.Request.SetRequestURI(path)
	testutil.SetAuthContext(req, orgID, userID)
	return req
}

func TestApp_Explore_CreatesReadOnlyDemoAccount(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	demo := ensureDemo(t, app)

	_, resp := explore(t, app)
	assert.Equal(t, demo, resp.User.OrganizationID, "explorers land in the demo workspace")
	require.NotNil(t, resp.User.Role)
	assert.Equal(t, database.ExplorerRoleName, resp.User.Role.Name)

	// The demo workspace has sample data to look at.
	var contacts int64
	app.DB.Model(&models.Contact{}).Where("organization_id = ?", demo).Count(&contacts)
	assert.Greater(t, contacts, int64(0))

	// Changes are blocked, reading isn't.
	assert.Nil(t, app.DemoReadOnlyGuard(guardRequest(t, "POST", "/api/contacts", demo, resp.User.ID)), "create blocked")
	assert.Nil(t, app.DemoReadOnlyGuard(guardRequest(t, "DELETE", "/api/templates/x", demo, resp.User.ID)), "delete blocked")
	assert.NotNil(t, app.DemoReadOnlyGuard(guardRequest(t, "GET", "/api/contacts", demo, resp.User.ID)), "reading allowed")
	assert.NotNil(t, app.DemoReadOnlyGuard(guardRequest(t, "POST", "/api/subscribe", demo, resp.User.ID)), "upgrading allowed")
	blocked := guardRequest(t, "PUT", "/api/contacts/x", demo, resp.User.ID)
	app.DemoReadOnlyGuard(blocked)
	testutil.AssertErrorResponse(t, blocked, fasthttp.StatusForbidden, "demo workspace")
}

func TestApp_DemoGuard_OnlyAffectsTheDemoWorkspace(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	demo := ensureDemo(t, f.app)

	// A normal business's own changes go through.
	assert.NotNil(t, f.app.DemoReadOnlyGuard(guardRequest(t, "POST", "/api/contacts", f.org.ID, f.member.ID)))
	// A super admin may change the demo workspace.
	assert.NotNil(t, f.app.DemoReadOnlyGuard(guardRequest(t, "POST", "/api/contacts", demo, f.superAdmin.ID)))
}

func TestApp_Subscribe_TurnsExplorerIntoBusinessAdmin(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	demo := ensureDemo(t, f.app)
	plan := f.createPlan(t, "Upgrade "+uuid.NewString()[:6])
	_, explorer := explore(t, f.app)

	req := testutil.NewJSONRequest(t, map[string]any{"business_name": "Eve's Bakery", "plan_id": plan.ID.String()})
	testutil.SetAuthContext(req, demo, explorer.User.ID)
	require.NoError(t, f.app.Subscribe(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var resp authPayload
	testutil.ParseEnvelopeResponse(t, req, &resp)
	assert.NotEqual(t, demo, resp.User.OrganizationID, "now in their own business")
	require.NotNil(t, resp.User.Role)
	assert.Equal(t, "admin", resp.User.Role.Name)

	vendor, err := loadVendorForTest(t, f, resp.User.OrganizationID)
	require.NoError(t, err)
	assert.Equal(t, "Eve's Bakery", vendor.Name)
	assert.Equal(t, models.VendorStatusTrial, vendor.Status)
	assert.Equal(t, plan.Name, vendor.PlanName)

	var demoMembership int64
	f.app.DB.Model(&models.UserOrganization{}).Where("user_id = ? AND organization_id = ?", explorer.User.ID, demo).Count(&demoMembership)
	assert.Zero(t, demoMembership, "left the demo workspace")

	// They can't subscribe a second time.
	again := testutil.NewJSONRequest(t, map[string]any{"business_name": "Another"})
	testutil.SetAuthContext(again, resp.User.OrganizationID, explorer.User.ID)
	require.NoError(t, f.app.Subscribe(again))
	testutil.AssertErrorResponse(t, again, fasthttp.StatusBadRequest, "already belongs to a business")

	// The demo workspace isn't listed as a vendor.
	list := f.asSuperAdmin(testutil.NewGETRequest(t))
	require.NoError(t, f.app.SuperAdminListVendors(list))
	var vendors []handlers.VendorResponse
	testutil.ParseEnvelopeResponse(t, list, &vendors)
	for _, v := range vendors {
		assert.NotEqual(t, demo, v.ID)
	}
}
