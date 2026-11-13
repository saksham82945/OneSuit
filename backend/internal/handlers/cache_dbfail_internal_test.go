package handlers

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A failed database read must not be cached: an empty keyword-rule or
// AI-context list would otherwise hide every rule for the whole cache TTL.
func TestCachedRuleLists_DBFailureIsNotCached(t *testing.T) {
	app := cacheTestApp(t)
	ctx := context.Background()
	orgID := uuid.New()
	account := "acc-" + uuid.New().String()[:8]

	keywordKey := fmt.Sprintf("%s%s:%s", keywordRulesCachePrefix, orgID, account)
	aiKey := fmt.Sprintf("%s%s:%s", aiContextsCachePrefix, orgID, account)
	app.Redis.Del(ctx, keywordKey, aiKey)
	t.Cleanup(func() { app.Redis.Del(context.Background(), keywordKey, aiKey) })

	// Every query on a cancelled context fails.
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	healthy := app.DB
	app.DB = healthy.WithContext(cancelled)

	_, err := app.getKeywordRulesCached(orgID, account)
	require.NoError(t, err)
	_, err = app.getAIContextsCached(orgID, account)
	require.NoError(t, err)

	n, err := app.Redis.Exists(ctx, keywordKey, aiKey).Result()
	require.NoError(t, err)
	assert.Equal(t, int64(0), n, "failed reads must not be cached")

	// Once the database answers, the result is cached as before.
	app.DB = healthy
	_, err = app.getKeywordRulesCached(orgID, account)
	require.NoError(t, err)
	_, err = app.getAIContextsCached(orgID, account)
	require.NoError(t, err)
	n, err = app.Redis.Exists(ctx, keywordKey, aiKey).Result()
	require.NoError(t, err)
	assert.Equal(t, int64(2), n)
}
