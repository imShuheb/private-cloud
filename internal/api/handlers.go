package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"private-storage/internal/storage"
)

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	maxKeys := int32(100)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err == nil && parsed > 0 && parsed <= 1000 {
			maxKeys = int32(parsed)
		}
	}

	s.mu.RLock()
	store := s.store
	activeConn := s.cfg.GetActiveConnection()
	s.mu.RUnlock()

	if store == nil {
		http.Error(w, "storage not configured", http.StatusServiceUnavailable)
		return
	}

	result, err := store.ListObjects(r.Context(), r.URL.Query().Get("prefix"), r.URL.Query().Get("continuationToken"), maxKeys)
	if err != nil {
		http.Error(w, fmt.Sprintf("list objects failed: %v", err), http.StatusBadGateway)
		return
	}

	bucket := ""
	if activeConn != nil {
		bucket = activeConn.Bucket
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"bucket":                bucket,
		"items":                 result.Items,
		"isTruncated":           result.IsTruncated,
		"nextContinuationToken": result.NextContinuationToken,
	})
}

func (s *Server) handleDriveList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	maxKeys := int32(200)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err == nil && parsed > 0 && parsed <= 1000 {
			maxKeys = int32(parsed)
		}
	}

	s.mu.RLock()
	store := s.store
	activeConn := s.cfg.GetActiveConnection()
	s.mu.RUnlock()

	if store == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"bucket": "",
			"data": map[string]any{
				"currentPrefix": r.URL.Query().Get("prefix"),
				"folders":       []any{},
				"files":         []any{},
			},
		})
		return
	}

	result, err := store.ListBrowser(r.Context(), r.URL.Query().Get("prefix"), r.URL.Query().Get("continuationToken"), maxKeys)
	if err != nil {
		if err == storage.ErrNotFound {
			http.Error(w, "folder not found", http.StatusNotFound)
			return
		}
		http.Error(w, fmt.Sprintf("drive list failed: %v", err), http.StatusBadGateway)
		return
	}

	bucket := ""
	if activeConn != nil {
		bucket = activeConn.Bucket
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"bucket": bucket,
		"data":   result,
	})
}

func (s *Server) handleDriveStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.mu.RLock()
	store := s.store
	s.mu.RUnlock()

	if store == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"totalSize":    0,
			"totalFiles":   0,
			"totalFolders": 0,
			"isConfigured": false,
		})
		return
	}

	stats, err := store.GetStats(r.Context())
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to get drive stats: %v", err), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"totalSize":    stats.TotalSize,
		"totalFiles":   stats.TotalFiles,
		"totalFolders": stats.TotalFolders,
		"isConfigured": true,
	})
}

type presignUploadRequest struct {
	Key         string `json:"key"`
	ContentType string `json:"contentType"`
	ExpiresIn   int    `json:"expiresInSeconds"`
}

func (s *Server) handlePresignUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req presignUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	key := strings.TrimLeft(strings.TrimSpace(req.Key), "/")
	if key == "" {
		http.Error(w, "key is required", http.StatusBadRequest)
		return
	}

	expires := 15 * time.Minute
	if req.ExpiresIn > 0 && req.ExpiresIn <= 3600 {
		expires = time.Duration(req.ExpiresIn) * time.Second
	}

	s.mu.RLock()
	store := s.store
	activeConn := s.cfg.GetActiveConnection()
	s.mu.RUnlock()

	if store == nil {
		http.Error(w, "storage not configured", http.StatusServiceUnavailable)
		return
	}

	result, err := store.PresignUpload(r.Context(), key, req.ContentType, expires)
	if err != nil {
		http.Error(w, fmt.Sprintf("presign upload failed: %v", err), http.StatusBadGateway)
		return
	}

	bucket := ""
	if activeConn != nil {
		bucket = activeConn.Bucket
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"bucket": bucket,
		"key":    key,
		"upload": result,
	})
}

func (s *Server) handlePresignDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	key := strings.TrimLeft(strings.TrimSpace(r.URL.Query().Get("key")), "/")
	if key == "" {
		http.Error(w, "key is required", http.StatusBadRequest)
		return
	}

	expires := 15 * time.Minute
	if raw := r.URL.Query().Get("expiresInSeconds"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err == nil && parsed > 0 && parsed <= 3600 {
			expires = time.Duration(parsed) * time.Second
		}
	}

	s.mu.RLock()
	store := s.store
	activeConn := s.cfg.GetActiveConnection()
	s.mu.RUnlock()

	if store == nil {
		http.Error(w, "storage not configured", http.StatusServiceUnavailable)
		return
	}

	result, err := store.PresignDownload(r.Context(), key, expires)
	if err != nil {
		http.Error(w, fmt.Sprintf("presign download failed: %v", err), http.StatusBadGateway)
		return
	}

	bucket := ""
	if activeConn != nil {
		bucket = activeConn.Bucket
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"bucket":   bucket,
		"key":      key,
		"download": result,
	})
}

func (s *Server) handleObject(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimLeft(strings.TrimPrefix(r.URL.Path, "/api/objects/"), "/")
	if key == "" {
		http.Error(w, "object key is required", http.StatusBadRequest)
		return
	}

	p, ok := principalFromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodPut:
		if !p.perms.CanWriteFiles {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		s.handleUpload(w, r, key)
	case http.MethodGet:
		if !p.perms.CanReadFiles {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		s.handleDownload(w, r, key)
	case http.MethodDelete:
		if !p.perms.CanWriteFiles {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		s.handleDelete(w, r, key)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request, key string) {
	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	s.mu.RLock()
	store := s.store
	activeConn := s.cfg.GetActiveConnection()
	s.mu.RUnlock()

	if store == nil {
		http.Error(w, "storage not configured", http.StatusServiceUnavailable)
		return
	}

	if err := store.UploadObject(r.Context(), key, contentType, r.Body); err != nil {
		http.Error(w, fmt.Sprintf("upload failed: %v", err), http.StatusBadGateway)
		return
	}

	bucket := ""
	if activeConn != nil {
		bucket = activeConn.Bucket
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"message": "uploaded",
		"bucket":  bucket,
		"key":     key,
	})
}

func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request, key string) {
	s.mu.RLock()
	store := s.store
	s.mu.RUnlock()

	if store == nil {
		http.Error(w, "storage not configured", http.StatusServiceUnavailable)
		return
	}

	obj, err := store.DownloadObject(r.Context(), key)
	if err != nil {
		http.Error(w, fmt.Sprintf("download failed: %v", err), http.StatusNotFound)
		return
	}
	defer obj.Body.Close()

	if obj.ContentType == "" {
		w.Header().Set("Content-Type", "application/octet-stream")
	} else {
		w.Header().Set("Content-Type", obj.ContentType)
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", sanitizeFilename(key)))

	if obj.ContentLength > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(obj.ContentLength, 10))
	}

	if _, err = io.Copy(w, obj.Body); err != nil {
		log.Printf("stream response failed: %v", err)
	}
}

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request, key string) {
	s.mu.RLock()
	store := s.store
	activeConn := s.cfg.GetActiveConnection()
	s.mu.RUnlock()

	if store == nil {
		http.Error(w, "storage not configured", http.StatusServiceUnavailable)
		return
	}

	if err := store.DeleteObject(r.Context(), key); err != nil {
		http.Error(w, fmt.Sprintf("delete failed: %v", err), http.StatusBadGateway)
		return
	}

	bucket := ""
	if activeConn != nil {
		bucket = activeConn.Bucket
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "deleted",
		"bucket":  bucket,
		"key":     key,
	})
}

func (s *Server) handleDeleteObjects(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Keys []string `json:"keys"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if len(body.Keys) == 0 {
		writeJSON(w, http.StatusOK, map[string]string{"message": "no keys to delete"})
		return
	}

	s.mu.RLock()
	store := s.store
	s.mu.RUnlock()

	if store == nil {
		http.Error(w, "storage not configured", http.StatusServiceUnavailable)
		return
	}

	for _, key := range body.Keys {
		if err := store.DeleteObject(r.Context(), key); err != nil {
			http.Error(w, fmt.Sprintf("failed to delete %s: %v", key, err), http.StatusBadGateway)
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "successfully deleted items"})
}
