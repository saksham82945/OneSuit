package handlers

import (
	"context"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/middleware"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"golang.org/x/crypto/bcrypt"
)

// LoginRequest represents login credentials
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

// RegisterRequest represents registration data
type RegisterRequest struct {
	Email          string    `json:"email" validate:"required,email"`
	Password       string    `json:"password" validate:"required"`
	FullName       string    `json:"full_name" validate:"required"`
	OrganizationID uuid.UUID `json:"organization_id" validate:"required"`
}

// CookieAuthResponse represents authentication response when tokens are in cookies.
// No tokens in the body — only the expiry hint and user object.
type CookieAuthResponse struct {
	ExpiresIn int         `json:"expires_in"`
	User      models.User `json:"user"`
}

// RefreshRequest represents token refresh request
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// Login authenticates a user and returns tokens
func (a *App) Login(r *fastglue.Request) error {
	var req LoginRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}

	// Find user by email with role preloaded
	var user models.User
	if err := a.DB.Preload("Role").Where("email = ?", req.Email).First(&user).Error; err != nil {
		// Run dummy bcrypt to prevent timing-based account enumeration
		_ = bcrypt.CompareHashAndPassword([]byte("$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"), []byte(req.Password))
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Invalid credentials", nil, "")
	}

	// Load permissions from cache
	if user.Role != nil && user.RoleID != nil {
		cachedPerms, err := a.GetRolePermissionsCached(*user.RoleID)
		if err == nil {
			permissions := make([]models.Permission, 0, len(cachedPerms))
			for _, p := range cachedPerms {
				for i := len(p) - 1; i >= 0; i-- {
					if p[i] == ':' {
						permissions = append(permissions, models.Permission{
							Resource: p[:i],
							Action:   p[i+1:],
						})
						break
					}
				}
			}
			user.Role.Permissions = permissions
		}
	}

	// Check if user is active
	if !user.IsActive {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Account is disabled", nil, "")
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Invalid credentials", nil, "")
	}

	// Block access during maintenance or for a suspended vendor
	if status, msg := a.orgAccessBlocked(&user, user.OrganizationID); status != 0 {
		return r.SendErrorEnvelope(status, msg, nil, "")
	}

	// Generate tokens
	accessToken, err := a.generateAccessToken(&user)
	if err != nil {
		a.Log.Error("Failed to generate access token", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to generate token", nil, "")
	}

	refreshToken, err := a.generateRefreshToken(&user)
	if err != nil {
		a.Log.Error("Failed to generate refresh token", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to generate token", nil, "")
	}

	a.setAuthCookies(r, accessToken, refreshToken)

	return r.SendEnvelope(CookieAuthResponse{
		ExpiresIn: a.Config.JWT.AccessExpiryMins * 60,
		User:      user,
	})
}

// registerClosedMessage answers POST /api/auth/register.
const registerClosedMessage = "Joining an organization needs an invite link from its admin. To start a new business, sign up instead."

// Register used to let anyone who knew an organization's ID join it as a
// member, bypassing invites and the platform's "allow sign-up" switch. Joining an organization now
// needs an invite (POST /api/auth/accept-invite) and new businesses use
// POST /api/auth/signup, so this endpoint only refuses.
func (a *App) Register(r *fastglue.Request) error {
	var req RegisterRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	return r.SendErrorEnvelope(fasthttp.StatusForbidden, registerClosedMessage, nil, "")
}

// RefreshToken refreshes access token using refresh token with rotation.
// The old refresh token is invalidated (single-use) and a new one is issued.
func (a *App) RefreshToken(r *fastglue.Request) error {
	// Read refresh token from cookie first, fall back to JSON body.
	refreshTokenStr := string(r.RequestCtx.Request.Header.Cookie(cookieRefreshName))
	if refreshTokenStr == "" {
		var req RefreshRequest
		_ = r.Decode(&req, "json")
		refreshTokenStr = req.RefreshToken
	}
	if refreshTokenStr == "" {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Missing refresh token", nil, "")
	}

	// Parse and validate refresh token
	token, err := jwt.ParseWithClaims(refreshTokenStr, &middleware.JWTClaims{}, func(token *jwt.Token) (any, error) {
		return []byte(a.Config.JWT.Secret), nil
	})

	if err != nil || !token.Valid {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Invalid refresh token", nil, "")
	}

	claims, ok := token.Claims.(*middleware.JWTClaims)
	if !ok {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Invalid token claims", nil, "")
	}

	// Only real refresh tokens (they always carry a JTI) can be exchanged.
	// Access and WebSocket tokens have none, and accepting them here would let
	// a short-lived token mint fresh, unrevocable sessions.
	if claims.ID == "" || claims.Subject == middleware.WSTokenSubject {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Invalid refresh token", nil, "")
	}

	// Validate JTI in Redis (single-use: delete on consumption)
	{
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		deleted, err := a.Redis.Del(ctx, refreshTokenKey(claims.ID)).Result()
		if err != nil || deleted == 0 {
			// Token was already used or revoked
			return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Refresh token has been revoked", nil, "")
		}
	}

	// Get user
	var user models.User
	if err := a.DB.Where("id = ?", claims.UserID).First(&user).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "User not found", nil, "")
	}

	if !user.IsActive {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Account is disabled", nil, "")
	}

	// users.organization_id is only the home org, so carry forward the org this
	// session was switched into — otherwise the first refresh silently reverts a
	// switched session. Re-validate it: a member removed since the last refresh
	// must drop back to their home org.
	if claims.OrganizationID != uuid.Nil && claims.OrganizationID != user.OrganizationID {
		if user.IsSuperAdmin {
			var count int64
			if err := a.DB.Table("organizations").Where("id = ?", claims.OrganizationID).Count(&count).Error; err == nil && count > 0 {
				user.OrganizationID = claims.OrganizationID
			}
		} else {
			var userOrg models.UserOrganization
			if err := a.DB.Where("user_id = ? AND organization_id = ?", user.ID, claims.OrganizationID).First(&userOrg).Error; err == nil {
				user.OrganizationID = claims.OrganizationID
				user.RoleID = userOrg.RoleID
			}
		}
	}

	// Block access during maintenance or for a suspended vendor
	if status, msg := a.orgAccessBlocked(&user, user.OrganizationID); status != 0 {
		a.clearAuthCookies(r)
		return r.SendErrorEnvelope(status, msg, nil, "")
	}

	// Generate new tokens (rotation: new refresh token with new JTI)
	accessToken, err := a.generateAccessToken(&user)
	if err != nil {
		a.Log.Error("Failed to generate access token", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to generate token", nil, "")
	}
	newRefreshToken, err := a.generateRefreshToken(&user)
	if err != nil {
		a.Log.Error("Failed to generate refresh token", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to generate token", nil, "")
	}

	a.setAuthCookies(r, accessToken, newRefreshToken)

	return r.SendEnvelope(CookieAuthResponse{
		ExpiresIn: a.Config.JWT.AccessExpiryMins * 60,
		User:      user,
	})
}

func (a *App) generateAccessToken(user *models.User) (string, error) {
	claims := middleware.JWTClaims{
		UserID:         user.ID,
		OrganizationID: user.OrganizationID,
		Email:          user.Email,
		RoleID:         user.RoleID,
		IsSuperAdmin:   user.IsSuperAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(a.Config.JWT.AccessExpiryMins) * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "whatomate",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(a.Config.JWT.Secret))
}

func (a *App) generateRefreshToken(user *models.User) (string, error) {
	jti := uuid.New().String()
	expiry := time.Duration(a.Config.JWT.RefreshExpiryDays) * 24 * time.Hour

	claims := middleware.JWTClaims{
		UserID:         user.ID,
		OrganizationID: user.OrganizationID,
		Email:          user.Email,
		RoleID:         user.RoleID,
		IsSuperAdmin:   user.IsSuperAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "whatomate",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(a.Config.JWT.Secret))
	if err != nil {
		return "", err
	}

	// Store JTI in Redis so it can be revoked
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := a.Redis.Set(ctx, refreshTokenKey(jti), user.ID.String(), expiry).Err(); err != nil {
		a.Log.Error("Failed to store refresh token in Redis", "error", err)
	}

	return signed, nil
}

// refreshTokenKey returns the Redis key for a refresh token JTI.
func refreshTokenKey(jti string) string {
	return fmt.Sprintf("refresh:%s", jti)
}

// SwitchOrgRequest represents the request body for switching organization
type SwitchOrgRequest struct {
	OrganizationID uuid.UUID `json:"organization_id"`
}

// SwitchOrg generates new tokens for a different organization the user belongs to
func (a *App) SwitchOrg(r *fastglue.Request) error {
	userID, ok := r.RequestCtx.UserValue("user_id").(uuid.UUID)
	if !ok {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	var req SwitchOrgRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}

	if req.OrganizationID == uuid.Nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "organization_id is required", nil, "")
	}

	// Verify the organization exists
	var org models.Organization
	if err := a.DB.Where("id = ?", req.OrganizationID).First(&org).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Organization not found", nil, "")
	}

	// Get the user
	var user models.User
	if err := a.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "User not found", nil, "")
	}

	// Super admins can switch to any org; others need membership
	if !user.IsSuperAdmin {
		var userOrg models.UserOrganization
		if err := a.DB.Where("user_id = ? AND organization_id = ?", userID, req.OrganizationID).First(&userOrg).Error; err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusForbidden, "You are not a member of this organization", nil, "")
		}
		// The target org's membership row is the only source of the role there;
		// keeping the home-org role would carry its permissions across tenants.
		user.RoleID = userOrg.RoleID
	}

	// Block access during maintenance or for a suspended vendor
	if status, msg := a.orgAccessBlocked(&user, req.OrganizationID); status != 0 {
		return r.SendErrorEnvelope(status, msg, nil, "")
	}

	// A super admin entering a client's workspace is recorded in that workspace.
	if user.IsSuperAdmin && req.OrganizationID != user.OrganizationID {
		a.logAudit(req.OrganizationID, userID, "organization", req.OrganizationID, models.AuditActionAccessed, nil, nil,
			map[string]any{"field": "entered_as_super_admin", "old_value": nil, "new_value": org.Name})
	}

	// Set the target org on the user for token generation
	user.OrganizationID = req.OrganizationID

	// Preload role with permissions for the response
	if user.RoleID != nil {
		var role models.CustomRole
		if err := a.DB.Where("id = ?", *user.RoleID).First(&role).Error; err == nil {
			user.Role = &role
			cachedPerms, err := a.GetRolePermissionsCached(*user.RoleID)
			if err == nil {
				permissions := make([]models.Permission, 0, len(cachedPerms))
				for _, p := range cachedPerms {
					parts := splitPermission(p)
					if len(parts) == 2 {
						permissions = append(permissions, models.Permission{
							Resource: parts[0],
							Action:   parts[1],
						})
					}
				}
				user.Role.Permissions = permissions
			}
		}
	}

	// Generate new tokens with the target org
	accessToken, err := a.generateAccessToken(&user)
	if err != nil {
		a.Log.Error("Failed to generate access token", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to generate token", nil, "")
	}

	refreshToken, err := a.generateRefreshToken(&user)
	if err != nil {
		a.Log.Error("Failed to generate refresh token", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to generate token", nil, "")
	}

	a.setAuthCookies(r, accessToken, refreshToken)

	return r.SendEnvelope(CookieAuthResponse{
		ExpiresIn: a.Config.JWT.AccessExpiryMins * 60,
		User:      user,
	})
}

// LogoutRequest represents logout request body
type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// Logout invalidates the user's refresh token
func (a *App) Logout(r *fastglue.Request) error {
	// Read refresh token from cookie first, fall back to body.
	refreshTokenStr := string(r.RequestCtx.Request.Header.Cookie(cookieRefreshName))
	if refreshTokenStr == "" {
		var req LogoutRequest
		_ = r.Decode(&req, "json")
		refreshTokenStr = req.RefreshToken
	}

	if refreshTokenStr != "" {
		// Parse the token to extract JTI (don't need to fully validate — just extract claims)
		token, _ := jwt.ParseWithClaims(refreshTokenStr, &middleware.JWTClaims{}, func(token *jwt.Token) (any, error) {
			return []byte(a.Config.JWT.Secret), nil
		})
		if token != nil {
			if claims, ok := token.Claims.(*middleware.JWTClaims); ok && claims.ID != "" {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				a.Redis.Del(ctx, refreshTokenKey(claims.ID))
			}
		}
	}

	a.clearAuthCookies(r)

	return r.SendEnvelope(map[string]string{"status": "logged_out"})
}

func generateSlug(name string) string {
	// Simple slug generation - in production, use a proper slugify library
	slug := ""
	for _, c := range name {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
			slug += string(c)
		} else if c >= 'A' && c <= 'Z' {
			slug += string(c + 32)
		} else if c == ' ' || c == '-' {
			slug += "-"
		}
	}
	return slug + "-" + uuid.New().String()[:8]
}

// GetWSToken returns a short-lived single-use JWT for WebSocket authentication.
// This is needed because httpOnly cookies cannot be read by JavaScript to pass
// as a query parameter to the WebSocket connection URL.
func (a *App) GetWSToken(r *fastglue.Request) error {
	userID, ok := r.RequestCtx.UserValue("user_id").(uuid.UUID)
	if !ok {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	// The hub registers the client under this org and BroadcastToOrg fans out by
	// it, so resolve the active org rather than trusting the JWT's default.
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	claims := middleware.JWTClaims{
		UserID:         userID,
		OrganizationID: orgID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * time.Second)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "whatomate",
			Subject:   middleware.WSTokenSubject,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(a.Config.JWT.Secret))
	if err != nil {
		a.Log.Error("Failed to generate WS token", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to generate token", nil, "")
	}

	return r.SendEnvelope(map[string]string{"token": signed})
}
