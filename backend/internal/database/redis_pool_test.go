package database_test

import (
	"os"
	"strings"
	"testing"

	"github.com/shridarpatil/whatomate/internal/config"
	"github.com/shridarpatil/whatomate/internal/database"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewRedis_AppliesPoolLimitsFromConfig(t *testing.T) {
	cfg := parseTestRedisConfig(t)
	cfg.PoolSize = 7
	cfg.MinIdleConns = 1

	client, err := database.NewRedis(cfg)
	require.NoError(t, err)
	defer client.Close()

	assert.Equal(t, 7, client.Options().PoolSize)
	assert.Equal(t, 1, client.Options().MinIdleConns)
}

// A pool size in the URL wins over the config default.
func TestNewRedis_URLPoolSizeWins(t *testing.T) {
	raw := os.Getenv("TEST_REDIS_URL")
	if raw == "" {
		t.Skip("TEST_REDIS_URL not set, skipping Redis test")
	}
	sep := "?"
	if strings.Contains(raw, "?") {
		sep = "&"
	}
	client, err := database.NewRedis(&config.RedisConfig{URL: raw + sep + "pool_size=3", PoolSize: 20})
	require.NoError(t, err)
	defer client.Close()

	assert.Equal(t, 3, client.Options().PoolSize)
}
