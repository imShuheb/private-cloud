package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"private-storage/internal/api"
	"private-storage/internal/appconfig"
	"private-storage/internal/db"
	"private-storage/internal/repository"
	"private-storage/internal/repository/postgres"
	"private-storage/internal/storage"
	"private-storage/internal/worker"
)

// Version is injected during build time using ldflags
var Version = "dev"

func main() {
	cfg, err := appconfig.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	ctx := context.Background()

	// 1. Initialize Database
	pool, err := db.Connect(ctx)
	if err != nil {
		log.Fatalf("database error: %v", err)
	}
	defer pool.Close()

	// 2. Run Migrations
	if err := db.RunMigrations(ctx, pool); err != nil {
		log.Fatalf("migration error: %v", err)
	}

	// 3. Initialize Repositories
	userRepo := postgres.NewUserRepo(pool)
	connRepo := postgres.NewConnectionRepo(pool)
	jobRepo := postgres.NewJobRepo(pool)
	analyticsRepo := postgres.NewAnalyticsRepo(pool)

	// 4. Initialize Worker Manager
	workerMgr := worker.NewManager(jobRepo, 5)
	
	// Register tasks
	inventoryTask := worker.NewInventoryScanTask(analyticsRepo, connRepo, func(ctx context.Context, conn *repository.Connection) (storage.Store, error) {
		return storage.NewS3Store(ctx, storage.S3Config{
			Bucket:       conn.Bucket,
			Region:       conn.Region,
			Endpoint:     conn.Endpoint,
			AccessKey:    conn.AccessKey,
			SecretKey:    conn.SecretKey,
			UsePathStyle: conn.UsePathStyle,
		})
	})
	workerMgr.Register(worker.TaskInventoryScan, inventoryTask.Run)

	workerMgr.Start(ctx)

	// 5. Initialize active storage
	var store storage.Store
	activeConn, err := connRepo.GetActive(ctx)
	if err != nil {
		log.Printf("Warning: failed to query active connection: %v", err)
	}

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

	// 6. Start HTTP Server
	httpServer := &http.Server{
		Addr:              cfg.ServerAddr,
		Handler:           api.NewHandler(store, cfg, userRepo, connRepo, jobRepo, analyticsRepo, workerMgr),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	log.Printf("Private storage server %s running at %s", Version, cfg.ServerAddr)
	if activeConn == nil {
		log.Println("WARNING: No active storage connection found. Please visit Settings to configure.")
	} else {
		log.Printf("Active Storage: %s (Bucket: %s)", activeConn.Name, activeConn.Bucket)
	}

	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
