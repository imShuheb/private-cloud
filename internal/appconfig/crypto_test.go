package appconfig

import (
	"database/sql"
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func encryptWith(t *testing.T, key []byte, plaintext string) string {
	t.Helper()
	saved := masterKey
	masterKey = key
	defer func() { masterKey = saved }()
	out, err := encrypt(plaintext)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestAppSecretOfAnyLengthWorks(t *testing.T) {
	for _, secret := range []string{"short", "sixteen-chars-xx", "between-16-and-31-chars", strings.Repeat("a", 64)} {
		t.Setenv("APP_SECRET", secret)
		if err := initKeys(filepath.Join(t.TempDir(), "db")); err != nil {
			t.Fatalf("APP_SECRET of length %d: %v", len(secret), err)
		}
		enc, err := encrypt("value")
		if err != nil {
			t.Fatal(err)
		}
		if got := decrypt(enc); got != "value" {
			t.Fatalf("APP_SECRET of length %d: round trip gave %q", len(secret), got)
		}
	}
}

func TestGeneratesAndReusesKeyFileWithoutAppSecret(t *testing.T) {
	t.Setenv("APP_SECRET", "")
	dbPath := filepath.Join(t.TempDir(), "private-storage.db")
	if err := initKeys(dbPath); err != nil {
		t.Fatal(err)
	}
	enc, _ := encrypt("value")

	info, err := os.Stat(filepath.Join(filepath.Dir(dbPath), keyFileName))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("key file permissions = %v, want 0600", info.Mode().Perm())
	}
	if string(masterKey) == string(legacyDefaultKey) {
		t.Fatal("must not use the built-in default key")
	}

	// A restart reads the same key file
	if err := initKeys(dbPath); err != nil {
		t.Fatal(err)
	}
	if got := decrypt(enc); got != "value" {
		t.Fatalf("after restart got %q", got)
	}
}

func TestDecryptsLegacyValues(t *testing.T) {
	secret := strings.Repeat("s", 40)
	legacyDefault := encryptWith(t, legacyDefaultKey, "from-default-key")
	legacyRaw := encryptWith(t, []byte(secret[:32]), "from-raw-secret")

	t.Setenv("APP_SECRET", secret)
	if err := initKeys(filepath.Join(t.TempDir(), "db")); err != nil {
		t.Fatal(err)
	}
	if got := decrypt(legacyDefault); got != "from-default-key" {
		t.Fatalf("legacy default key: got %q", got)
	}
	if got := decrypt(legacyRaw); got != "from-raw-secret" {
		t.Fatalf("legacy raw secret: got %q", got)
	}
	if legacyDecrypts != 2 {
		t.Fatalf("legacyDecrypts = %d, want 2", legacyDecrypts)
	}
}

func TestWrongKeyKeepsStoredValue(t *testing.T) {
	t.Setenv("APP_SECRET", "first-secret-first-secret")
	_ = initKeys(filepath.Join(t.TempDir(), "db"))
	enc, _ := encrypt("value")

	t.Setenv("APP_SECRET", "another-secret-another-secret")
	_ = initKeys(filepath.Join(t.TempDir(), "db"))
	if got := decrypt(enc); got != enc {
		t.Fatalf("expected the encrypted value back unchanged, got %q", got)
	}
}

func TestLoadReencryptsLegacyCredentials(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	dbPath := filepath.Join(dir, "config", "private-storage.db")
	t.Setenv("CONFIG_DB_PATH", dbPath)
	t.Setenv("APP_SECRET", "")
	t.Setenv("AUTH_USERNAME", "admin")
	t.Setenv("AUTH_PASSWORD", "admin@123")

	// First start creates the database
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	cfg.Connections = []Connection{{ID: "c1", Name: "r2", Bucket: "b", AccessKey: "AK", SecretKey: "SK"}}
	if err := cfg.Save(); err != nil {
		t.Fatal(err)
	}
	_ = cfg.db.Close()

	// Simulate a database written by an older version: default key, no key file
	legacyAK := encryptWith(t, legacyDefaultKey, "AK")
	legacySK := encryptWith(t, legacyDefaultKey, "SK")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE connections SET access_key = ?, secret_key = ?`, legacyAK, legacySK); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	_ = os.Remove(filepath.Join(filepath.Dir(dbPath), keyFileName))

	cfg, err = Load()
	if err != nil {
		t.Fatal(err)
	}
	defer cfg.db.Close()
	if cfg.Connections[0].AccessKey != "AK" || cfg.Connections[0].SecretKey != "SK" {
		t.Fatalf("credentials not decrypted: %+v", cfg.Connections[0])
	}

	var storedAK string
	if err := cfg.db.QueryRow(`SELECT access_key FROM connections`).Scan(&storedAK); err != nil {
		t.Fatal(err)
	}
	if storedAK == legacyAK {
		t.Fatal("legacy value was not re-encrypted")
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(storedAK, encPrefix))
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := openWith(legacyDefaultKey, raw); ok {
		t.Fatal("stored value is still readable with the legacy default key")
	}
	if got := decrypt(storedAK); got != "AK" {
		t.Fatalf("re-encrypted value decrypts to %q", got)
	}
}
