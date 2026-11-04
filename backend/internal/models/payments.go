package models

import (
	"time"

	"github.com/google/uuid"
)

// Payment methods and statuses.
const (
	PaymentMethodRazorpay = "razorpay"
	PaymentMethodUPI      = "upi"

	PaymentStatusCreated             = "created"              // waiting for the customer to pay
	PaymentStatusPendingVerification = "pending_verification" // UPI: customer sent a reference, waiting for approval
	PaymentStatusPaid                = "paid"
	PaymentStatusFailed              = "failed"
	PaymentStatusRejected            = "rejected" // UPI reference refused by the super admin
)

// Payment is a subscription payment by a workspace, through Razorpay or a
// direct UPI transfer. A paid payment activates the plan and has an invoice.
type Payment struct {
	BaseModel
	OrganizationID uuid.UUID  `gorm:"type:uuid;index;not null" json:"organization_id"`
	PlanID         uuid.UUID  `gorm:"type:uuid;not null" json:"plan_id"`
	PlanName       string     `gorm:"size:100" json:"plan_name"`
	BillingCycle   string     `gorm:"size:20;not null" json:"billing_cycle"`
	Amount         float64    `gorm:"type:numeric(12,2);not null" json:"amount"`
	Currency       string     `gorm:"size:3;not null" json:"currency"`
	Method         string     `gorm:"size:20;not null;index" json:"method"`
	Status         string     `gorm:"size:30;not null;index" json:"status"`
	CreatedByID    *uuid.UUID `gorm:"type:uuid" json:"created_by_id,omitempty"`

	// Razorpay
	RazorpayOrderID   string `gorm:"size:64;index" json:"razorpay_order_id,omitempty"`
	RazorpayPaymentID string `gorm:"size:64;index" json:"razorpay_payment_id,omitempty"`
	// UPI: the transaction reference (UTR) the customer entered
	UPIReference string `gorm:"size:64;index" json:"upi_reference,omitempty"`

	PayerName     string     `gorm:"size:255" json:"payer_name,omitempty"`
	PayerEmail    string     `gorm:"size:255" json:"payer_email,omitempty"`
	PayerPhone    string     `gorm:"size:50" json:"payer_phone,omitempty"`
	FailureReason string     `gorm:"type:text" json:"failure_reason,omitempty"`
	PaidAt        *time.Time `json:"paid_at,omitempty"`
	VerifiedByID  *uuid.UUID `gorm:"type:uuid" json:"verified_by_id,omitempty"`
	InvoiceID     *uuid.UUID `gorm:"type:uuid" json:"invoice_id,omitempty"`
	SubmittedAt   *time.Time `json:"submitted_at,omitempty"`
	PeriodEnd     *time.Time `json:"period_end,omitempty"`
}

func (Payment) TableName() string { return "payments" }
