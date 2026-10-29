package handlers_test

import (
	"context"
	"testing"

	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

// A permission set cached before the user became super admin (e.g. the
// startup seeding flipped the flag in the database) must not lock them out.
func TestApp_SuperAdmin_StaleCachedPermissions(t *testing.T) {
	f := newSuperAdminFixture(t)
	ctx := context.Background()
	key := "permissions:user:" + f.superAdmin.ID.String()
	require.NoError(t, f.app.Redis.Set(ctx, key, `{"is_super_admin":false,"permissions":[]}`, 0).Err())
	t.Cleanup(func() { f.app.Redis.Del(ctx, key) })

	req := f.asSuperAdmin(testutil.NewGETRequest(t))
	require.NoError(t, f.app.SuperAdminGetConfig(req))
	assert.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))

	// The stale entry is gone, so other permission checks reload it too.
	assert.Equal(t, int64(0), f.app.Redis.Exists(ctx, key).Val())

	// A plain member is still refused.
	member := f.asMember(testutil.NewGETRequest(t))
	require.NoError(t, f.app.SuperAdminGetConfig(member))
	assert.Equal(t, fasthttp.StatusForbidden, testutil.GetResponseStatusCode(member))
}

func TestApp_ClearAllUserPermissionCaches(t *testing.T) {
	f := newSuperAdminFixture(t)
	ctx := context.Background()
	key := "permissions:user:" + f.member.ID.String()
	require.NoError(t, f.app.Redis.Set(ctx, key, `{}`, 0).Err())
	f.app.ClearAllUserPermissionCaches()
	assert.Equal(t, int64(0), f.app.Redis.Exists(ctx, key).Val())
}
