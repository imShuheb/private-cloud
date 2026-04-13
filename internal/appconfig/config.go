package appconfig

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Connection struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Bucket       string `json:"bucket"`
	Region       string `json:"region"`
	Endpoint     string `json:"endpoint"`
	AccessKey    string `json:"accessKey"`
	SecretKey    string `json:"secretKey"`
	UsePathStyle bool   `json:"usePathStyle"`
}

type Config struct {
	ServerAddr  string       `json:"serverAddr"`
	AdminUser   string       `json:"adminUser"`
	AdminPass   string       `json:"adminPass"`
	Connections []Connection `json:"connections"`
	ActiveID    string       `json:"activeId"`
}

const configDir = "config"
const configFile = "config/config.json"
const encPrefix = "enc:"

// masterKey should ideally be from an env var
var masterKey = []byte("private-storage-32-byte-key-0123")

func init() {
	if k := os.Getenv("APP_SECRET"); len(k) >= 16 {
		// Use hash of secret for stable 32-byte key if provided
		masterKey = []byte(k[:32])
		if len(masterKey) < 32 {
			padding := make([]byte, 32-len(masterKey))
			masterKey = append(masterKey, padding...)
		}
	}
}

func encrypt(plaintext string) (string, error) {
	if plaintext == "" || strings.HasPrefix(plaintext, encPrefix) {
		return plaintext, nil
	}
	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return encPrefix + base64.StdEncoding.EncodeToString(ciphertext), nil
}

func decrypt(cipherText string) string {
	if !strings.HasPrefix(cipherText, encPrefix) {
		return cipherText
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(cipherText, encPrefix))
	if err != nil {
		return cipherText
	}
	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return cipherText
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return cipherText
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return cipherText
	}
	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return cipherText
	}
	return string(plaintext)
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	var cfg *Config

	// 1. Try Loading from File
	if _, err := os.Stat(configFile); err == nil {
		data, err := os.ReadFile(configFile)
		if err == nil {
			var loaded Config
			if err := json.Unmarshal(data, &loaded); err == nil {
				cfg = &loaded
			}
		}
	}

	// 2. Fallback to ENV (migration/default path)
	if cfg == nil {
		cfg = &Config{
			ServerAddr: getEnv("SERVER_ADDR", "0.0.0.0:8080"),
			AdminUser:  getEnv("AUTH_USERNAME", "admin"),
			AdminPass:  getEnv("AUTH_PASSWORD", "admin@123"),
			ActiveID:   "default",
		}

		// Check if we have S3 envs to create a default connection
		bucket := os.Getenv("S3_BUCKET")
		if bucket != "" {
			cfg.Connections = []Connection{
				{
					ID:           "default",
					Name:         "Default Storage",
					Bucket:       bucket,
					Region:       getEnv("S3_REGION", "us-east-1"),
					Endpoint:     os.Getenv("S3_ENDPOINT"),
					AccessKey:    os.Getenv("S3_ACCESS_KEY"),
					SecretKey:    os.Getenv("S3_SECRET_KEY"),
					UsePathStyle: parseBool(getEnv("S3_USE_PATH_STYLE", "true")),
				},
			}
		}
	}

	// Decrypt sensitive fields
	for i := range cfg.Connections {
		cfg.Connections[i].AccessKey = decrypt(cfg.Connections[i].AccessKey)
		cfg.Connections[i].SecretKey = decrypt(cfg.Connections[i].SecretKey)
	}

	return cfg, nil
}

func (c *Config) Save() error {
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return err
	}

	// Create a copy to encrypt without modifying in-memory config
	temp := *c
	temp.Connections = make([]Connection, len(c.Connections))
	copy(temp.Connections, c.Connections)

	for i := range temp.Connections {
		encAK, _ := encrypt(temp.Connections[i].AccessKey)
		encSK, _ := encrypt(temp.Connections[i].SecretKey)
		temp.Connections[i].AccessKey = encAK
		temp.Connections[i].SecretKey = encSK
	}

	data, err := json.MarshalIndent(temp, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configFile, data, 0644)
}
func (c *Config) IsConfigured() bool {
	return len(c.Connections) > 0 && c.AdminUser != "" && c.AdminPass != ""
}

func (c *Config) GetActiveConnection() *Connection {
	for i := range c.Connections {
		if c.Connections[i].ID == c.ActiveID {
			return &c.Connections[i]
		}
	}
	if len(c.Connections) > 0 {
		return &c.Connections[0]
	}
	return nil
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
