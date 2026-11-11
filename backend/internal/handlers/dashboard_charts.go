package handlers

import (
	"time"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"

	"github.com/shridarpatil/whatomate/internal/models"
)

// ============================================================================
// Dashboard charts (GET /api/dashboard/charts?from=YYYY-MM-DD&to=YYYY-MM-DD)
//
// One aggregated payload with every series the workspace dashboard draws for
// a date range: KPI totals with the previous period of the same length,
// messages over time, delivery funnel, busiest hours, conversations,
// campaigns, contacts growth, agents, chatbot flows and templates.
//
// Permission rules match GET /api/dashboard/overview: each section is gated
// by the permission that protects the matching list page and is omitted
// (null) when the caller can't read it. Members without analytics access
// only see their own agent numbers.
// ============================================================================

// wsChartMaxDays caps the requested range so one call stays cheap.
const wsChartMaxDays = 366

// DashboardKPI is a period total and the same-length previous period.
// Either may be null (no data, e.g. no responses to average).
type DashboardKPI struct {
	Current  *float64 `json:"current"`
	Previous *float64 `json:"previous"`
}

// ChartMessagePoint is one bucket of the messages-over-time series.
type ChartMessagePoint struct {
	Date     string `json:"date"`
	Sent     int64  `json:"sent"`
	Received int64  `json:"received"`
}

// ChartContactPoint is one bucket of the contacts-growth series.
type ChartContactPoint struct {
	Date  string `json:"date"`
	New   int64  `json:"new"`
	Total int64  `json:"total"`
}

// ChartDeliveryFunnel counts outgoing messages of the period by final status.
// Sent includes delivered and read; delivered includes read.
type ChartDeliveryFunnel struct {
	Total     int64 `json:"total"`
	Sent      int64 `json:"sent"`
	Delivered int64 `json:"delivered"`
	Read      int64 `json:"read"`
	Failed    int64 `json:"failed"`
	Pending   int64 `json:"pending"`
}

// ChartConversations is the agent queue right now plus what closed in the period.
type ChartConversations struct {
	OpenAssigned   int64 `json:"open_assigned"`
	OpenUnassigned int64 `json:"open_unassigned"`
	Resolved       int64 `json:"resolved"`
	Expired        int64 `json:"expired"`
}

// ChartCampaign is one campaign's recipient outcomes within the period.
type ChartCampaign struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	Sent      int64     `json:"sent"`
	Delivered int64     `json:"delivered"`
	Read      int64     `json:"read"`
	Failed    int64     `json:"failed"`
}

// ChartAgent is one agent's handled transfers in the period.
type ChartAgent struct {
	UserID                  uuid.UUID `json:"user_id"`
	Name                    string    `json:"name"`
	Handled                 int64     `json:"handled"`
	Resolved                int64     `json:"resolved"`
	AvgFirstResponseSeconds *float64  `json:"avg_first_response_seconds"`
}

// ChartFlow is one chatbot flow's sessions in the period.
type ChartFlow struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Sessions  int64     `json:"sessions"`
	Completed int64     `json:"completed"`
}

// ChartBot summarises chatbot sessions in the period.
type ChartBot struct {
	Sessions  int64       `json:"sessions"`
	Active    int64       `json:"active"`
	Completed int64       `json:"completed"`
	Cancelled int64       `json:"cancelled"`
	Timeout   int64       `json:"timeout"`
	TopFlows  []ChartFlow `json:"top_flows"`
}

// ChartTemplate is one template's sends in the period.
type ChartTemplate struct {
	Name      string `json:"name"`
	Sends     int64  `json:"sends"`
	Delivered int64  `json:"delivered"`
	Read      int64  `json:"read"`
}

// DashboardChartsResponse is the payload for GET /api/dashboard/charts.
type DashboardChartsResponse struct {
	From         string `json:"from"`
	To           string `json:"to"`
	PreviousFrom string `json:"previous_from"`
	PreviousTo   string `json:"previous_to"`
	Timezone     string `json:"timezone"`
	// Granularity of the time series: hour, day or week.
	Granularity string `json:"granularity"`
	// AgentScope is "all" with analytics access, "self" for the caller's own row only.
	AgentScope string `json:"agent_scope"`

	KPIs          map[string]DashboardKPI `json:"kpis"`
	Messages      []ChartMessagePoint     `json:"messages,omitempty"`
	Funnel        *ChartDeliveryFunnel    `json:"funnel,omitempty"`
	Hourly        []int64                 `json:"hourly,omitempty"`
	Conversations *ChartConversations     `json:"conversations,omitempty"`
	Campaigns     []ChartCampaign         `json:"campaigns"`
	Contacts      []ChartContactPoint     `json:"contacts,omitempty"`
	Agents        []ChartAgent            `json:"agents"`
	Bot           *ChartBot               `json:"bot,omitempty"`
	Templates     []ChartTemplate         `json:"templates"`
}

func wsF64(v float64) *float64 { return &v }

func wsKPICount(cur, prev int64) DashboardKPI {
	return DashboardKPI{Current: wsF64(float64(cur)), Previous: wsF64(float64(prev))}
}

// pct returns part/whole*100, or nil when whole is zero.
func wsPct(part, whole int64) *float64 {
	if whole <= 0 {
		return nil
	}
	return wsF64(float64(part) * 100 / float64(whole))
}

// wsChartGranularity picks the bucket size for a range of `days` calendar days.
func wsChartGranularity(days int) string {
	switch {
	case days <= 1:
		return "hour"
	case days <= 120:
		return "day"
	default:
		return "week"
	}
}

const wsBucketLayout = "2006-01-02T15:04"

// wsChartBuckets lists bucket keys (local time) covering [from, to).
func wsChartBuckets(from, to time.Time, gran string, loc *time.Location) []string {
	t := from.In(loc)
	switch gran {
	case "week":
		// date_trunc('week') starts weeks on Monday.
		offset := (int(t.Weekday()) + 6) % 7
		t = time.Date(t.Year(), t.Month(), t.Day()-offset, 0, 0, 0, 0, loc)
	case "day":
		t = time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
	}
	keys := []string{}
	for ; t.Before(to) && len(keys) < 2000; t = wsStepBucket(t, gran, loc) {
		keys = append(keys, t.Format(wsBucketLayout))
	}
	return keys
}

func wsStepBucket(t time.Time, gran string, loc *time.Location) time.Time {
	switch gran {
	case "hour":
		return t.Add(time.Hour)
	case "week":
		return time.Date(t.Year(), t.Month(), t.Day()+7, 0, 0, 0, 0, loc)
	default:
		return time.Date(t.Year(), t.Month(), t.Day()+1, 0, 0, 0, 0, loc)
	}
}

// wsBucketExpr is the SQL that maps a timestamptz column to a bucket key in the
// org's time zone. It takes two parameters: granularity and time zone.
func wsBucketExpr(col string) string {
	return `to_char(date_trunc(?, ` + col + ` AT TIME ZONE ?), 'YYYY-MM-DD"T"HH24:MI')`
}

// GetDashboardCharts returns every dashboard chart series for a date range.
func (a *App) GetDashboardCharts(r *fastglue.Request) error {
	orgID, userID, err := a.getOrgAndUserID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	perms, err := a.getUserPermissionsCached(userID, orgID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "Insufficient permissions", nil, "")
	}
	isDemo := orgID != uuid.Nil && orgID == a.demoOrgID()
	permSet := make(map[string]bool, len(perms.Permissions))
	for _, p := range perms.Permissions {
		permSet[p] = true
	}
	can := func(resource string) bool {
		return perms.IsSuperAdmin || isDemo || permSet[resource+":"+models.ActionRead]
	}

	// --- Range (calendar days in the org's time zone, both ends inclusive) ---
	loc := a.orgLocation(orgID)
	now := time.Now().In(loc)
	today := startOfDay(now, loc)
	from := today.AddDate(0, 0, -6)
	toDay := today
	if f, ok := parseDateParam(r, "from"); ok {
		from = time.Date(f.Year(), f.Month(), f.Day(), 0, 0, 0, 0, loc)
	}
	if t, ok := parseDateParam(r, "to"); ok {
		toDay = time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
	}
	if toDay.Before(from) {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "'from' must be on or before 'to'", nil, "")
	}
	days := daysBetween(from, toDay, loc) + 1
	if days > wsChartMaxDays {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Date range can be at most 366 days", nil, "")
	}
	to := toDay.AddDate(0, 0, 1) // exclusive end
	prevFrom := from.AddDate(0, 0, -days)
	prevTo := from
	gran := wsChartGranularity(days)
	tz := loc.String()
	buckets := wsChartBuckets(from, to, gran, loc)

	resp := DashboardChartsResponse{
		From:         from.Format("2006-01-02"),
		To:           toDay.Format("2006-01-02"),
		PreviousFrom: prevFrom.Format("2006-01-02"),
		PreviousTo:   prevTo.AddDate(0, 0, -1).Format("2006-01-02"),
		Timezone:     tz,
		Granularity:  gran,
		KPIs:         map[string]DashboardKPI{},
	}

	analytics := can(models.ResourceAnalytics)

	// --- Messages: KPIs, funnel, series, busiest hours, templates ---
	if analytics {
		var m struct {
			SentCur, SentPrev, RecvCur, RecvPrev                         int64
			OkCur, OkPrev, DeliveredCur, DeliveredPrev, ReadCur, ReadPrev int64
			FailedCur                                                    int64
		}
		if err := a.DB.Raw(`SELECT
				COUNT(*) FILTER (WHERE direction = 'outgoing' AND created_at >= ?) AS sent_cur,
				COUNT(*) FILTER (WHERE direction = 'outgoing' AND created_at < ?) AS sent_prev,
				COUNT(*) FILTER (WHERE direction = 'incoming' AND created_at >= ?) AS recv_cur,
				COUNT(*) FILTER (WHERE direction = 'incoming' AND created_at < ?) AS recv_prev,
				COUNT(*) FILTER (WHERE direction = 'outgoing' AND status IN ('sent','delivered','read') AND created_at >= ?) AS ok_cur,
				COUNT(*) FILTER (WHERE direction = 'outgoing' AND status IN ('sent','delivered','read') AND created_at < ?) AS ok_prev,
				COUNT(*) FILTER (WHERE direction = 'outgoing' AND status IN ('delivered','read') AND created_at >= ?) AS delivered_cur,
				COUNT(*) FILTER (WHERE direction = 'outgoing' AND status IN ('delivered','read') AND created_at < ?) AS delivered_prev,
				COUNT(*) FILTER (WHERE direction = 'outgoing' AND status = 'read' AND created_at >= ?) AS read_cur,
				COUNT(*) FILTER (WHERE direction = 'outgoing' AND status = 'read' AND created_at < ?) AS read_prev,
				COUNT(*) FILTER (WHERE direction = 'outgoing' AND status = 'failed' AND created_at >= ?) AS failed_cur
			FROM messages
			WHERE organization_id = ? AND deleted_at IS NULL AND created_at >= ? AND created_at < ?`,
			from, from, from, from, from, from, from, from, from, from, from,
			orgID, prevFrom, to).Scan(&m).Error; err != nil {
			a.Log.Error("Dashboard chart message totals failed", "error", err)
		}
		resp.KPIs["messages_sent"] = wsKPICount(m.SentCur, m.SentPrev)
		resp.KPIs["messages_received"] = wsKPICount(m.RecvCur, m.RecvPrev)
		resp.KPIs["delivery_rate"] = DashboardKPI{Current: wsPct(m.DeliveredCur, m.OkCur), Previous: wsPct(m.DeliveredPrev, m.OkPrev)}
		resp.KPIs["read_rate"] = DashboardKPI{Current: wsPct(m.ReadCur, m.OkCur), Previous: wsPct(m.ReadPrev, m.OkPrev)}
		resp.Funnel = &ChartDeliveryFunnel{
			Total: m.SentCur, Sent: m.OkCur, Delivered: m.DeliveredCur, Read: m.ReadCur, Failed: m.FailedCur,
			Pending: max(0, m.SentCur-m.OkCur-m.FailedCur),
		}

		// Messages over time.
		var rows []struct {
			Bucket   string
			Sent     int64
			Received int64
		}
		if err := a.DB.Raw(`SELECT `+wsBucketExpr("created_at")+` AS bucket,
				COUNT(*) FILTER (WHERE direction = 'outgoing') AS sent,
				COUNT(*) FILTER (WHERE direction = 'incoming') AS received
			FROM messages
			WHERE organization_id = ? AND deleted_at IS NULL AND created_at >= ? AND created_at < ?
			GROUP BY 1`, gran, tz, orgID, from, to).Scan(&rows).Error; err != nil {
			a.Log.Error("Dashboard chart message series failed", "error", err)
		}
		byBucket := make(map[string]ChartMessagePoint, len(rows))
		for _, row := range rows {
			byBucket[row.Bucket] = ChartMessagePoint{Sent: row.Sent, Received: row.Received}
		}
		resp.Messages = make([]ChartMessagePoint, 0, len(buckets))
		for _, b := range buckets {
			p := byBucket[b]
			p.Date = b
			resp.Messages = append(resp.Messages, p)
		}

		// Busiest hours: customer messages by hour of day.
		var hours []struct {
			Hour  int
			Count int64
		}
		if err := a.DB.Raw(`SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE ?)::int AS hour, COUNT(*) AS count
			FROM messages
			WHERE organization_id = ? AND deleted_at IS NULL AND direction = 'incoming'
			AND created_at >= ? AND created_at < ?
			GROUP BY 1`, tz, orgID, from, to).Scan(&hours).Error; err != nil {
			a.Log.Error("Dashboard chart hourly failed", "error", err)
		}
		resp.Hourly = make([]int64, 24)
		for _, h := range hours {
			if h.Hour >= 0 && h.Hour < 24 {
				resp.Hourly[h.Hour] = h.Count
			}
		}
	}

	if analytics || can(models.ResourceTemplates) {
		resp.Templates = []ChartTemplate{}
		if err := a.DB.Raw(`SELECT template_name AS name, COUNT(*) AS sends,
				COUNT(*) FILTER (WHERE status IN ('delivered','read')) AS delivered,
				COUNT(*) FILTER (WHERE status = 'read') AS read
			FROM messages
			WHERE organization_id = ? AND deleted_at IS NULL AND direction = 'outgoing'
			AND template_name <> '' AND created_at >= ? AND created_at < ?
			GROUP BY template_name ORDER BY sends DESC, template_name LIMIT 8`, orgID, from, to).Scan(&resp.Templates).Error; err != nil {
			a.Log.Error("Dashboard chart templates failed", "error", err)
		}
	}

	// --- Contacts: KPIs and growth ---
	if can(models.ResourceContacts) {
		var c struct {
			Base, NewCur, NewPrev, Open int64
		}
		if err := a.DB.Raw(`SELECT
				COUNT(*) FILTER (WHERE created_at < ?) AS base,
				COUNT(*) FILTER (WHERE created_at >= ? AND created_at < ?) AS new_cur,
				COUNT(*) FILTER (WHERE created_at >= ? AND created_at < ?) AS new_prev,
				COUNT(*) FILTER (WHERE last_inbound_at >= ?) AS open
			FROM contacts WHERE organization_id = ? AND deleted_at IS NULL`,
			from, from, to, prevFrom, prevTo, time.Now().Add(-24*time.Hour), orgID).Scan(&c).Error; err != nil {
			a.Log.Error("Dashboard chart contact totals failed", "error", err)
		}
		resp.KPIs["new_contacts"] = wsKPICount(c.NewCur, c.NewPrev)
		// Open = customer wrote in the last 24h (WhatsApp service window). A snapshot, so no previous value.
		resp.KPIs["open_conversations"] = DashboardKPI{Current: wsF64(float64(c.Open))}

		var rows []struct {
			Bucket string
			N      int64
		}
		if err := a.DB.Raw(`SELECT `+wsBucketExpr("created_at")+` AS bucket, COUNT(*) AS n
			FROM contacts
			WHERE organization_id = ? AND deleted_at IS NULL AND created_at >= ? AND created_at < ?
			GROUP BY 1`, gran, tz, orgID, from, to).Scan(&rows).Error; err != nil {
			a.Log.Error("Dashboard chart contact series failed", "error", err)
		}
		byBucket := make(map[string]int64, len(rows))
		for _, row := range rows {
			byBucket[row.Bucket] = row.N
		}
		resp.Contacts = make([]ChartContactPoint, 0, len(buckets))
		total := c.Base
		for _, b := range buckets {
			total += byBucket[b]
			resp.Contacts = append(resp.Contacts, ChartContactPoint{Date: b, New: byBucket[b], Total: total})
		}
	}

	// --- Campaigns ---
	if can(models.ResourceCampaigns) {
		var cm struct{ Cur, Prev int64 }
		if err := a.DB.Raw(`SELECT
				COUNT(*) FILTER (WHERE r.sent_at >= ?) AS cur,
				COUNT(*) FILTER (WHERE r.sent_at < ?) AS prev
			FROM bulk_message_recipients r
			JOIN bulk_message_campaigns c ON c.id = r.campaign_id
			WHERE c.organization_id = ? AND r.deleted_at IS NULL AND r.sent_at >= ? AND r.sent_at < ?`,
			from, from, orgID, prevFrom, to).Scan(&cm).Error; err != nil {
			a.Log.Error("Dashboard chart campaign totals failed", "error", err)
		}
		resp.KPIs["campaign_messages"] = wsKPICount(cm.Cur, cm.Prev)

		resp.Campaigns = []ChartCampaign{}
		if err := a.DB.Raw(`SELECT c.id, c.name, c.status,
				COUNT(*) FILTER (WHERE r.status IN ('sent','delivered','read')) AS sent,
				COUNT(*) FILTER (WHERE r.status IN ('delivered','read')) AS delivered,
				COUNT(*) FILTER (WHERE r.status = 'read') AS read,
				COUNT(*) FILTER (WHERE r.status = 'failed') AS failed
			FROM bulk_message_recipients r
			JOIN bulk_message_campaigns c ON c.id = r.campaign_id AND c.deleted_at IS NULL
			WHERE c.organization_id = ? AND r.deleted_at IS NULL AND r.status <> 'pending'
			AND COALESCE(r.sent_at, r.updated_at) >= ? AND COALESCE(r.sent_at, r.updated_at) < ?
			GROUP BY c.id, c.name, c.status
			ORDER BY sent DESC, failed DESC LIMIT 6`, orgID, from, to).Scan(&resp.Campaigns).Error; err != nil {
			a.Log.Error("Dashboard chart campaigns failed", "error", err)
		}
	}

	// --- Conversations (agent queue) ---
	if can(models.ResourceTransfers) {
		var cv ChartConversations
		if err := a.DB.Raw(`SELECT
				COUNT(*) FILTER (WHERE status = 'active' AND agent_id IS NOT NULL) AS open_assigned,
				COUNT(*) FILTER (WHERE status = 'active' AND agent_id IS NULL) AS open_unassigned,
				COUNT(*) FILTER (WHERE status = 'resumed' AND resumed_at >= ? AND resumed_at < ?) AS resolved,
				COUNT(*) FILTER (WHERE status = 'expired' AND updated_at >= ? AND updated_at < ?) AS expired
			FROM agent_transfers WHERE organization_id = ? AND deleted_at IS NULL`,
			from, to, from, to, orgID).Scan(&cv).Error; err != nil {
			a.Log.Error("Dashboard chart conversations failed", "error", err)
		}
		resp.Conversations = &cv
	}

	// --- Agents and first response time ---
	allAgents := analytics || can(models.ResourceAnalyticsAgents)
	if allAgents || can(models.ResourceChat) {
		scope, scopeArgs := "", []any{}
		resp.AgentScope = "all"
		if !allAgents {
			scope, scopeArgs = " AND t.agent_id = ?", []any{userID}
			resp.AgentScope = "self"
		}
		var frt struct{ Cur, Prev *float64 }
		args := append([]any{from, from, orgID, prevFrom, to}, scopeArgs...)
		if err := a.DB.Raw(`SELECT
				AVG(EXTRACT(EPOCH FROM (t.first_response_at - t.transferred_at))) FILTER (WHERE t.transferred_at >= ?) AS cur,
				AVG(EXTRACT(EPOCH FROM (t.first_response_at - t.transferred_at))) FILTER (WHERE t.transferred_at < ?) AS prev
			FROM agent_transfers t
			WHERE t.organization_id = ? AND t.deleted_at IS NULL AND t.first_response_at IS NOT NULL
			AND t.transferred_at >= ? AND t.transferred_at < ?`+scope, args...).Scan(&frt).Error; err != nil {
			a.Log.Error("Dashboard chart first response failed", "error", err)
		}
		resp.KPIs["avg_first_response_seconds"] = DashboardKPI{Current: frt.Cur, Previous: frt.Prev}

		resp.Agents = []ChartAgent{}
		args = append([]any{orgID, from, to}, scopeArgs...)
		if err := a.DB.Raw(`SELECT t.agent_id AS user_id, COALESCE(MAX(u.full_name), '') AS name,
				COUNT(*) AS handled,
				COUNT(*) FILTER (WHERE t.status = 'resumed') AS resolved,
				AVG(EXTRACT(EPOCH FROM (t.first_response_at - t.transferred_at))) FILTER (WHERE t.first_response_at IS NOT NULL) AS avg_first_response_seconds
			FROM agent_transfers t
			LEFT JOIN users u ON u.id = t.agent_id
			WHERE t.organization_id = ? AND t.deleted_at IS NULL AND t.agent_id IS NOT NULL
			AND t.transferred_at >= ? AND t.transferred_at < ?`+scope+`
			GROUP BY t.agent_id ORDER BY handled DESC LIMIT 10`, args...).Scan(&resp.Agents).Error; err != nil {
			a.Log.Error("Dashboard chart agents failed", "error", err)
		}
	}

	// --- Chatbot ---
	if analytics || can(models.ResourceFlowsChatbot) || can(models.ResourceChatbotAI) {
		var b struct {
			Cur, Prev, Active, Completed, Cancelled, Timeout int64
		}
		if err := a.DB.Raw(`SELECT
				COUNT(*) FILTER (WHERE created_at >= ?) AS cur,
				COUNT(*) FILTER (WHERE created_at < ?) AS prev,
				COUNT(*) FILTER (WHERE created_at >= ? AND status = 'active') AS active,
				COUNT(*) FILTER (WHERE created_at >= ? AND status = 'completed') AS completed,
				COUNT(*) FILTER (WHERE created_at >= ? AND status = 'cancelled') AS cancelled,
				COUNT(*) FILTER (WHERE created_at >= ? AND status = 'timeout') AS timeout
			FROM chatbot_sessions
			WHERE organization_id = ? AND deleted_at IS NULL AND created_at >= ? AND created_at < ?`,
			from, from, from, from, from, from, orgID, prevFrom, to).Scan(&b).Error; err != nil {
			a.Log.Error("Dashboard chart bot totals failed", "error", err)
		}
		resp.KPIs["bot_sessions"] = wsKPICount(b.Cur, b.Prev)
		bot := &ChartBot{Sessions: b.Cur, Active: b.Active, Completed: b.Completed, Cancelled: b.Cancelled, Timeout: b.Timeout, TopFlows: []ChartFlow{}}
		if err := a.DB.Raw(`SELECT f.id, f.name, COUNT(*) AS sessions,
				COUNT(*) FILTER (WHERE s.status = 'completed') AS completed
			FROM chatbot_sessions s
			JOIN chatbot_flows f ON f.id = s.current_flow_id
			WHERE s.organization_id = ? AND s.deleted_at IS NULL AND s.created_at >= ? AND s.created_at < ?
			GROUP BY f.id, f.name ORDER BY sessions DESC, f.name LIMIT 6`, orgID, from, to).Scan(&bot.TopFlows).Error; err != nil {
			a.Log.Error("Dashboard chart top flows failed", "error", err)
		}
		resp.Bot = bot
	}

	return r.SendEnvelope(resp)
}
