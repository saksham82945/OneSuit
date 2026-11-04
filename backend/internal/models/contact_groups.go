package models

import (
	"time"

	"github.com/google/uuid"
)

// ContactGroup organises contacts inside an organization. A contact can be
// a member of any number of groups. Membership lives in contact_group_members.
type ContactGroup struct {
	BaseModel
	OrganizationID uuid.UUID  `gorm:"type:uuid;index;not null" json:"organization_id"`
	Name           string     `gorm:"size:100;not null" json:"name"`
	Color          string     `gorm:"size:20" json:"color"`
	Description    string     `gorm:"type:text" json:"description"`
	CreatedByID    *uuid.UUID `gorm:"type:uuid" json:"created_by_id,omitempty"`

	Organization *Organization `gorm:"foreignKey:OrganizationID" json:"organization,omitempty"`
}

func (ContactGroup) TableName() string {
	return "contact_groups"
}

// ContactGroupMember links a contact to a group. The composite primary key
// makes adding the same contact twice a no-op.
type ContactGroupMember struct {
	GroupID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"group_id"`
	ContactID      uuid.UUID `gorm:"type:uuid;primaryKey;index" json:"contact_id"`
	OrganizationID uuid.UUID `gorm:"type:uuid;index;not null" json:"organization_id"`
	CreatedAt      time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (ContactGroupMember) TableName() string {
	return "contact_group_members"
}

// BroadcastList is a saved audience for sending campaigns.
// Membership lives in broadcast_list_members.
type BroadcastList struct {
	BaseModel
	OrganizationID uuid.UUID  `gorm:"type:uuid;index;not null" json:"organization_id"`
	Name           string     `gorm:"size:100;not null" json:"name"`
	Description    string     `gorm:"type:text" json:"description"`
	CreatedByID    *uuid.UUID `gorm:"type:uuid" json:"created_by_id,omitempty"`

	Organization *Organization `gorm:"foreignKey:OrganizationID" json:"organization,omitempty"`
}

func (BroadcastList) TableName() string {
	return "broadcast_lists"
}

// BroadcastListMember links a contact to a broadcast list.
type BroadcastListMember struct {
	ListID         uuid.UUID `gorm:"type:uuid;primaryKey" json:"list_id"`
	ContactID      uuid.UUID `gorm:"type:uuid;primaryKey;index" json:"contact_id"`
	OrganizationID uuid.UUID `gorm:"type:uuid;index;not null" json:"organization_id"`
	CreatedAt      time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (BroadcastListMember) TableName() string {
	return "broadcast_list_members"
}

// ValidGroupColors are the colours a contact group may use (matches tag colours).
var ValidGroupColors = []string{"emerald", "teal", "blue", "purple", "red", "amber", "pink", "gray"}

// IsValidGroupColor reports whether c is allowed. Empty means default.
func IsValidGroupColor(c string) bool {
	if c == "" {
		return true
	}
	for _, v := range ValidGroupColors {
		if v == c {
			return true
		}
	}
	return false
}
