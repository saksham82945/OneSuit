package handlers_test

import (
	"testing"

	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

// An organization admin must not be able to take over a super admin who is a
// member of their organization.
func TestApp_OrgAdminCannotChangeOrDeleteSuperAdmin(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	adminRole := testutil.CreateAdminRole(t, app.DB, org.ID)
	orgAdmin := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&adminRole.ID))
	superAdmin := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithSuperAdmin(), testutil.WithRoleID(&adminRole.ID))

	for name, body := range map[string]map[string]any{
		"password": {"password": "taken-over-123"},
		"email":    {"email": testutil.UniqueEmail("hijack")},
		"disable":  {"is_active": false},
	} {
		req := testutil.NewJSONRequest(t, body)
		testutil.SetFullAuthContext(req, org.ID, orgAdmin.ID, &adminRole.ID, false)
		testutil.SetPathParam(req, "id", superAdmin.ID.String())
		require.NoError(t, app.UpdateUser(req), name)
		testutil.AssertErrorResponse(t, req, fasthttp.StatusForbidden, "Only a super admin")
	}

	del := testutil.NewRequest(t)
	testutil.SetFullAuthContext(del, org.ID, orgAdmin.ID, &adminRole.ID, false)
	testutil.SetPathParam(del, "id", superAdmin.ID.String())
	require.NoError(t, app.DeleteUser(del))
	testutil.AssertErrorResponse(t, del, fasthttp.StatusForbidden, "Only a super admin")

	// The org admin can still edit ordinary users.
	agent := testutil.CreateTestUser(t, app.DB, org.ID)
	ok := testutil.NewJSONRequest(t, map[string]any{"full_name": "Renamed Agent"})
	testutil.SetFullAuthContext(ok, org.ID, orgAdmin.ID, &adminRole.ID, false)
	testutil.SetPathParam(ok, "id", agent.ID.String())
	require.NoError(t, app.UpdateUser(ok))
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(ok))
}

// Removing super admin rights must take effect immediately, not after the
// permissions cache expires.
func TestApp_RevokingSuperAdminTakesEffectImmediately(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	adminRole := testutil.CreateAdminRole(t, app.DB, org.ID)
	owner := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithSuperAdmin(), testutil.WithRoleID(&adminRole.ID))
	other := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithSuperAdmin(), testutil.WithRoleID(&adminRole.ID))
	require.True(t, app.IsSuperAdmin(other.ID), "warms the permissions cache")

	req := testutil.NewJSONRequest(t, map[string]any{"is_super_admin": false})
	testutil.SetFullAuthContext(req, org.ID, owner.ID, &adminRole.ID, true)
	testutil.SetPathParam(req, "id", other.ID.String())
	require.NoError(t, app.UpdateUser(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))

	assert.False(t, app.IsSuperAdmin(other.ID), "revoked right away")

	var audit models.AuditLog
	require.NoError(t, app.DB.Where("resource_id = ? AND action = ?", other.ID, models.AuditActionUpdated).First(&audit).Error,
		"the change is in the audit log")
}
