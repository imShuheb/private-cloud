package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("write JSON failed: %v", err)
	}
}

func sanitizeFilename(key string) string {
	parts := strings.Split(key, "/")
	name := parts[len(parts)-1]
	if strings.TrimSpace(name) == "" {
		return "file"
	}
	return name
}
