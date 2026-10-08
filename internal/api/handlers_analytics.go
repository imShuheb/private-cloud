package api

import (
	"net/http"
	"strconv"
	"strings"

	"private-storage/internal/analytics"
)

// handleAnalytics returns the scan status and the latest report summary for the active connection.
func (s *Server) handleAnalytics(w http.ResponseWriter, _ *http.Request) {
	store, connID, bucket := s.active()
	if store == nil {
		writeError(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}

	report, status := s.scanner.Report(connID)
	resp := map[string]any{
		"bucket":          bucket,
		"status":          status,
		"report":          report,
		"maxLargestFiles": analytics.MaxLargestFiles,
	}
	if report != nil {
		resp["largestFilesCount"] = len(report.LargestFiles)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleAnalyticsScan(w http.ResponseWriter, _ *http.Request) {
	store, connID, _ := s.active()
	if store == nil {
		writeError(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"status": s.scanner.Start(connID, store)})
}

func (s *Server) handleAnalyticsCancel(w http.ResponseWriter, _ *http.Request) {
	_, connID, _ := s.active()
	if connID == "" {
		writeError(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": s.scanner.Cancel(connID)})
}

// handleAnalyticsFiles filters, sorts and pages the largest files of the latest report.
func (s *Server) handleAnalyticsFiles(w http.ResponseWriter, r *http.Request) {
	store, connID, _ := s.active()
	if store == nil {
		writeError(w, http.StatusServiceUnavailable, "storage not configured")
		return
	}

	q := r.URL.Query()
	query := analytics.FileQuery{
		Category: analytics.Category(strings.TrimSpace(q.Get("category"))),
		Search:   q.Get("q"),
		Folder:   strings.TrimLeft(q.Get("folder"), "/"),
		SortBy:   q.Get("sort"),
		Desc:     q.Get("order") != "asc",
		Limit:    parseLimit(r, 50, 500),
	}
	if v, err := strconv.ParseInt(q.Get("minSize"), 10, 64); err == nil && v > 0 {
		query.MinSize = v
	}
	if v, err := strconv.Atoi(q.Get("offset")); err == nil && v > 0 {
		query.Offset = v
	}

	report, status := s.scanner.Report(connID)
	items, total := analytics.QueryFiles(report, query)
	writeJSON(w, http.StatusOK, map[string]any{
		"items":  items,
		"total":  total,
		"offset": query.Offset,
		"status": status,
	})
}
