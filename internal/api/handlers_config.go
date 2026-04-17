package api

import (
	"encoding/json"
	"net/http"
	"private-storage/internal/repository"
	"strings"
)

func (s *Server) handleListConnections(w http.ResponseWriter, r *http.Request) {
	conns, err := s.connRepo.List(r.Context())
	if err != nil {
		http.Error(w, "failed to list connections: "+err.Error(), http.StatusInternalServerError)
		return
	}

	active, _ := s.connRepo.GetActive(r.Context())
	activeID := ""
	if active != nil {
		activeID = active.ID
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"connections": conns,
		"activeId":    activeID,
	})
}

func (s *Server) handleAddConnection(w http.ResponseWriter, r *http.Request) {
	var conn repository.Connection
	if err := json.NewDecoder(r.Body).Decode(&conn); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	if conn.Name == "" || conn.Bucket == "" {
		http.Error(w, "Name and Bucket are required", http.StatusBadRequest)
		return
	}

	// Test connection before saving
	_, err := s.initStorage(r.Context(), &conn)
	if err != nil {
		http.Error(w, "connection test failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	// New connections might have a dummy ID from the frontend (e.g. "conn-123")
	// We only Update if the ID looks like a real UUID.
	if conn.ID != "" && !strings.HasPrefix(conn.ID, "conn-") && len(conn.ID) > 20 {
		// Update existing
		err = s.connRepo.Update(r.Context(), &conn)
	} else {
		// Create new
		conn.ID = "" // Ensure we don't try to insert a dummy ID
		err = s.connRepo.Create(r.Context(), &conn)
	}

	if err != nil {
		http.Error(w, "failed to save connection: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// If it's the only connection, make it active
	conns, _ := s.connRepo.List(r.Context())
	if len(conns) == 1 {
		s.connRepo.SetActive(r.Context(), conns[0].ID)
		store, _ := s.initStorage(r.Context(), &conns[0])
		s.mu.Lock()
		s.store = store
		s.mu.Unlock()
	}

	writeJSON(w, http.StatusOK, conns)
}

type switchRequest struct {
	ID string `json:"id"`
}

func (s *Server) handleSwitchConnection(w http.ResponseWriter, r *http.Request) {
	var req switchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	target, err := s.connRepo.GetByID(r.Context(), req.ID)
	if err != nil {
		http.Error(w, "connection not found", http.StatusNotFound)
		return
	}

	store, err := s.initStorage(r.Context(), target)
	if err != nil {
		http.Error(w, "failed to switch: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := s.connRepo.SetActive(r.Context(), req.ID); err != nil {
		http.Error(w, "failed to set active: "+err.Error(), http.StatusInternalServerError)
		return
	}

	s.mu.Lock()
	s.store = store
	s.mu.Unlock()

	writeJSON(w, http.StatusOK, map[string]string{"status": "switched", "id": req.ID})
}

func (s *Server) handleDeleteConnection(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/connections/")
	if id == "" {
		http.Error(w, "id is required", http.StatusBadRequest)
		return
	}

	active, _ := s.connRepo.GetActive(r.Context())
	if active != nil && active.ID == id {
		http.Error(w, "cannot delete the active connection", http.StatusForbidden)
		return
	}

	if err := s.connRepo.Delete(r.Context(), id); err != nil {
		http.Error(w, "failed to delete: "+err.Error(), http.StatusInternalServerError)
		return
	}

	conns, _ := s.connRepo.List(r.Context())
	writeJSON(w, http.StatusOK, conns)
}
