package api

import (
	"bytes"
	"net"
	"net/http/httptest"
	"os"
	"path/filepath"
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
