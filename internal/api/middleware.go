package api

import (
	"context"
	"crypto/subtle"
	"log"
	"net/http"
	"net/url"
	"private-storage/internal/appconfig"
	"strings"
	"time"
)

type permissionKey string

const (
	permReadFiles         permissionKey = "can_read_files"
	permWriteFiles        permissionKey = "can_write_files"
	permManageConnections permissionKey = "can_manage_connections"
	permManageSettings    permissionKey = "can_manage_settings"
)

type principal struct {
	userID    int64
	username  string
	role      string
	perms     appconfig.UserPermissions
	viaAPIKey bool
}

type principalContextKey struct{}

// sessionPrincipal resolves the session cookie to the user's current role and permissions.
// The user is re-read on every request, so disabling a user or changing their permissions
// takes effect immediately instead of when the session expires.
func (s *Server) sessionPrincipal(r *http.Request) (principal, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return principal{}, false
	}
	session, ok := s.sm.get(cookie.Value)
	if !ok {
		return principal{}, false
	}

	s.mu.RLock()
	user, err := s.cfg.GetUserByID(session.userID)
	s.mu.RUnlock()
	if err != nil || user == nil || !user.IsActive {
		s.sm.delete(cookie.Value)
		return principal{}, false
	}

	return principal{
		userID:   user.ID,
		username: user.Username,
		role:     user.Role,
		perms:    user.Permissions,
	}, true
}

func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if p, ok := s.sessionPrincipal(r); ok {
			next.ServeHTTP(w, withPrincipal(r, p))
			return
		}

		bearer := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer"))
		xAPIKey := strings.TrimSpace(r.Header.Get("X-API-Key"))

		s.mu.RLock()
		adminAPIKey := s.cfg.AdminAPIKey
		s.mu.RUnlock()

		if !isMatchingAPIKey(adminAPIKey, bearer) && !isMatchingAPIKey(adminAPIKey, xAPIKey) {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		ownerPerms := appconfig.UserPermissions{
			CanReadFiles:         true,
			CanWriteFiles:        true,
			CanManageConnections: true,
			CanManageSettings:    true,
		}
		p := principal{
			userID:    0,
			username:  "api-key",
			role:      appconfig.RoleOwner,
			perms:     ownerPerms,
			viaAPIKey: true,
		}
		next.ServeHTTP(w, withPrincipal(r, p))
	})
}

func withPrincipal(r *http.Request, p principal) *http.Request {
	ctx := context.WithValue(r.Context(), principalContextKey{}, p)
	return r.WithContext(ctx)
}

func principalFromRequest(r *http.Request) (principal, bool) {
	v := r.Context().Value(principalContextKey{})
	p, ok := v.(principal)
	return p, ok
}

func requireOwner(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := principalFromRequest(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		if p.role != appconfig.RoleOwner {
			writeError(w, http.StatusForbidden, "forbidden")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func requirePerm(perm permissionKey, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := principalFromRequest(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		allowed := false
		switch perm {
		case permReadFiles:
			allowed = p.perms.CanReadFiles
		case permWriteFiles:
			allowed = p.perms.CanWriteFiles
		case permManageConnections:
			allowed = p.perms.CanManageConnections
		case permManageSettings:
			allowed = p.perms.CanManageSettings
		}

		if !allowed {
			writeError(w, http.StatusForbidden, "forbidden")
			return
		}

		next.ServeHTTP(w, r)
	})
}

func isMatchingAPIKey(expected, provided string) bool {
	if expected == "" || provided == "" {
		return false
	}
	if len(expected) != len(provided) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) == 1
}

func isSecureRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	if strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https") {
		return true
	}
	if strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Ssl")), "on") {
		return true
	}
	return false
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" && isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-API-Key")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func isAllowedOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return false
	}

	if origin == "http://localhost:5173" || origin == "http://127.0.0.1:5173" {
		return true
	}

	if (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1") && (u.Port() == "5173" || u.Port() == "4173") {
		return true
	}

	return false
}
