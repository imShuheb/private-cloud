package main

import (
	"context"
	"log"
	"net/http"
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

	ctx := context.Background()
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
		Handler:           api.NewHandler(store, cfg),
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

	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
