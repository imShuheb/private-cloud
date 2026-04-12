package appconfig

import (
	"errors"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	ServerAddr   string
	StorageToken string
	Username     string
	Password     string

	Bucket       string
	Region       string
	Endpoint     string
	AccessKey    string
	SecretKey    string
	UsePathStyle bool
}

func LoadFromEnv() (Config, error) {
	_ = godotenv.Load()

	cfg := Config{
		ServerAddr: getEnv("SERVER_ADDR", "0.0.0.0:8080"),
		Username:   strings.TrimSpace(getEnv("AUTH_USERNAME", "admin")),
		Password:   getEnv("AUTH_PASSWORD", "admin@123"),
		Bucket:     strings.TrimSpace(os.Getenv("S3_BUCKET")),

		Region:       getEnv("S3_REGION", "us-east-1"),
		Endpoint:     strings.TrimSpace(os.Getenv("S3_ENDPOINT")),
		AccessKey:    strings.TrimSpace(os.Getenv("S3_ACCESS_KEY")),
		SecretKey:    strings.TrimSpace(os.Getenv("S3_SECRET_KEY")),
		UsePathStyle: parseBool(getEnv("S3_USE_PATH_STYLE", "true")),
	}

	if cfg.Bucket == "" {
		return Config{}, errors.New("S3_BUCKET is required")
	}
	if cfg.Username == "" {
		return Config{}, errors.New("AUTH_USERNAME is required")
	}
	if strings.TrimSpace(cfg.Password) == "" {
		return Config{}, errors.New("AUTH_PASSWORD is required")
	}

	return cfg, nil
}

func parseBool(v string) bool {
	return strings.EqualFold(v, "1") || strings.EqualFold(v, "true") || strings.EqualFold(v, "yes")
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
