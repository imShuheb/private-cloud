package api

import (
	"context"
	"net/http"
	"strings"
	"sync"

	"private-storage/frontend"
	"private-storage/internal/appconfig"
	"private-storage/internal/repository"
	"private-storage/internal/storage"
	"private-storage/internal/worker"
)

type Server struct {
	mu     sync.RWMutex
	store  storage.Store
	cfg    *appconfig.Config
	sm     *sessionManager
	
	// Repositories
	userRepo repository.UserRepository
	connRepo repository.ConnectionRepository
	jobRepo  repository.JobRepository
	analyticsRepo repository.AnalyticsRepository
	
	// Worker
	worker *worker.Manager
}

func NewHandler(
	store storage.Store, 
	cfg *appconfig.Config,
	userRepo repository.UserRepository,
	connRepo repository.ConnectionRepository,
	jobRepo repository.JobRepository,
	analyticsRepo repository.AnalyticsRepository,
	worker *worker.Manager,
) http.Handler {
	s := &Server{
		store:    store,
		cfg:      cfg,
		sm:       newSessionManager(),
		userRepo: userRepo,
		connRepo: connRepo,
		jobRepo:  jobRepo,
		analyticsRepo: analyticsRepo,
		worker:   worker,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", s.handleLogout)
	mux.HandleFunc("GET /api/auth/me", s.handleAuthMe)
	mux.HandleFunc("GET /api/health", s.handleHealth)

	mux.Handle("/api/connections", s.auth(http.HandlerFunc(s.handleListConnections)))
	mux.Handle("POST /api/connections", s.auth(http.HandlerFunc(s.handleAddConnection)))
	mux.Handle("POST /api/connections/switch", s.auth(http.HandlerFunc(s.handleSwitchConnection)))
	mux.Handle("DELETE /api/connections/", s.auth(http.HandlerFunc(s.handleDeleteConnection)))

	mux.Handle("/api/drive/list", s.auth(http.HandlerFunc(s.handleDriveList)))
	mux.Handle("/api/drive/stats", s.auth(http.HandlerFunc(s.handleDriveStats)))
	mux.Handle("/api/drive/presign/upload", s.auth(http.HandlerFunc(s.handlePresignUpload)))
	mux.Handle("/api/drive/presign/download", s.auth(http.HandlerFunc(s.handlePresignDownload)))
	mux.Handle("/api/objects", s.auth(http.HandlerFunc(s.handleList)))
	mux.Handle("POST /api/bulk-objects-delete", s.auth(http.HandlerFunc(s.handleDeleteObjects)))
	mux.Handle("/api/objects/", s.auth(http.HandlerFunc(s.handleObject)))

	// Jobs API
	mux.Handle("GET /api/jobs", s.auth(http.HandlerFunc(s.handleListJobs)))
	mux.Handle("GET /api/jobs/", s.auth(http.HandlerFunc(s.handleGetJob)))

	// Analytics API
	mux.Handle("GET /api/analytics/snapshot", s.auth(http.HandlerFunc(s.handleGetAnalyticsSnapshot)))
	mux.Handle("GET /api/analytics/pricing", s.auth(http.HandlerFunc(s.handleGetPricing)))
	mux.Handle("POST /api/analytics/pricing", s.auth(http.HandlerFunc(s.handleUpdatePricing)))
	mux.Handle("POST /api/analytics/trigger-scan", s.auth(http.HandlerFunc(s.handleTriggerInventoryScan)))

	distFS := frontend.GetDistFS()
	fileServer := http.FileServer(http.FS(distFS))

	staticHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api") {
			return
		}

		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		// Check if file exists in embedded FS
		_, err := distFS.Open(path)
		if err != nil {
			// If not found, serve index.html for SPA routing
			r.URL.Path = "/"
		}

		fileServer.ServeHTTP(w, r)
	})

	mainHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api") {
			mux.ServeHTTP(w, r)
			return
		}
		staticHandler.ServeHTTP(w, r)
	})

	return loggingMiddleware(corsMiddleware(mainHandler))
}

func (s *Server) initStorage(ctx context.Context, conn *repository.Connection) (storage.Store, error) {
	if conn == nil {
		return nil, nil
	}
	return storage.NewS3Store(ctx, storage.S3Config{
		Bucket:       conn.Bucket,
		Region:       conn.Region,
		Endpoint:     conn.Endpoint,
		AccessKey:    conn.AccessKey, // Should be decrypted if stored encrypted
		SecretKey:    conn.SecretKey, // Should be decrypted if stored encrypted
		UsePathStyle: conn.UsePathStyle,
	})
}

func (s *Server) getActiveConnection(ctx context.Context) (*repository.Connection, error) {
	return s.connRepo.GetActive(ctx)
}

func (s *Server) getActiveStore(ctx context.Context) (storage.Store, *repository.Connection, error) {
	conn, err := s.getActiveConnection(ctx)
	if err != nil {
		return nil, nil, err
	}
	if conn == nil {
		return nil, nil, nil
	}

	s.mu.RLock()
	store := s.store
	s.mu.RUnlock()

	if store != nil {
		return store, conn, nil
	}

	// Re-initialize if missing
	store, err = s.initStorage(ctx, conn)
	if err != nil {
		return nil, conn, err
	}

	s.mu.Lock()
	s.store = store
	s.mu.Unlock()

	return store, conn, nil
}
