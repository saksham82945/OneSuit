package handlers_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

func getOverview(t *testing.T, app *handlers.App, orgID, userID uuid.UUID, roleID *uuid.UUID) (handlers.DashboardOverviewResponse, map[string]any) {
	t.Helper()
	req := testutil.NewGETRequest(t)
	testutil.SetFullAuthContext(req, orgID, userID, roleID, false)
	require.NoError(t, app.GetDashboardOverview(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var resp handlers.DashboardOverviewResponse
	testutil.ParseEnvelopeResponse(t, req, &resp)
	var raw struct {
		Data map[string]any `json:"data"`
	}
	require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &raw))
	return resp, raw.Data
}

func TestApp_DashboardOverview_AdminCounts(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	role := testutil.CreateAdminRole(t, app.DB, org.ID)
	admin := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&role.ID))

	account := testutil.CreateTestWhatsAppAccount(t, app.DB, org.ID)
	contact := testutil.CreateTestContact(t, app.DB, org.ID)
	now := time.Now()
	require.NoError(t, app.DB.Model(contact).Update("last_inbound_at", now.Add(-time.Hour)).Error)
	createTestMessage(t, app, org.ID, contact.ID, models.DirectionIncoming, now.Add(-time.Minute))
	createTestMessage(t, app, org.ID, contact.ID, models.DirectionOutgoing, now.Add(-time.Minute))
	createTestMessage(t, app, org.ID, contact.ID, models.DirectionOutgoing, now.AddDate(0, 0, -10))
	createTestMessage(t, app, org.ID, contact.ID, models.DirectionOutgoing, now.AddDate(0, 0, -45)) // outside 30d

	testutil.CreateTestTemplate(t, app.DB, org.ID, account.Name) // approved
	pending := testutil.CreateTestTemplate(t, app.DB, org.ID, account.Name)
	require.NoError(t, app.DB.Model(pending).Update("status", "PENDING").Error)

	// A plan expiring in 3 days.
	plan := models.SubscriptionPlan{Name: "Growth", Price: 999, Currency: "INR", Interval: "monthly", MaxContacts: 100, IsActive: true}
	require.NoError(t, app.DB.Create(&plan).Error)
	renew := now.AddDate(0, 0, 3)
	require.NoError(t, app.DB.Create(&models.OrganizationSubscription{
		OrganizationID: org.ID, PlanID: &plan.ID, Status: models.VendorStatusTrial, RenewalDate: &renew,
	}).Error)

	resp, _ := getOverview(t, app, org.ID, admin.ID, &role.ID)
	assert.False(t, resp.IsDemo)

	require.NotNil(t, resp.Overview.TotalContacts)
	assert.Equal(t, int64(1), *resp.Overview.TotalContacts)
	require.NotNil(t, resp.Today.NewContactsToday)
	assert.Equal(t, int64(1), *resp.Today.NewContactsToday)
	require.NotNil(t, resp.Today.OpenConversations)
	assert.Equal(t, int64(1), *resp.Today.OpenConversations)

	require.NotNil(t, resp.Overview.MessagesSent30d)
	assert.Equal(t, int64(2), *resp.Overview.MessagesSent30d)
	assert.Equal(t, int64(1), *resp.Overview.MessagesReceived30d)
	assert.GreaterOrEqual(t, *resp.Today.MessagesToday, int64(1))

	assert.Equal(t, int64(2), *resp.Overview.TemplatesTotal)
	assert.Equal(t, int64(1), *resp.Overview.TemplatesApproved)
	assert.Equal(t, int64(1), *resp.Actions.TemplatesPending)

	assert.Equal(t, int64(1), *resp.Overview.ConnectedNumbers)
	require.NotNil(t, resp.Actions.NoNumberConnected)
	assert.False(t, *resp.Actions.NoNumberConnected)
	assert.Equal(t, int64(1), *resp.Overview.TeamMembers)

	require.NotNil(t, resp.Plan)
	assert.Equal(t, "Growth", resp.Plan.Name)
	assert.Equal(t, models.VendorStatusTrial, resp.Plan.Status)
	require.NotNil(t, resp.Plan.DaysLeft)
	assert.InDelta(t, 3, *resp.Plan.DaysLeft, 1)
	assert.True(t, resp.Actions.PlanExpiringSoon)
	assert.False(t, resp.Actions.PlanExpired)
	require.Len(t, resp.Plan.Quotas, 3)
	assert.Equal(t, int64(1), resp.Plan.Quotas[0].Used)
	assert.Equal(t, int64(100), resp.Plan.Quotas[0].Limit)
}

func TestApp_DashboardOverview_AgentSeesOnlyPermittedFields(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	role := testutil.CreateTestRoleWithKeys(t, app.DB, org.ID, "agent", []string{"chat:read", "chat:write", "transfers:read"})
	agent := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&role.ID))

	mine := testutil.CreateTestContact(t, app.DB, org.ID)
	require.NoError(t, app.DB.Model(mine).Update("assigned_user_id", agent.ID).Error)
	testutil.CreateTestContact(t, app.DB, org.ID) // someone else's
	createTestMessage(t, app, org.ID, mine.ID, models.DirectionIncoming, time.Now())
	require.NoError(t, app.DB.Create(&models.AgentTransfer{
		OrganizationID: org.ID, ContactID: mine.ID, WhatsAppAccount: "acc", PhoneNumber: mine.PhoneNumber,
		Status: models.TransferStatusActive, AgentID: &agent.ID,
	}).Error)
	require.NoError(t, app.DB.Create(&models.AgentTransfer{
		OrganizationID: org.ID, ContactID: mine.ID, WhatsAppAccount: "acc", PhoneNumber: mine.PhoneNumber,
		Status: models.TransferStatusActive, // unassigned queue
	}).Error)

	resp, raw := getOverview(t, app, org.ID, agent.ID, &role.ID)

	// No org-wide numbers the role can't read elsewhere.
	assert.Nil(t, resp.Overview.TotalContacts)
	assert.Nil(t, resp.Overview.MessagesSent30d)
	assert.Nil(t, resp.Today.MessagesToday)
	assert.Nil(t, resp.Overview.TotalCampaigns)
	assert.Nil(t, resp.Overview.TemplatesTotal)
	assert.Nil(t, resp.Overview.TeamMembers)
	assert.Nil(t, resp.Overview.ConnectedNumbers)
	assert.Nil(t, resp.Plan)
	overview, _ := raw["overview"].(map[string]any)
	assert.NotContains(t, overview, "total_contacts")
	assert.NotContains(t, raw, "plan")

	// Their own work is there.
	require.NotNil(t, resp.Agent)
	assert.Equal(t, int64(1), resp.Agent.MyOpenChats)
	assert.Equal(t, int64(1), resp.Agent.AssignedToMe)
	// transfers:read lets them see the unassigned queue.
	require.NotNil(t, resp.Actions.UnassignedConversations)
	assert.Equal(t, int64(1), *resp.Actions.UnassignedConversations)
}

func TestApp_DashboardOverview_DemoWorkspaceForExplorer(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	demo := ensureDemo(t, app)
	_, auth := explore(t, app)

	resp, _ := getOverview(t, app, demo, auth.User.ID, nil)
	assert.True(t, resp.IsDemo)
	require.NotNil(t, resp.Overview.TotalContacts, "explorers see the admin-style overview of sample data")
	assert.Greater(t, *resp.Overview.TotalContacts, int64(0))
	assert.Nil(t, resp.Plan, "the demo workspace has no plan")

	// Reading the dashboard passes the read-only guard; changes still don't.
	assert.NotNil(t, app.DemoReadOnlyGuard(guardRequest(t, "GET", "/api/dashboard/overview", demo, auth.User.ID)))
	assert.Nil(t, app.DemoReadOnlyGuard(guardRequest(t, "POST", "/api/contacts", demo, auth.User.ID)))
}

func TestApp_SuperAdminDashboard_OverviewFields(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	now := time.Now()

	plan := models.SubscriptionPlan{Name: "Pro " + uuid.NewString()[:6], Price: 1499, Currency: "INR", Interval: "monthly", IsActive: true}
	require.NoError(t, f.app.DB.Create(&plan).Error)

	expiring := testutil.CreateTestOrganization(t, f.app.DB)
	renew := now.AddDate(0, 0, 2)
	require.NoError(t, f.app.DB.Create(&models.OrganizationSubscription{
		OrganizationID: expiring.ID, PlanID: &plan.ID, Status: models.VendorStatusActive, RenewalDate: &renew,
		OwnerEmail: "owner@example.com",
	}).Error)
	expired := testutil.CreateTestOrganization(t, f.app.DB)
	past := now.AddDate(0, 0, -2)
	require.NoError(t, f.app.DB.Create(&models.OrganizationSubscription{
		OrganizationID: expired.ID, PlanID: &plan.ID, Status: models.VendorStatusActive, RenewalDate: &past,
	}).Error)

	dash := f.asSuperAdmin(testutil.NewGETRequest(t))
	require.NoError(t, f.app.SuperAdminDashboard(dash))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(dash), string(testutil.GetResponseBody(dash)))
	var resp handlers.SuperAdminDashboardResponse
	testutil.ParseEnvelopeResponse(t, dash, &resp)

	// Old fields are still there.
	assert.GreaterOrEqual(t, resp.TotalVendors, 3)
	assert.NotNil(t, resp.Plans)

	// New fields.
	assert.GreaterOrEqual(t, resp.NewSignupsToday, int64(3))
	assert.GreaterOrEqual(t, resp.ExpiringSoon, int64(1))
	assert.GreaterOrEqual(t, resp.ExpiredPlans, int64(1))
	assert.GreaterOrEqual(t, resp.ActivePlans, int64(1))
	assert.GreaterOrEqual(t, resp.PaymentsToday, int64(1))
	assert.NotEmpty(t, resp.Currency)
	assert.NotNil(t, resp.RecentSubscriptions)

	found := false
	for _, p := range resp.ExpiringPlans {
		if p.ID == expiring.ID {
			found = true
			assert.Equal(t, plan.Name, p.PlanName)
			assert.Equal(t, "owner@example.com", p.OwnerEmail)
			assert.InDelta(t, 2, p.DaysLeft, 1)
		}
		assert.NotEqual(t, expired.ID, p.ID, "expired plans aren't 'expiring'")
	}
	assert.True(t, found, "vendor renewing in 2 days is listed")

	// Raw JSON carries both old and new keys at the top level.
	var raw struct {
		Data map[string]any `json:"data"`
	}
	require.NoError(t, json.Unmarshal(testutil.GetResponseBody(dash), &raw))
	for _, k := range []string{"total_vendors", "tickets_new", "recent_tickets", "new_signups_today", "revenue_today",
		"messages_sent_30d", "ai_calls_30d", "wallets_total", "expiring_soon", "expiring_plans", "recent_subscriptions"} {
		assert.Contains(t, raw.Data, k)
	}
}
