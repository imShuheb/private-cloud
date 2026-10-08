package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"private-storage/internal/appconfig"
)

type createUserRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type updateUserPermissionsRequest struct {
	CanReadFiles         bool `json:"canReadFiles"`
	CanWriteFiles        bool `json:"canWriteFiles"`
	CanManageConnections bool `json:"canManageConnections"`
	CanManageSettings    bool `json:"canManageSettings"`
	CanUseSFTP           bool `json:"canUseSftp"`
}

type updateUserActiveRequest struct {
	IsActive bool `json:"isActive"`
}

type updateUserPasswordRequest struct {
	Password string `json:"password"`
}

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	s.mu.RLock()
	users, err := s.cfg.ListUsers()
	s.mu.RUnlock()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list users")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" {
		writeError(w, http.StatusBadRequest, "username is required")
		return
	}
	if msg := passwordProblem(req.Password); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}

	s.mu.Lock()
	user, err := s.cfg.CreateLocalUser(req.Username, req.Password)
	s.mu.Unlock()
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to create user: "+err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"user": user})
}

func (s *Server) handleUsersMutations(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/users/")
	parts := strings.Split(path, "/")
	if len(parts) != 2 {
		writeError(w, http.StatusBadRequest, "invalid users path")
		return
	}

	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	action := strings.TrimSpace(parts[1])
	switch action {
	case "permissions":
		s.handleUpdateUserPermissions(w, r, id)
	case "active":
		s.handleUpdateUserActive(w, r, id)
	case "password":
		s.handleUpdateUserPassword(w, r, id)
	default:
		writeError(w, http.StatusNotFound, "unknown users action")
	}
}

func (s *Server) handleUpdateUserPermissions(w http.ResponseWriter, r *http.Request, userID int64) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req updateUserPermissionsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	perms := appconfig.UserPermissions{
		CanReadFiles:         req.CanReadFiles,
		CanWriteFiles:        req.CanWriteFiles,
		CanManageConnections: req.CanManageConnections,
		CanManageSettings:    req.CanManageSettings,
		CanUseSFTP:           req.CanUseSFTP,
	}

	s.mu.Lock()
	user, err := s.cfg.GetUserByID(userID)
	if err != nil {
		s.mu.Unlock()
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if user.Role == appconfig.RoleOwner {
		perms = appconfig.UserPermissions{
			CanReadFiles:         true,
			CanWriteFiles:        true,
			CanManageConnections: true,
			CanManageSettings:    true,
			CanUseSFTP:           true,
		}
	}
	if err := s.cfg.UpsertUserPermissions(userID, perms); err != nil {
		s.mu.Unlock()
		writeError(w, http.StatusInternalServerError, "failed to update permissions")
		return
	}
	updated, err := s.cfg.GetUserByID(userID)
	s.mu.Unlock()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load updated user")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"user": updated})
}

func (s *Server) handleUpdateUserActive(w http.ResponseWriter, r *http.Request, userID int64) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req updateUserActiveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	s.mu.Lock()
	err := s.cfg.SetUserActive(userID, req.IsActive)
	if err != nil {
		s.mu.Unlock()
		status := http.StatusBadRequest
		if errors.Is(err, appconfig.ErrLastOwner) {
			status = http.StatusConflict
		}
		writeError(w, status, err.Error())
		return
	}
	updated, err := s.cfg.GetUserByID(userID)
	s.mu.Unlock()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load updated user")
		return
	}
	if !req.IsActive {
		s.sm.deleteUser(userID)
	}

	writeJSON(w, http.StatusOK, map[string]any{"user": updated})
}

func (s *Server) handleUpdateUserPassword(w http.ResponseWriter, r *http.Request, userID int64) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req updateUserPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	if msg := passwordProblem(req.Password); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}

	s.mu.Lock()
	err := s.cfg.SetUserPassword(userID, req.Password)
	s.mu.Unlock()
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to update password")
		return
	}
	// Sign out existing sessions; the user logs in again with the new password
	if p, ok := principalFromRequest(r); !ok || p.userID != userID {
		s.sm.deleteUser(userID)
	}

	writeJSON(w, http.StatusOK, map[string]any{"updated": true})
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	idText := strings.TrimPrefix(r.URL.Path, "/api/users/")
	idText = strings.TrimSpace(idText)
	if idText == "" || strings.Contains(idText, "/") {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	id, err := strconv.ParseInt(idText, 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	s.mu.Lock()
	err = s.cfg.DeleteUser(id)
	s.mu.Unlock()
	if err != nil {
		switch {
		case errors.Is(err, appconfig.ErrLastOwner):
			writeError(w, http.StatusConflict, err.Error())
		case errors.Is(err, appconfig.ErrUserNotFound):
			writeError(w, http.StatusNotFound, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "failed to delete user")
		}
		return
	}

	s.sm.deleteUser(id)
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

const minPasswordLength = 8

func passwordProblem(password string) string {
	if len(strings.TrimSpace(password)) < minPasswordLength {
		return fmt.Sprintf("password must be at least %d characters", minPasswordLength)
	}
	return ""
}
