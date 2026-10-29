package database

import (
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSanitizePostgresURLAll(t *testing.T) {
	cases := []struct {
		name     string
		password string
	}{
		{"space", "pass 123"},
		{"bracket", "pass[123]"},
		{"brace", "pass{123}"},
		{"at", "pass@123"},
		{"slash", "pass/123"},
		{"question", "pass?123"},
		{"hash", "pass#123"},
		{"backslash", "pass\\123"},
		{"caret", "pass^123"},
	}

	for _, c := range cases {
		raw := fmt.Sprintf("postgresql://onesuit:%s@dpg-dbh3s1ifngtc73faubm0-a/onesuit", c.password)
		sanitized := SanitizePostgresURL(raw)
		cfg, err := pgx.ParseConfig(sanitized)
		require.NoError(t, err, "Failed for case: %s (url: %s)", c.name, sanitized)
		assert.Equal(t, c.password, cfg.Password, "Password mismatch for case: %s", c.name)
	}
}

func TestSanitizePostgresURLQuotesAndWhitespace(t *testing.T) {
	raw := `  "postgresql://onesuit:secretpass@dpg-dbh3s1ifngtc73faubm0-a/onesuit"  `
	sanitized := SanitizePostgresURL(raw)
	cfg, err := pgx.ParseConfig(sanitized)
	require.NoError(t, err)
	assert.Equal(t, "secretpass", cfg.Password)
	assert.Equal(t, "onesuit", cfg.User)
	assert.Equal(t, "onesuit", cfg.Database)
	assert.Equal(t, "dpg-dbh3s1ifngtc73faubm0-a", cfg.Host)
}
