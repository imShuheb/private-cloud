package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid login payload")
		return
	}

	username := strings.TrimSpace(req.Username)
	password := req.Password
	if username == "" || password == "" {
		writeError(w, http.StatusBadRequest, "username and password are required")
		return
	}

	limitKey := loginLimitKey(r, username)
	if wait := s.logins.retryAfter(limitKey); wait > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
		writeError(w, http.StatusTooManyRequests, fmt.Sprintf("too many failed attempts, try again in %d minutes", int(wait.Minutes())+1))
		return
	}

	s.mu.RLock()
	user, validPassword, err := s.cfg.VerifyUserPassword(username, password)
	s.mu.RUnlock()
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "failed to verify credentials")
		return
	}
	if err != nil || !validPassword || user == nil {
		s.logins.fail(limitKey)
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	if !user.IsActive {
		writeError(w, http.StatusForbidden, "this account is disabled")
		return
	}
	s.logins.reset(limitKey)

	sessionID, expiresAt, err := s.sm.create(user.ID, user.Username, user.Role, user.Permissions)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecureRequest(r),
		Expires:  expiresAt,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"authenticated": true,
		"expiresAt":     expiresAt,
		"user": map[string]any{
			"id":          user.ID,
			"username":    user.Username,
			"role":        user.Role,
			"permissions": user.Permissions,
		},
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(sessionCookieName)
	if err == nil {
		s.sm.delete(cookie.Value)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecureRequest(r),
		MaxAge:   -1,
	})

	writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
}

func (s *Server) handleAuthMe(w http.ResponseWriter, r *http.Request) {
	p, ok := s.sessionPrincipal(r)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"authenticated": true,
		"user": map[string]any{
			"id":          p.userID,
			"username":    p.username,
			"role":        p.role,
			"permissions": p.perms,
		},
	})
}
