package models

import (
	"time"

	"github.com/google/uuid"
)

// Ads Manager: Facebook/Instagram ads that land on WhatsApp. Setup progress,
// campaign drafts, lead forms, leads, audiences and conversion events are kept
// here; talking to Meta's Marketing API is switched on later.

// AdsSetup is one organization's Ads Manager setup progress.
type AdsSetup struct {
	BaseModel
	OrganizationID         uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex" json:"organization_id"`
	FacebookConnected      bool       `gorm:"not null" json:"facebook_connected"`
	FacebookUserName       string     `gorm:"size:255" json:"facebook_user_name"`
	FacebookAccessTokenEnc string     `gorm:"type:text" json:"-"`
	PageID                 string     `gorm:"size:100" json:"page_id"`
	PageName               string     `gorm:"size:255" json:"page_name"`
	WhatsAppAccount        string     `gorm:"size:100" json:"whatsapp_account"`
	LeadTermsAcceptedAt    *time.Time `json:"lead_terms_accepted_at,omitempty"`
	AdCredit               float64    `gorm:"type:numeric(12,2);not null" json:"ad_credit"`
}

func (AdsSetup) TableName() string { return "ads_setups" }

// AdCampaign is an ad (draft until it is launched through Meta).
type AdCampaign struct {
	BaseModel
	OrganizationID uuid.UUID  `gorm:"type:uuid;index;not null" json:"organization_id"`
	Name           string     `gorm:"size:255;not null" json:"name"`
	Type           string     `gorm:"size:40;not null" json:"type"`   // click_to_whatsapp, whatsapp_status, website_to_whatsapp, website, lead_form
	Status         string     `gorm:"size:20;not null" json:"status"` // draft, active, paused, ended
	DailyBudget    float64    `gorm:"type:numeric(12,2);not null" json:"daily_budget"`
	Currency       string     `gorm:"size:3;not null" json:"currency"`
	StartDate      *time.Time `json:"start_date"`
	EndDate        *time.Time `json:"end_date"`
	AudienceID     *uuid.UUID `gorm:"type:uuid" json:"audience_id"`
	FormID         *uuid.UUID `gorm:"type:uuid" json:"form_id"`
	Creative       JSONB      `gorm:"type:jsonb" json:"creative"`
	MetaAdID       string     `gorm:"size:100" json:"meta_ad_id,omitempty"`
	Impressions    int64      `gorm:"not null" json:"impressions"`
	Clicks         int64      `gorm:"not null" json:"clicks"`
	Leads          int64      `gorm:"not null" json:"leads"`
	Spend          float64    `gorm:"type:numeric(12,2);not null" json:"spend"`
	CreatedByID    *uuid.UUID `gorm:"type:uuid" json:"created_by_id,omitempty"`
}

func (AdCampaign) TableName() string { return "ad_campaigns" }

// AdLeadForm is an instant form shown by a Lead Form ad.
type AdLeadForm struct {
	BaseModel
	OrganizationID  uuid.UUID  `gorm:"type:uuid;index;not null" json:"organization_id"`
	Name            string     `gorm:"size:255;not null" json:"name"`
	Headline        string     `gorm:"size:255" json:"headline"`
	Description     string     `gorm:"type:text" json:"description"`
	Questions       JSONBArray `gorm:"type:jsonb" json:"questions"`
	PrivacyURL      string     `gorm:"size:500" json:"privacy_url"`
	ThankYouMessage string     `gorm:"type:text" json:"thank_you_message"`
	Status          string     `gorm:"size:20;not null" json:"status"` // draft, published
	MetaFormID      string     `gorm:"size:100" json:"meta_form_id,omitempty"`
}

func (AdLeadForm) TableName() string { return "ad_lead_forms" }

// AdLead is a person who responded to an ad.
type AdLead struct {
	BaseModel
	OrganizationID uuid.UUID  `gorm:"type:uuid;index;not null" json:"organization_id"`
	Name           string     `gorm:"size:255" json:"name"`
	Phone          string     `gorm:"size:50" json:"phone"`
	Email          string     `gorm:"size:255" json:"email"`
	Source         string     `gorm:"size:30;not null" json:"source"` // lead_form, click_to_whatsapp, manual
	CampaignID     *uuid.UUID `gorm:"type:uuid;index" json:"campaign_id"`
	FormID         *uuid.UUID `gorm:"type:uuid;index" json:"form_id"`
	Answers        JSONB      `gorm:"type:jsonb" json:"answers"`
	ContactID      *uuid.UUID `gorm:"type:uuid" json:"contact_id"`
}

func (AdLead) TableName() string { return "ad_leads" }

// AdAudience is a saved group of people to target.
type AdAudience struct {
	BaseModel
	OrganizationID uuid.UUID   `gorm:"type:uuid;index;not null" json:"organization_id"`
	Name           string      `gorm:"size:255;not null" json:"name"`
	Source         string      `gorm:"size:30;not null" json:"source"` // all_contacts, contacts_tag, leads
	Tags           StringArray `gorm:"type:jsonb" json:"tags"`
	Description    string      `gorm:"type:text" json:"description"`
}

func (AdAudience) TableName() string { return "ad_audiences" }

// AdEvent is a conversion event attributed to ads (Lead, Purchase, ...).
type AdEvent struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	OrganizationID uuid.UUID  `gorm:"type:uuid;index:idx_ad_events_org_time;not null" json:"organization_id"`
	EventName      string     `gorm:"size:50;not null" json:"event_name"`
	ContactID      *uuid.UUID `gorm:"type:uuid" json:"contact_id"`
	ContactName    string     `gorm:"size:255" json:"contact_name"`
	CampaignID     *uuid.UUID `gorm:"type:uuid" json:"campaign_id"`
	Value          float64    `gorm:"type:numeric(12,2);not null" json:"value"`
	Currency       string     `gorm:"size:3" json:"currency"`
	CreatedAt      time.Time  `gorm:"autoCreateTime;index:idx_ad_events_org_time" json:"created_at"`
}

func (AdEvent) TableName() string { return "ad_events" }
