package api

import (
	"encoding/json"
	"net/http"
	"private-storage/internal/repository"
	"private-storage/internal/worker"
)

func (s *Server) handleGetAnalyticsSnapshot(w http.ResponseWriter, r *http.Request) {
	conn, err := s.connRepo.GetActive(r.Context())
	if err != nil {
		http.Error(w, "failed to get active connection", http.StatusInternalServerError)
		return
	}
	if conn == nil {
		writeJSON(w, http.StatusOK, map[string]any{"configured": false})
		return
	}

	stats, err := s.analyticsRepo.GetLatestStorageStats(r.Context(), conn.ID)
	if err != nil {
		http.Error(w, "failed to get stats", http.StatusInternalServerError)
		return
	}

	pricing, err := s.analyticsRepo.GetPricingConfig(r.Context(), conn.ID)
	if err != nil {
		http.Error(w, "failed to get pricing", http.StatusInternalServerError)
		return
	}

	// Calculate total cost
	totalCost := 0.0
	pricingMap := make(map[string]float64)
	for _, p := range pricing {
		pricingMap[p.StorageClass] = p.PricePerGB
	}

	for _, st := range stats {
		if rate, ok := pricingMap[st.StorageClass]; ok {
			totalCost += (float64(st.TotalSize) / (1024 * 1024 * 1024)) * rate
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"configured": true,
		"stats":       stats,
		"pricing":     pricing,
		"totalCost":   totalCost,
		"recordedAt":  nil, // Potentially from stats[0]
	})
}

func (s *Server) handleGetPricing(w http.ResponseWriter, r *http.Request) {
	conn, err := s.connRepo.GetActive(r.Context())
	if err != nil || conn == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}

	pricing, err := s.analyticsRepo.GetPricingConfig(r.Context(), conn.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, pricing)
}

func (s *Server) handleUpdatePricing(w http.ResponseWriter, r *http.Request) {
	var cfg repository.PricingConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	conn, err := s.connRepo.GetActive(r.Context())
	if err != nil || conn == nil {
		http.Error(w, "no active connection", http.StatusBadRequest)
		return
	}

	cfg.ConnectionID = conn.ID
	if err := s.analyticsRepo.UpdatePricingConfig(r.Context(), cfg); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

type triggerScanRequest struct {
	ManifestKey string `json:"manifestKey"` // Optional override
}

func (s *Server) handleTriggerInventoryScan(w http.ResponseWriter, r *http.Request) {
	var req triggerScanRequest
	json.NewDecoder(r.Body).Decode(&req)

	conn, err := s.connRepo.GetActive(r.Context())
	if err != nil || conn == nil {
		http.Error(w, "no active connection", http.StatusBadRequest)
		return
	}

	payload := map[string]any{
		"connectionId": conn.ID,
		"manifestKey":  req.ManifestKey,
	}

	jobID, err := s.worker.Enqueue(r.Context(), worker.TaskInventoryScan, payload)
	if err != nil {
		http.Error(w, "failed to enqueue job", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]string{
		"status": "accepted",
		"jobId":  jobID,
	})
}
