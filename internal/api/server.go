package api

import (
	"context"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"strings"
	"sync"
	"time"

	"private-storage/frontend"
	"private-storage/internal/analytics"
	"private-storage/internal/appconfig"
	"private-storage/internal/storage"
)

type Server struct {
	mu      sync.RWMutex
	store   storage.Store
	cfg     *appconfig.Config
	sm      *sessionManager
	sftpCtl *sftpController
	scanner *analytics.Scanner
	logins  *loginGuard
}

// maxAPIBodyBytes caps JSON request bodies (a 10,000-key bulk delete fits easily).
const maxAPIBodyBytes = 4 << 20

// NewHandler builds the HTTP handler. Background work (session cleanup) stops when ctx is done.
func NewHandler(ctx context.Context, store storage.Store, cfg *appconfig.Config) http.Handler {
	s := &Server{
		store:   store,
		cfg:     cfg,
		sm:      newSessionManager(),
		scanner: analytics.NewScanner(),
		logins:  newLoginGuard(),
	}
	s.sftpCtl = newSFTPController(s)
	if err := s.applySFTPFromConfig(); err != nil {
		log.Printf("failed to apply initial SFTP settings: %v", err)
	}
	go s.sm.cleanupLoop(ctx, 10*time.Minute)
	if readOnly {
		log.Println("READ_ONLY is on: files can be viewed and downloaded, not changed")
	}
	if key := cfg.AdminAPIKey; key != "" && len(key) < minAPIKeyLength {
		log.Printf("WARNING: ADMIN_API_KEY is shorter than %d characters and is ignored. Generate one with: openssl rand -hex 32", minAPIKeyLength)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", s.handleLogout)
	mux.HandleFunc("GET /api/auth/me", s.handleAuthMe)
	mux.HandleFunc("GET /api/health", s.handleHealth)

	mux.Handle("GET /api/connections", s.auth(requirePerm(permManageConnections, http.HandlerFunc(s.handleListConnections))))
	mux.Handle("POST /api/connections", s.auth(requirePerm(permManageConnections, http.HandlerFunc(s.handleAddConnection))))
	mux.Handle("POST /api/connections/switch", s.auth(requirePerm(permManageConnections, http.HandlerFunc(s.handleSwitchConnection))))
	mux.Handle("DELETE /api/connections/", s.auth(requirePerm(permManageConnections, http.HandlerFunc(s.handleDeleteConnection))))
	// Every signed-in user may see which storage is active (names only, no keys)
	mux.Handle("GET /api/connections/active", s.auth(http.HandlerFunc(s.handleActiveConnection)))
	mux.Handle("GET /api/settings", s.auth(requirePerm(permManageSettings, http.HandlerFunc(s.handleGetSettings))))
	mux.Handle("PUT /api/settings", s.auth(requirePerm(permManageSettings, http.HandlerFunc(s.handleUpdateSettings))))

	mux.Handle("/api/drive/list", s.auth(requirePerm(permReadFiles, http.HandlerFunc(s.handleDriveList))))
	mux.Handle("/api/drive/stats", s.auth(requirePerm(permReadFiles, http.HandlerFunc(s.handleDriveStats))))
	mux.Handle("/api/drive/search", s.auth(requirePerm(permReadFiles, http.HandlerFunc(s.handleDriveSearch))))
	mux.Handle("/api/drive/presign/upload", s.auth(requirePerm(permWriteFiles, http.HandlerFunc(s.handlePresignUpload))))
	mux.Handle("/api/drive/presign/download", s.auth(requirePerm(permReadFiles, http.HandlerFunc(s.handlePresignDownload))))
	mux.Handle("/api/objects", s.auth(requirePerm(permReadFiles, http.HandlerFunc(s.handleList))))
	mux.Handle("POST /api/bulk-objects-delete", s.auth(requirePerm(permWriteFiles, http.HandlerFunc(s.handleDeleteObjects))))
	mux.Handle("/api/objects/", s.auth(http.HandlerFunc(s.handleObject)))

	mux.Handle("GET /api/analytics", s.auth(requirePerm(permReadFiles, http.HandlerFunc(s.handleAnalytics))))
	mux.Handle("GET /api/analytics/files", s.auth(requirePerm(permReadFiles, http.HandlerFunc(s.handleAnalyticsFiles))))
	mux.Handle("POST /api/analytics/scan", s.auth(requirePerm(permReadFiles, http.HandlerFunc(s.handleAnalyticsScan))))
	mux.Handle("POST /api/analytics/scan/cancel", s.auth(requirePerm(permReadFiles, http.HandlerFunc(s.handleAnalyticsCancel))))

	mux.Handle("GET /api/users", s.auth(requireOwner(http.HandlerFunc(s.handleListUsers))))
	mux.Handle("POST /api/users", s.auth(requireOwner(http.HandlerFunc(s.handleCreateUser))))
	mux.Handle("PUT /api/users/", s.auth(requireOwner(http.HandlerFunc(s.handleUsersMutations))))
	mux.Handle("DELETE /api/users/", s.auth(requireOwner(http.HandlerFunc(s.handleDeleteUser))))

	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, "not found")
	})

	distFS := frontend.GetDistFS()
	mainHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api" {
			w.Header().Set("Cache-Control", "no-store")
			// JSON requests are small; only file uploads may send large bodies
			if !(r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/api/objects/")) {
				r.Body = http.MaxBytesReader(w, r.Body, maxAPIBodyBytes)
			}
			mux.ServeHTTP(w, r)
			return
		}
		serveSPA(distFS, w, r)
	})

	return loggingMiddleware(securityHeaders(corsMiddleware(mainHandler)))
}

func init() {
	// Not in Go's built-in table; browsers need it to read the home-screen app manifest
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
}

// serveSPA serves the embedded frontend, falling back to index.html for client-side routes.
func serveSPA(distFS fs.FS, w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "index.html"
	}
	if info, err := fs.Stat(distFS, path); err != nil || info.IsDir() {
		path = "index.html"
	}

	if strings.HasPrefix(path, "assets/") {
		// Vite puts a content hash in asset names, so they never change
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		w.Header().Set("Cache-Control", "no-cache")
	}
	http.ServeFileFS(w, r, distFS, path)
}

// active returns the active store, its connection ID and bucket name.
func (s *Server) active() (storage.Store, string, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	conn := s.cfg.GetActiveConnection()
	if s.store == nil || conn == nil {
		return nil, "", ""
	}
	return s.store, conn.ID, conn.Bucket
}

func (s *Server) initStorage(ctx context.Context, conn *appconfig.Connection) (storage.Store, error) {
	if conn == nil {
		return nil, nil
	}
	return storage.NewS3Store(ctx, storage.S3Config{
		Bucket:       conn.Bucket,
		Region:       conn.Region,
		Endpoint:     conn.Endpoint,
		AccessKey:    conn.AccessKey,
		SecretKey:    conn.SecretKey,
		UsePathStyle: conn.UsePathStyle,
	})
}
