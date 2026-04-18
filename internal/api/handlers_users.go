package api

import (
	"encoding/json"
	"errors"
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
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.mu.RLock()
	users, err := s.cfg.ListUsers()
	s.mu.RUnlock()
	if err != nil {
		http.Error(w, "failed to list users", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || strings.TrimSpace(req.Password) == "" {
		http.Error(w, "username and password are required", http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	user, err := s.cfg.CreateLocalUser(req.Username, req.Password)
	s.mu.Unlock()
	if err != nil {
		http.Error(w, "failed to create user: "+err.Error(), http.StatusBadRequest)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"user": user})
}

func (s *Server) handleUsersMutations(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/users/")
	parts := strings.Split(path, "/")
	if len(parts) != 2 {
		http.Error(w, "invalid users path", http.StatusBadRequest)
		return
	}

	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid user id", http.StatusBadRequest)
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
		http.Error(w, "unknown users action", http.StatusNotFound)
	}
}

func (s *Server) handleUpdateUserPermissions(w http.ResponseWriter, r *http.Request, userID int64) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req updateUserPermissionsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
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
		http.Error(w, "user not found", http.StatusNotFound)
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
		http.Error(w, "failed to update permissions", http.StatusInternalServerError)
		return
	}
	updated, err := s.cfg.GetUserByID(userID)
	s.mu.Unlock()
	if err != nil {
		http.Error(w, "failed to load updated user", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"user": updated})
}

func (s *Server) handleUpdateUserActive(w http.ResponseWriter, r *http.Request, userID int64) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req updateUserActiveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
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
		http.Error(w, err.Error(), status)
		return
	}
	updated, err := s.cfg.GetUserByID(userID)
	s.mu.Unlock()
	if err != nil {
		http.Error(w, "failed to load updated user", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"user": updated})
}

func (s *Server) handleUpdateUserPassword(w http.ResponseWriter, r *http.Request, userID int64) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req updateUserPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Password) == "" {
		http.Error(w, "password is required", http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	err := s.cfg.SetUserPassword(userID, req.Password)
	s.mu.Unlock()
	if err != nil {
		http.Error(w, "failed to update password", http.StatusBadRequest)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"updated": true})
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idText := strings.TrimPrefix(r.URL.Path, "/api/users/")
	idText = strings.TrimSpace(idText)
	if idText == "" || strings.Contains(idText, "/") {
		http.Error(w, "invalid user id", http.StatusBadRequest)
		return
	}

	id, err := strconv.ParseInt(idText, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid user id", http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	err = s.cfg.DeleteUser(id)
	s.mu.Unlock()
	if err != nil {
		switch {
		case errors.Is(err, appconfig.ErrLastOwner):
			http.Error(w, err.Error(), http.StatusConflict)
		case errors.Is(err, appconfig.ErrUserNotFound):
			http.Error(w, err.Error(), http.StatusNotFound)
		default:
			http.Error(w, "failed to delete user", http.StatusInternalServerError)
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}
