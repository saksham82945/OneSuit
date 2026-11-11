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

func getCharts(t *testing.T, app *handlers.App, orgID, userID uuid.UUID, roleID *uuid.UUID, query map[string]string) (handlers.DashboardChartsResponse, map[string]any) {
	t.Helper()
	req := testutil.NewGETRequest(t)
	for k, v := range query {
		testutil.SetQueryParam(req, k, v)
	}
	testutil.SetFullAuthContext(req, orgID, userID, roleID, false)
	require.NoError(t, app.GetDashboardCharts(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var resp handlers.DashboardChartsResponse
	testutil.ParseEnvelopeResponse(t, req, &resp)
	var raw struct {
		Data map[string]any `json:"data"`
	}
	require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &raw))
	return resp, raw.Data
}

func chartMsg(t *testing.T, app *handlers.App, orgID, contactID uuid.UUID, dir models.Direction, status models.MessageStatus, template string, at time.Time) {
	t.Helper()
	m := createTestMessage(t, app, orgID, contactID, dir, at)
	require.NoError(t, app.DB.Model(m).Updates(map[string]any{"status": status, "template_name": template}).Error)
}

func TestApp_DashboardCharts_AdminSeries(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	role := testutil.CreateAdminRole(t, app.DB, org.ID)
	admin := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&role.ID))
	contact := testutil.CreateTestContact(t, app.DB, org.ID)

	now := time.Now()
	chartMsg(t, app, org.ID, contact.ID, models.DirectionOutgoing, models.MessageStatusRead, "welcome", now.Add(-time.Minute))
	chartMsg(t, app, org.ID, contact.ID, models.DirectionOutgoing, models.MessageStatusDelivered, "welcome", now.Add(-time.Minute))
	chartMsg(t, app, org.ID, contact.ID, models.DirectionOutgoing, models.MessageStatusFailed, "", now.Add(-time.Minute))
	chartMsg(t, app, org.ID, contact.ID, models.DirectionIncoming, models.MessageStatusReceived, "", now.Add(-time.Minute))
	// Previous period (7 days before the default range).
	chartMsg(t, app, org.ID, contact.ID, models.DirectionOutgoing, models.MessageStatusSent, "", now.AddDate(0, 0, -10))

	flow := models.ChatbotFlow{OrganizationID: org.ID, WhatsAppAccount: "test-account", Name: "Order status"}
	require.NoError(t, app.DB.Create(&flow).Error)
	session := createTestChatbotSession(t, app, org.ID, contact.ID, now.Add(-time.Hour))
	require.NoError(t, app.DB.Model(session).Updates(map[string]any{"current_flow_id": flow.ID, "status": "completed"}).Error)

	responded := now.Add(-50 * time.Minute)
	require.NoError(t, app.DB.Create(&models.AgentTransfer{
		OrganizationID: org.ID, ContactID: contact.ID, WhatsAppAccount: "acc", PhoneNumber: contact.PhoneNumber,
		Status: models.TransferStatusActive, AgentID: &admin.ID, TransferredAt: now.Add(-time.Hour),
		SLA: models.SLATracking{FirstResponseAt: &responded},
	}).Error)
	require.NoError(t, app.DB.Create(&models.AgentTransfer{
		OrganizationID: org.ID, ContactID: contact.ID, WhatsAppAccount: "acc", PhoneNumber: contact.PhoneNumber,
		Status: models.TransferStatusActive,
	}).Error)

	resp, _ := getCharts(t, app, org.ID, admin.ID, &role.ID, nil)

	assert.Equal(t, "day", resp.Granularity)
	assert.Equal(t, "all", resp.AgentScope)
	require.Len(t, resp.Messages, 7, "default range is the last 7 days")
	var sent, recv int64
	for _, p := range resp.Messages {
		sent += p.Sent
		recv += p.Received
	}
	assert.Equal(t, int64(3), sent)
	assert.Equal(t, int64(1), recv)

	require.Contains(t, resp.KPIs, "messages_sent")
	assert.Equal(t, 3.0, *resp.KPIs["messages_sent"].Current)
	assert.Equal(t, 1.0, *resp.KPIs["messages_sent"].Previous)
	require.NotNil(t, resp.KPIs["delivery_rate"].Current)
	assert.InDelta(t, 100.0, *resp.KPIs["delivery_rate"].Current, 0.01) // 2 accepted, both delivered
	assert.InDelta(t, 50.0, *resp.KPIs["read_rate"].Current, 0.01)
	assert.InDelta(t, 0.0, *resp.KPIs["delivery_rate"].Previous, 0.01)

	require.NotNil(t, resp.Funnel)
	assert.Equal(t, handlers.ChartDeliveryFunnel{Total: 3, Sent: 2, Delivered: 2, Read: 1, Failed: 1}, *resp.Funnel)

	require.Len(t, resp.Hourly, 24)
	var hourly int64
	for _, h := range resp.Hourly {
		hourly += h
	}
	assert.Equal(t, int64(1), hourly)

	require.Len(t, resp.Templates, 1)
	assert.Equal(t, "welcome", resp.Templates[0].Name)
	assert.Equal(t, int64(2), resp.Templates[0].Sends)

	require.Len(t, resp.Contacts, 7)
	assert.Equal(t, int64(1), resp.Contacts[6].Total)
	assert.Equal(t, 1.0, *resp.KPIs["new_contacts"].Current)

	require.NotNil(t, resp.Conversations)
	assert.Equal(t, int64(1), resp.Conversations.OpenAssigned)
	assert.Equal(t, int64(1), resp.Conversations.OpenUnassigned)

	require.Len(t, resp.Agents, 1)
	assert.Equal(t, admin.ID, resp.Agents[0].UserID)
	assert.Equal(t, int64(1), resp.Agents[0].Handled)
	require.NotNil(t, resp.Agents[0].AvgFirstResponseSeconds)
	assert.InDelta(t, 600, *resp.Agents[0].AvgFirstResponseSeconds, 5)
	require.NotNil(t, resp.KPIs["avg_first_response_seconds"].Current)
	assert.Nil(t, resp.KPIs["avg_first_response_seconds"].Previous)

	require.NotNil(t, resp.Bot)
	assert.Equal(t, int64(1), resp.Bot.Sessions)
	assert.Equal(t, int64(1), resp.Bot.Completed)
	require.Len(t, resp.Bot.TopFlows, 1)
	assert.Equal(t, "Order status", resp.Bot.TopFlows[0].Name)
	assert.Equal(t, 1.0, *resp.KPIs["bot_sessions"].Current)

	require.Contains(t, resp.KPIs, "campaign_messages")
	assert.NotNil(t, resp.Campaigns)
}

func TestApp_DashboardCharts_TodayIsHourly(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	role := testutil.CreateAdminRole(t, app.DB, org.ID)
	admin := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&role.ID))

	day := time.Now().UTC().Format("2006-01-02")
	resp, _ := getCharts(t, app, org.ID, admin.ID, &role.ID, map[string]string{"from": day, "to": day})
	assert.Equal(t, "hour", resp.Granularity)
	assert.Len(t, resp.Messages, 24)
	assert.Equal(t, day, resp.From)
	assert.Equal(t, day, resp.To)
	// No data yet: series are zero-filled, rates are null rather than invented.
	assert.Nil(t, resp.KPIs["delivery_rate"].Current)
	assert.Equal(t, 0.0, *resp.KPIs["messages_sent"].Current)
}

func TestApp_DashboardCharts_AgentSeesOnlyOwnNumbers(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	role := testutil.CreateTestRoleWithKeys(t, app.DB, org.ID, "agent", []string{"chat:read", "chat:write"})
	agent := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&role.ID))
	other := testutil.CreateTestUser(t, app.DB, org.ID)
	contact := testutil.CreateTestContact(t, app.DB, org.ID)
	createTestMessage(t, app, org.ID, contact.ID, models.DirectionIncoming, time.Now())

	for _, id := range []uuid.UUID{agent.ID, other.ID} {
		agentID := id
		require.NoError(t, app.DB.Create(&models.AgentTransfer{
			OrganizationID: org.ID, ContactID: contact.ID, WhatsAppAccount: "acc", PhoneNumber: contact.PhoneNumber,
			Status: models.TransferStatusActive, AgentID: &agentID,
		}).Error)
	}

	resp, raw := getCharts(t, app, org.ID, agent.ID, &role.ID, nil)
	assert.Equal(t, "self", resp.AgentScope)
	require.Len(t, resp.Agents, 1)
	assert.Equal(t, agent.ID, resp.Agents[0].UserID)

	assert.NotContains(t, resp.KPIs, "messages_sent")
	assert.NotContains(t, resp.KPIs, "new_contacts")
	assert.NotContains(t, raw, "messages")
	assert.NotContains(t, raw, "funnel")
	assert.NotContains(t, raw, "contacts")
	assert.Nil(t, raw["campaigns"], "null = not permitted")
	assert.NotContains(t, raw, "conversations")
	assert.NotContains(t, raw, "bot")
	assert.Nil(t, raw["templates"])
}

func TestApp_DashboardCharts_RejectsBadRange(t *testing.T) {
	t.Parallel()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	role := testutil.CreateAdminRole(t, app.DB, org.ID)
	admin := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithRoleID(&role.ID))

	for _, q := range []map[string]string{
		{"from": "2026-02-10", "to": "2026-02-01"},
		{"from": "2024-01-01", "to": "2026-01-01"},
	} {
		req := testutil.NewGETRequest(t)
		for k, v := range q {
			testutil.SetQueryParam(req, k, v)
		}
		testutil.SetFullAuthContext(req, org.ID, admin.ID, &role.ID, false)
		require.NoError(t, app.GetDashboardCharts(req))
		assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(req))
	}
}
