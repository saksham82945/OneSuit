package middleware_test

import (
	"testing"

	"github.com/shridarpatil/whatomate/internal/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

func TestCSRFProtection(t *testing.T) {
	mw := middleware.CSRFProtection()

	t.Run("GET requests pass through without check", func(t *testing.T) {
		req := &fastglue.Request{RequestCtx: &fasthttp.RequestCtx{}}
		req.RequestCtx.Request.Header.SetMethod("GET")
		req.RequestCtx.Request.SetRequestURI("/api/contacts")

		res := mw(req)
		assert.NotNil(t, res)
		assert.Equal(t, fasthttp.StatusOK, req.RequestCtx.Response.StatusCode())
	})

	t.Run("Mutating request without access cookie passes (auth mw will reject)", func(t *testing.T) {
		req := &fastglue.Request{RequestCtx: &fasthttp.RequestCtx{}}
		req.RequestCtx.Request.Header.SetMethod("POST")
		req.RequestCtx.Request.SetRequestURI("/api/contacts")

		res := mw(req)
		assert.NotNil(t, res)
	})

	t.Run("Mutating request with Authorization header passes", func(t *testing.T) {
		req := &fastglue.Request{RequestCtx: &fasthttp.RequestCtx{}}
		req.RequestCtx.Request.Header.SetMethod("POST")
		req.RequestCtx.Request.SetRequestURI("/api/contacts")
		req.RequestCtx.Request.Header.Set("Authorization", "Bearer some-token")
		req.RequestCtx.Request.Header.SetCookie("whm_access", "access-token")

		res := mw(req)
		assert.NotNil(t, res)
	})

	t.Run("Mutating request with X-API-Key passes", func(t *testing.T) {
		req := &fastglue.Request{RequestCtx: &fasthttp.RequestCtx{}}
		req.RequestCtx.Request.Header.SetMethod("POST")
		req.RequestCtx.Request.SetRequestURI("/api/contacts")
		req.RequestCtx.Request.Header.Set("X-API-Key", "my-api-key")
		req.RequestCtx.Request.Header.SetCookie("whm_access", "access-token")

		res := mw(req)
		assert.NotNil(t, res)
	})

	t.Run("Public auth endpoints pass even with stale whm_access cookie and no CSRF token", func(t *testing.T) {
		paths := []string{
			"/api/auth/login",
			"/api/auth/register",
			"/api/auth/signup",
			"/api/auth/explore",
			"/api/auth/refresh",
			"/api/auth/accept-invite",
			"/api/auth/logout",
			"/api/webhook",
			"/subpath/api/auth/login",
		}

		for _, path := range paths {
			req := &fastglue.Request{RequestCtx: &fasthttp.RequestCtx{}}
			req.RequestCtx.Request.Header.SetMethod("POST")
			req.RequestCtx.Request.SetRequestURI(path)
			req.RequestCtx.Request.Header.SetCookie("whm_access", "stale-access-token")

			res := mw(req)
			assert.NotNil(t, res, "path %s should be exempt from CSRF", path)
			assert.Equal(t, fasthttp.StatusOK, req.RequestCtx.Response.StatusCode(), "path %s should pass", path)
		}
	})

	t.Run("Protected mutating request with matching CSRF cookie and header passes", func(t *testing.T) {
		req := &fastglue.Request{RequestCtx: &fasthttp.RequestCtx{}}
		req.RequestCtx.Request.Header.SetMethod("POST")
		req.RequestCtx.Request.SetRequestURI("/api/contacts")
		req.RequestCtx.Request.Header.SetCookie("whm_access", "access-token")
		req.RequestCtx.Request.Header.SetCookie("whm_csrf", "my-csrf-token-123")
		req.RequestCtx.Request.Header.Set("X-CSRF-Token", "my-csrf-token-123")

		res := mw(req)
		assert.NotNil(t, res)
		assert.Equal(t, fasthttp.StatusOK, req.RequestCtx.Response.StatusCode())
	})

	t.Run("Protected mutating request with missing CSRF header fails with 403", func(t *testing.T) {
		req := &fastglue.Request{RequestCtx: &fasthttp.RequestCtx{}}
		req.RequestCtx.Request.Header.SetMethod("POST")
		req.RequestCtx.Request.SetRequestURI("/api/contacts")
		req.RequestCtx.Request.Header.SetCookie("whm_access", "access-token")
		req.RequestCtx.Request.Header.SetCookie("whm_csrf", "my-csrf-token-123")

		res := mw(req)
		assert.Nil(t, res)
		assert.Equal(t, fasthttp.StatusForbidden, req.RequestCtx.Response.StatusCode())
		assert.JSONEq(t, `{"status":"error","message":"CSRF token mismatch"}`, string(req.RequestCtx.Response.Body()))
	})

	t.Run("Protected mutating request with mismatched CSRF header fails with 403", func(t *testing.T) {
		req := &fastglue.Request{RequestCtx: &fasthttp.RequestCtx{}}
		req.RequestCtx.Request.Header.SetMethod("DELETE")
		req.RequestCtx.Request.SetRequestURI("/api/contacts/123")
		req.RequestCtx.Request.Header.SetCookie("whm_access", "access-token")
		req.RequestCtx.Request.Header.SetCookie("whm_csrf", "token-a")
		req.RequestCtx.Request.Header.Set("X-CSRF-Token", "token-b")

		res := mw(req)
		assert.Nil(t, res)
		assert.Equal(t, fasthttp.StatusForbidden, req.RequestCtx.Response.StatusCode())
		assert.JSONEq(t, `{"status":"error","message":"CSRF token mismatch"}`, string(req.RequestCtx.Response.Body()))
	})
}
