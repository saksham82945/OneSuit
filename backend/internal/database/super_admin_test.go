package database_test

import (
	"testing"

	"github.com/shridarpatil/whatomate/internal/config"
	"github.com/shridarpatil/whatomate/internal/database"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

func TestEnsureSuperAdmin_NotConfiguredIsNoop(t *testing.T) {
	db := testutil.SetupTestDB(t)
	cleanAll(t, db)

	require.NoError(t, database.EnsureSuperAdmin(db, &config.SuperAdminConfig{}))
	var count int64
	db.Model(&models.User{}).Count(&count)
	assert.Equal(t, int64(0), count)
}

func TestEnsureSuperAdmin_CreatesAccount(t *testing.T) {
	db := testutil.SetupTestDB(t)
	cleanAll(t, db)

	cfg := &config.SuperAdminConfig{Email: "Owner@Platform.example", Password: "long-secret-1", FullName: "Platform Owner"}
	require.NoError(t, database.EnsureSuperAdmin(db, cfg))
	require.NoError(t, database.EnsureSuperAdmin(db, cfg), "idempotent")

	var users []models.User
	require.NoError(t, db.Find(&users).Error)
	require.Len(t, users, 1)
	u := users[0]
	assert.Equal(t, "owner@platform.example", u.Email, "email is normalised")
	assert.True(t, u.IsSuperAdmin)
	assert.True(t, u.IsActive)
	assert.NoError(t, bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte("long-secret-1")))

	var membership models.UserOrganization
	require.NoError(t, db.Preload("Role").Where("user_id = ?", u.ID).First(&membership).Error)
	require.NotNil(t, membership.Role)
	assert.Equal(t, "admin", membership.Role.Name, "admin of its home organization")
}

func TestEnsureSuperAdmin_PromotesExistingWithoutChangingPassword(t *testing.T) {
	db := testutil.SetupTestDB(t)
	cleanAll(t, db)
	org := testutil.CreateTestOrganization(t, db)
	existing := testutil.CreateTestUser(t, db, org.ID, testutil.WithEmail("boss@platform.example"), testutil.WithInactive())

	require.NoError(t, database.EnsureSuperAdmin(db, &config.SuperAdminConfig{Email: "boss@platform.example", Password: "ignored-password"}))

	var u models.User
	require.NoError(t, db.First(&u, "id = ?", existing.ID).Error)
	assert.True(t, u.IsSuperAdmin)
	assert.True(t, u.IsActive, "reactivated")
	assert.NoError(t, bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte("password123")), "password unchanged")
}

func TestEnsureSuperAdmin_RejectsShortPasswordForNewAccount(t *testing.T) {
	db := testutil.SetupTestDB(t)
	cleanAll(t, db)
	err := database.EnsureSuperAdmin(db, &config.SuperAdminConfig{Email: "new@platform.example", Password: "short"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "at least 8")
}
