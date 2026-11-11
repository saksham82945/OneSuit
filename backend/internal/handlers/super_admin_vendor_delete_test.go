package handlers_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

func TestApp_SuperAdminDeleteVendor(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)

	deleteReq := func(id uuid.UUID, asMember bool) *fastglue.Request {
		req := testutil.NewRequest(t)
		if asMember {
			f.asMember(req)
		} else {
			f.asSuperAdmin(req)
		}
		testutil.SetPathParam(req, "id", id.String())
		require.NoError(t, f.app.SuperAdminDeleteVendor(req))
		return req
	}

	client := f.createVendor(t, map[string]any{
		"name": "Doomed client", "owner_name": "Ravi", "owner_email": testutil.UniqueEmail("doomed"),
		"owner_password": "password-123",
	})

	// Non super admins are refused.
	testutil.AssertErrorResponse(t, deleteReq(client.ID, true), fasthttp.StatusForbidden, "Super admin")
	// Unknown ids are 404.
	testutil.AssertErrorResponse(t, deleteReq(uuid.New(), false), fasthttp.StatusNotFound, "not found")

	// A workspace that is a super admin's home can be deleted: the super
	// admin is kept and moved to the platform workspace.
	guarded := f.createVendor(t, map[string]any{"name": "Guarded client " + uuid.NewString()[:6]})
	otherSuper := testutil.CreateTestUser(t, f.app.DB, guarded.ID, testutil.WithSuperAdmin())
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(deleteReq(guarded.ID, false)))
	var movedSuper models.User
	require.NoError(t, f.app.DB.First(&movedSuper, "id = ?", otherSuper.ID).Error, "super admin is never deleted")
	assert.True(t, movedSuper.IsActive)
	assert.NotEqual(t, guarded.ID, movedSuper.OrganizationID)
	var platform models.Organization
	require.NoError(t, f.app.DB.First(&platform, "id = ?", movedSuper.OrganizationID).Error)
	assert.Equal(t, "OneSuit Platform", platform.Name)
	// The platform workspace itself can't be deleted.
	testutil.AssertErrorResponse(t, deleteReq(platform.ID, false), fasthttp.StatusBadRequest, "platform workspace")

	// A user who also belongs to another workspace keeps their login.
	shared := testutil.CreateTestUser(t, f.app.DB, client.ID)
	require.NoError(t, f.app.DB.Create(&models.UserOrganization{UserID: shared.ID, OrganizationID: f.org.ID}).Error)
	wa := testutil.CreateTestWhatsAppAccount(t, f.app.DB, client.ID)

	ok := deleteReq(client.ID, false)
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(ok), string(testutil.GetResponseBody(ok)))

	// Gone from the client list.
	list := f.asSuperAdmin(testutil.NewGETRequest(t))
	require.NoError(t, f.app.SuperAdminListVendors(list))
	var vendors []handlers.VendorResponse
	testutil.ParseEnvelopeResponse(t, list, &vendors)
	for _, v := range vendors {
		assert.NotEqual(t, client.ID, v.ID, "deleted client is still listed")
	}

	var count int64
	f.app.DB.Model(&models.Organization{}).Where("id = ?", client.ID).Count(&count)
	assert.Zero(t, count, "organization soft-deleted")
	f.app.DB.Model(&models.OrganizationSubscription{}).Where("organization_id = ?", client.ID).Count(&count)
	assert.Zero(t, count, "subscription soft-deleted")
	f.app.DB.Model(&models.WhatsAppAccount{}).Where("id = ?", wa.ID).Count(&count)
	assert.Zero(t, count, "WhatsApp account soft-deleted")
	f.app.DB.Model(&models.UserOrganization{}).Where("organization_id = ?", client.ID).Count(&count)
	assert.Zero(t, count, "memberships removed")
	f.app.DB.Model(&models.User{}).Where("email = ?", client.OwnerEmail).Count(&count)
	assert.Zero(t, count, "owner whose only workspace it was is removed")

	var kept models.User
	require.NoError(t, f.app.DB.Where("id = ?", shared.ID).First(&kept).Error)
	assert.Equal(t, f.org.ID, kept.OrganizationID, "shared user moved to their other workspace")

	// The owner's email can be used again.
	again := f.createVendor(t, map[string]any{
		"name": "Doomed client", "owner_email": client.OwnerEmail, "owner_password": "password-123",
	})
	assert.NotEqual(t, client.ID, again.ID)
}
