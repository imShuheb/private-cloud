package db

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	pool *pgxpool.Pool
	once sync.Once
)

// Connect initializes the database connection pool
func Connect(ctx context.Context) (*pgxpool.Pool, error) {
	var err error
	once.Do(func() {
		connStr := os.Getenv("DATABASE_URL")
		if connStr == "" {
			dbUser := getEnv("DB_USER", "postgres")
			dbPass := getEnv("DB_PASSWORD", "postgres")
			dbHost := getEnv("DB_HOST", "localhost")
			dbPort := getEnv("DB_PORT", "5432")
			dbName := getEnv("DB_NAME", "private_storage")
			connStr = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", dbUser, dbPass, dbHost, dbPort, dbName)
		}

		config, pErr := pgxpool.ParseConfig(connStr)
		if pErr != nil {
			err = fmt.Errorf("unable to parse connection string: %v", pErr)
			return
		}

		config.MaxConns = 25
		config.MinConns = 2
		config.MaxConnIdleTime = 30 * time.Minute

		p, pErr := pgxpool.NewWithConfig(ctx, config)
		if pErr != nil {
			err = fmt.Errorf("unable to create connection pool: %v", pErr)
			return
		}

		// Ping to ensure connection is valid
		if pErr = p.Ping(ctx); pErr != nil {
			err = fmt.Errorf("unable to ping database: %v", pErr)
			return
		}

		pool = p
		log.Println("Connected to PostgreSQL/TimescaleDB")
	})

	return pool, err
}

// GetPool returns the initialized connection pool
func GetPool() *pgxpool.Pool {
	return pool
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
