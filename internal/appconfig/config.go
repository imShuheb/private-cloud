package appconfig

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
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
	ServerAddr        string       `json:"serverAddr"`
	AdminUser         string       `json:"adminUser"`
	AdminPass         string       `json:"adminPass"`
	AdminPasswordHash string       `json:"-"`
	AdminAPIKey       string       `json:"-"`
	SFTPEnabled       bool         `json:"-"`
	SFTPAddr          string       `json:"-"`
	SFTPUser          string       `json:"-"`
	SFTPPassword      string       `json:"-"`
	TLSCertFile       string       `json:"tlsCertFile,omitempty"`
	TLSKeyFile        string       `json:"tlsKeyFile,omitempty"`
	Connections       []Connection `json:"connections"`
	ActiveID          string       `json:"activeId"`

	db *sql.DB
}

const configDir = "config"
const dbFile = "config/private-storage.db"
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

	if err := os.MkdirAll(configDir, 0755); err != nil {
		return nil, err
	}

	dbPath := getEnv("CONFIG_DB_PATH", dbFile)
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	if err := ensureSchema(db); err != nil {
		_ = db.Close()
		return nil, err
	}

	cfg, err := loadFromDB(db)
	if err != nil {
		_ = db.Close()
		return nil, err
	}

	if cfg == nil {
		cfg, err = bootstrapConfig()
		if err != nil {
			_ = db.Close()
			return nil, err
		}
		cfg.db = db
		if err := cfg.Save(); err != nil {
			_ = db.Close()
			return nil, err
		}
	} else {
		cfg.db = db
	}

	cfg.AdminAPIKey = strings.TrimSpace(os.Getenv("ADMIN_API_KEY"))
	return cfg, nil
}

func (c *Config) Save() error {
	if c.db == nil {
		return errors.New("config database is not initialized")
	}

	if err := os.MkdirAll(filepath.Dir(getEnv("CONFIG_DB_PATH", dbFile)), 0755); err != nil {
		return err
	}

	if c.AdminPasswordHash == "" && c.AdminPass != "" {
		h, err := hashSecret(c.AdminPass)
		if err != nil {
			return err
		}
		c.AdminPasswordHash = h
	}

	tx, err := c.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := upsertSetting(tx, "server_addr", c.ServerAddr); err != nil {
		return err
	}
	if err := upsertSetting(tx, "admin_user", c.AdminUser); err != nil {
		return err
	}
	if err := upsertSetting(tx, "admin_password_hash", c.AdminPasswordHash); err != nil {
		return err
	}
	if err := upsertSetting(tx, "active_id", c.ActiveID); err != nil {
		return err
	}
	if err := upsertSetting(tx, "tls_cert_file", c.TLSCertFile); err != nil {
		return err
	}
	if err := upsertSetting(tx, "tls_key_file", c.TLSKeyFile); err != nil {
		return err
	}
	if err := upsertSetting(tx, "sftp_enabled", boolToString(c.SFTPEnabled)); err != nil {
		return err
	}
	if err := upsertSetting(tx, "sftp_addr", c.SFTPAddr); err != nil {
		return err
	}
	if err := upsertSetting(tx, "sftp_user", c.SFTPUser); err != nil {
		return err
	}
	encSFTPPassword, err := encrypt(c.SFTPPassword)
	if err != nil {
		return err
	}
	if err := upsertSetting(tx, "sftp_password", encSFTPPassword); err != nil {
		return err
	}

	if _, err := tx.Exec(`DELETE FROM connections`); err != nil {
		return err
	}

	for _, conn := range c.Connections {
		encAK, err := encrypt(conn.AccessKey)
		if err != nil {
			return err
		}
		encSK, err := encrypt(conn.SecretKey)
		if err != nil {
			return err
		}

		if _, err := tx.Exec(`
			INSERT INTO connections(id, name, bucket, region, endpoint, access_key, secret_key, use_path_style)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, conn.ID, conn.Name, conn.Bucket, conn.Region, conn.Endpoint, encAK, encSK, boolToInt(conn.UsePathStyle)); err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	// Keep plaintext out of memory after persisting a hash.
	c.AdminPass = ""
	return nil
}

func (c *Config) IsConfigured() bool {
	return len(c.Connections) > 0 && c.AdminUser != "" && c.AdminPasswordHash != ""
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

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

func boolToString(v bool) string {
	if v {
		return "true"
	}
	return "false"
}

func hashSecret(secret string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(secret), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func (c *Config) VerifyAdminPassword(password string) (bool, bool) {
	if strings.TrimSpace(c.AdminPasswordHash) != "" {
		err := bcrypt.CompareHashAndPassword([]byte(c.AdminPasswordHash), []byte(password))
		return err == nil, false
	}

	if c.AdminPass == "" || c.AdminPass != password {
		return false, false
	}

	hash, err := hashSecret(password)
	if err != nil {
		return true, false
	}

	c.AdminPasswordHash = hash
	c.AdminPass = ""
	return true, true
}

func ensureSchema(db *sql.DB) error {
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
	`); err != nil {
		return err
	}

	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS connections (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			bucket TEXT NOT NULL,
			region TEXT NOT NULL,
			endpoint TEXT NOT NULL DEFAULT '',
			access_key TEXT NOT NULL,
			secret_key TEXT NOT NULL,
			use_path_style INTEGER NOT NULL DEFAULT 0
		);
	`)
	return err
}

func loadFromDB(db *sql.DB) (*Config, error) {
	settings, err := readSettings(db)
	if err != nil {
		return nil, err
	}

	connections, err := readConnections(db)
	if err != nil {
		return nil, err
	}

	if len(settings) == 0 && len(connections) == 0 {
		return nil, nil
	}

	cfg := &Config{
		ServerAddr:        settingOrFallback(settings, "server_addr", getEnv("SERVER_ADDR", "0.0.0.0:8080")),
		AdminUser:         settingOrFallback(settings, "admin_user", getEnv("AUTH_USERNAME", "admin")),
		AdminPasswordHash: settings["admin_password_hash"],
		ActiveID:          settings["active_id"],
		TLSCertFile:       settings["tls_cert_file"],
		TLSKeyFile:        settings["tls_key_file"],
		SFTPEnabled:       parseBool(settingOrFallback(settings, "sftp_enabled", getEnv("SFTP_ENABLED", "false"))),
		SFTPAddr:          settingOrFallback(settings, "sftp_addr", getEnv("SFTP_ADDR", "0.0.0.0:2022")),
		SFTPUser:          settingOrFallback(settings, "sftp_user", strings.TrimSpace(os.Getenv("SFTP_USER"))),
		SFTPPassword:      decrypt(settingOrFallback(settings, "sftp_password", os.Getenv("SFTP_PASSWORD"))),
		Connections:       connections,
	}

	if cfg.AdminPasswordHash == "" {
		legacyPass := settings["admin_pass"]
		if legacyPass != "" {
			cfg.AdminPass = legacyPass
		}
	}

	return cfg, nil
}

func readSettings(db *sql.DB) (map[string]string, error) {
	rows, err := db.Query(`SELECT key, value FROM settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := map[string]string{}
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		settings[key] = value
	}
	return settings, rows.Err()
}

func readConnections(db *sql.DB) ([]Connection, error) {
	rows, err := db.Query(`
		SELECT id, name, bucket, region, endpoint, access_key, secret_key, use_path_style
		FROM connections
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	conns := []Connection{}
	for rows.Next() {
		var conn Connection
		var usePathStyle int
		if err := rows.Scan(&conn.ID, &conn.Name, &conn.Bucket, &conn.Region, &conn.Endpoint, &conn.AccessKey, &conn.SecretKey, &usePathStyle); err != nil {
			return nil, err
		}
		conn.AccessKey = decrypt(conn.AccessKey)
		conn.SecretKey = decrypt(conn.SecretKey)
		conn.UsePathStyle = usePathStyle == 1
		conns = append(conns, conn)
	}

	return conns, rows.Err()
}

func settingOrFallback(settings map[string]string, key, fallback string) string {
	v, ok := settings[key]
	if !ok || strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}

func upsertSetting(tx *sql.Tx, key, value string) error {
	_, err := tx.Exec(`
		INSERT INTO settings(key, value) VALUES(?, ?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value
	`, key, value)
	return err
}

func bootstrapConfig() (*Config, error) {
	password := getEnv("AUTH_PASSWORD", "admin@123")
	passwordHash, err := hashSecret(password)
	if err != nil {
		return nil, err
	}

	cfg := &Config{
		ServerAddr:        getEnv("SERVER_ADDR", "0.0.0.0:8080"),
		AdminUser:         getEnv("AUTH_USERNAME", "admin"),
		AdminPasswordHash: passwordHash,
		SFTPEnabled:       parseBool(getEnv("SFTP_ENABLED", "false")),
		SFTPAddr:          getEnv("SFTP_ADDR", "0.0.0.0:2022"),
		SFTPUser:          strings.TrimSpace(os.Getenv("SFTP_USER")),
		SFTPPassword:      os.Getenv("SFTP_PASSWORD"),
		TLSCertFile:       strings.TrimSpace(os.Getenv("TLS_CERT_FILE")),
		TLSKeyFile:        strings.TrimSpace(os.Getenv("TLS_KEY_FILE")),
		ActiveID:          "default",
	}

	bucket := strings.TrimSpace(os.Getenv("S3_BUCKET"))
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

	return cfg, nil
}

type RuntimeSettings struct {
	SFTPEnabled  bool
	SFTPAddr     string
	SFTPUser     string
	SFTPPassword string
}

func (c *Config) GetRuntimeSettings() RuntimeSettings {
	return RuntimeSettings{
		SFTPEnabled:  c.SFTPEnabled,
		SFTPAddr:     c.SFTPAddr,
		SFTPUser:     c.SFTPUser,
		SFTPPassword: c.SFTPPassword,
	}
}

func (c *Config) SetRuntimeSettings(s RuntimeSettings) {
	c.SFTPEnabled = s.SFTPEnabled
	c.SFTPAddr = strings.TrimSpace(s.SFTPAddr)
	c.SFTPUser = strings.TrimSpace(s.SFTPUser)
	c.SFTPPassword = s.SFTPPassword
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
