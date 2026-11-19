package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
)

// fakeS3 implements the handful of S3 calls UploadObject makes, storing parts in memory.
type fakeS3 struct {
	mu        sync.Mutex
	objects   map[string][]byte
	types     map[string]string
	parts     map[string]map[int][]byte
	puts      int
	completed int
	aborted   int
}

func (f *fakeS3) body(r *http.Request) []byte {
	data, _ := io.ReadAll(r.Body)
	// Newer SDKs send aws-chunked bodies with a trailing checksum
	if strings.Contains(r.Header.Get("Content-Encoding"), "aws-chunked") {
		var out []byte
		for {
			line, rest, _ := bytes.Cut(data, []byte("\r\n"))
			sizeHex, _, _ := strings.Cut(string(line), ";")
			n, err := strconv.ParseInt(sizeHex, 16, 64)
			if err != nil || n == 0 {
				break
			}
			out = append(out, rest[:n]...)
			data = rest[n+2:]
		}
		return out
	}
	return data
}

func (f *fakeS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	key := strings.TrimPrefix(r.URL.Path, "/bucket/")
	q := r.URL.Query()
	switch {
	case r.Method == http.MethodPost && q.Has("uploads"):
		f.parts[key] = map[int][]byte{}
		f.types[key] = r.Header.Get("Content-Type")
		fmt.Fprintf(w, `<InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>%s</Key><UploadId>up1</UploadId></InitiateMultipartUploadResult>`, key)
	case r.Method == http.MethodPut && q.Has("partNumber"):
		n, _ := strconv.Atoi(q.Get("partNumber"))
		f.parts[key][n] = f.body(r)
		w.Header().Set("ETag", fmt.Sprintf(`"etag-%d"`, n))
	case r.Method == http.MethodPost && q.Has("uploadId"):
		var all []byte
		for i := 1; i <= len(f.parts[key]); i++ {
			all = append(all, f.parts[key][i]...)
		}
		f.objects[key] = all
		f.completed++
		fmt.Fprintf(w, `<CompleteMultipartUploadResult><Bucket>bucket</Bucket><Key>%s</Key><ETag>"x"</ETag></CompleteMultipartUploadResult>`, key)
	case r.Method == http.MethodDelete && q.Has("uploadId"):
		f.aborted++
		w.WriteHeader(http.StatusNoContent)
	case r.Method == http.MethodGet && q.Get("list-type") == "2":
		f.list(w, q.Get("prefix"), q.Get("delimiter"))
	case r.Method == http.MethodPost && q.Has("delete"):
		body := string(f.body(r))
		for _, part := range strings.Split(body, "<Key>")[1:] {
			k, _, _ := strings.Cut(part, "</Key>")
			delete(f.objects, k)
		}
		fmt.Fprint(w, `<DeleteResult></DeleteResult>`)
	case r.Method == http.MethodDelete:
		delete(f.objects, key)
		w.WriteHeader(http.StatusNoContent)
	case r.Method == http.MethodPut:
		f.objects[key] = f.body(r)
		f.types[key] = r.Header.Get("Content-Type")
		f.puts++
		w.Header().Set("ETag", `"x"`)
	default:
		http.Error(w, "unexpected "+r.Method+" "+r.URL.String(), http.StatusBadRequest)
	}
}

// list answers ListObjectsV2 (single page) from the stored objects.
func (f *fakeS3) list(w http.ResponseWriter, prefix, delimiter string) {
	keys := make([]string, 0, len(f.objects))
	for k := range f.objects {
		if strings.HasPrefix(k, prefix) {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	var b strings.Builder
	b.WriteString(`<ListBucketResult><IsTruncated>false</IsTruncated>`)
	seen := map[string]bool{}
	for _, k := range keys {
		rest := strings.TrimPrefix(k, prefix)
		if delimiter != "" {
			if i := strings.Index(rest, delimiter); i >= 0 {
				cp := prefix + rest[:i+1]
				if !seen[cp] {
					seen[cp] = true
					fmt.Fprintf(&b, `<CommonPrefixes><Prefix>%s</Prefix></CommonPrefixes>`, cp)
				}
				continue
			}
		}
		fmt.Fprintf(&b, `<Contents><Key>%s</Key><Size>%d</Size></Contents>`, k, len(f.objects[k]))
	}
	b.WriteString(`</ListBucketResult>`)
	fmt.Fprint(w, b.String())
}

func newFakeStore(t *testing.T) (*S3Store, *fakeS3) {
	t.Helper()
	fake := &fakeS3{objects: map[string][]byte{}, types: map[string]string{}, parts: map[string]map[int][]byte{}}
	srv := httptest.NewServer(fake)
	t.Cleanup(srv.Close)
	store, err := NewS3Store(context.Background(), S3Config{
		Bucket: "bucket", Region: "auto", Endpoint: srv.URL,
		AccessKey: "test", SecretKey: "test", UsePathStyle: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	return store, fake
}

func TestUploadObjectUsesMultipartForLargeFiles(t *testing.T) {
	oldLimit, oldPart := singlePutLimit, minPartSize
	singlePutLimit, minPartSize = 1<<20, 256<<10
	t.Cleanup(func() { singlePutLimit, minPartSize = oldLimit, oldPart })

	store, fake := newFakeStore(t)
	data := make([]byte, 3<<20+12345) // 13 parts, the last one short
	for i := range data {
		data[i] = byte(i % 251)
	}
	if err := store.UploadObject(t.Context(), "Camera/VID_1.mp4", "", bytes.NewReader(data), int64(len(data))); err != nil {
		t.Fatal(err)
	}
	if fake.completed != 1 || fake.puts != 0 {
		t.Fatalf("completed %d multipart uploads and %d single puts", fake.completed, fake.puts)
	}
	if !bytes.Equal(fake.objects["Camera/VID_1.mp4"], data) {
		t.Fatalf("stored %d bytes, want the original %d", len(fake.objects["Camera/VID_1.mp4"]), len(data))
	}
	if got := fake.types["Camera/VID_1.mp4"]; got != "video/mp4" {
		t.Errorf("content type %q", got)
	}

	if err := store.UploadObject(t.Context(), "Camera/IMG_1.jpg", "application/octet-stream", strings.NewReader("small"), 5); err != nil {
		t.Fatal(err)
	}
	if fake.puts != 1 || string(fake.objects["Camera/IMG_1.jpg"]) != "small" || fake.types["Camera/IMG_1.jpg"] != "image/jpeg" {
		t.Fatalf("small upload: puts=%d data=%q type=%q", fake.puts, fake.objects["Camera/IMG_1.jpg"], fake.types["Camera/IMG_1.jpg"])
	}
}

func TestUploadObjectAbortsOnReadError(t *testing.T) {
	oldLimit, oldPart := singlePutLimit, minPartSize
	singlePutLimit, minPartSize = 1<<20, 256<<10
	t.Cleanup(func() { singlePutLimit, minPartSize = oldLimit, oldPart })

	store, fake := newFakeStore(t)
	body := io.MultiReader(bytes.NewReader(make([]byte, 600<<10)), errReader{})
	if err := store.UploadObject(t.Context(), "a.bin", "", body, 2<<20); err == nil {
		t.Fatal("expected an error")
	}
	if fake.aborted != 1 || fake.completed != 0 {
		t.Fatalf("aborted %d, completed %d", fake.aborted, fake.completed)
	}
}

type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, fmt.Errorf("connection lost") }

func TestPartSizeStaysUnderPartLimit(t *testing.T) {
	for _, size := range []int64{0, 1 << 20, 5 << 30, 200 << 30, 1 << 40} {
		ps := partSizeFor(size)
		if ps < minPartSize || (size+ps-1)/ps > maxParts {
			t.Errorf("size %d: part size %d", size, ps)
		}
	}
}

func TestContentTypeFor(t *testing.T) {
	cases := map[[2]string]string{
		{"DCIM/Camera/20240101_120000.jpg", ""}:     "image/jpeg",
		{"a/VIDEO.MP4", "application/octet-stream"}: "video/mp4",
		{"x.heic", ""}:         "image/heic",
		{"x.mov", ""}:          "video/quicktime",
		{"x.unknownext", ""}:   "application/octet-stream",
		{"x.jpg", "image/png"}: "image/png",
	}
	for in, want := range cases {
		if got := ContentTypeFor(in[0], in[1]); got != want {
			t.Errorf("ContentTypeFor(%q, %q) = %q, want %q", in[0], in[1], got, want)
		}
	}
}

func TestCopySourceEscapesKey(t *testing.T) {
	if got := copySource("bucket", "Photos 2020/a+b#1.jpg"); got != "bucket/Photos%202020/a+b%231.jpg" {
		t.Errorf("got %q", got)
	}
}

func TestThumbnailsHiddenAndDeletedWithFiles(t *testing.T) {
	store, fake := newFakeStore(t)
	for _, k := range []string{"Camera/a.jpg", "Camera/b.mp4", ThumbKey("Camera/a.jpg"), ThumbKey("Camera/b.mp4"), "notes.txt"} {
		fake.objects[k] = []byte("x")
	}

	root, err := store.ListBrowser(t.Context(), "", "", 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range root.Folders {
		if f.Prefix == ThumbPrefix {
			t.Error("thumbnail folder shown at the root")
		}
	}
	var walked []string
	if err := store.Walk(t.Context(), "", func(o ObjectInfo) error { walked = append(walked, o.Key); return nil }); err != nil {
		t.Fatal(err)
	}
	for _, k := range walked {
		if IsThumbKey(k) {
			t.Errorf("walk returned thumbnail %s", k)
		}
	}
	// Listing inside the thumbnail folder on purpose still works (the desktop app needs it)
	inside, err := store.ListObjects(t.Context(), ThumbPrefix, "", 100)
	if err != nil || len(inside.Items) != 2 {
		t.Fatalf("listing thumbnails: %v %v", inside.Items, err)
	}

	if err := store.DeleteObjects(t.Context(), []string{"Camera/a.jpg"}); err != nil {
		t.Fatal(err)
	}
	if _, ok := fake.objects[ThumbKey("Camera/a.jpg")]; ok {
		t.Error("thumbnail kept after bulk delete")
	}
	if err := store.DeleteObject(t.Context(), "Camera/"); err != nil {
		t.Fatal(err)
	}
	if _, ok := fake.objects[ThumbKey("Camera/b.mp4")]; ok {
		t.Error("thumbnail kept after folder delete")
	}
	if _, ok := fake.objects["notes.txt"]; !ok {
		t.Error("unrelated file deleted")
	}
}

func TestThumbnailURLIsStableWithinTheHour(t *testing.T) {
	store, _ := newFakeStore(t)
	a, err := store.PresignThumbnail(t.Context(), ThumbKey("Camera/a.jpg"))
	if err != nil {
		t.Fatal(err)
	}
	b, _ := store.PresignThumbnail(t.Context(), ThumbKey("Camera/a.jpg"))
	if a != b {
		t.Errorf("URLs differ:\n%s\n%s", a, b)
	}
	if !strings.Contains(a, "X-Amz-Expires=7200") {
		t.Errorf("unexpected expiry: %s", a)
	}
}
