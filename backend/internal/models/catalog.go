package models

import (
	"time"

	"github.com/google/uuid"
)

// Catalog represents a WhatsApp product catalog (a Meta Commerce catalogue).
type Catalog struct {
	BaseModel
	OrganizationID  uuid.UUID `gorm:"type:uuid;index;not null" json:"organization_id"`
	WhatsAppAccount string    `gorm:"size:100;index" json:"whatsapp_account"` // Links to WhatsAppAccount.Name
	MetaCatalogID   string    `gorm:"size:100;uniqueIndex" json:"meta_catalog_id"`
	Name            string    `gorm:"size:255;not null" json:"name"`
	IsActive        bool      `gorm:"default:true" json:"is_active"`
	// IsConnected: the catalogue is connected to the account's WABA, so it can
	// be shown on the WhatsApp business profile and used in product messages.
	IsConnected  bool       `gorm:"default:false" json:"is_connected"`
	LastSyncedAt *time.Time `json:"last_synced_at,omitempty"`

	// Relations
	Organization *Organization    `gorm:"foreignKey:OrganizationID" json:"organization,omitempty"`
	Products     []CatalogProduct `gorm:"foreignKey:CatalogID" json:"products,omitempty"`
}

func (Catalog) TableName() string {
	return "catalogs"
}

// Product sync states (our copy vs the Meta catalogue).
const (
	ProductSyncSynced  = "synced"  // matches Meta
	ProductSyncPending = "pending" // saved here, not pushed yet
	ProductSyncError   = "error"   // last push to Meta failed (see SyncError)
)

// CatalogProduct represents a product in a catalog
type CatalogProduct struct {
	BaseModel
	OrganizationID uuid.UUID `gorm:"type:uuid;index;not null" json:"organization_id"`
	CatalogID      uuid.UUID `gorm:"type:uuid;index;not null" json:"catalog_id"`
	// Empty until the product exists in Meta. Unique among non-empty values
	// (partial index created in database.getIndexes).
	MetaProductID string `gorm:"size:100;index:idx_catalog_products_meta_pid" json:"meta_product_id"`
	Name          string `gorm:"size:255;not null" json:"name"`
	Description   string `gorm:"type:text" json:"description"`
	Price         int64  `gorm:"not null" json:"price"`       // smallest currency unit (cents / paise)
	SalePrice     int64  `gorm:"default:0" json:"sale_price"` // 0 = none
	Currency      string `gorm:"size:3;default:'INR'" json:"currency"`
	Availability  string `gorm:"size:30;default:'in stock'" json:"availability"`
	Condition     string `gorm:"size:20;default:'new'" json:"condition"`
	Brand         string `gorm:"size:100" json:"brand"`
	Category      string `gorm:"size:255" json:"category"`
	URL           string `gorm:"size:500" json:"url"`
	ImageURL      string `gorm:"size:500" json:"image_url"`
	RetailerID    string `gorm:"size:100" json:"retailer_id"` // SKU
	IsActive      bool   `gorm:"default:true" json:"is_active"`

	SyncStatus   string     `gorm:"size:20;default:'synced'" json:"sync_status"`
	SyncError    string     `gorm:"type:text" json:"sync_error"`
	LastSyncedAt *time.Time `json:"last_synced_at,omitempty"`

	// Relations
	Organization *Organization `gorm:"foreignKey:OrganizationID" json:"organization,omitempty"`
	Catalog      *Catalog      `gorm:"foreignKey:CatalogID" json:"catalog,omitempty"`
}

func (CatalogProduct) TableName() string {
	return "catalog_products"
}
