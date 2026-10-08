package appconfig

import (
	"database/sql"
	"errors"
	"log"
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

const (
	RoleOwner = "owner"
	RoleUser  = "user"
)

type UserPermissions struct {
	CanReadFiles         bool `json:"canReadFiles"`
	CanWriteFiles        bool `json:"canWriteFiles"`
	CanManageConnections bool `json:"canManageConnections"`
	CanManageSettings    bool `json:"canManageSettings"`
	CanUseSFTP           bool `json:"canUseSftp"`
}

type User struct {
	ID          int64           `json:"id"`
	Username    string          `json:"username"`
	Role        string          `json:"role"`
	IsActive    bool            `json:"isActive"`
	CreatedAt   string          `json:"createdAt"`
	UpdatedAt   string          `json:"updatedAt"`
	Permissions UserPermissions `json:"permissions"`
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

var ErrLastOwner = errors.New("cannot deactivate the last owner")
var ErrUserNotFound = errors.New("user not found")

func Load() (*Config, error) {
	_ = godotenv.Load()

	if err := os.MkdirAll(configDir, 0755); err != nil {
		return nil, err
	}

	dbPath := getEnv("CONFIG_DB_PATH", dbFile)
	// After godotenv.Load, so an APP_SECRET in .env is honoured
	if err := initKeys(dbPath); err != nil {
		return nil, err
	}

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
		if legacyDecrypts > 0 {
			// Re-encrypt credentials written by older versions with the current key
			if err := cfg.Save(); err != nil {
				_ = db.Close()
				return nil, err
			}
			log.Printf("Re-encrypted %d stored credential(s) with the current encryption key", legacyDecrypts)
			legacyDecrypts = 0
		}
	}

	cfg.AdminAPIKey = strings.TrimSpace(os.Getenv("ADMIN_API_KEY"))

	if err := cfg.ensureOwnerUser(); err != nil {
		_ = db.Close()
		return nil, err
	}
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
	if err != nil {
		return err
	}

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL CHECK(role IN ('owner','user')),
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
	`); err != nil {
		return err
	}

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS user_permissions (
			user_id INTEGER PRIMARY KEY,
			can_read_files INTEGER NOT NULL DEFAULT 1,
			can_write_files INTEGER NOT NULL DEFAULT 1,
			can_manage_connections INTEGER NOT NULL DEFAULT 0,
			can_manage_settings INTEGER NOT NULL DEFAULT 0,
			can_use_sftp INTEGER NOT NULL DEFAULT 1,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		);
	`); err != nil {
		return err
	}

	if _, err := db.Exec(`ALTER TABLE user_permissions ADD COLUMN can_use_sftp INTEGER NOT NULL DEFAULT 1`); err != nil {
		if !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
			return err
		}
	}

	_, err = db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_active_owner
		ON users(role)
		WHERE role='owner' AND is_active=1;
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

func defaultPermissionsByRole(role string) UserPermissions {
	if role == RoleOwner {
		return UserPermissions{
			CanReadFiles:         true,
			CanWriteFiles:        true,
			CanManageConnections: true,
			CanManageSettings:    true,
			CanUseSFTP:           true,
		}
	}

	return UserPermissions{
		CanReadFiles:         true,
		CanWriteFiles:        true,
		CanManageConnections: false,
		CanManageSettings:    false,
		CanUseSFTP:           true,
	}
}

func (c *Config) ensureOwnerUser() error {
	if c.db == nil {
		return errors.New("config database is not initialized")
	}

	ownerUsername := strings.TrimSpace(c.AdminUser)
	ownerHash := strings.TrimSpace(c.AdminPasswordHash)
	if ownerUsername == "" || ownerHash == "" {
		return nil
	}

	var existingOwnerID int64
	var existingOwnerUsername string
	err := c.db.QueryRow(`
		SELECT id, username
		FROM users
		WHERE role = ? AND is_active = 1
		LIMIT 1
	`, RoleOwner).Scan(&existingOwnerID, &existingOwnerUsername)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	if err == nil && strings.EqualFold(existingOwnerUsername, ownerUsername) {
		if _, err := c.db.Exec(`
			UPDATE users
			SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, ownerHash, existingOwnerID); err != nil {
			return err
		}
		return c.UpsertUserPermissions(existingOwnerID, defaultPermissionsByRole(RoleOwner))
	}

	if err == nil && !strings.EqualFold(existingOwnerUsername, ownerUsername) {
		return nil
	}

	user, err := c.GetUserByUsername(ownerUsername)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	if errors.Is(err, sql.ErrNoRows) {
		created, err := c.CreateUser(ownerUsername, ownerHash, RoleOwner, true)
		if err != nil {
			return err
		}
		return c.UpsertUserPermissions(created.ID, defaultPermissionsByRole(RoleOwner))
	}

	if _, err := c.db.Exec(`
		UPDATE users
		SET role = ?, is_active = 1, password_hash = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, RoleOwner, ownerHash, user.ID); err != nil {
		return err
	}

	return c.UpsertUserPermissions(user.ID, defaultPermissionsByRole(RoleOwner))
}

func (c *Config) CreateUser(username, passwordHash, role string, isActive bool) (*User, error) {
	if c.db == nil {
		return nil, errors.New("config database is not initialized")
	}

	username = strings.TrimSpace(username)
	if username == "" {
		return nil, errors.New("username is required")
	}
	if role != RoleOwner && role != RoleUser {
		return nil, errors.New("invalid role")
	}
	if strings.TrimSpace(passwordHash) == "" {
		return nil, errors.New("password hash is required")
	}

	res, err := c.db.Exec(`
		INSERT INTO users(username, password_hash, role, is_active)
		VALUES (?, ?, ?, ?)
	`, username, passwordHash, role, boolToInt(isActive))
	if err != nil {
		return nil, err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	if err := c.UpsertUserPermissions(id, defaultPermissionsByRole(role)); err != nil {
		return nil, err
	}

	return c.GetUserByID(id)
}

func (c *Config) CreateLocalUser(username, password string) (*User, error) {
	hash, err := hashSecret(password)
	if err != nil {
		return nil, err
	}

	role := RoleUser
	var ownerCount int
	if err := c.db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = ? AND is_active = 1`, RoleOwner).Scan(&ownerCount); err != nil {
		return nil, err
	}
	if ownerCount == 0 {
		role = RoleOwner
	}

	return c.CreateUser(username, hash, role, true)
}

func (c *Config) GetUserByID(id int64) (*User, error) {
	if c.db == nil {
		return nil, errors.New("config database is not initialized")
	}

	var u User
	var isActive int
	err := c.db.QueryRow(`
		SELECT id, username, role, is_active, created_at, updated_at
		FROM users
		WHERE id = ?
	`, id).Scan(&u.ID, &u.Username, &u.Role, &isActive, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	u.IsActive = isActive == 1

	perms, err := c.GetUserPermissions(u.ID)
	if err != nil {
		return nil, err
	}
	u.Permissions = perms
	return &u, nil
}

func (c *Config) GetUserByUsername(username string) (*User, error) {
	if c.db == nil {
		return nil, errors.New("config database is not initialized")
	}

	username = strings.TrimSpace(username)
	var u User
	var isActive int
	err := c.db.QueryRow(`
		SELECT id, username, role, is_active, created_at, updated_at
		FROM users
		WHERE username = ?
	`, username).Scan(&u.ID, &u.Username, &u.Role, &isActive, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	u.IsActive = isActive == 1

	perms, err := c.GetUserPermissions(u.ID)
	if err != nil {
		return nil, err
	}
	u.Permissions = perms
	return &u, nil
}

func (c *Config) GetUserPasswordHashByUsername(username string) (string, error) {
	if c.db == nil {
		return "", errors.New("config database is not initialized")
	}
	username = strings.TrimSpace(username)
	var hash string
	err := c.db.QueryRow(`SELECT password_hash FROM users WHERE username = ?`, username).Scan(&hash)
	if err != nil {
		return "", err
	}
	return hash, nil
}

func (c *Config) VerifyUserPassword(username, password string) (*User, bool, error) {
	u, err := c.GetUserByUsername(strings.TrimSpace(username))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if !u.IsActive {
		return nil, false, nil
	}

	hash, err := c.GetUserPasswordHashByUsername(u.Username)
	if err != nil {
		return nil, false, err
	}

	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return nil, false, nil
	}

	return u, true, nil
}

func (c *Config) ListUsers() ([]User, error) {
	if c.db == nil {
		return nil, errors.New("config database is not initialized")
	}

	rows, err := c.db.Query(`
		SELECT id, username, role, is_active, created_at, updated_at
		FROM users
		ORDER BY username ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]User, 0)
	for rows.Next() {
		var u User
		var isActive int
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &isActive, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		u.IsActive = isActive == 1
		perms, err := c.GetUserPermissions(u.ID)
		if err != nil {
			return nil, err
		}
		u.Permissions = perms
		users = append(users, u)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return users, nil
}

func (c *Config) GetUserPermissions(userID int64) (UserPermissions, error) {
	if c.db == nil {
		return UserPermissions{}, errors.New("config database is not initialized")
	}

	var p UserPermissions
	var readFiles, writeFiles, manageConnections, manageSettings, useSFTP int
	err := c.db.QueryRow(`
		SELECT can_read_files, can_write_files, can_manage_connections, can_manage_settings, can_use_sftp
		FROM user_permissions
		WHERE user_id = ?
	`, userID).Scan(&readFiles, &writeFiles, &manageConnections, &manageSettings, &useSFTP)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return UserPermissions{}, nil
		}
		return UserPermissions{}, err
	}

	p.CanReadFiles = readFiles == 1
	p.CanWriteFiles = writeFiles == 1
	p.CanManageConnections = manageConnections == 1
	p.CanManageSettings = manageSettings == 1
	p.CanUseSFTP = useSFTP == 1
	return p, nil
}

func (c *Config) UpsertUserPermissions(userID int64, perms UserPermissions) error {
	if c.db == nil {
		return errors.New("config database is not initialized")
	}

	_, err := c.db.Exec(`
		INSERT INTO user_permissions (
			user_id,
			can_read_files,
			can_write_files,
			can_manage_connections,
			can_manage_settings,
			can_use_sftp,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id) DO UPDATE SET
			can_read_files=excluded.can_read_files,
			can_write_files=excluded.can_write_files,
			can_manage_connections=excluded.can_manage_connections,
			can_manage_settings=excluded.can_manage_settings,
			can_use_sftp=excluded.can_use_sftp,
			updated_at=CURRENT_TIMESTAMP
	`,
		userID,
		boolToInt(perms.CanReadFiles),
		boolToInt(perms.CanWriteFiles),
		boolToInt(perms.CanManageConnections),
		boolToInt(perms.CanManageSettings),
		boolToInt(perms.CanUseSFTP),
	)
	return err
}

func (c *Config) SetUserActive(userID int64, active bool) error {
	if c.db == nil {
		return errors.New("config database is not initialized")
	}

	if !active {
		var role string
		err := c.db.QueryRow(`SELECT role FROM users WHERE id = ?`, userID).Scan(&role)
		if err != nil {
			return err
		}

		if role == RoleOwner {
			var ownerCount int
			if err := c.db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = ? AND is_active = 1`, RoleOwner).Scan(&ownerCount); err != nil {
				return err
			}
			if ownerCount <= 1 {
				return ErrLastOwner
			}
		}
	}

	_, err := c.db.Exec(`
		UPDATE users
		SET is_active = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, boolToInt(active), userID)
	return err
}

func (c *Config) SetUserPassword(userID int64, password string) error {
	if c.db == nil {
		return errors.New("config database is not initialized")
	}

	password = strings.TrimSpace(password)
	if password == "" {
		return errors.New("password is required")
	}

	hash, err := hashSecret(password)
	if err != nil {
		return err
	}

	_, err = c.db.Exec(`
		UPDATE users
		SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, hash, userID)
	return err
}

func (c *Config) DeleteUser(userID int64) error {
	if c.db == nil {
		return errors.New("config database is not initialized")
	}

	var role string
	var isActive int
	err := c.db.QueryRow(`SELECT role, is_active FROM users WHERE id = ?`, userID).Scan(&role, &isActive)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrUserNotFound
		}
		return err
	}

	if role == RoleOwner && isActive == 1 {
		var ownerCount int
		if err := c.db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = ? AND is_active = 1`, RoleOwner).Scan(&ownerCount); err != nil {
			return err
		}
		if ownerCount <= 1 {
			return ErrLastOwner
		}
	}

	res, err := c.db.Exec(`DELETE FROM users WHERE id = ?`, userID)
	if err != nil {
		return err
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrUserNotFound
	}

	return nil
}
