package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"private-storage/internal/api"
	"private-storage/internal/appconfig"
	"private-storage/internal/storage"
)

// Version is injected during build time using ldflags
var Version = "dev"

func main() {
	cfg, err := appconfig.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	var store storage.Store
	activeConn := cfg.GetActiveConnection()

	if activeConn != nil {
		s3Store, err := storage.NewS3Store(ctx, storage.S3Config{
			Bucket:       activeConn.Bucket,
			Region:       activeConn.Region,
			Endpoint:     activeConn.Endpoint,
			AccessKey:    activeConn.AccessKey,
			SecretKey:    activeConn.SecretKey,
			UsePathStyle: activeConn.UsePathStyle,
		})
		if err != nil {
			log.Printf("Warning: failed to initialize active storage: %v", err)
		} else {
			store = s3Store
		}
	}

	httpServer := &http.Server{
		Addr:              cfg.ServerAddr,
		Handler:           api.NewHandler(ctx, store, cfg),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	log.Printf("Private storage server %s running at %s", Version, cfg.ServerAddr)
	if !cfg.IsConfigured() {
		log.Println("WARNING: Server started in SETUP MODE. Please visit the dashboard to configure.")
	} else if activeConn != nil {
		log.Printf("Active Storage: %s (Bucket: %s)", activeConn.Name, activeConn.Bucket)
	}
	serveErr := make(chan error, 1)
	go func() {
		if cfg.TLSCertFile != "" && cfg.TLSKeyFile != "" {
			log.Printf("HTTPS enabled with cert %s", cfg.TLSCertFile)
			serveErr <- httpServer.ListenAndServeTLS(cfg.TLSCertFile, cfg.TLSKeyFile)
			return
		}
		serveErr <- httpServer.ListenAndServe()
	}()

	select {
	case err := <-serveErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	case <-ctx.Done():
		log.Println("Shutting down...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			log.Printf("shutdown: %v", err)
		}
	}
}
