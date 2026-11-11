package handlers

import (
	"strings"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"
)

// paymentsQuery is the super admin's payment list with its filters applied
// (status, method and a search across client, email, references and plan).
func (a *App) paymentsQuery(status, method, search string) *gorm.DB {
	base := a.DB.Table("payments AS p").Joins("LEFT JOIN organizations o ON o.id = p.organization_id").Where("p.deleted_at IS NULL")
	if status != "" {
		base = base.Where("p.status = ?", status)
	}
	if method != "" {
		base = base.Where("p.method = ?", method)
	}
	if v := strings.TrimSpace(search); v != "" {
		like := "%" + v + "%"
		base = base.Where("o.name ILIKE ? OR p.payer_email ILIKE ? OR p.upi_reference ILIKE ? OR p.razorpay_payment_id ILIKE ? OR p.razorpay_order_id ILIKE ? OR p.plan_name ILIKE ?",
			like, like, like, like, like, like)
	}
	return base
}

// maxPaymentDeleteIDs caps how many payments one request may name.
const maxPaymentDeleteIDs = 500

// SuperAdminDeletePayments removes payments from the history
// (POST /api/super-admin/payments/delete).
//
// Body: {"ids": [...]} for chosen payments, or {"all": true, "status", "method",
// "search"} for every payment matching those filters. With
// "delete_invoices": true the invoices issued for those payments go too.
// A deleted payment changes nothing else: a plan it activated stays active.
func (a *App) SuperAdminDeletePayments(r *fastglue.Request) error {
	adminID, err := a.requireSuperAdmin(r)
	if err != nil {
		return nil
	}
	var req struct {
		IDs            []uuid.UUID `json:"ids"`
		All            bool        `json:"all"`
		Status         string      `json:"status"`
		Method         string      `json:"method"`
		Search         string      `json:"search"`
		DeleteInvoices bool        `json:"delete_invoices"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	if !req.All && len(req.IDs) == 0 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Choose the payments to delete", nil, "")
	}
	if len(req.IDs) > maxPaymentDeleteIDs {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Delete at most 500 payments at a time", nil, "")
	}

	var payments []models.Payment
	q := a.paymentsQuery(req.Status, req.Method, req.Search).Select("p.*")
	if !req.All {
		q = q.Where("p.id IN ?", req.IDs)
	}
	if err := q.Scan(&payments).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Could not load the payments", nil, "")
	}
	if len(payments) == 0 {
		return r.SendEnvelope(map[string]any{"deleted": 0, "invoices_deleted": 0})
	}

	ids := make([]uuid.UUID, 0, len(payments))
	for _, p := range payments {
		ids = append(ids, p.ID)
	}
	var invoicesDeleted int64
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		if req.DeleteInvoices {
			res := tx.Where("source_id IN ? OR id IN (?)", ids,
				tx.Model(&models.Payment{}).Select("invoice_id").Where("id IN ? AND invoice_id IS NOT NULL", ids)).
				Delete(&models.BillingInvoice{})
			if res.Error != nil {
				return res.Error
			}
			invoicesDeleted = res.RowsAffected
		}
		return tx.Where("id IN ?", ids).Delete(&models.Payment{}).Error
	})
	if err != nil {
		a.Log.Error("Failed to delete payments", "error", err, "count", len(ids))
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Could not delete the payments: "+err.Error(), nil, "")
	}
	for _, p := range payments {
		a.logAudit(p.OrganizationID, adminID, "payment", p.ID, models.AuditActionDeleted, p, nil,
			map[string]any{"invoice_deleted": req.DeleteInvoices})
	}
	return r.SendEnvelope(map[string]any{"deleted": len(ids), "invoices_deleted": invoicesDeleted})
}
