package handlers_test

// Regression tests for the pre-production security review (auth, roles, SSO,
// organizations, teams, passwords).

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/middleware"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

func signTestClaims(t *testing.T, claims middleware.JWTClaims) string {
	t.Helper()
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testutil.TestJWTSecret))
	require.NoError(t, err)
	return s
}

// An access token (no JTI) or a WebSocket token must not be exchangeable for
// a fresh session: that would turn a 30-second WS token (which travels in a
// WebSocket message) or a stolen access token into an unrevocable login.
func TestSecurity_RefreshToken_RejectsNonRefreshTokens(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := testutil.CreateTestUser(t, app.DB, org.ID)

	base := middleware.JWTClaims{UserID: user.ID, OrganizationID: org.ID, Email: user.Email,
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute)), Issuer: "whatomate"}}
	access := signTestClaims(t, base)
	ws := base
	ws.Subject = middleware.WSTokenSubject
	wsToken := signTestClaims(t, ws)

	for name, tok := range map[string]string{"access": access, "ws": wsToken} {
		req := testutil.NewJSONRequest(t, map[string]string{"refresh_token": tok})
		require.NoError(t, app.RefreshToken(req))
		assert.Equal(t, fasthttp.StatusUnauthorized, testutil.GetResponseStatusCode(req), name)
		assert.Empty(t, testutil.GetResponseCookie(req, "whm_access"), name)
	}
}

func TestSecurity_ChangePassword_UsesSignupRule(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithPassword("oldPassword1"))

	for _, weak := range []string{"abc123", "lettersonly", "12345678"} {
		req := testutil.NewJSONRequest(t, map[string]any{"current_password": "oldPassword1", "new_password": weak})
		testutil.SetAuthContext(req, org.ID, user.ID)
		require.NoError(t, app.ChangePassword(req))
		testutil.AssertErrorResponse(t, req, fasthttp.StatusBadRequest, "at least 8 characters")
	}
}

func TestSecurity_AcceptInvite_NewAccountNeedsStrongPassword(t *testing.T) {
	f := newSuperAdminFixture(t)
	require.NoError(t, f.app.DB.Create(&models.CustomRole{OrganizationID: f.org.ID, Name: "agent", IsSystem: true, IsDefault: true}).Error)
	inv := f.createInvite(t, f.org.ID, map[string]any{})

	req := acceptInvite(t, f.app, map[string]any{"token": inv.Token, "full_name": "Weak", "email": testutil.UniqueEmail("weak"), "password": "aaaaaaaa"})
	testutil.AssertErrorResponse(t, req, fasthttp.StatusBadRequest, "letter and a number")
}

// --- Roles: managing roles needs the roles permissions ---

func TestSecurity_Roles_RequirePermission(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	agentRole := testutil.CreateAgentRole(t, app.DB, org.ID)
	custom := testutil.CreateTestRoleExact(t, app.DB, org.ID, "Custom", false, false, nil)
	agent := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&agentRole.ID))

	// Create a role with every permission.
	create := testutil.NewJSONRequest(t, map[string]any{"name": "Escalated", "permissions": []string{"users:write", "roles:write"}})
	testutil.SetAuthContext(create, org.ID, agent.ID)
	require.NoError(t, app.CreateRole(create))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(create))

	// Give an existing custom role more permissions.
	update := testutil.NewJSONRequest(t, map[string]any{"permissions": []string{"users:write"}})
	testutil.SetAuthContext(update, org.ID, agent.ID)
	testutil.SetPathParam(update, "id", custom.ID.String())
	require.NoError(t, app.UpdateRole(update))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(update))

	del := testutil.NewRequest(t)
	testutil.SetAuthContext(del, org.ID, agent.ID)
	testutil.SetPathParam(del, "id", custom.ID.String())
	require.NoError(t, app.DeleteRole(del))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(del))

	var count int64
	app.DB.Model(&models.CustomRole{}).Where("organization_id = ? AND name = ?", org.ID, "Escalated").Count(&count)
	assert.Equal(t, int64(0), count)
	var stillThere int64
	app.DB.Model(&models.CustomRole{}).Where("id = ?", custom.ID).Count(&stillThere)
	assert.Equal(t, int64(1), stillThere)
}

// --- SSO settings need settings.sso; an org's own SSO only signs in its members ---

func TestSecurity_SSOSettings_RequirePermission(t *testing.T) {
	app := newSSOApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	agentRole := testutil.CreateAgentRole(t, app.DB, org.ID)
	agent := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&agentRole.ID))

	req := testutil.NewJSONRequest(t, map[string]any{
		"client_id": "id", "client_secret": "s", "is_enabled": true,
		"auth_url": "https://idp.example/auth", "token_url": "https://idp.example/token", "user_info_url": "https://idp.example/me",
	})
	testutil.SetAuthContext(req, org.ID, agent.ID)
	testutil.SetPathParam(req, "provider", "custom")
	require.NoError(t, app.UpdateSSOProvider(req))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(req))

	var count int64
	app.DB.Model(&models.SSOProvider{}).Where("organization_id = ?", org.ID).Count(&count)
	assert.Equal(t, int64(0), count)

	get := testutil.NewGETRequest(t)
	testutil.SetAuthContext(get, org.ID, agent.ID)
	require.NoError(t, app.GetSSOSettings(get))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(get))
}

func runOrgSSOCallback(t *testing.T, app *handlers.App, orgID uuid.UUID) *fastglue.Request {
	t.Helper()
	nonce := uuid.New().String()
	state := handlers.SSOState{OrgID: orgID.String(), Provider: "custom", Nonce: nonce, ExpiresAt: time.Now().Add(5 * time.Minute)}
	stored, _ := json.Marshal(state)
	require.NoError(t, app.Redis.Set(context.Background(), "sso:state:"+nonce, stored, 5*time.Minute).Err())
	req := testutil.NewGETRequest(t)
	testutil.SetPathParam(req, "provider", "custom")
	testutil.SetQueryParam(req, "code", "c")
	testutil.SetQueryParam(req, "state", nonce)
	require.NoError(t, app.CallbackSSO(req))
	return req
}

// A workspace's custom identity server can claim any email. It must not sign
// in people from other workspaces, and never a super admin.
func TestSecurity_OrgSSO_CannotSignInOutsiders(t *testing.T) {
	app := newSSOApp(t)
	fake := newFakeOAuth(t)
	attackerOrg := testutil.CreateTestOrganization(t, app.DB)
	createCustomSSOProvider(t, app, attackerOrg.ID, fake)
	// Other tests count the enabled providers in the shared test database.
	t.Cleanup(func() { app.DB.Unscoped().Where("organization_id = ?", attackerOrg.ID).Delete(&models.SSOProvider{}) })

	victimOrg := testutil.CreateTestOrganization(t, app.DB)
	superAdmin := testutil.CreateTestUser(t, app.DB, victimOrg.ID, testutil.WithSuperAdmin())
	outsider := testutil.CreateTestUser(t, app.DB, victimOrg.ID)

	for _, target := range []*models.User{superAdmin, outsider} {
		fake.UserEmail = target.Email
		req := runOrgSSOCallback(t, app, attackerOrg.ID)
		assert.Empty(t, testutil.GetResponseCookie(req, "whm_access"), target.Email)
		assert.Contains(t, string(req.RequestCtx.Response.Header.Peek("Location")), "error=", target.Email)
	}

	// A member of the workspace still signs in.
	member := testutil.CreateTestUser(t, app.DB, attackerOrg.ID)
	fake.UserEmail = member.Email
	req := runOrgSSOCallback(t, app, attackerOrg.ID)
	assert.NotEmpty(t, testutil.GetResponseCookie(req, "whm_access"))
}

// --- Organizations ---

func TestSecurity_ListOrganizations_OnlyOwnForNonSuperAdmins(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	other := testutil.CreateTestOrganization(t, app.DB)
	admin := createAdminUser(t, app, org.ID)

	req := testutil.NewGETRequest(t)
	testutil.SetAuthContext(req, org.ID, admin.ID)
	require.NoError(t, app.ListOrganizations(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	var resp struct {
		Organizations []handlers.OrganizationResponse `json:"organizations"`
	}
	testutil.ParseEnvelopeResponse(t, req, &resp)
	ids := map[uuid.UUID]bool{}
	for _, o := range resp.Organizations {
		ids[o.ID] = true
	}
	assert.True(t, ids[org.ID])
	assert.False(t, ids[other.ID], "another tenant must not be listed")
	assert.Len(t, resp.Organizations, 1)
}

func TestSecurity_CreateOrganization_SuperAdminOnly(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	admin := createAdminUser(t, app, org.ID)

	req := testutil.NewJSONRequest(t, map[string]string{"name": "Free Workspace"})
	testutil.SetAuthContext(req, org.ID, admin.ID)
	require.NoError(t, app.CreateOrganization(req))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(req))

	var count int64
	app.DB.Model(&models.Organization{}).Where("name = ?", "Free Workspace").Count(&count)
	assert.Equal(t, int64(0), count)
}

// --- Teams: a team manager can't widen the team's access ---

func TestSecurity_UpdateTeam_ManagerCannotChangeAccess(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	agentRole := testutil.CreateAgentRole(t, app.DB, org.ID)
	manager := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&agentRole.ID))
	team := createTeam(t, app, org.ID, "Support "+uuid.New().String()[:6])
	addTeamMember(t, app, team.ID, manager.ID, models.TeamRoleManager)

	req := testutil.NewJSONRequest(t, map[string]any{
		"name": team.Name, "is_active": true, "access": []string{"campaigns", "contacts", "automation"},
	})
	testutil.SetAuthContext(req, org.ID, manager.ID)
	testutil.SetPathParam(req, "id", team.ID.String())
	require.NoError(t, app.UpdateTeam(req))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(req))

	var stored models.Team
	require.NoError(t, app.DB.Where("id = ?", team.ID).First(&stored).Error)
	assert.Empty(t, stored.Access)
	assert.False(t, app.HasPermission(manager.ID, models.ResourceCampaigns, models.ActionWrite, org.ID))

	// Saving without touching access still works for the manager.
	ok := testutil.NewJSONRequest(t, map[string]any{"name": team.Name, "description": "updated", "is_active": true, "access": []string{}})
	testutil.SetAuthContext(ok, org.ID, manager.ID)
	testutil.SetPathParam(ok, "id", team.ID.String())
	require.NoError(t, app.UpdateTeam(ok))
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(ok), string(testutil.GetResponseBody(ok)))
}

func TestSecurity_CreateAndUpdateUser_UseSignupPasswordRule(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	admin := createAdminUser(t, app, org.ID)

	create := testutil.NewJSONRequest(t, map[string]any{"email": testutil.UniqueEmail("weakpw"), "password": "123456", "full_name": "Weak"})
	testutil.SetAuthContext(create, org.ID, admin.ID)
	require.NoError(t, app.CreateUser(create))
	testutil.AssertErrorResponse(t, create, fasthttp.StatusBadRequest, "at least 8 characters")

	target := testutil.CreateTestUser(t, app.DB, org.ID)
	update := testutil.NewJSONRequest(t, map[string]any{"password": "abc"})
	testutil.SetAuthContext(update, org.ID, admin.ID)
	testutil.SetPathParam(update, "id", target.ID.String())
	require.NoError(t, app.UpdateUser(update))
	testutil.AssertErrorResponse(t, update, fasthttp.StatusBadRequest, "at least 8 characters")
}
