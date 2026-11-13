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

// A workspace marks its own support ticket solved or open again; another
// workspace's ticket stays out of reach.
func TestApp_UpdateMySupportTicket(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	other := testutil.CreateTestOrganization(t, app.DB)
	user := testutil.CreateTestUser(t, app.DB, org.ID)
	mine := models.SupportTicket{OrganizationID: org.ID, Subject: "Help", Status: models.TicketStatusOpen, Priority: "medium"}
	theirs := models.SupportTicket{OrganizationID: other.ID, Subject: "Other", Status: models.TicketStatusOpen, Priority: "medium"}
	require.NoError(t, app.DB.Create(&mine).Error)
	require.NoError(t, app.DB.Create(&theirs).Error)

	set := func(id, status string) int {
		req := testutil.NewJSONRequest(t, map[string]any{"status": status})
		testutil.SetAuthContext(req, org.ID, user.ID)
		testutil.SetPathParam(req, "id", id)
		require.NoError(t, app.UpdateMySupportTicket(req))
		return testutil.GetResponseStatusCode(req)
	}

	assert.Equal(t, fasthttp.StatusOK, set(mine.ID.String(), models.TicketStatusSolved))
	var got models.SupportTicket
	app.DB.First(&got, "id = ?", mine.ID)
	assert.Equal(t, models.TicketStatusSolved, got.Status)
	assert.NotNil(t, got.SolvedAt)

	assert.Equal(t, fasthttp.StatusOK, set(mine.ID.String(), models.TicketStatusOpen))
	var reopened models.SupportTicket
	app.DB.First(&reopened, "id = ?", mine.ID)
	assert.Equal(t, models.TicketStatusOpen, reopened.Status)
	assert.Nil(t, reopened.SolvedAt)

	assert.Equal(t, fasthttp.StatusBadRequest, set(mine.ID.String(), "closed"))
	assert.Equal(t, fasthttp.StatusNotFound, set(theirs.ID.String(), models.TicketStatusSolved))
}

// Updating a team without per_agent_timeout_secs keeps the saved value.
func TestApp_UpdateTeam_KeepsTimeoutWhenNotSent(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := createAdminUser(t, app, org.ID)
	team := createTeam(t, app, org.ID, "Support")
	require.NoError(t, app.DB.Model(&models.Team{}).Where("id = ?", team.ID).Update("per_agent_timeout_secs", 45).Error)

	req := testutil.NewJSONRequest(t, handlers.TeamRequest{Name: "Support 2", IsActive: true})
	testutil.SetAuthContext(req, org.ID, user.ID)
	testutil.SetPathParam(req, "id", team.ID.String())
	require.NoError(t, app.UpdateTeam(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))

	var saved models.Team
	app.DB.First(&saved, "id = ?", team.ID)
	assert.Equal(t, 45, saved.PerAgentTimeoutSecs)
}
