package api

import (
	"context"
	"log"
	"net/http"
	"strings"
	"sync"

	"private-storage/frontend"
	"private-storage/internal/appconfig"
	"private-storage/internal/storage"
)

type Server struct {
	mu      sync.RWMutex
	store   storage.Store
	cfg     *appconfig.Config
	sm      *sessionManager
	sftpCtl *sftpController
}

func NewHandler(store storage.Store, cfg *appconfig.Config) http.Handler {
	s := &Server{
		store: store,
		cfg:   cfg,
		sm:    newSessionManager(),
	}
	s.sftpCtl = newSFTPController(s)
	if err := s.applySFTPFromConfig(); err != nil {
		log.Printf("failed to apply initial SFTP settings: %v", err)
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
	mux.Handle("GET /api/settings", s.auth(http.HandlerFunc(s.handleGetSettings)))
	mux.Handle("PUT /api/settings", s.auth(http.HandlerFunc(s.handleUpdateSettings)))

	mux.Handle("/api/drive/list", s.auth(http.HandlerFunc(s.handleDriveList)))
	mux.Handle("/api/drive/stats", s.auth(http.HandlerFunc(s.handleDriveStats)))
	mux.Handle("/api/drive/presign/upload", s.auth(http.HandlerFunc(s.handlePresignUpload)))
	mux.Handle("/api/drive/presign/download", s.auth(http.HandlerFunc(s.handlePresignDownload)))
	mux.Handle("/api/objects", s.auth(http.HandlerFunc(s.handleList)))
	mux.Handle("POST /api/bulk-objects-delete", s.auth(http.HandlerFunc(s.handleDeleteObjects)))
	mux.Handle("/api/objects/", s.auth(http.HandlerFunc(s.handleObject)))

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
