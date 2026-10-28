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

type authPayload struct {
	User struct {
		ID             uuid.UUID `json:"id"`
		Email          string    `json:"email"`
		OrganizationID uuid.UUID `json:"organization_id"`
		Role           *struct {
			Name string `json:"name"`
		} `json:"role"`
	} `json:"user"`
}

func signup(t *testing.T, app *handlers.App, body map[string]any) *fastglue.Request {
	t.Helper()
	req := testutil.NewJSONRequest(t, body)
	require.NoError(t, app.Signup(req))
	return req
}

func (f *superAdminFixture) createInvite(t *testing.T, orgID uuid.UUID, body map[string]any) handlers.InviteResponse {
	t.Helper()
	req := testutil.NewJSONRequest(t, body)
	testutil.SetFullAuthContext(req, orgID, f.superAdmin.ID, nil, true)
	require.NoError(t, f.app.CreateInvite(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var inv handlers.InviteResponse
	testutil.ParseEnvelopeResponse(t, req, &inv)
	return inv
}

func acceptInvite(t *testing.T, app *handlers.App, body map[string]any) *fastglue.Request {
	t.Helper()
	req := testutil.NewJSONRequest(t, body)
	require.NoError(t, app.AcceptInvite(req))
	return req
}

// --- Public plans ---

func TestApp_PublicPlans_OnlyActivePlans(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	active := f.createPlan(t, "Public "+uuid.NewString()[:6])
	hidden := f.createPlan(t, "Hidden "+uuid.NewString()[:6])
	off := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"is_active": false}))
	testutil.SetPathParam(off, "id", hidden.ID.String())
	require.NoError(t, f.app.SuperAdminUpdatePlan(off))

	req := testutil.NewGETRequest(t) // no login
	require.NoError(t, f.app.GetPublicPlans(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	var resp struct {
		Plans         []handlers.PublicPlan `json:"plans"`
		SignupEnabled bool                  `json:"signup_enabled"`
	}
	testutil.ParseEnvelopeResponse(t, req, &resp)
	ids := map[uuid.UUID]bool{}
	for _, p := range resp.Plans {
		ids[p.ID] = true
	}
	assert.True(t, ids[active.ID], "active plan is listed")
	assert.False(t, ids[hidden.ID], "inactive plan is hidden")
	assert.True(t, resp.SignupEnabled)
}

// --- Website sign-up ---

func TestApp_Signup_CreatesTrialBusinessAndSignsIn(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	plan := f.createPlan(t, "Growth "+uuid.NewString()[:6])
	email := testutil.UniqueEmail("signup-owner")

	req := signup(t, f.app, map[string]any{
		"business_name": "Sunrise Realty", "full_name": "Carlos Mendez", "email": email,
		"password": "secret-pass-1", "plan_id": plan.ID.String(),
	})
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	assert.NotEmpty(t, testutil.GetResponseCookie(req, "whm_access"), "signed in")
	var resp authPayload
	testutil.ParseEnvelopeResponse(t, req, &resp)
	assert.Equal(t, email, resp.User.Email)
	require.NotNil(t, resp.User.Role)
	assert.Equal(t, "admin", resp.User.Role.Name, "the buyer owns their workspace")

	vendor, err := loadVendorForTest(t, f, resp.User.OrganizationID)
	require.NoError(t, err)
	assert.Equal(t, "Sunrise Realty", vendor.Name)
	assert.Equal(t, models.VendorStatusTrial, vendor.Status)
	assert.Equal(t, plan.Name, vendor.PlanName)
	assert.Equal(t, email, vendor.OwnerEmail)
	require.NotNil(t, vendor.RenewalDate, "trial end date is set")

	// They can sign in again later.
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(login(t, f.app, email, "secret-pass-1")))
}

func TestApp_Signup_Validation(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	base := func() map[string]any {
		return map[string]any{
			"business_name": "Acme", "full_name": "Priya", "email": testutil.UniqueEmail("signup-val"), "password": "long-enough-1",
		}
	}

	dup := base()
	dup["email"] = f.member.Email
	testutil.AssertErrorResponse(t, signup(t, f.app, dup), fasthttp.StatusConflict, "already exists")

	short := base()
	short["password"] = "short"
	testutil.AssertErrorResponse(t, signup(t, f.app, short), fasthttp.StatusBadRequest, "at least 8")

	noBiz := base()
	noBiz["business_name"] = " "
	testutil.AssertErrorResponse(t, signup(t, f.app, noBiz), fasthttp.StatusBadRequest, "Business name")

	badPlan := base()
	badPlan["plan_id"] = uuid.NewString()
	testutil.AssertErrorResponse(t, signup(t, f.app, badPlan), fasthttp.StatusBadRequest, "not available")
}

// --- Invites ---

func TestApp_Invites_JoinWithLink(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	agentRole := models.CustomRole{OrganizationID: f.org.ID, Name: "agent", IsSystem: true, IsDefault: true}
	require.NoError(t, f.app.DB.Create(&agentRole).Error)

	inv := f.createInvite(t, f.org.ID, map[string]any{}) // default role, single use, 7 days
	require.NotEmpty(t, inv.Token)
	assert.Equal(t, "/join/"+inv.Token, inv.Path)
	assert.Equal(t, "agent", inv.RoleName)
	assert.Equal(t, 1, inv.MaxUses)

	// The join page can describe it without login.
	pub := testutil.NewGETRequest(t)
	testutil.SetPathParam(pub, "token", inv.Token)
	require.NoError(t, f.app.GetPublicInvite(pub))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(pub))
	var info struct {
		OrganizationName string `json:"organization_name"`
		RoleName         string `json:"role_name"`
	}
	testutil.ParseEnvelopeResponse(t, pub, &info)
	assert.Equal(t, f.org.Name, info.OrganizationName)

	// A new person joins and is signed in to the org with the invite's role.
	email := testutil.UniqueEmail("invitee")
	req := acceptInvite(t, f.app, map[string]any{"token": inv.Token, "full_name": "New Agent", "email": email, "password": "agent-pass-1"})
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var resp authPayload
	testutil.ParseEnvelopeResponse(t, req, &resp)
	assert.Equal(t, f.org.ID, resp.User.OrganizationID)
	var membership models.UserOrganization
	require.NoError(t, f.app.DB.Where("user_id = ? AND organization_id = ?", resp.User.ID, f.org.ID).First(&membership).Error)
	require.NotNil(t, membership.RoleID)
	assert.Equal(t, agentRole.ID, *membership.RoleID)

	// A single-use link can't be used twice.
	again := acceptInvite(t, f.app, map[string]any{"token": inv.Token, "full_name": "Someone", "email": testutil.UniqueEmail("late"), "password": "agent-pass-1"})
	testutil.AssertErrorResponse(t, again, fasthttp.StatusNotFound, "invalid")

	// The admin's list shows it as used, without the token.
	list := testutil.NewGETRequest(t)
	testutil.SetFullAuthContext(list, f.org.ID, f.superAdmin.ID, nil, true)
	require.NoError(t, f.app.ListInvites(list))
	var listed struct {
		Invites []handlers.InviteResponse `json:"invites"`
	}
	testutil.ParseEnvelopeResponse(t, list, &listed)
	require.Len(t, listed.Invites, 1)
	assert.Equal(t, "used", listed.Invites[0].Status)
	assert.Empty(t, listed.Invites[0].Token)
}

func TestApp_Invites_EmailRestrictionExistingUserAndRevoke(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	other := testutil.CreateTestOrganization(t, f.app.DB)
	role := models.CustomRole{OrganizationID: other.ID, Name: "manager", IsSystem: true}
	require.NoError(t, f.app.DB.Create(&role).Error)

	// Restricted to the existing member's email, reusable.
	inv := f.createInvite(t, other.ID, map[string]any{"role_id": role.ID, "email": f.member.Email, "max_uses": 0})

	wrong := acceptInvite(t, f.app, map[string]any{"token": inv.Token, "full_name": "X", "email": testutil.UniqueEmail("x"), "password": "whatever-123"})
	testutil.AssertErrorResponse(t, wrong, fasthttp.StatusForbidden, "different email")

	badPass := acceptInvite(t, f.app, map[string]any{"token": inv.Token, "email": f.member.Email, "password": "not-their-password"})
	testutil.AssertErrorResponse(t, badPass, fasthttp.StatusUnauthorized, "Enter its password")

	// An existing account joins a second organization with its own password.
	ok := acceptInvite(t, f.app, map[string]any{"token": inv.Token, "email": f.member.Email, "password": "password123"})
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(ok), string(testutil.GetResponseBody(ok)))
	var count int64
	f.app.DB.Model(&models.UserOrganization{}).Where("user_id = ?", f.member.ID).Count(&count)
	assert.Equal(t, int64(2), count, "now a member of both organizations")

	// Revoked links stop working.
	del := testutil.NewRequest(t)
	testutil.SetFullAuthContext(del, other.ID, f.superAdmin.ID, nil, true)
	testutil.SetPathParam(del, "id", inv.ID.String())
	require.NoError(t, f.app.DeleteInvite(del))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(del))
	pub := testutil.NewGETRequest(t)
	testutil.SetPathParam(pub, "token", inv.Token)
	require.NoError(t, f.app.GetPublicInvite(pub))
	assert.Equal(t, fasthttp.StatusNotFound, testutil.GetResponseStatusCode(pub))
}

// --- Plan limits and trial expiry ---

func TestApp_PlanUserLimit_BlocksExtraMembers(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	planReq := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"name": "Solo " + uuid.NewString()[:6], "price": 5, "max_users": 1}))
	require.NoError(t, f.app.SuperAdminCreatePlan(planReq))
	var plan models.SubscriptionPlan
	testutil.ParseEnvelopeResponse(t, planReq, &plan)

	vendor := f.createVendor(t, map[string]any{
		"name": "Solo Shop", "plan_id": plan.ID.String(), "status": "active",
		"owner_email": testutil.UniqueEmail("solo-owner"), "owner_password": "owner-pass-1",
	})
	inv := f.createInvite(t, vendor.ID, map[string]any{"max_uses": 0})

	req := acceptInvite(t, f.app, map[string]any{"token": inv.Token, "full_name": "Extra", "email": testutil.UniqueEmail("extra"), "password": "extra-pass-1"})
	testutil.AssertErrorResponse(t, req, fasthttp.StatusForbidden, "allows up to 1 users")

	// The refused attempt didn't use up the link.
	pub := testutil.NewGETRequest(t)
	testutil.SetPathParam(pub, "token", inv.Token)
	require.NoError(t, f.app.GetPublicInvite(pub))
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(pub))
}

func TestApp_ExpiredTrial_BlocksSignIn(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	email := testutil.UniqueEmail("expired-trial")
	vendor := f.createVendor(t, map[string]any{"name": "Old Trial", "owner_email": email, "owner_password": "owner-pass-1"})
	require.Equal(t, models.VendorStatusTrial, vendor.Status)

	upd := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"renewal_date": "2020-01-01"}))
	testutil.SetPathParam(upd, "id", vendor.ID.String())
	require.NoError(t, f.app.SuperAdminUpdateVendor(upd))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(upd))

	testutil.AssertErrorResponse(t, login(t, f.app, email, "owner-pass-1"), fasthttp.StatusForbidden, "free trial has ended")

	// Marking them active (e.g. after payment) lets them back in.
	act := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"status": "active"}))
	testutil.SetPathParam(act, "id", vendor.ID.String())
	require.NoError(t, f.app.SuperAdminUpdateVendor(act))
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(login(t, f.app, email, "owner-pass-1")))
}

// loadVendorForTest fetches one vendor through the Super Admin list.
func loadVendorForTest(t *testing.T, f *superAdminFixture, id uuid.UUID) (handlers.VendorResponse, error) {
	t.Helper()
	req := testutil.NewGETRequest(t)
	testutil.SetFullAuthContext(req, f.org.ID, f.superAdmin.ID, nil, true)
	if err := f.app.SuperAdminListVendors(req); err != nil {
		return handlers.VendorResponse{}, err
	}
	var vendors []handlers.VendorResponse
	testutil.ParseEnvelopeResponse(t, req, &vendors)
	for _, v := range vendors {
		if v.ID == id {
			return v, nil
		}
	}
	return handlers.VendorResponse{}, assert.AnError
}

func TestApp_Signup_WithoutPlan(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	email := testutil.UniqueEmail("signup-noplan")
	// No plan_id and no default plan configured: the business starts on a trial with no plan.
	req := signup(t, f.app, map[string]any{
		"business_name": "No Plan Co", "full_name": "Ana", "email": email, "password": "secret-pass-1",
	})
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var resp authPayload
	testutil.ParseEnvelopeResponse(t, req, &resp)
	vendor, err := loadVendorForTest(t, f, resp.User.OrganizationID)
	require.NoError(t, err)
	assert.Nil(t, vendor.PlanID)
	assert.Equal(t, models.VendorStatusTrial, vendor.Status)
}
