package handlers_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// superAdminFixture is a super admin and a plain member in the same org.
type superAdminFixture struct {
	app        *handlers.App
	org        *models.Organization
	superAdmin *models.User
	member     *models.User
}

func newSuperAdminFixture(t *testing.T) *superAdminFixture {
	t.Helper()
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	return &superAdminFixture{
		app:        app,
		org:        org,
		superAdmin: testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithSuperAdmin()),
		member:     testutil.CreateTestUser(t, app.DB, org.ID),
	}
}

func (f *superAdminFixture) asSuperAdmin(req *fastglue.Request) *fastglue.Request {
	testutil.SetFullAuthContext(req, f.org.ID, f.superAdmin.ID, nil, true)
	return req
}

func (f *superAdminFixture) asMember(req *fastglue.Request) *fastglue.Request {
	testutil.SetFullAuthContext(req, f.org.ID, f.member.ID, nil, false)
	return req
}

func (f *superAdminFixture) createPlan(t *testing.T, name string) models.SubscriptionPlan {
	t.Helper()
	req := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"name": name, "price": 49, "currency": "usd", "interval": "monthly",
		"max_users": 10, "features": []string{"Campaigns", " ", "Analytics"},
	}))
	require.NoError(t, f.app.SuperAdminCreatePlan(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var plan models.SubscriptionPlan
	testutil.ParseEnvelopeResponse(t, req, &plan)
	return plan
}

func (f *superAdminFixture) createVendor(t *testing.T, body map[string]any) handlers.VendorResponse {
	t.Helper()
	req := f.asSuperAdmin(testutil.NewJSONRequest(t, body))
	require.NoError(t, f.app.SuperAdminCreateVendor(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var vendor handlers.VendorResponse
	testutil.ParseEnvelopeResponse(t, req, &vendor)
	return vendor
}

func login(t *testing.T, app *handlers.App, email, password string) *fastglue.Request {
	t.Helper()
	req := testutil.NewJSONRequest(t, map[string]string{"email": email, "password": password})
	require.NoError(t, app.Login(req))
	return req
}

// --- Access control ---

func TestApp_SuperAdmin_RejectsNonSuperAdmins(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)

	handlersToCheck := map[string]func(*fastglue.Request) error{
		"dashboard":    f.app.SuperAdminDashboard,
		"list vendors": f.app.SuperAdminListVendors,
		"list plans":   f.app.SuperAdminListPlans,
		"list pages":   f.app.SuperAdminListPages,
		"get config":   f.app.SuperAdminGetConfig,
		"list tickets": f.app.SuperAdminListTickets,
	}
	for name, h := range handlersToCheck {
		req := f.asMember(testutil.NewGETRequest(t))
		require.NoError(t, h(req), name)
		assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(req), name)
	}

	unauthenticated := testutil.NewGETRequest(t)
	require.NoError(t, f.app.SuperAdminListVendors(unauthenticated))
	assert.Equal(t, fasthttp.StatusUnauthorized, testutil.GetResponseStatusCode(unauthenticated))
}

// --- Plans ---

func TestApp_SuperAdmin_PlanLifecycle(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)

	plan := f.createPlan(t, "Growth "+uuid.NewString()[:6])
	assert.Equal(t, "INR", plan.Currency, "plans are always in rupees")
	assert.Equal(t, models.StringArray{"Campaigns", "Analytics"}, plan.Features, "blank features are dropped")
	assert.True(t, plan.IsActive)

	// Partial update: deactivate only.
	req := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"is_active": false}))
	testutil.SetPathParam(req, "id", plan.ID.String())
	require.NoError(t, f.app.SuperAdminUpdatePlan(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	var updated models.SubscriptionPlan
	testutil.ParseEnvelopeResponse(t, req, &updated)
	assert.False(t, updated.IsActive)
	assert.Equal(t, plan.Name, updated.Name, "untouched fields keep their value")

	// Validation.
	bad := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"name": "Bad", "price": 1, "interval": "weekly"}))
	require.NoError(t, f.app.SuperAdminCreatePlan(bad))
	testutil.AssertErrorResponse(t, bad, fasthttp.StatusBadRequest, "monthly or yearly")

	// A plan with vendors on it cannot be deleted.
	f.createVendor(t, map[string]any{"name": "Plan User " + uuid.NewString()[:6], "plan_id": plan.ID.String(), "status": "active"})
	del := f.asSuperAdmin(testutil.NewRequest(t))
	testutil.SetPathParam(del, "id", plan.ID.String())
	require.NoError(t, f.app.SuperAdminDeletePlan(del))
	testutil.AssertErrorResponse(t, del, fasthttp.StatusConflict, "still has vendors")

	// An unused plan can.
	unused := f.createPlan(t, "Unused "+uuid.NewString()[:6])
	del = f.asSuperAdmin(testutil.NewRequest(t))
	testutil.SetPathParam(del, "id", unused.ID.String())
	require.NoError(t, f.app.SuperAdminDeletePlan(del))
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(del))
}

// --- Vendors ---

func TestApp_SuperAdmin_CreateVendorWithOwnerLogin(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	plan := f.createPlan(t, "Starter "+uuid.NewString()[:6])
	ownerEmail := testutil.UniqueEmail("vendor-owner")

	vendor := f.createVendor(t, map[string]any{
		"name":           "Acme Retail",
		"owner_name":     "Priya Sharma",
		"owner_email":    ownerEmail,
		"phone":          "+91 98200 11223",
		"plan_id":        plan.ID.String(),
		"owner_password": "owner-password-1",
	})
	assert.Equal(t, "Acme Retail", vendor.Name)
	assert.Equal(t, models.VendorStatusTrial, vendor.Status, "new vendors start on trial")
	assert.Equal(t, plan.Name, vendor.PlanName)
	assert.Equal(t, int64(1), vendor.UsersCount, "owner login was created")
	require.NotNil(t, vendor.RenewalDate, "trial end is set")
	assert.True(t, vendor.RenewalDate.After(time.Now()))

	// The owner is an admin of the new org and can sign in.
	var owner models.User
	require.NoError(t, f.app.DB.Preload("Role").Where("email = ?", ownerEmail).First(&owner).Error)
	assert.Equal(t, vendor.ID, owner.OrganizationID)
	require.NotNil(t, owner.Role)
	assert.Equal(t, "admin", owner.Role.Name)
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(login(t, f.app, ownerEmail, "owner-password-1")))

	// Same owner email again is rejected.
	dup := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"name": "Acme Again", "owner_email": ownerEmail, "owner_password": "owner-password-1",
	}))
	require.NoError(t, f.app.SuperAdminCreateVendor(dup))
	testutil.AssertErrorResponse(t, dup, fasthttp.StatusConflict, "already exists")
}

func TestApp_SuperAdmin_ListVendorsIncludesOrgsWithoutSubscription(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)

	req := f.asSuperAdmin(testutil.NewGETRequest(t))
	require.NoError(t, f.app.SuperAdminListVendors(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	var vendors []handlers.VendorResponse
	testutil.ParseEnvelopeResponse(t, req, &vendors)

	var found *handlers.VendorResponse
	for i := range vendors {
		if vendors[i].ID == f.org.ID {
			found = &vendors[i]
		}
	}
	require.NotNil(t, found, "fixture org is listed")
	assert.Equal(t, models.VendorStatusActive, found.Status, "orgs without a subscription row count as active")
	assert.Equal(t, int64(2), found.UsersCount)
	assert.NotEmpty(t, found.OwnerEmail, "owner falls back to the org's first user")
}

func TestApp_SuperAdmin_SuspendedVendorCannotSignIn(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	ownerEmail := testutil.UniqueEmail("suspended-owner")
	vendor := f.createVendor(t, map[string]any{
		"name": "Pixel Academy", "owner_email": ownerEmail, "owner_password": "owner-password-1", "status": "active",
	})

	req := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"status": "suspended", "renewal_date": "2027-01-31"}))
	testutil.SetPathParam(req, "id", vendor.ID.String())
	require.NoError(t, f.app.SuperAdminUpdateVendor(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var updated handlers.VendorResponse
	testutil.ParseEnvelopeResponse(t, req, &updated)
	assert.Equal(t, models.VendorStatusSuspended, updated.Status)
	require.NotNil(t, updated.RenewalDate)
	assert.Equal(t, "2027-01-31", updated.RenewalDate.Format("2006-01-02"))

	testutil.AssertErrorResponse(t, login(t, f.app, ownerEmail, "owner-password-1"), fasthttp.StatusForbidden, "suspended")

	// A super admin can still enter the suspended vendor.
	sw := testutil.NewJSONRequest(t, map[string]any{"organization_id": vendor.ID})
	testutil.SetAuthContext(sw, f.org.ID, f.superAdmin.ID)
	require.NoError(t, f.app.SwitchOrg(sw))
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(sw))

	// Invalid status is rejected.
	bad := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"status": "paused"}))
	testutil.SetPathParam(bad, "id", vendor.ID.String())
	require.NoError(t, f.app.SuperAdminUpdateVendor(bad))
	testutil.AssertErrorResponse(t, bad, fasthttp.StatusBadRequest, "active, trial or suspended")
}

// --- Pages ---

func TestApp_SuperAdmin_Pages(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	slug := "terms-" + uuid.NewString()[:8]

	req := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"title": "Terms of Service", "slug": slug, "content": "Be nice."}))
	require.NoError(t, f.app.SuperAdminCreatePage(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	var page models.CMSPage
	testutil.ParseEnvelopeResponse(t, req, &page)
	assert.False(t, page.IsPublished)

	// Drafts are not public.
	pub := testutil.NewGETRequest(t)
	testutil.SetPathParam(pub, "slug", slug)
	require.NoError(t, f.app.GetPublicPage(pub))
	assert.Equal(t, fasthttp.StatusNotFound, testutil.GetResponseStatusCode(pub))

	// Publish, then it is.
	upd := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"is_published": true}))
	testutil.SetPathParam(upd, "id", page.ID.String())
	require.NoError(t, f.app.SuperAdminUpdatePage(upd))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(upd))

	pub = testutil.NewGETRequest(t)
	testutil.SetPathParam(pub, "slug", slug)
	require.NoError(t, f.app.GetPublicPage(pub))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(pub))
	var public struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	testutil.ParseEnvelopeResponse(t, pub, &public)
	assert.Equal(t, "Be nice.", public.Content)

	// Slugs are unique.
	dup := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"title": "Copy", "slug": slug}))
	require.NoError(t, f.app.SuperAdminCreatePage(dup))
	testutil.AssertErrorResponse(t, dup, fasthttp.StatusConflict, "already uses")

	// Delete.
	del := f.asSuperAdmin(testutil.NewRequest(t))
	testutil.SetPathParam(del, "id", page.ID.String())
	require.NoError(t, f.app.SuperAdminDeletePage(del))
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(del))
}

// --- Support tickets & dashboard ---

func TestApp_SuperAdmin_TicketsAndDashboard(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)

	// A vendor's user raises a ticket.
	create := f.asMember(testutil.NewJSONRequest(t, map[string]any{"subject": "Template rejected", "priority": "high"}))
	require.NoError(t, f.app.CreateSupportTicket(create))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(create), string(testutil.GetResponseBody(create)))
	var ticket models.SupportTicket
	testutil.ParseEnvelopeResponse(t, create, &ticket)
	assert.Equal(t, models.TicketStatusOpen, ticket.Status)
	assert.Equal(t, f.org.ID, ticket.OrganizationID)

	// They see it in their own list.
	mine := f.asMember(testutil.NewGETRequest(t))
	require.NoError(t, f.app.ListMySupportTickets(mine))
	var myTickets []handlers.SupportTicketResponse
	testutil.ParseEnvelopeResponse(t, mine, &myTickets)
	require.Len(t, myTickets, 1)
	assert.Equal(t, f.org.Name, myTickets[0].VendorName)

	// It shows up as new on the dashboard.
	dash := f.asSuperAdmin(testutil.NewGETRequest(t))
	require.NoError(t, f.app.SuperAdminDashboard(dash))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(dash), string(testutil.GetResponseBody(dash)))
	var before handlers.SuperAdminDashboardResponse
	testutil.ParseEnvelopeResponse(t, dash, &before)
	assert.GreaterOrEqual(t, before.TicketsNew, int64(1))
	assert.GreaterOrEqual(t, before.TotalVendors, 1)

	// Super admin solves it.
	solve := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"status": "solved"}))
	testutil.SetPathParam(solve, "id", ticket.ID.String())
	require.NoError(t, f.app.SuperAdminUpdateTicket(solve))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(solve))
	var solved models.SupportTicket
	testutil.ParseEnvelopeResponse(t, solve, &solved)
	assert.Equal(t, models.TicketStatusSolved, solved.Status)
	assert.NotNil(t, solved.SolvedAt)

	// Open-only filter no longer includes it.
	open := f.asSuperAdmin(testutil.NewGETRequest(t))
	testutil.SetQueryParam(open, "status", "open")
	require.NoError(t, f.app.SuperAdminListTickets(open))
	var openTickets []handlers.SupportTicketResponse
	testutil.ParseEnvelopeResponse(t, open, &openTickets)
	for _, tk := range openTickets {
		assert.NotEqual(t, ticket.ID, tk.ID)
	}

	// Missing subject is rejected.
	bad := f.asMember(testutil.NewJSONRequest(t, map[string]any{"subject": "  "}))
	require.NoError(t, f.app.CreateSupportTicket(bad))
	testutil.AssertErrorResponse(t, bad, fasthttp.StatusBadRequest, "Subject is required")
}

// --- Platform config ---
//
// Not parallel: the platform config is a single shared row, and maintenance
// mode would block logins in other tests. Serial tests finish before any
// parallel test in this package resumes.

func TestApp_SuperAdmin_ConfigAndMaintenanceMode(t *testing.T) {
	f := newSuperAdminFixture(t)
	t.Cleanup(func() { f.app.DB.Where("key = ?", "platform_config").Delete(&models.PlatformSetting{}) })

	// Defaults when nothing is stored.
	get := f.asSuperAdmin(testutil.NewGETRequest(t))
	require.NoError(t, f.app.SuperAdminGetConfig(get))
	var cfg handlers.PlatformConfig
	testutil.ParseEnvelopeResponse(t, get, &cfg)
	assert.Equal(t, 14, cfg.TrialDays)

	// Validation.
	bad := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"trial_days": 999}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(bad))
	testutil.AssertErrorResponse(t, bad, fasthttp.StatusBadRequest, "Trial days")

	// The platform currency is always INR.
	cur := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"default_currency": "USD"}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(cur))
	testutil.ParseEnvelopeResponse(t, cur, &cfg)
	assert.Equal(t, "INR", cfg.DefaultCurrency)

	// Turn on maintenance mode (partial update keeps the other fields).
	upd := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"maintenance_mode": true, "maintenance_message": "Back at 6pm", "trial_days": 30,
	}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(upd))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(upd), string(testutil.GetResponseBody(upd)))
	testutil.ParseEnvelopeResponse(t, upd, &cfg)
	assert.True(t, cfg.MaintenanceMode)
	assert.Equal(t, 30, cfg.TrialDays)
	assert.Equal(t, "onesuit", cfg.PlatformName)

	// Members are blocked; super admins are not.
	testutil.AssertErrorResponse(t, login(t, f.app, f.member.Email, "password123"), fasthttp.StatusServiceUnavailable, "Back at 6pm")
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(login(t, f.app, f.superAdmin.Email, "password123")))

	// Turning it off lets members back in.
	off := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"maintenance_mode": false}))
	require.NoError(t, f.app.SuperAdminUpdateConfig(off))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(off))
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(login(t, f.app, f.member.Email, "password123")))
}

func TestApp_SupportTickets_EmptyListIsArray(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t) // fresh org with no tickets

	req := f.asMember(testutil.NewGETRequest(t))
	require.NoError(t, f.app.ListMySupportTickets(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	assert.Contains(t, string(testutil.GetResponseBody(req)), `"data":[]`, "empty list must encode as [], not null")
}
