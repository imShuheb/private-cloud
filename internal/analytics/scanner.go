package analytics

import (
	"context"
	"errors"
	"log"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"private-storage/internal/storage"
)

type State string

const (
	StateIdle      State = "idle"
	StateRunning   State = "running"
	StateDone      State = "done"
	StateFailed    State = "failed"
	StateCancelled State = "cancelled"
)

// Status describes the latest scan of one connection.
type Status struct {
	ConnectionID   string     `json:"connectionId"`
	State          State      `json:"state"`
	StartedAt      *time.Time `json:"startedAt,omitempty"`
	FinishedAt     *time.Time `json:"finishedAt,omitempty"`
	ScannedObjects int64      `json:"scannedObjects"`
	ScannedBytes   int64      `json:"scannedBytes"`
	Error          string     `json:"error,omitempty"`
	// ReportAt is when the available report was generated (it may be from an earlier scan).
	ReportAt *time.Time `json:"reportAt,omitempty"`
}

type job struct {
	status  Status
	objects atomic.Int64
	bytes   atomic.Int64
	cancel  context.CancelFunc
	report  *Report
}

// Scanner runs at most one background scan per connection and keeps the last good report.
type Scanner struct {
	mu   sync.Mutex
	jobs map[string]*job
	now  func() time.Time
}

func NewScanner() *Scanner {
	return &Scanner{jobs: map[string]*job{}, now: time.Now}
}

func (s *Scanner) jobFor(connID string) *job {
	j, ok := s.jobs[connID]
	if !ok {
		j = &job{status: Status{ConnectionID: connID, State: StateIdle}}
		s.jobs[connID] = j
	}
	return j
}

// Start begins a scan of store for connID unless one is already running, and returns the status.
func (s *Scanner) Start(connID string, store storage.Store) Status {
	s.mu.Lock()
	defer s.mu.Unlock()

	j := s.jobFor(connID)
	if j.status.State == StateRunning {
		return s.statusLocked(j)
	}

	ctx, cancel := context.WithCancel(context.Background())
	started := s.now()
	j.cancel = cancel
	j.objects.Store(0)
	j.bytes.Store(0)
	j.status.State = StateRunning
	j.status.StartedAt = &started
	j.status.FinishedAt = nil
	j.status.Error = ""

	go s.run(ctx, connID, j, store)
	return s.statusLocked(j)
}

func (s *Scanner) run(ctx context.Context, connID string, j *job, store storage.Store) {
	agg := NewAggregator(s.now())
	err := store.Walk(ctx, "", func(obj storage.ObjectInfo) error {
		agg.Add(obj)
		j.objects.Add(1)
		j.bytes.Add(obj.Size)
		return nil
	})

	s.mu.Lock()
	defer s.mu.Unlock()
	finished := s.now()
	j.status.FinishedAt = &finished
	j.cancel = nil

	switch {
	case errors.Is(err, context.Canceled):
		j.status.State = StateCancelled
	case err != nil:
		j.status.State = StateFailed
		j.status.Error = err.Error()
		log.Printf("[analytics] scan of %s failed after %d objects: %v", connID, j.objects.Load(), err)
	default:
		j.status.State = StateDone
		j.report = agg.Report()
		j.report.GeneratedAt = finished
		log.Printf("[analytics] scanned %s: %d objects in %s", connID, j.objects.Load(), finished.Sub(*j.status.StartedAt).Round(time.Millisecond))
	}
}

// Cancel stops a running scan of connID; the previous report is kept.
func (s *Scanner) Cancel(connID string) Status {
	s.mu.Lock()
	defer s.mu.Unlock()
	j := s.jobFor(connID)
	if j.cancel != nil {
		j.cancel()
	}
	return s.statusLocked(j)
}

// Status returns the current scan status of connID.
func (s *Scanner) Status(connID string) Status {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.statusLocked(s.jobFor(connID))
}

// Report returns the last completed report for connID (nil if none) and the scan status.
func (s *Scanner) Report(connID string) (*Report, Status) {
	s.mu.Lock()
	defer s.mu.Unlock()
	j := s.jobFor(connID)
	return j.report, s.statusLocked(j)
}

// Forget drops everything known about connID (e.g. when the connection is deleted or changed).
func (s *Scanner) Forget(connID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if j, ok := s.jobs[connID]; ok {
		if j.cancel != nil {
			j.cancel()
		}
		delete(s.jobs, connID)
	}
}

func (s *Scanner) statusLocked(j *job) Status {
	st := j.status
	st.ScannedObjects = j.objects.Load()
	st.ScannedBytes = j.bytes.Load()
	if j.report != nil {
		at := j.report.GeneratedAt
		st.ReportAt = &at
	}
	return st
}

// RemoveKeys drops deleted objects from the report's file list so it doesn't show files that
// are gone. Keys ending in "/" remove everything under that folder. Totals keep their scan-time
// values until the next scan.
func (s *Scanner) RemoveKeys(connID string, keys []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	j, ok := s.jobs[connID]
	if !ok || j.report == nil || len(keys) == 0 {
		return
	}
	deleted := func(key string) bool {
		for _, k := range keys {
			if key == k || (strings.HasSuffix(k, "/") && strings.HasPrefix(key, k)) {
				return true
			}
		}
		return false
	}
	// Copy instead of filtering in place: readers may still hold the old slice
	kept := make([]FileEntry, 0, len(j.report.LargestFiles))
	for _, f := range j.report.LargestFiles {
		if !deleted(f.Key) {
			kept = append(kept, f)
		}
	}
	updated := *j.report
	updated.LargestFiles = kept
	j.report = &updated
}
