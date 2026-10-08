package appconfig

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
)

const encPrefix = "enc:"
const keyFileName = "app.key"

// legacyDefaultKey was the built-in key used when APP_SECRET was not set.
// It is only kept to decrypt data written by older versions; nothing new is encrypted with it.
var legacyDefaultKey = []byte("private-storage-32-byte-key-0123")

var (
	// masterKey encrypts everything written to the database.
	masterKey []byte
	// legacyKeys are tried when decrypting values written by older versions.
	legacyKeys [][]byte
	// legacyDecrypts counts values that were decrypted with a legacy key and need re-encrypting.
	legacyDecrypts int
)

// initKeys sets up the encryption key. With APP_SECRET set, the key is SHA-256(APP_SECRET);
// otherwise a random key is generated once and stored next to the config database.
func initKeys(dbPath string) error {
	legacyKeys = [][]byte{legacyDefaultKey}
	legacyDecrypts = 0

	if secret := os.Getenv("APP_SECRET"); secret != "" {
		if len(secret) < 16 {
			log.Printf("WARNING: APP_SECRET is shorter than 16 characters; use a long random value (e.g. openssl rand -hex 32)")
		}
		sum := sha256.Sum256([]byte(secret))
		masterKey = sum[:]
		if len(secret) >= 32 {
			// Older versions used the first 32 bytes of APP_SECRET directly as the key
			legacyKeys = append(legacyKeys, []byte(secret[:32]))
		}
		return nil
	}

	key, err := loadOrCreateKeyFile(filepath.Join(filepath.Dir(dbPath), keyFileName))
	if err != nil {
		return err
	}
	masterKey = key
	return nil
}

func loadOrCreateKeyFile(path string) ([]byte, error) {
	if data, err := os.ReadFile(path); err == nil {
		key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(data)))
		if err != nil || len(key) != 32 {
			return nil, fmt.Errorf("invalid encryption key file %s", path)
		}
		return key, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}

	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, []byte(base64.StdEncoding.EncodeToString(key)+"\n"), 0600); err != nil {
		return nil, err
	}
	log.Printf("APP_SECRET not set: generated an encryption key at %s (keep this file with the database)", path)
	return key, nil
}

func encrypt(plaintext string) (string, error) {
	if plaintext == "" || strings.HasPrefix(plaintext, encPrefix) {
		return plaintext, nil
	}
	gcm, err := newGCM(masterKey)
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

// decrypt returns the plaintext, or the input unchanged if it can't be decrypted
// (so a wrong key never overwrites the stored value).
func decrypt(cipherText string) string {
	if !strings.HasPrefix(cipherText, encPrefix) {
		return cipherText
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(cipherText, encPrefix))
	if err != nil {
		return cipherText
	}

	if plaintext, ok := openWith(masterKey, data); ok {
		return plaintext
	}
	for _, key := range legacyKeys {
		if plaintext, ok := openWith(key, data); ok {
			legacyDecrypts++
			return plaintext
		}
	}

	log.Printf("WARNING: could not decrypt a stored credential; was APP_SECRET or %s changed?", keyFileName)
	return cipherText
}

func openWith(key, data []byte) (string, bool) {
	gcm, err := newGCM(key)
	if err != nil {
		return "", false
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", false
	}
	plaintext, err := gcm.Open(nil, data[:nonceSize], data[nonceSize:], nil)
	if err != nil {
		return "", false
	}
	return string(plaintext), true
}

func newGCM(key []byte) (cipher.AEAD, error) {
	if len(key) != 32 {
		return nil, errors.New("encryption key is not initialized")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
