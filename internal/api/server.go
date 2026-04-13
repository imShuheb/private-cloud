package api

import (
	"net/http"
	"strings"

	"private-storage/frontend"
	"private-storage/internal/storage"
)

type Server struct {
	store  storage.Store
	token  string
	user   string
	pass   string
	bucket string
	sm     *sessionManager
}

func NewHandler(store storage.Store, token, user, pass, bucket string) http.Handler {
	s := &Server{store: store, token: token, user: user, pass: pass, bucket: bucket, sm: newSessionManager()}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", s.handleLogout)
	mux.HandleFunc("GET /api/auth/me", s.handleAuthMe)
	mux.HandleFunc("GET /api/health", s.handleHealth)
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
