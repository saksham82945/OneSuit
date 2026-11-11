package handlers

import (
	"math"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// ============================================================================
// Super admin dashboard charts: GET /api/super-admin/dashboard/charts?from=&to=
//
// Everything here is read from real rows (organizations, subscriptions,
// payments, billing_invoices, messages, support tickets). The shared demo
// workspace is left out, like the dashboard overview.
//
// Revenue: every paid payment creates an invoice, so revenue = paid invoices
// + paid payments that have no invoice (yet). Each invoice is labelled with
// the method of the payment behind it (razorpay / upi); invoices with no
// payment are "manual" (activated by the platform team) or "ad_credit".
// ============================================================================

// SAChartKPI is a metric for the selected period and, where it can be known,
// the same metric for the previous period of equal length.
type SAChartKPI struct {
	Value    float64  `json:"value"`
	Previous *float64 `json:"previous"` // nil: no history to compare against
}

// SAChartKPIs are the dashboard's headline numbers.
type SAChartKPIs struct {
	TotalClients        SAChartKPI `json:"total_clients"`
	ActiveClients       SAChartKPI `json:"active_clients"`
	AwaitingPayment     SAChartKPI `json:"awaiting_payment"`
	SuspendedClients    SAChartKPI `json:"suspended_clients"`
	NewSignups          SAChartKPI `json:"new_signups"`
	MRR                 SAChartKPI `json:"mrr"`
	RevenueCollected    SAChartKPI `json:"revenue_collected"`
	PaidPayments        SAChartKPI `json:"paid_payments"`
	PendingUPIApprovals SAChartKPI `json:"pending_upi_approvals"`
	OpenTickets         SAChartKPI `json:"open_tickets"`
	Messages            SAChartKPI `json:"messages"`
	ConnectedNumbers    SAChartKPI `json:"connected_numbers"`
}

// SARevenuePoint is revenue collected in one bucket, by how it was paid.
type SARevenuePoint struct {
	Bucket   string  `json:"bucket"`
	Razorpay float64 `json:"razorpay"`
	UPI      float64 `json:"upi"`
	Manual   float64 `json:"manual"`
	AdCredit float64 `json:"ad_credit"`
}

// SACountPoint is a count in one bucket.
type SACountPoint struct {
	Bucket string `json:"bucket"`
	Count  int64  `json:"count"`
}

// SAMessagePoint is messages sent/received in one bucket.
type SAMessagePoint struct {
	Bucket   string `json:"bucket"`
	Sent     int64  `json:"sent"`
	Received int64  `json:"received"`
}

// SATicketPoint is tickets opened/solved in one bucket.
type SATicketPoint struct {
	Bucket string `json:"bucket"`
	Opened int64  `json:"opened"`
	Solved int64  `json:"solved"`
}

// SAMRRPoint is the monthly recurring revenue at the end of one bucket.
type SAMRRPoint struct {
	Bucket string  `json:"bucket"`
	MRR    float64 `json:"mrr"`
}

// SALabelCount is a labelled count (donuts / bars).
type SALabelCount struct {
	Key   string  `json:"key"`
	Label string  `json:"label"`
	Count int64   `json:"count"`
	MRR   float64 `json:"mrr,omitempty"`
}

// SARenewalDay is renewals due on one day.
type SARenewalDay struct {
	Date   string  `json:"date"`
	Count  int64   `json:"count"`
	Amount float64 `json:"amount"`
}

// SAFunnel is payments started in the period by where they ended up.
type SAFunnel struct {
	Started             int64   `json:"started"`
	Created             int64   `json:"created"` // still waiting for the customer
	PendingVerification int64   `json:"pending_verification"`
	Paid                int64   `json:"paid"`
	Failed              int64   `json:"failed"`
	Rejected            int64   `json:"rejected"`
	PaidAmount          float64 `json:"paid_amount"`
}

// SATopClient is a client ranked by messages in the period.
type SATopClient struct {
	ID       uuid.UUID `json:"id"`
	Name     string    `json:"name"`
	Messages int64     `json:"messages"`
	Sent     int64     `json:"sent"`
	Received int64     `json:"received"`
}

// SuperAdminChartsResponse is the payload for the super admin dashboard charts.
type SuperAdminChartsResponse struct {
	From            string           `json:"from"` // YYYY-MM-DD, inclusive
	To              string           `json:"to"`   // YYYY-MM-DD, inclusive
	PrevFrom        string           `json:"prev_from"`
	PrevTo          string           `json:"prev_to"`
	Granularity     string           `json:"granularity"` // day | month
	Timezone        string           `json:"timezone"`
	Currency        string           `json:"currency"`
	KPIs            SAChartKPIs      `json:"kpis"`
	Revenue         []SARevenuePoint `json:"revenue"`
	Signups         []SACountPoint   `json:"signups"`
	Messages        []SAMessagePoint `json:"messages"`
	Tickets         []SATicketPoint  `json:"tickets"`
	MRRTrend        []SAMRRPoint     `json:"mrr_trend"`
	ClientsByStatus []SALabelCount   `json:"clients_by_status"`
	ClientsByPlan   []SALabelCount   `json:"clients_by_plan"`
	RenewalsNext30  []SARenewalDay   `json:"renewals_next_30"`
	PaymentFunnel   SAFunnel         `json:"payment_funnel"`
	TopClients      []SATopClient    `json:"top_clients"`
}

// saMaxChartRangeDays caps the custom range so a query can't scan forever.
const saMaxChartRangeDays = 800

// saChartRange turns ?from=&to= (YYYY-MM-DD, inclusive, platform time zone) into
// [start, end). Defaults to the last 30 days.
func saChartRange(fromS, toS string, now time.Time, loc *time.Location) (time.Time, time.Time, bool) {
	today := startOfDay(now, loc)
	end := today.AddDate(0, 0, 1)
	if toS != "" {
		t, err := time.ParseInLocation("2006-01-02", toS, loc)
		if err != nil {
			return time.Time{}, time.Time{}, false
		}
		end = t.AddDate(0, 0, 1)
	}
	start := end.AddDate(0, 0, -30)
	if fromS != "" {
		f, err := time.ParseInLocation("2006-01-02", fromS, loc)
		if err != nil {
			return time.Time{}, time.Time{}, false
		}
		start = f
	}
	if !start.Before(end) || end.Sub(start) > saMaxChartRangeDays*24*time.Hour {
		return time.Time{}, time.Time{}, false
	}
	return start, end, true
}

// saChartBuckets lists every bucket start in [start, end) so empty buckets show as zero.
func saChartBuckets(start, end time.Time, gran string) []time.Time {
	var out []time.Time
	t := start
	if gran == "month" {
		t = time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, start.Location())
	}
	for t.Before(end) {
		out = append(out, t)
		if gran == "month" {
			t = t.AddDate(0, 1, 0)
		} else {
			t = t.AddDate(0, 0, 1)
		}
	}
	return out
}

func saF64p(v float64) *float64 { return &v }

// SuperAdminDashboardCharts returns time series and breakdowns for the platform dashboard.
func (a *App) SuperAdminDashboardCharts(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}

	cfg := a.loadPlatformConfig()
	loc := time.UTC
	if cfg.Timezone != "" {
		if l, err := time.LoadLocation(cfg.Timezone); err == nil {
			loc = l
		}
	}
	now := time.Now()
	q := r.RequestCtx.QueryArgs()
	start, end, ok := saChartRange(strings.TrimSpace(string(q.Peek("from"))), strings.TrimSpace(string(q.Peek("to"))), now, loc)
	if !ok {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid date range (use YYYY-MM-DD, from before to, at most 800 days)", nil, "")
	}
	span := end.Sub(start)
	prevStart, prevEnd := start.Add(-span), start

	gran := "day"
	if span > 92*24*time.Hour {
		gran = "month"
	}
	tz := loc.String()
	demoID := a.demoOrgID()

	resp := SuperAdminChartsResponse{
		From: start.Format("2006-01-02"), To: end.AddDate(0, 0, -1).Format("2006-01-02"),
		PrevFrom: prevStart.Format("2006-01-02"), PrevTo: prevEnd.AddDate(0, 0, -1).Format("2006-01-02"),
		Granularity: gran, Timezone: tz, Currency: models.PlatformCurrency,
		ClientsByStatus: []SALabelCount{}, ClientsByPlan: []SALabelCount{},
		RenewalsNext30: []SARenewalDay{}, TopClients: []SATopClient{},
	}

	buckets := saChartBuckets(start, end, gran)
	keys := make([]string, len(buckets))
	index := make(map[string]int, len(buckets))
	for i, b := range buckets {
		keys[i] = b.Format("2006-01-02")
		index[keys[i]] = i
	}
	// SQL expression giving a timestamp column's bucket key in the platform time zone.
	bucketExpr := func(col string) string {
		return "to_char(date_trunc('" + gran + "', " + col + " AT TIME ZONE '" + strings.ReplaceAll(tz, "'", "") + "'), 'YYYY-MM-DD')"
	}

	a.saChartRevenue(&resp, keys, index, bucketExpr, start, end, prevStart, prevEnd, demoID)
	a.saChartSignups(&resp, keys, index, bucketExpr, start, end, prevStart, prevEnd, demoID)
	a.saChartMessages(&resp, keys, index, bucketExpr, start, end, prevStart, prevEnd, demoID)
	a.saChartTickets(&resp, keys, index, bucketExpr, start, end, demoID)
	a.saChartSubscriptions(&resp, now, loc, demoID)
	a.saChartMRRTrend(&resp, buckets, end, now, gran, demoID)
	a.saChartFunnel(&resp, start, end, demoID)

	resp.KPIs.ConnectedNumbers = SAChartKPI{
		Value: float64(a.countSQL(`SELECT COUNT(*) FROM whatsapp_accounts WHERE deleted_at IS NULL AND organization_id <> ?`, demoID)),
		Previous: saF64p(float64(a.countSQL(`SELECT COUNT(*) FROM whatsapp_accounts
			WHERE deleted_at IS NULL AND organization_id <> ? AND created_at < ?`, demoID, start))),
	}
	resp.KPIs.PendingUPIApprovals = SAChartKPI{Value: float64(a.countSQL(`SELECT COUNT(*) FROM payments
		WHERE deleted_at IS NULL AND status = ? AND organization_id <> ?`, models.PaymentStatusPendingVerification, demoID))}
	resp.KPIs.OpenTickets = SAChartKPI{Value: float64(a.countSQL(`SELECT COUNT(*) FROM support_tickets
		WHERE deleted_at IS NULL AND status = ? AND organization_id <> ?`, models.TicketStatusOpen, demoID))}

	return r.SendEnvelope(resp)
}

type saBucketExprFn func(col string) string

// chartRevenue: paid invoices (labelled by the payment behind them) plus paid
// payments without an invoice, so nothing is counted twice.
func (a *App) saChartRevenue(resp *SuperAdminChartsResponse, keys []string, index map[string]int, bucket saBucketExprFn,
	start, end, prevStart, prevEnd time.Time, demoID uuid.UUID) {
	resp.Revenue = make([]SARevenuePoint, len(keys))
	for i, k := range keys {
		resp.Revenue[i].Bucket = k
	}
	const revenueRows = `
		SELECT COALESCE(i.paid_at, i.issued_at) AS ts, i.amount,
			CASE WHEN pay.method IS NOT NULL THEN pay.method
			     WHEN i.kind = 'ad_credit' THEN 'ad_credit' ELSE 'manual' END AS method
		FROM billing_invoices i
		LEFT JOIN LATERAL (SELECT p.method FROM payments p
			WHERE p.invoice_id = i.id AND p.deleted_at IS NULL LIMIT 1) pay ON TRUE
		WHERE i.deleted_at IS NULL AND i.status = 'paid' AND i.organization_id <> @demo
		UNION ALL
		SELECT COALESCE(p.paid_at, p.updated_at) AS ts, p.amount, p.method
		FROM payments p
		WHERE p.deleted_at IS NULL AND p.status = 'paid' AND p.organization_id <> @demo
		  AND (p.invoice_id IS NULL OR NOT EXISTS (
			SELECT 1 FROM billing_invoices bi WHERE bi.id = p.invoice_id AND bi.deleted_at IS NULL))`

	var rows []struct {
		Bucket string
		Method string
		Amount float64
		N      int64
	}
	if err := a.DB.Raw(`SELECT `+bucket("ts")+` AS bucket, method, SUM(amount) AS amount, COUNT(*) AS n
		FROM (`+revenueRows+`) rev WHERE ts >= @start AND ts < @end GROUP BY 1, 2`,
		map[string]any{"demo": demoID, "start": start, "end": end}).Scan(&rows).Error; err != nil {
		a.Log.Error("Super admin revenue chart failed", "error", err)
	}
	var total float64
	var count int64
	for _, r := range rows {
		total += r.Amount
		count += r.N
		i, ok := index[r.Bucket]
		if !ok {
			continue
		}
		switch r.Method {
		case models.PaymentMethodRazorpay:
			resp.Revenue[i].Razorpay += r.Amount
		case models.PaymentMethodUPI:
			resp.Revenue[i].UPI += r.Amount
		case "ad_credit":
			resp.Revenue[i].AdCredit += r.Amount
		default:
			resp.Revenue[i].Manual += r.Amount
		}
	}

	var prev struct {
		Amount float64
		N      int64
	}
	if err := a.DB.Raw(`SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS n
		FROM (`+revenueRows+`) rev WHERE ts >= @start AND ts < @end`,
		map[string]any{"demo": demoID, "start": prevStart, "end": prevEnd}).Scan(&prev).Error; err != nil {
		a.Log.Error("Super admin previous revenue failed", "error", err)
	}
	resp.KPIs.RevenueCollected = SAChartKPI{Value: total, Previous: saF64p(prev.Amount)}
	resp.KPIs.PaidPayments = SAChartKPI{Value: float64(count), Previous: saF64p(float64(prev.N))}
}

func (a *App) saChartSignups(resp *SuperAdminChartsResponse, keys []string, index map[string]int, bucket saBucketExprFn,
	start, end, prevStart, prevEnd time.Time, demoID uuid.UUID) {
	resp.Signups = make([]SACountPoint, len(keys))
	for i, k := range keys {
		resp.Signups[i].Bucket = k
	}
	var rows []struct {
		Bucket string
		N      int64
	}
	if err := a.DB.Raw(`SELECT `+bucket("created_at")+` AS bucket, COUNT(*) AS n FROM organizations
		WHERE deleted_at IS NULL AND id <> ? AND created_at >= ? AND created_at < ? GROUP BY 1`,
		demoID, start, end).Scan(&rows).Error; err != nil {
		a.Log.Error("Super admin signups chart failed", "error", err)
	}
	var total int64
	for _, r := range rows {
		total += r.N
		if i, ok := index[r.Bucket]; ok {
			resp.Signups[i].Count = r.N
		}
	}
	prev := a.countSQL(`SELECT COUNT(*) FROM organizations
		WHERE deleted_at IS NULL AND id <> ? AND created_at >= ? AND created_at < ?`, demoID, prevStart, prevEnd)
	resp.KPIs.NewSignups = SAChartKPI{Value: float64(total), Previous: saF64p(float64(prev))}

	before := a.countSQL(`SELECT COUNT(*) FROM organizations WHERE deleted_at IS NULL AND id <> ? AND created_at < ?`, demoID, start)
	all := a.countSQL(`SELECT COUNT(*) FROM organizations WHERE deleted_at IS NULL AND id <> ?`, demoID)
	resp.KPIs.TotalClients = SAChartKPI{Value: float64(all), Previous: saF64p(float64(before))}
}

func (a *App) saChartMessages(resp *SuperAdminChartsResponse, keys []string, index map[string]int, bucket saBucketExprFn,
	start, end, prevStart, prevEnd time.Time, demoID uuid.UUID) {
	resp.Messages = make([]SAMessagePoint, len(keys))
	for i, k := range keys {
		resp.Messages[i].Bucket = k
	}
	var rows []struct {
		Bucket   string
		Sent     int64
		Received int64
	}
	if err := a.DB.Raw(`SELECT `+bucket("created_at")+` AS bucket,
			COUNT(*) FILTER (WHERE direction = 'outgoing') AS sent,
			COUNT(*) FILTER (WHERE direction = 'incoming') AS received
		FROM messages WHERE deleted_at IS NULL AND organization_id <> ? AND created_at >= ? AND created_at < ?
		GROUP BY 1`, demoID, start, end).Scan(&rows).Error; err != nil {
		a.Log.Error("Super admin messages chart failed", "error", err)
	}
	var total int64
	for _, r := range rows {
		total += r.Sent + r.Received
		if i, ok := index[r.Bucket]; ok {
			resp.Messages[i].Sent, resp.Messages[i].Received = r.Sent, r.Received
		}
	}
	prev := a.countSQL(`SELECT COUNT(*) FROM messages
		WHERE deleted_at IS NULL AND organization_id <> ? AND created_at >= ? AND created_at < ?
		AND direction IN ('outgoing', 'incoming')`, demoID, prevStart, prevEnd)
	resp.KPIs.Messages = SAChartKPI{Value: float64(total), Previous: saF64p(float64(prev))}

	var top []SATopClient
	if err := a.DB.Raw(`SELECT m.organization_id AS id, o.name,
			COUNT(*) AS messages,
			COUNT(*) FILTER (WHERE m.direction = 'outgoing') AS sent,
			COUNT(*) FILTER (WHERE m.direction = 'incoming') AS received
		FROM messages m JOIN organizations o ON o.id = m.organization_id AND o.deleted_at IS NULL
		WHERE m.deleted_at IS NULL AND m.organization_id <> ? AND m.created_at >= ? AND m.created_at < ?
		GROUP BY m.organization_id, o.name ORDER BY messages DESC, o.name ASC LIMIT 10`,
		demoID, start, end).Scan(&top).Error; err != nil {
		a.Log.Error("Super admin top clients failed", "error", err)
	}
	if top != nil {
		resp.TopClients = top
	}
}

func (a *App) saChartTickets(resp *SuperAdminChartsResponse, keys []string, index map[string]int, bucket saBucketExprFn,
	start, end time.Time, demoID uuid.UUID) {
	resp.Tickets = make([]SATicketPoint, len(keys))
	for i, k := range keys {
		resp.Tickets[i].Bucket = k
	}
	var rows []struct {
		Bucket string
		N      int64
	}
	if err := a.DB.Raw(`SELECT `+bucket("created_at")+` AS bucket, COUNT(*) AS n FROM support_tickets
		WHERE deleted_at IS NULL AND organization_id <> ? AND created_at >= ? AND created_at < ? GROUP BY 1`,
		demoID, start, end).Scan(&rows).Error; err != nil {
		a.Log.Error("Super admin tickets chart failed", "error", err)
	}
	for _, r := range rows {
		if i, ok := index[r.Bucket]; ok {
			resp.Tickets[i].Opened = r.N
		}
	}
	rows = nil
	if err := a.DB.Raw(`SELECT `+bucket("solved_at")+` AS bucket, COUNT(*) AS n FROM support_tickets
		WHERE deleted_at IS NULL AND organization_id <> ? AND solved_at >= ? AND solved_at < ? GROUP BY 1`,
		demoID, start, end).Scan(&rows).Error; err != nil {
		a.Log.Error("Super admin solved tickets chart failed", "error", err)
	}
	for _, r := range rows {
		if i, ok := index[r.Bucket]; ok {
			resp.Tickets[i].Solved = r.N
		}
	}
}

var saChartStatusLabels = map[string]string{
	"active":          "Active",
	"pending_payment": "Awaiting payment",
	"expired":         "Expired",
	"idle":            "No plan",
	"trial":           "Trial (legacy)",
	"suspended":       "Suspended",
}

// chartSubscriptions: clients by status and plan, current MRR and renewals due.
// The status follows the same rules as the clients list.
func (a *App) saChartSubscriptions(resp *SuperAdminChartsResponse, now time.Time, loc *time.Location, demoID uuid.UUID) {
	var rows []struct {
		Status       *string
		PlanID       *uuid.UUID
		RenewalDate  *time.Time
		BillingCycle *string
	}
	if err := a.DB.Raw(`SELECT s.status, s.plan_id, s.renewal_date, s.billing_cycle
		FROM organizations o
		LEFT JOIN organization_subscriptions s ON s.organization_id = o.id AND s.deleted_at IS NULL
		WHERE o.deleted_at IS NULL AND o.id <> ?`, demoID).Scan(&rows).Error; err != nil {
		a.Log.Error("Super admin subscription chart failed", "error", err)
	}
	var plans []models.SubscriptionPlan
	a.DB.Find(&plans)
	planByID := make(map[uuid.UUID]models.SubscriptionPlan, len(plans))
	for _, p := range plans {
		planByID[p.ID] = p
	}

	statusCount := map[string]int64{}
	type planAgg struct {
		count int64
		mrr   float64
	}
	perPlan := map[string]*planAgg{}
	in30 := now.AddDate(0, 0, 30)
	renewals := map[string]*SARenewalDay{}
	var mrr float64

	for _, r := range rows {
		status := models.VendorStatusActive
		if r.Status != nil && *r.Status != "" {
			status = *r.Status
		}
		cycle := models.BillingIntervalMonthly
		if r.BillingCycle != nil && models.BillingCycleMonths(*r.BillingCycle) > 0 {
			cycle = *r.BillingCycle
		}
		var plan *models.SubscriptionPlan
		if r.PlanID != nil {
			if p, ok := planByID[*r.PlanID]; ok {
				plan = &p
			}
		}
		state := status
		switch {
		case status == models.VendorStatusSuspended, status == models.VendorStatusPendingPayment:
		case r.RenewalDate != nil && r.RenewalDate.Before(now):
			state = "expired"
		case status == models.VendorStatusTrial:
		case r.PlanID == nil:
			state = "idle"
		default:
			state = "active"
		}
		statusCount[state]++

		cycleAmount, monthly := 0.0, 0.0
		if plan != nil {
			cycleAmount = plan.PriceFor(cycle)
			monthly = cycleAmount / float64(models.BillingCycleMonths(cycle))
		}
		if state == "active" {
			mrr += monthly
		}
		if state != "suspended" {
			name := "No plan"
			if plan != nil {
				name = plan.Name
			}
			agg := perPlan[name]
			if agg == nil {
				agg = &planAgg{}
				perPlan[name] = agg
			}
			agg.count++
			if state == "active" {
				agg.mrr += monthly
			}
		}
		if (state == "active" || state == "trial") && r.RenewalDate != nil && r.RenewalDate.Before(in30) {
			day := r.RenewalDate.In(loc).Format("2006-01-02")
			d := renewals[day]
			if d == nil {
				d = &SARenewalDay{Date: day}
				renewals[day] = d
			}
			d.Count++
			d.Amount += cycleAmount
		}
	}

	for _, key := range []string{"active", "pending_payment", "expired", "idle", "trial", "suspended"} {
		if n := statusCount[key]; n > 0 {
			resp.ClientsByStatus = append(resp.ClientsByStatus, SALabelCount{Key: key, Label: saChartStatusLabels[key], Count: n})
		}
	}
	for name, agg := range perPlan {
		resp.ClientsByPlan = append(resp.ClientsByPlan, SALabelCount{Key: name, Label: name, Count: agg.count, MRR: math.Round(agg.mrr)})
	}
	sort.Slice(resp.ClientsByPlan, func(i, j int) bool {
		if resp.ClientsByPlan[i].Count != resp.ClientsByPlan[j].Count {
			return resp.ClientsByPlan[i].Count > resp.ClientsByPlan[j].Count
		}
		return resp.ClientsByPlan[i].Label < resp.ClientsByPlan[j].Label
	})
	for _, d := range renewals {
		resp.RenewalsNext30 = append(resp.RenewalsNext30, *d)
	}
	sort.Slice(resp.RenewalsNext30, func(i, j int) bool { return resp.RenewalsNext30[i].Date < resp.RenewalsNext30[j].Date })

	resp.KPIs.ActiveClients = SAChartKPI{Value: float64(statusCount["active"])}
	resp.KPIs.AwaitingPayment = SAChartKPI{Value: float64(statusCount["pending_payment"])}
	resp.KPIs.SuspendedClients = SAChartKPI{Value: float64(statusCount["suspended"])}
	resp.KPIs.MRR = SAChartKPI{Value: math.Round(mrr)}
}

// chartMRRTrend rebuilds MRR at the end of each bucket from paid subscription
// invoices: an invoice adds amount ÷ months-covered while its period runs.
// (Subscription status history isn't stored, so invoices are the record.)
func (a *App) saChartMRRTrend(resp *SuperAdminChartsResponse, buckets []time.Time, end, now time.Time, gran string, demoID uuid.UUID) {
	resp.MRRTrend = make([]SAMRRPoint, len(buckets))
	var inv []struct {
		Amount      float64
		PeriodStart time.Time
		PeriodEnd   time.Time
	}
	first := end
	if len(buckets) > 0 {
		first = buckets[0]
	}
	if err := a.DB.Raw(`SELECT amount, period_start, period_end FROM billing_invoices
		WHERE deleted_at IS NULL AND status = 'paid' AND kind = 'subscription' AND organization_id <> ?
		  AND period_start IS NOT NULL AND period_end IS NOT NULL AND period_end > period_start
		  AND period_end > ? AND period_start < ?`, demoID, first, end).Scan(&inv).Error; err != nil {
		a.Log.Error("Super admin MRR trend failed", "error", err)
	}
	for i, b := range buckets {
		at := b.AddDate(0, 0, 1)
		if gran == "month" {
			at = b.AddDate(0, 1, 0)
		}
		if at.After(end) {
			at = end
		}
		if at.After(now) {
			at = now
		}
		at = at.Add(-time.Second) // the last moment of the bucket
		var sum float64
		for _, v := range inv {
			if v.PeriodStart.After(at) || !v.PeriodEnd.After(at) {
				continue
			}
			months := math.Round(v.PeriodEnd.Sub(v.PeriodStart).Hours() / 24 / 30.44)
			if months < 1 {
				months = 1
			}
			sum += v.Amount / months
		}
		resp.MRRTrend[i] = SAMRRPoint{Bucket: b.Format("2006-01-02"), MRR: math.Round(sum)}
	}
}

func (a *App) saChartFunnel(resp *SuperAdminChartsResponse, start, end time.Time, demoID uuid.UUID) {
	var rows []struct {
		Status string
		N      int64
		Amount float64
	}
	if err := a.DB.Raw(`SELECT status, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS amount FROM payments
		WHERE deleted_at IS NULL AND organization_id <> ? AND created_at >= ? AND created_at < ?
		GROUP BY status`, demoID, start, end).Scan(&rows).Error; err != nil {
		a.Log.Error("Super admin payment funnel failed", "error", err)
	}
	f := &resp.PaymentFunnel
	for _, r := range rows {
		f.Started += r.N
		switch r.Status {
		case models.PaymentStatusCreated:
			f.Created = r.N
		case models.PaymentStatusPendingVerification:
			f.PendingVerification = r.N
		case models.PaymentStatusPaid:
			f.Paid, f.PaidAmount = r.N, r.Amount
		case models.PaymentStatusFailed:
			f.Failed = r.N
		case models.PaymentStatusRejected:
			f.Rejected = r.N
		}
	}
}
