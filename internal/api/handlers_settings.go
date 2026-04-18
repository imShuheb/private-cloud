package api

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"
)

type updateSettingsRequest struct {
	SFTPEnabled bool   `json:"sftpEnabled"`
	SFTPAddr    string `json:"sftpAddr"`
}

func (s *Server) handleGetSettings(w http.ResponseWriter, _ *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	writeJSON(w, http.StatusOK, map[string]any{
		"sftpEnabled": s.cfg.SFTPEnabled,
		"sftpAddr":    s.cfg.SFTPAddr,
	})
}

func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req updateSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	addr := strings.TrimSpace(req.SFTPAddr)
	if addr == "" {
		addr = "0.0.0.0:2022"
	}
	if _, _, err := net.SplitHostPort(addr); err != nil {
		http.Error(w, "sftp address must be in host:port format", http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	settings := s.cfg.GetRuntimeSettings()
	settings.SFTPEnabled = req.SFTPEnabled
	settings.SFTPAddr = addr
	settings.SFTPUser = ""
	settings.SFTPPassword = ""
	s.cfg.SetRuntimeSettings(settings)

	if err := s.cfg.Save(); err != nil {
		s.mu.Unlock()
		http.Error(w, "failed to persist settings", http.StatusInternalServerError)
		return
	}
	s.mu.Unlock()

	if err := s.applySFTPFromConfig(); err != nil {
		http.Error(w, "failed to apply SFTP settings: "+err.Error(), http.StatusBadRequest)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"saved":       true,
		"sftpEnabled": settings.SFTPEnabled,
		"sftpAddr":    settings.SFTPAddr,
	})
}
