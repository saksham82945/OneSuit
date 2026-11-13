package database_test

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/database"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// isolatedDB opens the test database inside a fresh schema, so the raw
// indexes built here do not change the shared schema other tests use.
func isolatedDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set, skipping database test")
	}
	schema := "idx_test_" + strings.ReplaceAll(uuid.New().String()[:8], "-", "")
	admin, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	require.NoError(t, admin.Exec("CREATE SCHEMA "+schema).Error)

	sep := "?"
	if strings.Contains(dsn, "?") {
		sep = "&"
	}
	db, err := gorm.Open(postgres.Open(dsn+sep+"search_path="+schema), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
		admin.Exec(fmt.Sprintf("DROP SCHEMA %s CASCADE", schema))
		if sqlDB, err := admin.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

// migrateAll runs the model migrations and the raw index statements, as the
// server does on every start.
func migrateAll(t *testing.T, db *gorm.DB) {
	t.Helper()
	require.NoError(t, database.AutoMigrate(db))
	require.NoError(t, database.CreateIndexes(db))
}

func indexExists(t *testing.T, db *gorm.DB, name string) bool {
	t.Helper()
	var n int64
	require.NoError(t, db.Raw(`SELECT COUNT(*) FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ?`, name).Scan(&n).Error)
	return n > 0
}

// Migrations run on every server start, so running them twice must succeed,
// including on a database that still has the old full unique indexes.
func TestMigrations_IdempotentAndReplaceOldUniqueIndexes(t *testing.T) {
	db := isolatedDB(t)
	require.NoError(t, database.AutoMigrate(db))

	// Simulate a database created by an older release.
	require.NoError(t, db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_org ON user_organizations(user_id, organization_id)`).Error)
	require.NoError(t, db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_roles_org_name ON custom_roles(organization_id, name)`).Error)
	require.NoError(t, db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_canned_responses_org_name ON canned_responses(organization_id, name)`).Error)

	migrateAll(t, db)
	migrateAll(t, db)

	for _, gone := range []string{"idx_user_org", "idx_custom_roles_org_name", "idx_canned_responses_org_name"} {
		assert.False(t, indexExists(t, db, gone), "old index %s should be dropped", gone)
	}
	for _, want := range []string{
		"idx_user_org_unique",
		"idx_custom_roles_org_name_live",
		"idx_canned_responses_org_name_live",
		"idx_contacts_org_last_message",
		"idx_messages_org_created",
		"idx_messages_campaign_id",
		"idx_bulk_recipients_campaign_status",
		"idx_chatbot_sessions_contact_status",
		"idx_chatbot_sessions_org_created",
		"idx_audit_logs_org_created",
		"idx_audit_logs_created",
		"idx_payments_org_created",
		"idx_payments_created",
		"idx_scheduled_messages_status_due",
		"idx_bulk_campaigns_status_scheduled",
		"idx_chatbot_session_messages_session_created",
		"idx_whatsapp_flows_org_meta_flow",
		"idx_messages_wamid_unique",
	} {
		assert.True(t, indexExists(t, db, want), "index %s should exist", want)
	}

	// No index left half-built (invalid) by the migration.
	var invalid int64
	require.NoError(t, db.Raw(`SELECT COUNT(*) FROM pg_index WHERE NOT indisvalid`).Scan(&invalid).Error)
	assert.Equal(t, int64(0), invalid)
}

// A member removed from a workspace can be added back; two live memberships
// for the same user and workspace are still refused.
func TestUserOrganization_RemovedMemberCanBeAddedBack(t *testing.T) {
	db := isolatedDB(t)
	migrateAll(t, db)

	org := testutil.CreateTestOrganization(t, db)
	user := testutil.CreateTestUser(t, db, org.ID)
	other := testutil.CreateTestOrganization(t, db)

	first := models.UserOrganization{UserID: user.ID, OrganizationID: other.ID}
	require.NoError(t, db.Create(&first).Error)
	require.NoError(t, db.Delete(&first).Error)

	again := models.UserOrganization{UserID: user.ID, OrganizationID: other.ID}
	require.NoError(t, db.Create(&again).Error, "re-adding a removed member must work")

	dup := models.UserOrganization{UserID: user.ID, OrganizationID: other.ID}
	assert.Error(t, db.Create(&dup).Error, "a second live membership must be refused")
}

// A deleted role's or canned response's name can be used again.
func TestDeletedNamesCanBeReused(t *testing.T) {
	db := isolatedDB(t)
	migrateAll(t, db)

	org := testutil.CreateTestOrganization(t, db)
	user := testutil.CreateTestUser(t, db, org.ID)

	role := models.CustomRole{BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: org.ID, Name: "support"}
	require.NoError(t, db.Create(&role).Error)
	require.NoError(t, db.Delete(&role).Error)
	role2 := models.CustomRole{BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: org.ID, Name: "support"}
	require.NoError(t, db.Create(&role2).Error, "deleted role name should be reusable")
	role3 := models.CustomRole{BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: org.ID, Name: "support"}
	assert.Error(t, db.Create(&role3).Error, "two live roles with one name must be refused")

	cr := models.CannedResponse{OrganizationID: org.ID, CreatedByID: user.ID, Name: "greeting", Content: "hi"}
	require.NoError(t, db.Create(&cr).Error)
	require.NoError(t, db.Delete(&cr).Error)
	cr2 := models.CannedResponse{OrganizationID: org.ID, CreatedByID: user.ID, Name: "greeting", Content: "hello"}
	require.NoError(t, db.Create(&cr2).Error, "deleted canned response name should be reusable")
	cr3 := models.CannedResponse{OrganizationID: org.ID, CreatedByID: user.ID, Name: "greeting", Content: "hey"}
	assert.Error(t, db.Create(&cr3).Error, "two live canned responses with one name must be refused")
}

// The unique WhatsApp message ID index is skipped, not fatal, when existing
// rows already hold duplicates, and is built on a later start once clean.
func TestMessagesWAMIDUnique_SkippedWhenDuplicatesExist(t *testing.T) {
	db := isolatedDB(t)
	require.NoError(t, database.AutoMigrate(db))

	org := testutil.CreateTestOrganization(t, db)
	contact := models.Contact{BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: org.ID, PhoneNumber: "15550001"}
	require.NoError(t, db.Create(&contact).Error)
	mk := func() *models.Message {
		return &models.Message{BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: org.ID, WhatsAppAccount: "acc",
			ContactID: contact.ID, WhatsAppMessageID: "wamid.dup", Direction: models.DirectionIncoming, MessageType: "text"}
	}
	first, second := mk(), mk()
	require.NoError(t, db.Create(first).Error)
	require.NoError(t, db.Create(second).Error)

	require.NoError(t, database.CreateIndexes(db), "duplicates must not stop the server from starting")
	assert.False(t, indexExists(t, db, "idx_messages_wamid_unique"))

	require.NoError(t, db.Delete(second).Error)
	require.NoError(t, database.CreateIndexes(db))
	assert.True(t, indexExists(t, db, "idx_messages_wamid_unique"))

	assert.Error(t, db.Create(mk()).Error, "a second live row with the same WhatsApp message ID must be refused")
	empty := mk()
	empty.WhatsAppMessageID = ""
	require.NoError(t, db.Create(empty).Error)
	empty2 := mk()
	empty2.WhatsAppMessageID = ""
	require.NoError(t, db.Create(empty2).Error, "rows without a WhatsApp ID are not constrained")
}
