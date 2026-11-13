package middleware_test

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/middleware"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
	"golang.org/x/crypto/bcrypt"
)

// A refresh token (it carries a JTI and lives for days) or a WebSocket token
// must not be accepted as an API access token.
func TestAuth_RejectsRefreshAndWSTokens(t *testing.T) {
	t.Parallel()
	base := middleware.JWTClaims{UserID: uuid.New(), OrganizationID: uuid.New(), Email: "a@example.com",
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}}

	refresh := base
	refresh.ID = uuid.New().String()
	ws := base
	ws.Subject = middleware.WSTokenSubject

	for name, claims := range map[string]middleware.JWTClaims{"refresh": refresh, "ws": ws} {
		tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testJWTSecret))
		require.NoError(t, err)

		req := newTestRequest()
		req.RequestCtx.Request.Header.Set("Authorization", "Bearer "+tok)
		assert.Nil(t, middleware.Auth(testJWTSecret)(req), name)
		assert.Equal(t, fasthttp.StatusUnauthorized, req.RequestCtx.Response.StatusCode(), name)

		// Same through the cookie.
		req = newTestRequest()
		req.RequestCtx.Request.Header.SetCookie("whm_access", tok)
		assert.Nil(t, middleware.Auth(testJWTSecret)(req), name+" cookie")
	}

	// A plain access token still works.
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, base).SignedString([]byte(testJWTSecret))
	require.NoError(t, err)
	req := newTestRequest()
	req.RequestCtx.Request.Header.Set("Authorization", "Bearer "+tok)
	assert.NotNil(t, middleware.Auth(testJWTSecret)(req))
}

func TestRecoverHandler_PanicAnswers500(t *testing.T) {
	t.Parallel()
	h := middleware.RecoverHandler(testutil.NopLogger(), func(ctx *fasthttp.RequestCtx) {
		var m map[string]int
		m["boom"]++ // nil map write panics
	})
	ctx := &fasthttp.RequestCtx{}
	require.NotPanics(t, func() { h(ctx) })
	assert.Equal(t, fasthttp.StatusInternalServerError, ctx.Response.StatusCode())
	assert.Contains(t, string(ctx.Response.Body()), "Internal server error")
}

// A deactivated user's API keys must stop working with their login.
func TestAuthWithDB_APIKeyOfInactiveUserRejected(t *testing.T) {
	db := testutil.SetupTestDB(t)
	org := testutil.CreateTestOrganization(t, db)
	user := testutil.CreateTestUser(t, db, org.ID, testutil.WithInactive())

	key := "whm_" + "0123456789abcdef0123456789abcdef"
	hash, err := bcrypt.GenerateFromPassword([]byte(key), bcrypt.MinCost)
	require.NoError(t, err)
	require.NoError(t, db.Create(&models.APIKey{
		BaseModel: models.BaseModel{ID: uuid.New()}, OrganizationID: org.ID, UserID: user.ID,
		Name: "k", KeyPrefix: key[4:20], KeyHash: string(hash), IsActive: true,
	}).Error)

	req := newTestRequest()
	req.RequestCtx.Request.Header.Set("X-API-Key", key)
	assert.Nil(t, middleware.AuthWithDB(testJWTSecret, db)(req))
	assert.Equal(t, fasthttp.StatusUnauthorized, req.RequestCtx.Response.StatusCode())

	// Reactivated: the same key works again.
	require.NoError(t, db.Model(&models.User{}).Where("id = ?", user.ID).Update("is_active", true).Error)
	req = newTestRequest()
	req.RequestCtx.Request.Header.Set("X-API-Key", key)
	assert.NotNil(t, middleware.AuthWithDB(testJWTSecret, db)(req))
}
