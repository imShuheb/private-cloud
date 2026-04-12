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

func main() {
	cfg, err := appconfig.LoadFromEnv()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	ctx := context.Background()
	store, err := storage.NewS3Store(ctx, cfg)
	if err != nil {
		log.Fatalf("storage init error: %v", err)
	}

	httpServer := &http.Server{
		Addr:              cfg.ServerAddr,
		Handler:           api.NewHandler(store, cfg.StorageToken, cfg.Username, cfg.Password, cfg.Bucket),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	log.Printf("Private storage server running at %s", cfg.ServerAddr)
	log.Printf("Bucket: %s", cfg.Bucket)
	if cfg.Endpoint != "" {
		log.Printf("S3 endpoint: %s", cfg.Endpoint)
	}

	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
