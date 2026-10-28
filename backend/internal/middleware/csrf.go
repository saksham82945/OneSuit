package middleware

import (
	"strings"

	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// CSRFProtection returns a middleware that validates CSRF tokens on mutating
// requests that use cookie-based authentication.
func CSRFProtection() fastglue.FastMiddleware {
	return func(r *fastglue.Request) *fastglue.Request {
		method := string(r.RequestCtx.Method())

		// Only validate mutating methods.
		if method != "POST" && method != "PUT" && method != "DELETE" && method != "PATCH" {
			return r
		}

		path := string(r.RequestCtx.Path())

		// Skip public / auth endpoints where cookie-based session auth is not used
		// (e.g. login, register, signup, explore, refresh, logout, accept-invite, webhook).
		// A stale access cookie in the browser must never block these requests.
		if isCSRFExemptPath(path) {
			return r
		}

		// Skip if the request uses header-based auth (API key or Bearer token).
		// These are not automatically attached by the browser, so CSRF is not a concern.
		if len(r.RequestCtx.Request.Header.Peek("Authorization")) > 0 ||
			len(r.RequestCtx.Request.Header.Peek("X-API-Key")) > 0 {
			return r
		}

		// Skip if there is no access cookie — the auth middleware will reject
		// the request with 401 anyway.
		cookieVal := r.RequestCtx.Request.Header.Cookie("whm_access")
		if len(cookieVal) == 0 {
			return r
		}

		// Double-submit: compare whm_csrf cookie with X-CSRF-Token header.
		csrfCookie := string(r.RequestCtx.Request.Header.Cookie("whm_csrf"))
		csrfHeader := string(r.RequestCtx.Request.Header.Peek("X-CSRF-Token"))

		if csrfCookie == "" || csrfHeader == "" || csrfCookie != csrfHeader {
			r.RequestCtx.SetStatusCode(fasthttp.StatusForbidden)
			r.RequestCtx.SetContentType("application/json")
			r.RequestCtx.SetBodyString(`{"status":"error","message":"CSRF token mismatch"}`)
			return nil
		}

		return r
	}
}

func isCSRFExemptPath(path string) bool {
	p := strings.TrimRight(path, "/")
	return strings.HasSuffix(p, "/api/auth/login") ||
		strings.HasSuffix(p, "/api/auth/register") ||
		strings.HasSuffix(p, "/api/auth/signup") ||
		strings.HasSuffix(p, "/api/auth/explore") ||
		strings.HasSuffix(p, "/api/auth/refresh") ||
		strings.HasSuffix(p, "/api/auth/accept-invite") ||
		strings.HasSuffix(p, "/api/auth/logout") ||
		strings.HasSuffix(p, "/api/webhook")
}
