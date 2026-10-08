package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"private-storage/internal/appconfig"
)

// connectionView is what the API returns for a connection: never the keys themselves.
type connectionView struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Bucket        string `json:"bucket"`
	Region        string `json:"region"`
	Endpoint      string `json:"endpoint"`
	UsePathStyle  bool   `json:"usePathStyle"`
	AccessKeyHint string `json:"accessKeyHint"`
}

func viewOf(c appconfig.Connection) connectionView {
	hint := ""
	if n := len(c.AccessKey); n > 4 {
		hint = "…" + c.AccessKey[n-4:]
	}
	return connectionView{
		ID:            c.ID,
		Name:          c.Name,
		Bucket:        c.Bucket,
		Region:        c.Region,
		Endpoint:      c.Endpoint,
		UsePathStyle:  c.UsePathStyle,
		AccessKeyHint: hint,
	}
}

func viewsOf(conns []appconfig.Connection) []connectionView {
	out := make([]connectionView, 0, len(conns))
	for _, c := range conns {
		out = append(out, viewOf(c))
	}
	return out
}

func (s *Server) handleListConnections(w http.ResponseWriter, _ *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	writeJSON(w, http.StatusOK, map[string]any{
		"connections": viewsOf(s.cfg.Connections),
		"activeId":    s.cfg.ActiveID,
	})
}

// handleActiveConnection tells any signed-in user which storage is active.
func (s *Server) handleActiveConnection(w http.ResponseWriter, _ *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	conn := s.cfg.GetActiveConnection()
	if conn == nil {
		writeJSON(w, http.StatusOK, map[string]any{"connection": nil})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"connection": map[string]string{"id": conn.ID, "name": conn.Name, "bucket": conn.Bucket},
	})
}

func (s *Server) handleAddConnection(w http.ResponseWriter, r *http.Request) {
	var conn appconfig.Connection
	if err := json.NewDecoder(r.Body).Decode(&conn); err != nil {
		writeError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	conn.ID = strings.TrimSpace(conn.ID)
	conn.Name = strings.TrimSpace(conn.Name)
	conn.Bucket = strings.TrimSpace(conn.Bucket)
	conn.Region = strings.TrimSpace(conn.Region)
	conn.Endpoint = strings.TrimSpace(conn.Endpoint)
	conn.AccessKey = strings.TrimSpace(conn.AccessKey)
	if conn.ID == "" || conn.Bucket == "" {
		writeError(w, http.StatusBadRequest, "id and bucket are required")
		return
	}
	if conn.Name == "" {
		conn.Name = conn.Bucket
	}
	if conn.Region == "" {
		conn.Region = "us-east-1"
	}

	// Keys are never sent to the browser, so an edit leaves them blank to keep the stored ones
	s.mu.RLock()
	for _, existing := range s.cfg.Connections {
		if existing.ID == conn.ID {
			if conn.AccessKey == "" {
				conn.AccessKey = existing.AccessKey
			}
			if conn.SecretKey == "" {
				conn.SecretKey = existing.SecretKey
			}
		}
	}
	s.mu.RUnlock()
	if conn.AccessKey == "" || conn.SecretKey == "" {
		writeError(w, http.StatusBadRequest, "access key and secret key are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	store, err := s.initStorage(ctx, &conn)
	if err == nil {
		err = store.Ping(ctx)
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not reach the bucket with these settings: "+err.Error())
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	previous := append([]appconfig.Connection(nil), s.cfg.Connections...)
	previousActive := s.cfg.ActiveID
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
	becomesActive := s.cfg.ActiveID == "" || s.cfg.ActiveID == conn.ID
	if becomesActive {
		s.cfg.ActiveID = conn.ID
	}

	if err := s.cfg.Save(); err != nil {
		s.cfg.Connections = previous
		s.cfg.ActiveID = previousActive
		writeError(w, http.StatusInternalServerError, "failed to save connection")
		return
	}
	if becomesActive {
		s.store = store
	}
	// Bucket or credentials may have changed, so an old report no longer applies
	s.scanner.Forget(conn.ID)

	writeJSON(w, http.StatusOK, map[string]any{"connections": viewsOf(s.cfg.Connections), "activeId": s.cfg.ActiveID})
}

type switchRequest struct {
	ID string `json:"id"`
}

func (s *Server) handleSwitchConnection(w http.ResponseWriter, r *http.Request) {
	var req switchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	s.mu.RLock()
	var target *appconfig.Connection
	for i := range s.cfg.Connections {
		if s.cfg.Connections[i].ID == req.ID {
			conn := s.cfg.Connections[i]
			target = &conn
			break
		}
	}
	s.mu.RUnlock()
	if target == nil {
		writeError(w, http.StatusNotFound, "connection not found")
		return
	}

	store, err := s.initStorage(r.Context(), target)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to switch: "+err.Error())
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	previousActive := s.cfg.ActiveID
	s.cfg.ActiveID = req.ID
	if err := s.cfg.Save(); err != nil {
		s.cfg.ActiveID = previousActive
		writeError(w, http.StatusInternalServerError, "failed to save active connection")
		return
	}
	s.store = store

	writeJSON(w, http.StatusOK, map[string]string{"status": "switched", "id": req.ID})
}

func (s *Server) handleDeleteConnection(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/connections/")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if id == s.cfg.ActiveID {
		writeError(w, http.StatusConflict, "cannot delete the active connection")
		return
	}

	previous := s.cfg.Connections
	remaining := make([]appconfig.Connection, 0, len(previous))
	for _, c := range previous {
		if c.ID != id {
			remaining = append(remaining, c)
		}
	}
	if len(remaining) == len(previous) {
		writeError(w, http.StatusNotFound, "connection not found")
		return
	}

	s.cfg.Connections = remaining
	if err := s.cfg.Save(); err != nil {
		s.cfg.Connections = previous
		writeError(w, http.StatusInternalServerError, "failed to save connections")
		return
	}
	s.scanner.Forget(id)

	writeJSON(w, http.StatusOK, map[string]any{"connections": viewsOf(s.cfg.Connections), "activeId": s.cfg.ActiveID})
}
