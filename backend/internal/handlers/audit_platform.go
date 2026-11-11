package handlers

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"
)

// Platform audit log: what super admins see across every workspace.

// platformAudit records a platform-level change made by the calling super
// admin (plans, platform and payment settings). It is filed under the super
// admin's own workspace.
func (a *App) platformAudit(r *fastglue.Request, resourceType string, resourceID uuid.UUID, action models.AuditAction, oldData, newData any, extra ...map[string]any) {
	userID, ok := r.RequestCtx.UserValue("user_id").(uuid.UUID)
	if !ok {
		return
	}
	orgID, err := a.getOrgID(r)
	if err != nil {
		return
	}
	a.logAudit(orgID, userID, resourceType, resourceID, action, oldData, newData, extra...)
}

// auditPaymentDecision records a super admin approving or rejecting a
// payment, filed under the client's workspace.
func (a *App) auditPaymentDecision(id, adminID uuid.UUID, action models.AuditAction, reason string) {
	var p models.Payment
	if err := a.DB.Where("id = ?", id).First(&p).Error; err != nil {
		return
	}
	changes := []map[string]any{
		{"field": "amount", "old_value": nil, "new_value": p.Amount},
		{"field": "plan", "old_value": nil, "new_value": p.PlanName},
		{"field": "method", "old_value": nil, "new_value": p.Method},
	}
	if reason != "" {
		changes = append(changes, map[string]any{"field": "reason", "old_value": nil, "new_value": reason})
	}
	a.logAudit(p.OrganizationID, adminID, "payment", p.ID, action, nil, nil, changes...)
}

// PlatformAuditLogRow is an audit entry with the workspace it belongs to.
type PlatformAuditLogRow struct {
	ID               uuid.UUID          `json:"id"`
	OrganizationID   uuid.UUID          `json:"organization_id"`
	OrganizationName string             `json:"organization_name"`
	ResourceType     string             `json:"resource_type"`
	ResourceID       uuid.UUID          `json:"resource_id"`
	UserID           uuid.UUID          `json:"user_id"`
	UserName         string             `json:"user_name"`
	Action           models.AuditAction `json:"action"`
	Changes          models.JSONBArray  `json:"changes"`
	CreatedAt        time.Time          `json:"created_at"`
}

// maxAuditExportRows caps a CSV export.
const maxAuditExportRows = 10000

// platformAuditQuery applies the list filters shared by the page and the export.
func (a *App) platformAuditQuery(q *fasthttp.Args) *gorm.DB {
	db := a.DB.Table("audit_logs AS l").Joins("LEFT JOIN organizations o ON o.id = l.organization_id")
	if v := string(q.Peek("organization_id")); v != "" {
		if id, err := uuid.Parse(v); err == nil {
			db = db.Where("l.organization_id = ?", id)
		}
	}
	if v := string(q.Peek("resource_type")); v != "" {
		db = db.Where("l.resource_type = ?", v)
	}
	if v := string(q.Peek("action")); v != "" {
		db = db.Where("l.action = ?", v)
	}
	if v := strings.TrimSpace(string(q.Peek("search"))); v != "" {
		like := "%" + v + "%"
		db = db.Where("l.user_name ILIKE ? OR o.name ILIKE ? OR l.resource_type ILIKE ? OR l.changes::text ILIKE ?", like, like, like, like)
	}
	if t, ok := parseAuditDay(string(q.Peek("from"))); ok {
		db = db.Where("l.created_at >= ?", t)
	}
	if t, ok := parseAuditDay(string(q.Peek("to"))); ok {
		db = db.Where("l.created_at < ?", t.AddDate(0, 0, 1))
	}
	return db
}

// parseAuditDay reads a YYYY-MM-DD date as the start of that day in the
// platform's time zone.
func parseAuditDay(v string) (time.Time, bool) {
	if v == "" {
		return time.Time{}, false
	}
	t, err := time.ParseInLocation(time.DateOnly, v, time.Local)
	return t, err == nil
}

// SuperAdminListAuditLogs lists audit entries from every workspace
// (GET /api/super-admin/audit-logs?organization_id=&resource_type=&action=&search=&from=&to=&page=&limit=,
// or &format=csv for a download).
func (a *App) SuperAdminListAuditLogs(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	q := r.RequestCtx.QueryArgs()
	base := a.platformAuditQuery(q)
	sel := "l.id, l.organization_id, o.name AS organization_name, l.resource_type, l.resource_id, l.user_id, l.user_name, l.action, l.changes, l.created_at"

	if string(q.Peek("format")) == "csv" {
		rows := []PlatformAuditLogRow{}
		if err := base.Select(sel).Order("l.created_at DESC").Limit(maxAuditExportRows).Scan(&rows).Error; err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Could not export the audit log", nil, "")
		}
		return sendAuditCSV(r, rows)
	}

	pg := parsePaginationWithDefaults(r, 50, 200)
	var total int64
	if err := base.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		a.Log.Error("Failed to count audit logs", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Could not load the audit log", nil, "")
	}
	rows := []PlatformAuditLogRow{}
	if err := base.Session(&gorm.Session{}).Select(sel).Order("l.created_at DESC").
		Offset(pg.Offset).Limit(pg.Limit).Scan(&rows).Error; err != nil {
		a.Log.Error("Failed to list audit logs", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Could not load the audit log", nil, "")
	}

	// Choices for the filters, and today's activity for the summary cards.
	resourceTypes := []string{}
	a.DB.Model(&models.AuditLog{}).Distinct("resource_type").Order("resource_type").Pluck("resource_type", &resourceTypes)
	var summary struct {
		Today      int64 `json:"today"`
		Week       int64 `json:"week"`
		Deletions  int64 `json:"deletions_week"`
		ActiveUser int64 `json:"active_users_week"`
	}
	now := time.Now()
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	weekStart := dayStart.AddDate(0, 0, -6)
	a.DB.Raw(`SELECT COUNT(*) FILTER (WHERE created_at >= ?) AS today,
		COUNT(*) AS week,
		COUNT(*) FILTER (WHERE action = 'deleted') AS deletions,
		COUNT(DISTINCT user_id) AS active_user
		FROM audit_logs WHERE created_at >= ?`, dayStart, weekStart).Scan(&summary)

	return r.SendEnvelope(map[string]any{
		"audit_logs": rows, "total": total, "page": pg.Page, "limit": pg.Limit,
		"resource_types": resourceTypes, "summary": summary,
	})
}

// sendAuditCSV writes the rows as a CSV download.
func sendAuditCSV(r *fastglue.Request, rows []PlatformAuditLogRow) error {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"Time", "Workspace", "User", "Action", "Resource", "Resource ID", "Changes"})
	for _, row := range rows {
		_ = w.Write([]string{
			row.CreatedAt.Format(time.RFC3339), row.OrganizationName, row.UserName, string(row.Action),
			row.ResourceType, row.ResourceID.String(), summarizeChanges(row.Changes),
		})
	}
	w.Flush()
	r.RequestCtx.Response.Header.Set("Content-Type", "text/csv; charset=utf-8")
	r.RequestCtx.Response.Header.Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="audit-log-%s.csv"`, time.Now().Format("2006-01-02")))
	r.RequestCtx.SetStatusCode(fasthttp.StatusOK)
	r.RequestCtx.SetBody(buf.Bytes())
	return nil
}

// summarizeChanges turns a change list into "field: old → new; ..." text.
func summarizeChanges(changes models.JSONBArray) string {
	parts := make([]string, 0, len(changes))
	for _, c := range changes {
		m, ok := c.(map[string]any)
		if !ok {
			continue
		}
		parts = append(parts, fmt.Sprintf("%v: %s → %s", m["field"], auditValue(m["old_value"]), auditValue(m["new_value"])))
	}
	return strings.Join(parts, "; ")
}

func auditValue(v any) string {
	if v == nil {
		return "—"
	}
	if s, ok := v.(string); ok {
		return s
	}
	b, _ := json.Marshal(v)
	return string(b)
}
