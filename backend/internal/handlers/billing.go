package handlers

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"
)

// Billing: the workspace's plan, what it uses of the plan, and its invoices.
// Payments are taken outside OneSuit, so invoices are written when the
// platform team activates a paid plan period or approves an ad credit top-up.

// BillingResponse is GET /api/billing.
type BillingResponse struct {
	Plan              *DashboardPlanInfo      `json:"plan"`
	BillingCycle      string                  `json:"billing_cycle"`
	CyclePrice        float64                 `json:"cycle_price"`
	Features          []string                `json:"features"`
	MessagesThisMonth int64                   `json:"messages_this_month"`
	Invoices          []models.BillingInvoice `json:"invoices"`
	Company           map[string]string       `json:"company"`
}

// GetBilling returns the current workspace's real plan, usage and invoices.
func (a *App) GetBilling(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceSettingsGeneral, models.ActionRead)
	if err != nil {
		return nil
	}
	now := time.Now()
	resp := BillingResponse{Invoices: []models.BillingInvoice{}, Features: []string{}, Company: map[string]string{}}
	resp.Plan = a.dashboardPlan(orgID, now, time.UTC)

	var sub models.OrganizationSubscription
	if a.DB.Where("organization_id = ?", orgID).First(&sub).Error == nil {
		resp.BillingCycle = sub.BillingCycle
		var plan models.SubscriptionPlan
		if sub.PlanID != nil && a.DB.Where("id = ?", *sub.PlanID).First(&plan).Error == nil {
			resp.CyclePrice = plan.PriceFor(sub.BillingCycle)
			resp.Features = plan.Features
		}
	}

	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	resp.MessagesThisMonth = a.countSQL(`SELECT COUNT(*) FROM messages
		WHERE organization_id = ? AND deleted_at IS NULL AND direction = ? AND created_at >= ?`,
		orgID, models.DirectionOutgoing, monthStart)

	a.DB.Where("organization_id = ?", orgID).Order("issued_at DESC").Limit(200).Find(&resp.Invoices)

	var org models.Organization
	if a.DB.Where("id = ?", orgID).First(&org).Error == nil {
		resp.Company["workspace"] = org.Name
	}
	resp.Company["owner_name"] = sub.OwnerName
	resp.Company["owner_email"] = sub.OwnerEmail
	return r.SendEnvelope(resp)
}

// newInvoiceNumber makes a readable, unique invoice number such as OS-202611-3F9A1C.
func newInvoiceNumber(at time.Time) string {
	return fmt.Sprintf("OS-%s-%s", at.Format("200601"), strings.ToUpper(strings.ReplaceAll(uuid.NewString(), "-", "")[:8]))
}

// issueSubscriptionInvoice writes an invoice when a paid plan period starts:
// the plan, billing cycle or renewal date changed on an active workspace.
func issueSubscriptionInvoice(tx *gorm.DB, before, after models.OrganizationSubscription) error {
	if after.Status != models.VendorStatusActive || after.PlanID == nil {
		return nil
	}
	samePlan := before.PlanID != nil && *before.PlanID == *after.PlanID
	sameRenewal := (before.RenewalDate == nil && after.RenewalDate == nil) ||
		(before.RenewalDate != nil && after.RenewalDate != nil && before.RenewalDate.Equal(*after.RenewalDate))
	wasActive := before.Status == models.VendorStatusActive
	if samePlan && sameRenewal && before.BillingCycle == after.BillingCycle && wasActive {
		return nil
	}
	var plan models.SubscriptionPlan
	if err := tx.Where("id = ?", *after.PlanID).First(&plan).Error; err != nil {
		return nil // plan gone: nothing to bill
	}
	amount := plan.PriceFor(after.BillingCycle)
	if amount <= 0 {
		return nil
	}
	months := models.BillingCycleMonths(after.BillingCycle)
	if months == 0 {
		months = 1
	}
	now := time.Now()
	end := now.AddDate(0, months, 0)
	if after.RenewalDate != nil && after.RenewalDate.After(now) {
		end = *after.RenewalDate
	}
	start := end.AddDate(0, -months, 0)
	cycle := strings.ReplaceAll(after.BillingCycle, "_", "-")
	if cycle == "" {
		cycle = models.BillingIntervalMonthly
	}
	inv := models.BillingInvoice{
		OrganizationID: after.OrganizationID,
		Number:         newInvoiceNumber(now),
		Kind:           models.InvoiceKindSubscription,
		Description:    fmt.Sprintf("%s plan (%s)", plan.Name, cycle),
		Amount:         amount,
		Currency:       plan.Currency,
		Status:         models.InvoiceStatusPaid,
		PeriodStart:    &start,
		PeriodEnd:      &end,
		IssuedAt:       now,
		PaidAt:         &now,
	}
	if inv.Currency == "" {
		inv.Currency = models.PlatformCurrency
	}
	return tx.Create(&inv).Error
}

// issueAdCreditInvoice writes the invoice for an approved ad credit top-up.
func issueAdCreditInvoice(tx *gorm.DB, t models.AdCreditTransaction) error {
	now := time.Now()
	desc := "Ad credit top-up"
	if t.PackName != "" {
		desc = t.PackName
	}
	id := t.ID
	inv := models.BillingInvoice{
		OrganizationID: t.OrganizationID,
		Number:         newInvoiceNumber(now),
		Kind:           models.InvoiceKindAdCredit,
		Description:    desc,
		Amount:         t.Amount,
		Currency:       t.Currency,
		Status:         models.InvoiceStatusPaid,
		IssuedAt:       now,
		PaidAt:         &now,
		SourceID:       &id,
	}
	if inv.Currency == "" {
		inv.Currency = models.PlatformCurrency
	}
	return tx.Create(&inv).Error
}

// SuperAdminListInvoices lists a vendor's invoices (GET /api/super-admin/vendors/{id}/invoices).
func (a *App) SuperAdminListInvoices(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "vendor")
	if err != nil {
		return nil
	}
	invoices := []models.BillingInvoice{}
	a.DB.Where("organization_id = ?", id).Order("issued_at DESC").Limit(200).Find(&invoices)
	if invoices == nil {
		invoices = []models.BillingInvoice{}
	}
	return r.SendEnvelope(map[string]any{"invoices": invoices})
}
