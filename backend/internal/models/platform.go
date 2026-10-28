package models

import (
	"time"

	"github.com/google/uuid"
)

// Models backing the Super Admin panel: platform-wide data that is not owned by
// any single organization (plans, public pages, settings) plus the per-vendor
// subscription record and the support tickets vendors raise.

// Vendor (organization) subscription statuses.
const (
	VendorStatusActive    = "active"
	VendorStatusTrial     = "trial"
	VendorStatusSuspended = "suspended"
)

// Subscription plan billing intervals.
const (
	BillingIntervalMonthly = "monthly"
	BillingIntervalYearly  = "yearly"
)

// Support ticket statuses and priorities.
const (
	TicketStatusOpen   = "open"
	TicketStatusSolved = "solved"

	TicketPriorityLow    = "low"
	TicketPriorityMedium = "medium"
	TicketPriorityHigh   = "high"
)

// SubscriptionPlan is a plan vendors can subscribe to. Limits of 0 mean unlimited.
type SubscriptionPlan struct {
	BaseModel
	Name        string      `gorm:"size:100;not null" json:"name"`
	Description string      `gorm:"size:500" json:"description"`
	Price       float64     `gorm:"type:numeric(12,2);not null" json:"price"`
	Currency    string      `gorm:"size:3;not null" json:"currency"`
	Interval    string      `gorm:"size:20;not null" json:"interval"`
	MaxUsers    int         `gorm:"not null" json:"max_users"`
	MaxContacts int         `gorm:"not null" json:"max_contacts"`
	MaxAccounts int         `gorm:"not null" json:"max_accounts"`
	Features    StringArray `gorm:"type:jsonb" json:"features"`
	// No default tag on purpose: GORM skips zero values for columns with a
	// default, which would make it impossible to create an inactive plan.
	IsActive bool `gorm:"not null" json:"is_active"`
}

func (SubscriptionPlan) TableName() string {
	return "subscription_plans"
}

// OrganizationSubscription holds the commercial details of a vendor
// (organization). Organizations without a row are treated as active with no plan.
type OrganizationSubscription struct {
	BaseModel
	OrganizationID uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex" json:"organization_id"`
	PlanID         *uuid.UUID `gorm:"type:uuid;index" json:"plan_id,omitempty"`
	Status         string     `gorm:"size:20;not null;default:'active'" json:"status"`
	RenewalDate    *time.Time `json:"renewal_date,omitempty"`
	OwnerName      string     `gorm:"size:255" json:"owner_name"`
	OwnerEmail     string     `gorm:"size:255" json:"owner_email"`
	OwnerPhone     string     `gorm:"size:50" json:"owner_phone"`
}

func (OrganizationSubscription) TableName() string {
	return "organization_subscriptions"
}

// CMSPage is a public content page such as Terms of Service or Privacy Policy.
type CMSPage struct {
	BaseModel
	Title       string     `gorm:"size:255;not null" json:"title"`
	Slug        string     `gorm:"size:150;not null" json:"slug"` // unique among live pages (partial index)
	Content     string     `gorm:"type:text" json:"content"`
	IsPublished bool       `gorm:"not null" json:"is_published"`
	UpdatedByID *uuid.UUID `gorm:"type:uuid" json:"updated_by_id,omitempty"`
}

func (CMSPage) TableName() string {
	return "cms_pages"
}

// SupportTicket is a help request raised by a vendor for the platform team.
type SupportTicket struct {
	BaseModel
	OrganizationID uuid.UUID  `gorm:"type:uuid;index;not null" json:"organization_id"`
	CreatedByID    *uuid.UUID `gorm:"type:uuid" json:"created_by_id,omitempty"`
	Subject        string     `gorm:"size:255;not null" json:"subject"`
	Description    string     `gorm:"type:text" json:"description"`
	ImageURL       string     `gorm:"type:text" json:"image_url,omitempty"`
	Priority       string     `gorm:"size:20;not null;default:'medium'" json:"priority"`
	Status         string     `gorm:"size:20;not null;default:'open';index" json:"status"`
	SolvedAt       *time.Time `json:"solved_at,omitempty"`
	SolvedByID     *uuid.UUID `gorm:"type:uuid" json:"solved_by_id,omitempty"`
}

func (SupportTicket) TableName() string {
	return "support_tickets"
}

// SupportTicketReply is a message / comment inside a support ticket conversation thread.
type SupportTicketReply struct {
	BaseModel
	TicketID   uuid.UUID  `gorm:"type:uuid;index;not null" json:"ticket_id"`
	UserID     *uuid.UUID `gorm:"type:uuid" json:"user_id,omitempty"`
	SenderRole string     `gorm:"size:30;not null" json:"sender_role"` // "super_admin" | "user"
	SenderName string     `gorm:"size:255" json:"sender_name"`
	Message    string     `gorm:"type:text;not null" json:"message"`
	ImageURL   string     `gorm:"type:text" json:"image_url,omitempty"`
}

func (SupportTicketReply) TableName() string {
	return "support_ticket_replies"
}

// PlatformSetting is a key/value store for platform-wide configuration.
type PlatformSetting struct {
	Key       string    `gorm:"size:100;primaryKey" json:"key"`
	Value     JSONB     `gorm:"type:jsonb;not null" json:"value"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (PlatformSetting) TableName() string {
	return "platform_settings"
}

// OrganizationInvite is a shareable link that lets people join an organization
// with a given role. Only a hash of the token is stored.
type OrganizationInvite struct {
	BaseModel
	OrganizationID uuid.UUID  `gorm:"type:uuid;index;not null" json:"organization_id"`
	TokenHash      string     `gorm:"size:64;uniqueIndex;not null" json:"-"`
	RoleID         uuid.UUID  `gorm:"type:uuid;not null" json:"role_id"`
	Email          string     `gorm:"size:255" json:"email"` // optional: only this address may use the invite
	ExpiresAt      time.Time  `gorm:"not null" json:"expires_at"`
	MaxUses        int        `gorm:"not null" json:"max_uses"` // 0 = unlimited
	UsedCount      int        `gorm:"not null" json:"used_count"`
	CreatedByID    *uuid.UUID `gorm:"type:uuid" json:"created_by_id,omitempty"`
}

func (OrganizationInvite) TableName() string {
	return "organization_invites"
}
