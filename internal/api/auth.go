package api

import (
	"encoding/json"
	"net/http"
	"strings"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid login payload", http.StatusBadRequest)
		return
	}

	username := strings.TrimSpace(req.Username)
	password := req.Password

	s.mu.RLock()
	adminUser := s.cfg.AdminUser
	adminPass := s.cfg.AdminPass
	s.mu.RUnlock()

	if username != adminUser || password != adminPass {
		if username == "" || password == "" {
			http.Error(w, "username and password are required", http.StatusBadRequest)
			return
		}

		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	sessionID, expiresAt, err := s.sm.create(username)
	if err != nil {
		http.Error(w, "failed to create session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false,
		Expires:  expiresAt,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"authenticated": true,
		"expiresAt":     expiresAt,
		"user": map[string]string{
			"username": adminUser,
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
		Secure:   false,
		MaxAge:   -1,
	})

	writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
}

func (s *Server) handleAuthMe(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
		return
	}

	session, ok := s.sm.get(cookie.Value)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"authenticated": true,
		"user": map[string]string{
			"username": session.username,
		},
	})
}
