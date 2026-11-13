package handlers_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/middleware"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

func TestApp_Login_Success(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	email := testutil.UniqueEmail("login-success")
	password := "validpassword123"
	testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithEmail(email), testutil.WithPassword(password))

	req := testutil.NewJSONRequest(t, map[string]string{
		"email":    email,
		"password": password,
	})

	err := app.Login(req)
	require.NoError(t, err)
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))

	// Parse the response — tokens are in cookies, not body
	var resp struct {
		Status string `json:"status"`
		Data   struct {
			ExpiresIn int `json:"expires_in"`
			User      struct {
				Email string `json:"email"`
				Role  string `json:"role"`
			} `json:"user"`
		} `json:"data"`
	}
	err = json.Unmarshal(testutil.GetResponseBody(req), &resp)
	require.NoError(t, err)

	assert.Equal(t, "success", resp.Status)
	assert.Equal(t, 15*60, resp.Data.ExpiresIn)
	assert.Equal(t, email, resp.Data.User.Email)

	// Tokens should be in Set-Cookie headers
	assert.NotEmpty(t, testutil.GetResponseCookie(req, "whm_access"))
	assert.NotEmpty(t, testutil.GetResponseCookie(req, "whm_refresh"))
	assert.NotEmpty(t, testutil.GetResponseCookie(req, "whm_csrf"))
}

func TestApp_Login_WrongPassword(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	email := testutil.UniqueEmail("wrong-pwd")
	testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithEmail(email), testutil.WithPassword("correctpassword"))

	req := testutil.NewJSONRequest(t, map[string]string{
		"email":    email,
		"password": "wrongpassword",
	})

	err := app.Login(req)
	require.NoError(t, err)
	testutil.AssertErrorResponse(t, req, fasthttp.StatusUnauthorized, "Invalid credentials")
}

func TestApp_Login_UserNotFound(t *testing.T) {
	app := newTestApp(t)

	req := testutil.NewJSONRequest(t, map[string]string{
		"email":    testutil.UniqueEmail("nonexistent"),
		"password": "anypassword",
	})

	err := app.Login(req)
	require.NoError(t, err)
	testutil.AssertErrorResponse(t, req, fasthttp.StatusUnauthorized, "Invalid credentials")
}

func TestApp_Login_InactiveUser(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	email := testutil.UniqueEmail("inactive")
	testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithEmail(email), testutil.WithPassword("validpassword123"), testutil.WithInactive())

	req := testutil.NewJSONRequest(t, map[string]string{
		"email":    email,
		"password": "validpassword123",
	})

	err := app.Login(req)
	require.NoError(t, err)
	testutil.AssertErrorResponse(t, req, fasthttp.StatusUnauthorized, "Account is disabled")
}

func TestApp_Login_InvalidRequestBody(t *testing.T) {
	app := newTestApp(t)

	req := testutil.NewRequest(t)
	req.RequestCtx.Request.SetBody([]byte("invalid json"))
	req.RequestCtx.Request.Header.SetContentType("application/json")

	err := app.Login(req)
	require.NoError(t, err)
	assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(req))
}

func TestApp_Login_UserWithRole(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	email := testutil.UniqueEmail("role-test")
	password := "testpassword123"

	// Create an actual role first
	role := &models.CustomRole{
		BaseModel:      models.BaseModel{ID: uuid.New()},
		OrganizationID: org.ID,
		Name:           "Test Role " + uuid.New().String()[:8],
		IsSystem:       false,
	}
	require.NoError(t, app.DB.Create(role).Error)

	testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithEmail(email), testutil.WithPassword(password), testutil.WithRoleID(&role.ID))

	req := testutil.NewJSONRequest(t, map[string]string{
		"email":    email,
		"password": password,
	})

	err := app.Login(req)
	require.NoError(t, err)
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
}

// Register no longer lets anyone who knows an organization's ID join it:
// joining needs an invite link (accept-invite), new businesses use sign-up.
func TestApp_Register_RefusesToJoinOrganizationByID(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	testutil.CreateTestRoleExact(t, app.DB, org.ID, "agent", true, true, nil)
	email := testutil.UniqueEmail("register")

	req := testutil.NewJSONRequest(t, map[string]any{
		"email":           email,
		"password":        "securepassword123",
		"full_name":       "New User",
		"organization_id": org.ID.String(),
	})

	require.NoError(t, app.Register(req))
	testutil.AssertErrorResponse(t, req, fasthttp.StatusForbidden, "invite link")
	assert.Empty(t, testutil.GetResponseCookie(req, "whm_access"))

	var count int64
	app.DB.Model(&models.User{}).Where("email = ?", email).Count(&count)
	assert.Equal(t, int64(0), count, "no account may be created")
}

func TestApp_Register_ExistingUserCannotJoinAnotherOrg(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	email := testutil.UniqueEmail("multiorg")
	user := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithEmail(email), testutil.WithPassword("password123"))

	victim := testutil.CreateTestOrganization(t, app.DB)
	testutil.CreateTestRoleExact(t, app.DB, victim.ID, "agent", true, true, nil)

	req := testutil.NewJSONRequest(t, map[string]any{
		"email":           email,
		"password":        "password123",
		"full_name":       "Same User",
		"organization_id": victim.ID.String(),
	})

	require.NoError(t, app.Register(req))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(req))
	assert.Empty(t, testutil.GetResponseCookie(req, "whm_access"))

	var count int64
	app.DB.Model(&models.UserOrganization{}).Where("user_id = ? AND organization_id = ?", user.ID, victim.ID).Count(&count)
	assert.Equal(t, int64(0), count, "must not become a member of the other organization")
}

func TestApp_Register_InvalidRequestBody(t *testing.T) {
	app := newTestApp(t)

	req := testutil.NewRequest(t)
	req.RequestCtx.Request.SetBody([]byte("invalid json"))
	req.RequestCtx.Request.Header.SetContentType("application/json")

	err := app.Register(req)
	require.NoError(t, err)
	assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(req))
}

// storedRefreshToken issues a refresh token whose JTI is live in Redis, the
// way generateRefreshToken does, so RefreshToken gets past the JTI check.
func storedRefreshToken(t *testing.T, app *handlers.App, user *models.User) string {
	t.Helper()
	jti := uuid.New().String()
	require.NoError(t, app.Redis.Set(context.Background(), "refresh:"+jti, user.ID.String(), time.Hour).Err())
	return generateRefreshTokenWithJTI(t, testutil.TestJWTSecret, user, jti, time.Hour)
}

func TestApp_RefreshToken_Success(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithEmail(testutil.UniqueEmail("refresh")), testutil.WithPassword("password123"))
	refreshToken := storedRefreshToken(t, app, user)

	req := testutil.NewJSONRequest(t, map[string]string{
		"refresh_token": refreshToken,
	})

	err := app.RefreshToken(req)
	require.NoError(t, err)
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))

	var resp struct {
		Status string `json:"status"`
		Data   struct {
			ExpiresIn int `json:"expires_in"`
		} `json:"data"`
	}
	err = json.Unmarshal(testutil.GetResponseBody(req), &resp)
	require.NoError(t, err)

	assert.Equal(t, "success", resp.Status)
	assert.Equal(t, 15*60, resp.Data.ExpiresIn)

	// Tokens should be in cookies
	assert.NotEmpty(t, testutil.GetResponseCookie(req, "whm_access"))
	assert.NotEmpty(t, testutil.GetResponseCookie(req, "whm_refresh"))
}

func TestApp_RefreshToken_Expired(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithEmail(testutil.UniqueEmail("expired")), testutil.WithPassword("password123"))
	expiredToken := testutil.GenerateTestRefreshToken(t, user, testutil.TestJWTSecret, -time.Hour)

	req := testutil.NewJSONRequest(t, map[string]string{
		"refresh_token": expiredToken,
	})

	err := app.RefreshToken(req)
	require.NoError(t, err)
	testutil.AssertErrorResponse(t, req, fasthttp.StatusUnauthorized, "Invalid refresh token")
}

func TestApp_RefreshToken_InvalidSignature(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithEmail(testutil.UniqueEmail("invalid-sig")), testutil.WithPassword("password123"))
	wrongSecretToken := testutil.GenerateTestRefreshToken(t, user, "wrong-secret-key-that-is-long", 7*24*time.Hour)

	req := testutil.NewJSONRequest(t, map[string]string{
		"refresh_token": wrongSecretToken,
	})

	err := app.RefreshToken(req)
	require.NoError(t, err)
	testutil.AssertErrorResponse(t, req, fasthttp.StatusUnauthorized, "Invalid refresh token")
}

func TestApp_RefreshToken_UserNotFound(t *testing.T) {
	app := newTestApp(t)
	fakeUser := &models.User{
		BaseModel: models.BaseModel{
			ID: uuid.New(),
		},
		OrganizationID: uuid.New(),
		Email:          "fake@example.com",
	}
	token := storedRefreshToken(t, app, fakeUser)

	req := testutil.NewJSONRequest(t, map[string]string{
		"refresh_token": token,
	})

	err := app.RefreshToken(req)
	require.NoError(t, err)
	testutil.AssertErrorResponse(t, req, fasthttp.StatusUnauthorized, "User not found")
}

func TestApp_RefreshToken_DisabledUser(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	user := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithEmail(testutil.UniqueEmail("disabled")), testutil.WithPassword("password123"), testutil.WithInactive())
	token := storedRefreshToken(t, app, user)

	req := testutil.NewJSONRequest(t, map[string]string{
		"refresh_token": token,
	})

	err := app.RefreshToken(req)
	require.NoError(t, err)
	testutil.AssertErrorResponse(t, req, fasthttp.StatusUnauthorized, "Account is disabled")
}

func TestApp_RefreshToken_MalformedToken(t *testing.T) {
	app := newTestApp(t)

	req := testutil.NewJSONRequest(t, map[string]string{
		"refresh_token": "not.a.valid.jwt.token",
	})

	err := app.RefreshToken(req)
	require.NoError(t, err)
	testutil.AssertErrorResponse(t, req, fasthttp.StatusUnauthorized, "Invalid refresh token")
}

func TestApp_RefreshToken_InvalidRequestBody(t *testing.T) {
	app := newTestApp(t)

	req := testutil.NewRequest(t)
	req.RequestCtx.Request.SetBody([]byte("invalid json"))
	req.RequestCtx.Request.Header.SetContentType("application/json")

	err := app.RefreshToken(req)
	require.NoError(t, err)
	// No cookie and no valid body → 401 "Missing refresh token"
	testutil.AssertErrorResponse(t, req, fasthttp.StatusUnauthorized, "Missing refresh token")
}

func TestApp_GeneratedTokensAreValid(t *testing.T) {
	app := newTestApp(t)
	org := testutil.CreateTestOrganization(t, app.DB)
	email := testutil.UniqueEmail("tokentest")
	user := testutil.CreateTestUser(t, app.DB, org.ID, testutil.WithEmail(email), testutil.WithPassword("password123"))

	req := testutil.NewJSONRequest(t, map[string]string{
		"email":    email,
		"password": "password123",
	})

	err := app.Login(req)
	require.NoError(t, err)
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))

	// Read tokens from cookies
	accessTokenStr := testutil.GetResponseCookie(req, "whm_access")
	refreshTokenStr := testutil.GetResponseCookie(req, "whm_refresh")
	require.NotEmpty(t, accessTokenStr)
	require.NotEmpty(t, refreshTokenStr)

	// Verify access token can be parsed
	accessToken, err := jwt.ParseWithClaims(accessTokenStr, &middleware.JWTClaims{}, func(token *jwt.Token) (any, error) {
		return []byte(testutil.TestJWTSecret), nil
	})
	require.NoError(t, err)
	require.True(t, accessToken.Valid)

	accessClaims, ok := accessToken.Claims.(*middleware.JWTClaims)
	require.True(t, ok)
	assert.Equal(t, user.ID, accessClaims.UserID)
	assert.Equal(t, org.ID, accessClaims.OrganizationID)
	assert.Equal(t, user.Email, accessClaims.Email)
	assert.Equal(t, user.RoleID, accessClaims.RoleID)
	assert.Equal(t, "whatomate", accessClaims.Issuer)

	// Verify refresh token can be parsed
	refreshToken, err := jwt.ParseWithClaims(refreshTokenStr, &middleware.JWTClaims{}, func(token *jwt.Token) (any, error) {
		return []byte(testutil.TestJWTSecret), nil
	})
	require.NoError(t, err)
	require.True(t, refreshToken.Valid)

	refreshClaims, ok := refreshToken.Claims.(*middleware.JWTClaims)
	require.True(t, ok)
	assert.Equal(t, user.ID, refreshClaims.UserID)
}
