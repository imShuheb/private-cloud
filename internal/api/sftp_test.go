package api

import (
	"bytes"
	"errors"
	"fmt"
	"time"

	"net"
	"net/http/httptest"
	"os"
	"path/filepath"
	"private-storage/internal/storage"
	"testing"

	"private-storage/internal/appconfig"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

// startSFTP runs an SFTP server on a free local port, backed by the test env's config and store.
func startSFTP(t *testing.T, e *testEnv) string {
	t.Helper()
	s := &Server{cfg: e.cfg, store: e.store, logins: newLoginGuard()}
	c := newSFTPController(s)
	if err := c.apply(sftpRuntimeConfig{enabled: true, addr: "127.0.0.1:0"}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		c.mu.Lock()
		defer c.mu.Unlock()
		_ = c.stopLocked()
	})
	return c.ln.Addr().String()
}

func dialSFTP(addr, user, pass string, hostKey *ssh.PublicKey) (*sftp.Client, error) {
	conn, err := ssh.Dial("tcp", addr, &ssh.ClientConfig{
		User: user,
		Auth: []ssh.AuthMethod{ssh.Password(pass)},
		HostKeyCallback: func(_ string, _ net.Addr, key ssh.PublicKey) error {
			if hostKey != nil {
				*hostKey = key
			}
			return nil
		},
	})
	if err != nil {
		return nil, err
	}
	client, err := sftp.NewClient(conn)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	return client, nil
}

func TestSFTPHostKeyPersistsAcrossRestarts(t *testing.T) {
	e := newTestEnv(t)

	var first, second ssh.PublicKey
	c1, err := dialSFTP(startSFTP(t, e), "admin", "admin-password", &first)
	if err != nil {
		t.Fatal(err)
	}
	_ = c1.Close()

	// A new controller stands in for a server restart
	c2, err := dialSFTP(startSFTP(t, e), "admin", "admin-password", &second)
	if err != nil {
		t.Fatal(err)
	}
	_ = c2.Close()

	if !bytes.Equal(first.Marshal(), second.Marshal()) {
		t.Fatal("host key changed between restarts")
	}
	if first.Type() != ssh.KeyAlgoED25519 {
		t.Errorf("host key type %s", first.Type())
	}
	info, err := os.Stat(filepath.Join(appconfig.Dir(), sftpHostKeyFile))
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("host key file mode %o", perm)
	}
}

func TestSFTPLoginRateLimit(t *testing.T) {
	e := newTestEnv(t)
	addr := startSFTP(t, e)

	for i := 0; i < 10; i++ {
		if c, err := dialSFTP(addr, "admin", "wrong", nil); err == nil {
			_ = c.Close()
			t.Fatal("wrong password accepted")
		}
	}
	if c, err := dialSFTP(addr, "admin", "admin-password", nil); err == nil {
		_ = c.Close()
		t.Fatal("login allowed after 10 failures")
	}
}

func TestSFTPFilesAndImmediateRevoke(t *testing.T) {
	e := newTestEnv(t)
	user, err := e.cfg.CreateLocalUser("phone", "phone-password")
	if err != nil {
		t.Fatal(err)
	}
	addr := startSFTP(t, e)

	client, err := dialSFTP(addr, "phone", "phone-password", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	entries, err := client.ReadDir("/docs")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("docs has %d entries", len(entries))
	}

	f, err := client.Create("/docs/upload.txt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.Write([]byte("hello")); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	listed, err := e.store.ListBrowser(t.Context(), "docs/", "", 100)
	if err != nil {
		t.Fatal(err)
	}
	stored := false
	for _, f := range listed.Files {
		stored = stored || (f.Key == "docs/upload.txt" && f.Size == 5)
	}
	if !stored {
		t.Fatalf("upload not stored: %+v", listed.Files)
	}

	// Disabling the user cuts off the session that is already connected
	if err := e.cfg.SetUserActive(user.ID, false); err != nil {
		t.Fatal(err)
	}
	if _, err := client.ReadDir("/docs"); err == nil {
		t.Fatal("disabled user can still list files")
	}
}

func TestOwnerPasswordChangeSurvivesRestart(t *testing.T) {
	e := newTestEnv(t)
	owner, err := e.cfg.GetUserByUsername("admin")
	if err != nil {
		t.Fatal(err)
	}
	if err := e.cfg.SetUserPassword(owner.ID, "a-new-strong-password"); err != nil {
		t.Fatal(err)
	}

	reloaded, err := appconfig.Load()
	if err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := reloaded.VerifyUserPassword("admin", "a-new-strong-password"); !ok {
		t.Fatal("new owner password lost after restart")
	}
	if _, ok, _ := reloaded.VerifyUserPassword("admin", "admin-password"); ok {
		t.Fatal("old owner password works again after restart")
	}
}

func TestOwnerUsesDefaultPassword(t *testing.T) {
	e := newTestEnv(t)
	if usesDefault, err := e.cfg.OwnerUsesDefaultPassword(); err != nil || usesDefault {
		t.Fatalf("got %v, %v", usesDefault, err)
	}
	owner, _ := e.cfg.GetUserByUsername("admin")
	if err := e.cfg.SetUserPassword(owner.ID, appconfig.DefaultAdminPassword); err != nil {
		t.Fatal(err)
	}
	if usesDefault, err := e.cfg.OwnerUsesDefaultPassword(); err != nil || !usesDefault {
		t.Fatalf("got %v, %v", usesDefault, err)
	}
}

func TestClientIPTrustsProxyOnlyWhenEnabled(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "172.18.0.2:5000"
	req.Header.Set("X-Forwarded-For", "6.6.6.6, 203.0.113.9")

	old := trustProxyHeaders
	t.Cleanup(func() { trustProxyHeaders = old })

	trustProxyHeaders = false
	if got := clientIP(req); got != "172.18.0.2" {
		t.Errorf("untrusted: %s", got)
	}

	trustProxyHeaders = true
	if got := clientIP(req); got != "203.0.113.9" {
		t.Errorf("trusted proxy: %s", got)
	}

	// Headers from a public address are ignored even when trust is on
	req.RemoteAddr = "198.51.100.7:5000"
	if got := clientIP(req); got != "198.51.100.7" {
		t.Errorf("public peer: %s", got)
	}
}

// A phone camera folder holds far more files than one listing page (1000)
func TestSFTPLargeFolderAndRename(t *testing.T) {
	e := newTestEnv(t)
	for i := 0; i < 2500; i++ {
		key := fmt.Sprintf("Camera/IMG_%05d.jpg", i)
		e.store.objects[key] = storage.ObjectInfo{Key: key, Size: int64(i + 1), LastModified: time.Now()}
	}
	addr := startSFTP(t, e)
	client, err := dialSFTP(addr, "admin", "admin-password", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	entries, err := client.ReadDir("/Camera")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2500 {
		t.Fatalf("listed %d of 2500 files", len(entries))
	}

	// Stat finds a file past the first page, so sync apps don't upload it again
	info, err := client.Stat("/Camera/IMG_02400.jpg")
	if err != nil || info.Size() != 2401 || info.IsDir() {
		t.Fatalf("stat: %v %v", info, err)
	}
	if info, err := client.Stat("/Camera"); err != nil || !info.IsDir() {
		t.Fatalf("stat folder: %v %v", info, err)
	}
	if _, err := client.Stat("/Camera/missing.jpg"); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stat missing: %v", err)
	}

	// Upload to a temporary name, then rename: the pattern many sync apps use
	f, err := client.Create("/Camera/.IMG_new.jpg.tmp")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.Write([]byte("photo")); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	if err := client.Rename("/Camera/.IMG_new.jpg.tmp", "/Camera/IMG_new.jpg"); err != nil {
		t.Fatal(err)
	}
	e.store.objects[storage.ThumbKey("Camera/IMG_new.jpg")] = storage.ObjectInfo{Key: storage.ThumbKey("Camera/IMG_new.jpg"), Size: 1}
	if err := client.Rename("/Camera/IMG_new.jpg", "/Camera/IMG_moved.jpg"); err != nil {
		t.Fatal(err)
	}
	if _, ok := e.store.objects[storage.ThumbKey("Camera/IMG_moved.jpg")]; !ok {
		t.Error("thumbnail not moved with its file")
	}
	if err := client.Rename("/Camera/IMG_moved.jpg", "/Camera/IMG_new.jpg"); err != nil {
		t.Fatal(err)
	}
	if _, ok := e.store.objects["Camera/.IMG_new.jpg.tmp"]; ok {
		t.Error("temporary file left behind")
	}
	if o, ok := e.store.objects["Camera/IMG_new.jpg"]; !ok || o.Size != 5 {
		t.Errorf("renamed file: %+v %v", o, ok)
	}
	if err := client.PosixRename("/Camera/IMG_new.jpg", "/Camera/IMG_00001.jpg"); err != nil {
		t.Fatalf("posix rename over an existing file: %v", err)
	}
	if err := client.Rename("/Camera", "/Camera2"); err == nil {
		t.Error("folder rename should be refused")
	}
}

func TestSFTPRenameNeedsWritePermission(t *testing.T) {
	e := newTestEnv(t)
	user, err := e.cfg.CreateLocalUser("viewer", "viewer-password")
	if err != nil {
		t.Fatal(err)
	}
	perms, _ := e.cfg.GetUserPermissions(user.ID)
	perms.CanWriteFiles = false
	perms.CanUseSFTP = true
	perms.CanReadFiles = true
	if err := e.cfg.UpsertUserPermissions(user.ID, perms); err != nil {
		t.Fatal(err)
	}
	client, err := dialSFTP(startSFTP(t, e), "viewer", "viewer-password", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	if err := client.Rename("/docs/notes.txt", "/docs/moved.txt"); err == nil {
		t.Fatal("read-only user renamed a file")
	}
	if _, ok := e.store.objects["docs/notes.txt"]; !ok {
		t.Fatal("file was moved")
	}
}
