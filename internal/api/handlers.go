package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"private-storage/internal/analytics"
	"private-storage/internal/storage"
)

const (
	maxBulkDeleteKeys = 10000
	maxSearchResults  = 500
)

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func parseLimit(r *http.Request, def, max int) int {
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= max {
			return parsed
		}
	}
	return def
}

func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	store, _, bucket := s.active()
	if store == nil {
		writeError(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}

	result, err := store.ListObjects(r.Context(), r.URL.Query().Get("prefix"), r.URL.Query().Get("continuationToken"), int32(parseLimit(r, 100, 1000)))
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("list objects failed: %v", err))
		return
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
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	store, _, bucket := s.active()
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

	result, err := store.ListBrowser(r.Context(), r.URL.Query().Get("prefix"), r.URL.Query().Get("continuationToken"), int32(parseLimit(r, 200, 1000)))
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, "folder not found")
			return
		}
		writeError(w, http.StatusBadGateway, fmt.Sprintf("drive list failed: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"bucket": bucket,
		"data":   result,
	})
}

// handleDriveStats serves totals from the latest analytics scan instead of listing the
// whole bucket on every request; the first request starts a background scan.
func (s *Server) handleDriveStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	store, connID, _ := s.active()
	if store == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"totalSize":    0,
			"totalFiles":   0,
			"totalFolders": 0,
			"isConfigured": false,
			"scanning":     false,
		})
		return
	}

	report, status := s.scanner.Report(connID)
	if report == nil && status.State != analytics.StateRunning {
		status = s.scanner.Start(connID, store)
	}

	resp := map[string]any{
		"totalSize":    0,
		"totalFiles":   0,
		"totalFolders": 0,
		"isConfigured": true,
		"scanning":     status.State == analytics.StateRunning,
		"scannedAt":    status.ReportAt,
	}
	if report != nil {
		resp["totalSize"] = report.TotalBytes
		resp["totalFiles"] = report.TotalFiles
		resp["totalFolders"] = report.TotalFolders
	}
	writeJSON(w, http.StatusOK, resp)
}

// handleDriveSearch finds objects whose name contains q anywhere in the bucket.
func (s *Server) handleDriveSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	if q == "" {
		writeError(w, http.StatusBadRequest, "q is required")
		return
	}
	limit := parseLimit(r, 200, maxSearchResults)

	store, _, _ := s.active()
	if store == nil {
		writeError(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}

	items := make([]storage.ObjectInfo, 0, limit)
	truncated := false
	err := store.Walk(r.Context(), "", func(obj storage.ObjectInfo) error {
		name := strings.ToLower(strings.TrimSuffix(obj.Key, "/"))
		if i := strings.LastIndex(name, "/"); i >= 0 {
			name = name[i+1:]
		}
		if !strings.Contains(name, q) {
			return nil
		}
		if len(items) == limit {
			truncated = true
			return storage.ErrStopWalk
		}
		items = append(items, obj)
		return nil
	})
	if err != nil {
		if r.Context().Err() != nil {
			return // the client gave up, e.g. typed a new query
		}
		writeError(w, http.StatusBadGateway, fmt.Sprintf("search failed: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items":     items,
		"truncated": truncated,
	})
}

type presignUploadRequest struct {
	Key         string `json:"key"`
	ContentType string `json:"contentType"`
	ExpiresIn   int    `json:"expiresInSeconds"`
}

func (s *Server) handlePresignUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req presignUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	key := strings.TrimLeft(strings.TrimSpace(req.Key), "/")
	if key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}

	expires := 15 * time.Minute
	if req.ExpiresIn > 0 && req.ExpiresIn <= 3600 {
		expires = time.Duration(req.ExpiresIn) * time.Second
	}

	store, _, bucket := s.active()
	if store == nil {
		writeError(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}

	result, err := store.PresignUpload(r.Context(), key, req.ContentType, expires)
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("presign upload failed: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"bucket": bucket,
		"key":    key,
		"upload": result,
	})
}

// handlePresignDownload signs a GET for key. With ?download=1 the browser saves the
// file instead of opening it, so downloads never stream through this server.
func (s *Server) handlePresignDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	key := strings.TrimLeft(strings.TrimSpace(r.URL.Query().Get("key")), "/")
	if key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}

	expires := 15 * time.Minute
	if raw := r.URL.Query().Get("expiresInSeconds"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err == nil && parsed > 0 && parsed <= 3600 {
			expires = time.Duration(parsed) * time.Second
		}
	}

	attachmentName := ""
	if r.URL.Query().Get("download") == "1" {
		attachmentName = sanitizeFilename(key)
	}

	store, _, bucket := s.active()
	if store == nil {
		writeError(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}

	result, err := store.PresignDownload(r.Context(), key, expires, attachmentName)
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("presign download failed: %v", err))
		return
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
		writeError(w, http.StatusBadRequest, "object key is required")
		return
	}

	p, ok := principalFromRequest(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	switch r.Method {
	case http.MethodPut:
		if !p.perms.CanWriteFiles {
			writeError(w, http.StatusForbidden, "forbidden")
			return
		}
		s.handleUpload(w, r, key)
	case http.MethodGet:
		if !p.perms.CanReadFiles {
			writeError(w, http.StatusForbidden, "forbidden")
			return
		}
		s.handleDownload(w, r, key)
	case http.MethodDelete:
		if !p.perms.CanWriteFiles {
			writeError(w, http.StatusForbidden, "forbidden")
			return
		}
		s.handleDelete(w, r, key)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// noDeadlines lifts the server-wide read/write timeouts for long transfers.
func noDeadlines(w http.ResponseWriter) {
	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(time.Time{})
	_ = rc.SetWriteDeadline(time.Time{})
}

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request, key string) {
	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	store, _, bucket := s.active()
	if store == nil {
		writeError(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}
	if r.ContentLength < 0 {
		writeError(w, http.StatusLengthRequired, "Content-Length is required")
		return
	}

	noDeadlines(w)
	if err := store.UploadObject(r.Context(), key, contentType, r.Body, r.ContentLength); err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("upload failed: %v", err))
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"message": "uploaded",
		"bucket":  bucket,
		"key":     key,
	})
}

func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request, key string) {
	store, _, _ := s.active()
	if store == nil {
		writeError(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}

	obj, err := store.DownloadObject(r.Context(), key)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, "file not found")
			return
		}
		writeError(w, http.StatusBadGateway, fmt.Sprintf("download failed: %v", err))
		return
	}
	defer obj.Body.Close()

	if obj.ContentType == "" {
		w.Header().Set("Content-Type", "application/octet-stream")
	} else {
		w.Header().Set("Content-Type", obj.ContentType)
	}
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": sanitizeFilename(key)}))
	if obj.ContentLength > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(obj.ContentLength, 10))
	}

	noDeadlines(w)
	if _, err = io.Copy(w, obj.Body); err != nil {
		log.Printf("stream response failed: %v", err)
	}
}

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request, key string) {
	store, connID, bucket := s.active()
	if store == nil {
		writeError(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}

	if err := store.DeleteObject(r.Context(), key); err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("delete failed: %v", err))
		return
	}

	s.scanner.RemoveKeys(connID, []string{key})
	writeJSON(w, http.StatusOK, map[string]string{
		"message": "deleted",
		"bucket":  bucket,
		"key":     key,
	})
}

// handleDeleteObjects deletes files in batches and folders (keys ending in "/") recursively.
func (s *Server) handleDeleteObjects(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Keys []string `json:"keys"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(body.Keys) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{"deleted": 0})
		return
	}
	if len(body.Keys) > maxBulkDeleteKeys {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("at most %d keys per request", maxBulkDeleteKeys))
		return
	}

	store, connID, _ := s.active()
	if store == nil {
		writeError(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}

	var files []string
	for _, key := range body.Keys {
		key = strings.TrimLeft(strings.TrimSpace(key), "/")
		switch {
		case key == "":
			continue
		case strings.HasSuffix(key, "/"):
			if err := store.DeleteObject(r.Context(), key); err != nil {
				writeError(w, http.StatusBadGateway, fmt.Sprintf("failed to delete folder %s: %v", key, err))
				return
			}
		default:
			files = append(files, key)
		}
	}
	if err := store.DeleteObjects(r.Context(), files); err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("failed to delete files: %v", err))
		return
	}

	s.scanner.RemoveKeys(connID, body.Keys)
	writeJSON(w, http.StatusOK, map[string]any{"deleted": len(body.Keys)})
}
