package handlers_test

import (
	"testing"

	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

func TestApp_SiteContent(t *testing.T) {
	f := newSuperAdminFixture(t)
	t.Cleanup(func() { f.app.DB.Where("key = ?", "site_content").Delete(&models.PlatformSetting{}) })

	// Only the super admin can change it.
	deny := f.asMember(testutil.NewJSONRequest(t, map[string]any{"hero_title": "Hi"}))
	require.NoError(t, f.app.SuperAdminUpdateSiteContent(deny))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(deny))

	bad := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"facebook_url": "facebook.com/x"}))
	require.NoError(t, f.app.SuperAdminUpdateSiteContent(bad))
	testutil.AssertErrorResponse(t, bad, fasthttp.StatusBadRequest, "https://")

	upd := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{
		"hero_title": "  Grow on WhatsApp ", "instagram_url": "https://instagram.com/onesuit",
		"faqs":         []map[string]string{{"question": "Q1", "answer": "A1"}, {"question": " ", "answer": "dropped"}},
		"logo_display": "weird", "animations_enabled": false,
		"features": []map[string]string{{"title": "F", "text": "T", "icon": "unknown"}},
	}))
	require.NoError(t, f.app.SuperAdminUpdateSiteContent(upd))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(upd), string(testutil.GetResponseBody(upd)))

	pub := testutil.NewGETRequest(t)
	require.NoError(t, f.app.GetPublicSiteContent(pub))
	var out struct {
		Content handlers.SiteContent      `json:"content"`
		Pages   []handlers.PublicPageLink `json:"pages"`
	}
	testutil.ParseEnvelopeResponse(t, pub, &out)
	assert.Equal(t, "Grow on WhatsApp", out.Content.HeroTitle)
	assert.Equal(t, "https://instagram.com/onesuit", out.Content.InstagramURL)
	assert.Len(t, out.Content.FAQs, 1)
	assert.Equal(t, "logo", out.Content.LogoDisplay)
	assert.False(t, out.Content.AnimationsEnabled)
	assert.Equal(t, "sparkles", out.Content.Features[0].Icon)
	assert.True(t, out.Content.ShowPricing, "fields not sent keep their value")
	assert.NotNil(t, out.Pages)
}

func TestEnsureDefaultPages_OnlyOnce(t *testing.T) {
	app := newTestApp(t)
	db := app.DB
	db.Where("key = ?", "default_pages_seeded").Delete(&models.PlatformSetting{})
	t.Cleanup(func() { db.Where("key = ?", "default_pages_seeded").Delete(&models.PlatformSetting{}) })

	require.NoError(t, handlers.EnsureDefaultPages(db))
	var n int64
	db.Model(&models.CMSPage{}).Where("slug = ?", "privacy-policy").Count(&n)
	assert.Equal(t, int64(1), n)

	// A deleted page is not created again.
	db.Where("slug = ?", "privacy-policy").Delete(&models.CMSPage{})
	require.NoError(t, handlers.EnsureDefaultPages(db))
	db.Model(&models.CMSPage{}).Where("slug = ?", "privacy-policy").Count(&n)
	assert.Equal(t, int64(0), n)
}

func TestApp_PlanUnlimitedMinusOne(t *testing.T) {
	t.Parallel()
	f := newSuperAdminFixture(t)
	plan := f.createPlan(t, "Advance")
	upd := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"max_users": -1, "max_contacts": -1}))
	testutil.SetPathParam(upd, "id", plan.ID.String())
	require.NoError(t, f.app.SuperAdminUpdatePlan(upd))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(upd), string(testutil.GetResponseBody(upd)))
	testutil.ParseEnvelopeResponse(t, upd, &plan)
	assert.Equal(t, -1, plan.MaxUsers)

	bad := f.asSuperAdmin(testutil.NewJSONRequest(t, map[string]any{"max_users": -5}))
	testutil.SetPathParam(bad, "id", plan.ID.String())
	require.NoError(t, f.app.SuperAdminUpdatePlan(bad))
	testutil.AssertErrorResponse(t, bad, fasthttp.StatusBadRequest, "-1 for unlimited")
}
