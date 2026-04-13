package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"private-storage/internal/appconfig"
)

func (s *Server) handleListConnections(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	writeJSON(w, http.StatusOK, map[string]any{
		"connections": s.cfg.Connections,
		"activeId":    s.cfg.ActiveID,
	})
}

func (s *Server) handleAddConnection(w http.ResponseWriter, r *http.Request) {
	var conn appconfig.Connection
	if err := json.NewDecoder(r.Body).Decode(&conn); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	if conn.ID == "" || conn.Bucket == "" {
		http.Error(w, "ID and Bucket are required", http.StatusBadRequest)
		return
	}

	_, err := s.initStorage(r.Context(), &conn)
	if err != nil {
		http.Error(w, "connection test failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	found := false
	for i := range s.cfg.Connections {
		if s.cfg.Connections[i].ID == conn.ID {
			s.cfg.Connections[i] = conn
			found = true
			break
		}
	}
	if !found {
		s.cfg.Connections = append(s.cfg.Connections, conn)
	}

	if s.cfg.ActiveID == "" || s.cfg.ActiveID == conn.ID {
		s.cfg.ActiveID = conn.ID
		store, _ := s.initStorage(r.Context(), &conn)
		s.store = store
	}

	s.cfg.Save()
	writeJSON(w, http.StatusOK, s.cfg.Connections)
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

	s.mu.Lock()
	defer s.mu.Unlock()

	var target *appconfig.Connection
	for i := range s.cfg.Connections {
		if s.cfg.Connections[i].ID == req.ID {
			target = &s.cfg.Connections[i]
			break
		}
	}

	if target == nil {
		http.Error(w, "connection not found", http.StatusNotFound)
		return
	}

	store, err := s.initStorage(r.Context(), target)
	if err != nil {
		http.Error(w, "failed to switch: "+err.Error(), http.StatusBadRequest)
		return
	}

	s.store = store
	s.cfg.ActiveID = req.ID
	s.cfg.Save()

	writeJSON(w, http.StatusOK, map[string]string{"status": "switched", "id": req.ID})
}

func (s *Server) handleDeleteConnection(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/connections/")
	if id == "" {
		http.Error(w, "id is required", http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if id == s.cfg.ActiveID {
		http.Error(w, "cannot delete the active connection", http.StatusForbidden)
		return
	}

	newConns := []appconfig.Connection{}
	for _, c := range s.cfg.Connections {
		if c.ID != id {
			newConns = append(newConns, c)
		}
	}
	s.cfg.Connections = newConns
	s.cfg.Save()

	writeJSON(w, http.StatusOK, s.cfg.Connections)
}
