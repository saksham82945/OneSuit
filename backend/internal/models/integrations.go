package models

import (
	"time"

	"github.com/google/uuid"
)

// Lead integrations: outside lead sources (IndiaMART, JustDial, ...) send new
// leads into a client's account. The super admin manages the list of
// integrations; each client connects the ones they use.

// IntegrationDefinition is one integration in the platform's catalog.
type IntegrationDefinition struct {
	BaseModel
	Key         string `gorm:"size:60;not null;uniqueIndex" json:"key"`
	Name        string `gorm:"size:100;not null" json:"name"`
	Category    string `gorm:"size:60;not null" json:"category"`
	Description string `gorm:"type:text" json:"description"`
	SetupSteps  string `gorm:"type:text" json:"setup_steps"` // shown to clients, one step per line
	DocsURL     string `gorm:"size:500" json:"docs_url"`
	LogoURL     string `gorm:"size:500" json:"logo_url"`
	Color       string `gorm:"size:20" json:"color"`
	// FieldMap says where each lead field is in what the source sends:
	// {"name": ["RESPONSE.SENDER_NAME", "name"], "phone": [...], ...}. The
	// first non-empty value wins.
	FieldMap JSONB `gorm:"type:jsonb" json:"field_map"`
	// Shown to clients. No default tag so false can be saved.
	IsEnabled bool `gorm:"not null" json:"is_enabled"`
	IsBuiltin bool `gorm:"not null" json:"is_builtin"`
	SortOrder int  `gorm:"not null" json:"sort_order"`
}

func (IntegrationDefinition) TableName() string { return "integration_definitions" }

// IntegrationConnection is a client's connection to one integration.
type IntegrationConnection struct {
	BaseModel
	OrganizationID uuid.UUID  `gorm:"type:uuid;index;not null" json:"organization_id"`
	DefinitionKey  string     `gorm:"size:60;index;not null" json:"definition_key"`
	Name           string     `gorm:"size:100;not null" json:"name"`
	Token          string     `gorm:"size:64;not null;uniqueIndex" json:"-"` // secret part of the lead URL
	Tag            string     `gorm:"size:50" json:"tag"`                    // added to every lead's contact
	IsActive       bool       `gorm:"not null" json:"is_active"`
	LeadCount      int64      `gorm:"not null" json:"lead_count"`
	LastLeadAt     *time.Time `json:"last_lead_at"`
	CreatedByID    *uuid.UUID `gorm:"type:uuid" json:"created_by_id,omitempty"`
}

func (IntegrationConnection) TableName() string { return "integration_connections" }

// IntegrationLead is a lead received through a connection.
type IntegrationLead struct {
	BaseModel
	OrganizationID uuid.UUID  `gorm:"type:uuid;index;not null" json:"organization_id"`
	ConnectionID   uuid.UUID  `gorm:"type:uuid;index;not null" json:"connection_id"`
	DefinitionKey  string     `gorm:"size:60;not null" json:"definition_key"`
	ExternalID     string     `gorm:"size:150;index" json:"external_id"` // the source's lead id, to skip repeats
	Name           string     `gorm:"size:255" json:"name"`
	Phone          string     `gorm:"size:50" json:"phone"`
	Email          string     `gorm:"size:255" json:"email"`
	City           string     `gorm:"size:150" json:"city"`
	Subject        string     `gorm:"size:500" json:"subject"`
	Message        string     `gorm:"type:text" json:"message"`
	ContactID      *uuid.UUID `gorm:"type:uuid" json:"contact_id"`
	Raw            JSONB      `gorm:"type:jsonb" json:"raw"`
}

func (IntegrationLead) TableName() string { return "integration_leads" }
