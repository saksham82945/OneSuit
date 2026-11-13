package handlers

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/config"
	"github.com/shridarpatil/whatomate/internal/middleware"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Only the short-lived WebSocket token signs in to /ws.
func TestValidateWSToken_OnlyWSTokens(t *testing.T) {
	app := &App{Config: &config.Config{JWT: config.JWTConfig{Secret: testutil.TestJWTSecret}}}
	sign := func(subject, jti string) string {
		c := middleware.JWTClaims{UserID: uuid.New(), OrganizationID: uuid.New()}
		c.Subject = subject
		c.ID = jti
		c.ExpiresAt = jwt.NewNumericDate(time.Now().Add(time.Minute))
		s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString([]byte(testutil.TestJWTSecret))
		require.NoError(t, err)
		return s
	}
	validate := app.validateWSTokenFn()

	_, _, err := validate(sign(middleware.WSTokenSubject, ""))
	assert.NoError(t, err)
	_, _, err = validate(sign("", ""))
	assert.Error(t, err, "access token refused")
	_, _, err = validate(sign("", uuid.NewString()))
	assert.Error(t, err, "refresh token refused")
}
