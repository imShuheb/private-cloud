package api

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

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

	staticHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api") {
			return
		}

		path := filepath.Join("dist", r.URL.Path)
		info, err := os.Stat(path)
		if os.IsNotExist(err) || info.IsDir() {
			http.ServeFile(w, r, filepath.Join("dist", "index.html"))
			return
		}

		http.ServeFile(w, r, path)
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
