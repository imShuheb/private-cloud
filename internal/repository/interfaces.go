package repository

import (
	"context"
	"time"
)

type Connection struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Bucket       string    `json:"bucket"`
	Region       string    `json:"region"`
	Endpoint     string    `json:"endpoint"`
	AccessKey    string    `json:"accessKey"`
	SecretKey    string    `json:"secretKey"`
	UsePathStyle bool      `json:"usePathStyle"`
	IsActive     bool      `json:"isActive"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Job struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Status      string      `json:"status"`
	Payload     interface{} `json:"payload"`
	Result      interface{} `json:"result"`
	Error       string      `json:"error"`
	StartedAt   *time.Time  `json:"startedAt"`
	CompletedAt *time.Time  `json:"completedAt"`
	CreatedAt   time.Time   `json:"createdAt"`
}

type StorageStat struct {
	ID           string    `json:"id"`
	ConnectionID string    `json:"connectionId"`
	StorageClass string    `json:"storageClass"`
	TotalSize    int64     `json:"totalSize"`
	TotalObjects int       `json:"totalObjects"`
	RecordedAt   time.Time `json:"recordedAt"`
}

type PricingConfig struct {
	ConnectionID string  `json:"connectionId"`
	StorageClass string  `json:"storageClass"`
	PricePerGB   float64 `json:"pricePerGb"`
}

type ConnectionRepository interface {
	Create(ctx context.Context, conn *Connection) error
	GetByID(ctx context.Context, id string) (*Connection, error)
	List(ctx context.Context) ([]Connection, error)
	Update(ctx context.Context, conn *Connection) error
	Delete(ctx context.Context, id string) error
	SetActive(ctx context.Context, id string) error
	GetActive(ctx context.Context) (*Connection, error)
}

type UserRepository interface {
	GetByUsername(ctx context.Context, username string) (*User, error)
	UpdatePassword(ctx context.Context, id string, newHash string) error
}

type JobRepository interface {
	Create(ctx context.Context, job *Job) error
	Update(ctx context.Context, job *Job) error
	GetByID(ctx context.Context, id string) (*Job, error)
	List(ctx context.Context, limit int) ([]Job, error)
}

type AnalyticsRepository interface {
	SaveStorageStats(ctx context.Context, stats []StorageStat) error
	GetLatestStorageStats(ctx context.Context, connectionID string) ([]StorageStat, error)
	GetPricingConfig(ctx context.Context, connectionID string) ([]PricingConfig, error)
	UpdatePricingConfig(ctx context.Context, config PricingConfig) error
}
