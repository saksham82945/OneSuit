package models

import (
	"time"

	"github.com/google/uuid"
)

// Message types for rich chat messages. MessageTypeContacts matches the
// WhatsApp type incoming contact cards are stored with.
const (
	MessageTypeContacts MessageType = "contacts"
	MessageTypeOrder    MessageType = "order"
)

// Scheduled message statuses.
const (
	ScheduledStatusScheduled = "scheduled"
	ScheduledStatusSending   = "sending"
	ScheduledStatusSent      = "sent"
	ScheduledStatusFailed    = "failed"
	ScheduledStatusCancelled = "cancelled"
)

// ScheduledMessage is a chat message an agent queued to be sent later. A
// background job sends it once ScheduledAt has passed.
type ScheduledMessage struct {
	BaseModel
	OrganizationID  uuid.UUID  `gorm:"type:uuid;index;not null" json:"organization_id"`
	ContactID       uuid.UUID  `gorm:"type:uuid;index;not null" json:"contact_id"`
	WhatsAppAccount string     `gorm:"size:100" json:"whatsapp_account"`
	Kind            string     `gorm:"size:20;not null;default:'text'" json:"kind"` // text | template
	Content         string     `gorm:"type:text" json:"content"`
	TemplateID      *uuid.UUID `gorm:"type:uuid" json:"template_id,omitempty"`
	TemplateName    string     `gorm:"size:255" json:"template_name,omitempty"`
	TemplateParams  JSONB      `gorm:"type:jsonb" json:"template_params,omitempty"`
	ScheduledAt     time.Time  `gorm:"index;not null" json:"scheduled_at"`
	Status          string     `gorm:"size:20;index;not null;default:'scheduled'" json:"status"`
	ErrorMessage    string     `gorm:"type:text" json:"error_message,omitempty"`
	MessageID       *uuid.UUID `gorm:"type:uuid" json:"message_id,omitempty"`
	SentAt          *time.Time `json:"sent_at,omitempty"`
	CreatedByUserID *uuid.UUID `gorm:"type:uuid" json:"created_by_user_id,omitempty"`
}

func (ScheduledMessage) TableName() string { return "scheduled_messages" }

// PollVote is one customer's answer to a WhatsApp button/list poll. A
// customer has one vote per poll; tapping another option moves it.
type PollVote struct {
	BaseModel
	OrganizationID uuid.UUID `gorm:"type:uuid;index;not null" json:"organization_id"`
	MessageID      uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_poll_vote_message_contact" json:"message_id"`
	ContactID      uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_poll_vote_message_contact" json:"contact_id"`
	PollID         string    `gorm:"size:40;index" json:"poll_id"`
	OptionID       string    `gorm:"size:100" json:"option_id"`
	OptionTitle    string    `gorm:"size:100" json:"option_title"`
}

func (PollVote) TableName() string { return "poll_votes" }
