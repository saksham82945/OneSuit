package handlers_test

import (
	"testing"

	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

func TestApp_TeamAccessGrantsPermissions(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	adminRole := testutil.CreateAdminRole(t, app.DB, org.ID)
	admin := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&adminRole.ID))
	agentRole := testutil.CreateAgentRole(t, app.DB, org.ID)
	agent := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&agentRole.ID))

	assert.False(t, app.HasPermission(agent.ID, models.ResourceCampaigns, models.ActionRead, org.ID))

	// Create a team with access to campaigns, no strategy or timeout needed.
	req := testutil.NewJSONRequest(t, map[string]any{"name": "Marketing", "description": "Runs broadcasts", "access": []string{"campaigns", "templates", "campaigns"}})
	testutil.SetFullAuthContext(req, org.ID, admin.ID, &adminRole.ID, false)
	require.NoError(t, app.CreateTeam(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var created struct {
		Team struct {
			ID     string   `json:"id"`
			Access []string `json:"access"`
		} `json:"team"`
	}
	testutil.ParseEnvelopeResponse(t, req, &created)
	assert.Equal(t, []string{"campaigns", "templates"}, created.Team.Access)

	bad := testutil.NewJSONRequest(t, map[string]any{"name": "X", "access": []string{"everything"}})
	testutil.SetFullAuthContext(bad, org.ID, admin.ID, &adminRole.ID, false)
	require.NoError(t, app.CreateTeam(bad))
	testutil.AssertErrorResponse(t, bad, fasthttp.StatusBadRequest, "Unknown access")

	// Adding the agent gives them the team's access.
	add := testutil.NewJSONRequest(t, map[string]any{"user_id": agent.ID.String()})
	testutil.SetFullAuthContext(add, org.ID, admin.ID, &adminRole.ID, false)
	testutil.SetPathParam(add, "id", created.Team.ID)
	require.NoError(t, app.AddTeamMember(add))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(add), string(testutil.GetResponseBody(add)))
	assert.True(t, app.HasPermission(agent.ID, models.ResourceCampaigns, models.ActionWrite, org.ID))
	assert.True(t, app.HasPermission(agent.ID, models.ResourceTemplates, models.ActionRead, org.ID))
	assert.False(t, app.HasPermission(agent.ID, models.ResourceContacts, models.ActionWrite, org.ID), "only what the team gives")

	// Removing campaigns from the team takes it away again.
	upd := testutil.NewJSONRequest(t, map[string]any{"name": "Marketing", "is_active": true, "access": []string{"templates"}})
	testutil.SetFullAuthContext(upd, org.ID, admin.ID, &adminRole.ID, false)
	testutil.SetPathParam(upd, "id", created.Team.ID)
	require.NoError(t, app.UpdateTeam(upd))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(upd), string(testutil.GetResponseBody(upd)))
	assert.False(t, app.HasPermission(agent.ID, models.ResourceCampaigns, models.ActionRead, org.ID))
	assert.True(t, app.HasPermission(agent.ID, models.ResourceTemplates, models.ActionRead, org.ID))
}
