package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"private-storage/internal/appconfig"
	"private-storage/internal/storage"
)

// memStore is an in-memory storage.Store for tests.
type memStore struct {
	mu      sync.Mutex
	objects map[string]storage.ObjectInfo
}

func newMemStore(objs ...storage.ObjectInfo) *memStore {
	m := &memStore{objects: map[string]storage.ObjectInfo{}}
	for _, o := range objs {
		m.objects[o.Key] = o
	}
	return m
}

func (m *memStore) sorted(prefix string) []storage.ObjectInfo {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []storage.ObjectInfo
	for _, o := range m.objects {
		if strings.HasPrefix(o.Key, prefix) {
			out = append(out, o)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out
}

func (m *memStore) Ping(context.Context) error { return nil }
func (m *memStore) GetStats(context.Context) (storage.DriveStats, error) {
	return storage.DriveStats{}, nil
}
func (m *memStore) ListObjects(_ context.Context, prefix, _ string, _ int32) (storage.ListResult, error) {
	return storage.ListResult{Items: m.sorted(prefix)}, nil
}
func (m *memStore) ListBrowser(_ context.Context, prefix, _ string, _ int32) (storage.BrowserListResult, error) {
	res := storage.BrowserListResult{CurrentPrefix: prefix, Folders: []storage.FolderInfo{}, Files: []storage.ObjectInfo{}}
	seen := map[string]bool{}
	for _, o := range m.sorted(prefix) {
		rest := strings.TrimPrefix(o.Key, prefix)
		if rest == "" {
			continue
		}
		if i := strings.Index(rest, "/"); i >= 0 {
			if !seen[rest[:i]] {
				seen[rest[:i]] = true
				res.Folders = append(res.Folders, storage.FolderInfo{Name: rest[:i], Prefix: prefix + rest[:i+1]})
			}
			continue
		}
		res.Files = append(res.Files, o)
	}
	return res, nil
}
func (m *memStore) Walk(ctx context.Context, prefix string, fn func(storage.ObjectInfo) error) error {
	for _, o := range m.sorted(prefix) {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := fn(o); err != nil {
			if err == storage.ErrStopWalk {
				return nil
			}
			return err
		}
	}
	return nil
}
func (m *memStore) UploadObject(_ context.Context, key, _ string, body io.Reader, _ int64) error {
	data, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[key] = storage.ObjectInfo{Key: key, Size: int64(len(data)), LastModified: time.Now()}
	return nil
}
func (m *memStore) PresignUpload(_ context.Context, key, _ string, _ time.Duration) (storage.PresignedRequest, error) {
	return storage.PresignedRequest{URL: "https://example.test/" + key, Method: "PUT"}, nil
}
func (m *memStore) DownloadObject(context.Context, string) (storage.DownloadObject, error) {
	return storage.DownloadObject{}, storage.ErrNotFound
}
func (m *memStore) ReadRange(context.Context, string, int64, int64) ([]byte, error) { return nil, nil }
func (m *memStore) HeadObject(context.Context, string) (storage.ObjectInfo, error) {
	return storage.ObjectInfo{}, storage.ErrNotFound
}
func (m *memStore) PresignDownload(_ context.Context, key string, _ time.Duration, attachment string) (storage.PresignedRequest, error) {
	return storage.PresignedRequest{URL: "https://example.test/" + key + "?attachment=" + attachment, Method: "GET"}, nil
}
func (m *memStore) DeleteObject(_ context.Context, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for k := range m.objects {
		if k == key || (strings.HasSuffix(key, "/") && strings.HasPrefix(k, key)) {
			delete(m.objects, k)
		}
	}
	return nil
}
func (m *memStore) DeleteObjects(ctx context.Context, keys []string) error {
	for _, k := range keys {
		_ = m.DeleteObject(ctx, k)
	}
	return nil
}

type testEnv struct {
	t      *testing.T
	srv    *httptest.Server
	cfg    *appconfig.Config
	store  *memStore
	client *http.Client
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	dir := t.TempDir()
	t.Chdir(dir)
	t.Setenv("CONFIG_DB_PATH", filepath.Join(dir, "config", "test.db"))
	t.Setenv("APP_SECRET", "test-secret-test-secret-test-secret")
	t.Setenv("AUTH_USERNAME", "admin")
	t.Setenv("AUTH_PASSWORD", "admin-password")

	cfg, err := appconfig.Load()
	if err != nil {
		t.Fatal(err)
	}
	cfg.Connections = []appconfig.Connection{{ID: "c1", Name: "Test", Bucket: "bucket", Region: "auto", AccessKey: "AKIATESTKEY1234", SecretKey: "super-secret"}}
	cfg.ActiveID = "c1"
	if err := cfg.Save(); err != nil {
		t.Fatal(err)
	}

	mb := int64(1 << 20)
	store := newMemStore(
		storage.ObjectInfo{Key: "videos/", Size: 0},
		storage.ObjectInfo{Key: "videos/big.mp4", Size: 500 * mb, LastModified: time.Now(), ETag: `"a"`},
		storage.ObjectInfo{Key: "docs/report.pdf", Size: 2 * mb, LastModified: time.Now(), ETag: `"b"`},
		storage.ObjectInfo{Key: "docs/notes.txt", Size: 100, LastModified: time.Now(), ETag: `"c"`},
	)

	ctx, cancel := context.WithCancel(context.Background())
	srv := httptest.NewServer(NewHandler(ctx, store, cfg))
	t.Cleanup(func() {
		srv.Close()
		cancel()
	})

	return &testEnv{t: t, srv: srv, cfg: cfg, store: store, client: newClient(t)}
}

func newClient(t *testing.T) *http.Client {
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Client{Jar: jar}
}

func (e *testEnv) do(client *http.Client, method, path string, body any) (int, map[string]any) {
	e.t.Helper()
	var reader io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		reader = bytes.NewReader(data)
	}
	req, _ := http.NewRequest(method, e.srv.URL+path, reader)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func (e *testEnv) login(client *http.Client, user, pass string) int {
	status, _ := e.do(client, "POST", "/api/auth/login", map[string]string{"username": user, "password": pass})
	return status
}

func TestLoginAndJSONErrors(t *testing.T) {
	e := newTestEnv(t)

	status, body := e.do(e.client, "GET", "/api/drive/list", nil)
	if status != http.StatusUnauthorized || body["error"] != "unauthorized" {
		t.Errorf("unauthenticated list: %d %v", status, body)
	}

	if s := e.login(e.client, "admin", "wrong"); s != http.StatusUnauthorized {
		t.Errorf("wrong password: %d", s)
	}
	if s := e.login(e.client, "admin", "admin-password"); s != http.StatusOK {
		t.Fatalf("login: %d", s)
	}

	status, body = e.do(e.client, "GET", "/api/auth/me", nil)
	if status != 200 || body["authenticated"] != true {
		t.Errorf("me: %d %v", status, body)
	}

	status, body = e.do(e.client, "GET", "/api/does-not-exist", nil)
	if status != http.StatusNotFound || body["error"] != "not found" {
		t.Errorf("unknown api route: %d %v", status, body)
	}
}

func TestLoginRateLimit(t *testing.T) {
	e := newTestEnv(t)
	for i := 0; i < 10; i++ {
		e.login(e.client, "admin", "wrong")
	}
	status, body := e.do(e.client, "POST", "/api/auth/login", map[string]string{"username": "admin", "password": "admin-password"})
	if status != http.StatusTooManyRequests {
		t.Fatalf("after 10 failures: %d %v", status, body)
	}
	// Other usernames from the same client are not blocked
	if s := e.login(e.client, "someone-else", "wrong"); s != http.StatusUnauthorized {
		t.Errorf("other user: %d", s)
	}
}

func TestDisabledUserLosesAccessImmediately(t *testing.T) {
	e := newTestEnv(t)
	user, err := e.cfg.CreateLocalUser("alice", "alice-password")
	if err != nil {
		t.Fatal(err)
	}
	if err := e.cfg.UpsertUserPermissions(user.ID, appconfig.UserPermissions{CanReadFiles: true}); err != nil {
		t.Fatal(err)
	}

	alice := newClient(t)
	if s := e.login(alice, "alice", "alice-password"); s != 200 {
		t.Fatalf("alice login: %d", s)
	}
	if s, _ := e.do(alice, "GET", "/api/drive/list", nil); s != 200 {
		t.Fatalf("alice list: %d", s)
	}

	// Removing a permission applies to the existing session
	if err := e.cfg.UpsertUserPermissions(user.ID, appconfig.UserPermissions{}); err != nil {
		t.Fatal(err)
	}
	if s, _ := e.do(alice, "GET", "/api/drive/list", nil); s != http.StatusForbidden {
		t.Errorf("after permission removal: %d, want 403", s)
	}

	// Disabling the account through the API signs her out
	e.login(e.client, "admin", "admin-password")
	path := "/api/users/" + itoa(user.ID) + "/active"
	if s, body := e.do(e.client, "PUT", path, map[string]bool{"isActive": false}); s != 200 {
		t.Fatalf("disable: %d %v", s, body)
	}
	if s, _ := e.do(alice, "GET", "/api/drive/list", nil); s != http.StatusUnauthorized {
		t.Errorf("after disable: %d, want 401", s)
	}
}

func TestConnectionsNeverExposeKeys(t *testing.T) {
	e := newTestEnv(t)
	e.login(e.client, "admin", "admin-password")

	req, _ := http.NewRequest("GET", e.srv.URL+"/api/connections", nil)
	resp, err := e.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if bytes.Contains(raw, []byte("super-secret")) || bytes.Contains(raw, []byte("AKIATESTKEY1234")) {
		t.Fatalf("connection keys leaked: %s", raw)
	}
	if !bytes.Contains(raw, []byte(`"accessKeyHint":"…1234"`)) {
		t.Errorf("missing access key hint: %s", raw)
	}
}

func TestPasswordPolicy(t *testing.T) {
	e := newTestEnv(t)
	e.login(e.client, "admin", "admin-password")
	status, body := e.do(e.client, "POST", "/api/users", map[string]string{"username": "bob", "password": "short"})
	if status != http.StatusBadRequest || !strings.Contains(body["error"].(string), "at least 8") {
		t.Errorf("short password: %d %v", status, body)
	}
}

func TestStatsSearchAndAnalytics(t *testing.T) {
	e := newTestEnv(t)
	e.login(e.client, "admin", "admin-password")

	// The first stats request starts a scan; totals arrive once it finishes
	deadline := time.Now().Add(3 * time.Second)
	var body map[string]any
	for time.Now().Before(deadline) {
		_, body = e.do(e.client, "GET", "/api/drive/stats", nil)
		if body["scanning"] == false && body["totalFiles"] != float64(0) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if body["totalFiles"] != float64(3) || body["totalFolders"] != float64(2) {
		t.Fatalf("stats = %v", body)
	}

	status, body := e.do(e.client, "GET", "/api/drive/search?q=REPORT", nil)
	items, _ := body["items"].([]any)
	if status != 200 || len(items) != 1 {
		t.Errorf("search: %d %v", status, body)
	}

	status, body = e.do(e.client, "GET", "/api/analytics", nil)
	report, _ := body["report"].(map[string]any)
	if status != 200 || report == nil || report["totalBytes"] == float64(0) {
		t.Fatalf("analytics: %d %v", status, body)
	}

	status, body = e.do(e.client, "GET", "/api/analytics/files?sort=size&order=desc&limit=1", nil)
	files, _ := body["items"].([]any)
	if status != 200 || body["total"] != float64(3) || len(files) != 1 || files[0].(map[string]any)["key"] != "videos/big.mp4" {
		t.Errorf("analytics files: %d %v", status, body)
	}

	status, body = e.do(e.client, "POST", "/api/analytics/scan", nil)
	if status != http.StatusAccepted {
		t.Errorf("rescan: %d %v", status, body)
	}
}

func TestBulkDeleteAndPresignDownload(t *testing.T) {
	e := newTestEnv(t)
	e.login(e.client, "admin", "admin-password")

	status, body := e.do(e.client, "GET", "/api/drive/presign/download?key=docs/report.pdf&download=1", nil)
	dl, _ := body["download"].(map[string]any)
	if status != 200 || !strings.Contains(dl["url"].(string), "attachment=report.pdf") {
		t.Errorf("presign download: %d %v", status, body)
	}

	status, body = e.do(e.client, "POST", "/api/bulk-objects-delete", map[string][]string{"keys": {"videos/", "docs/notes.txt"}})
	if status != 200 || body["deleted"] != float64(2) {
		t.Fatalf("bulk delete: %d %v", status, body)
	}
	left := e.store.sorted("")
	if len(left) != 1 || left[0].Key != "docs/report.pdf" {
		t.Errorf("remaining objects: %+v", left)
	}
}

func TestSPAFallbackAndHeaders(t *testing.T) {
	e := newTestEnv(t)
	resp, err := http.Get(e.srv.URL + "/drive/some/folder")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || !bytes.Contains(body, []byte(`<div id="root">`)) {
		t.Errorf("SPA fallback: %d", resp.StatusCode)
	}
	if resp.Header.Get("X-Content-Type-Options") != "nosniff" || resp.Header.Get("X-Frame-Options") != "DENY" {
		t.Errorf("security headers missing: %v", resp.Header)
	}
}

func itoa(n int64) string {
	data, _ := json.Marshal(n)
	return string(data)
}
