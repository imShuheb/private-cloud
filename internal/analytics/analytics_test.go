package analytics

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"private-storage/internal/storage"
)

var now = time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)

func obj(key string, size int64, age time.Duration, etag string) storage.ObjectInfo {
	return storage.ObjectInfo{Key: key, Size: size, LastModified: now.Add(-age), ETag: etag}
}

const mb = int64(1 << 20)

func sampleObjects() []storage.ObjectInfo {
	day := 24 * time.Hour
	return []storage.ObjectInfo{
		obj("videos/", 0, 0, ""),
		obj("videos/2026/lecture.mp4", 900*mb, 2*day, `"aaa"`),
		obj("videos/2026/lecture-copy.mp4", 900*mb, 40*day, `"aaa"`),
		obj("videos/intro.mov", 50*mb, 100*day, `"bbb"`),
		obj("images/logo.png", 20_000, 400*day, `"ccc"`),
		obj("images/raw/photo.HEIC", 3*mb, 10*day, `"ddd"`),
		obj("docs/report.pdf", 2*mb, 1*day, `"eee"`),
		obj("readme", 100, 1*day, `"fff"`),
		obj("empty/", 0, 0, ""),
	}
}

func buildReport() *Report {
	agg := NewAggregator(now)
	for _, o := range sampleObjects() {
		agg.Add(o)
	}
	return agg.Report()
}

func TestReportTotals(t *testing.T) {
	r := buildReport()
	if r.TotalFiles != 7 {
		t.Errorf("TotalFiles = %d, want 7", r.TotalFiles)
	}
	wantBytes := 900*mb*2 + 50*mb + 20_000 + 3*mb + 2*mb + 100
	if r.TotalBytes != wantBytes {
		t.Errorf("TotalBytes = %d, want %d", r.TotalBytes, wantBytes)
	}
	// videos/, videos/2026/, images/, images/raw/, docs/, empty/
	if r.TotalFolders != 6 {
		t.Errorf("TotalFolders = %d, want 6", r.TotalFolders)
	}
	if r.LargestFile == nil || r.LargestFile.Size != 900*mb {
		t.Fatalf("LargestFile = %+v", r.LargestFile)
	}
}

func TestReportBreakdowns(t *testing.T) {
	r := buildReport()

	if r.ByCategory[0].Key != string(CategoryVideo) || r.ByCategory[0].Count != 3 {
		t.Errorf("first category = %+v, want video with 3 files", r.ByCategory[0])
	}
	var image Bucket
	for _, b := range r.ByCategory {
		if b.Key == string(CategoryImage) {
			image = b
		}
	}
	if image.Count != 2 {
		t.Errorf("image count = %d, want 2 (extension match is case-insensitive)", image.Count)
	}

	if r.RootFolders[0].Prefix != "videos/" || r.RootFolders[0].Files != 3 {
		t.Errorf("first root folder = %+v, want videos/ with 3 files", r.RootFolders[0])
	}
	foundNested := false
	for _, f := range r.TopFolders {
		if f.Prefix == "videos/2026/" && f.Bytes == 1800*mb {
			foundNested = true
		}
	}
	if !foundNested {
		t.Error("nested folder videos/2026/ missing from TopFolders")
	}

	var gte1gb, lt1gb Bucket
	for _, b := range r.SizeDistribution {
		switch b.Key {
		case "gte1gb":
			gte1gb = b
		case "lt1gb":
			lt1gb = b
		}
	}
	if gte1gb.Count != 0 || lt1gb.Count != 2 {
		t.Errorf("size buckets: >1GB=%d (want 0), 100MB–1GB=%d (want 2)", gte1gb.Count, lt1gb.Count)
	}
	if r.AgeDistribution[0].Count != 3 { // lecture (2d), report (1d), readme (1d)
		t.Errorf("last-7-days count = %d, want 3", r.AgeDistribution[0].Count)
	}
}

func TestDuplicates(t *testing.T) {
	r := buildReport()
	if len(r.Duplicates) != 1 {
		t.Fatalf("duplicates = %+v, want 1 group", r.Duplicates)
	}
	d := r.Duplicates[0]
	if d.Count != 2 || d.WastedBytes != 900*mb || len(d.Keys) != 2 {
		t.Errorf("duplicate group = %+v", d)
	}
	if r.DuplicateWastedBytes != 900*mb {
		t.Errorf("DuplicateWastedBytes = %d", r.DuplicateWastedBytes)
	}
}

func TestLargestFilesKeepsBiggest(t *testing.T) {
	agg := NewAggregator(now)
	for i := int64(1); i <= MaxLargestFiles+500; i++ {
		agg.Add(obj("f/"+itoa(i), i, 0, ""))
	}
	r := agg.Report()
	if len(r.LargestFiles) != MaxLargestFiles {
		t.Fatalf("kept %d files, want %d", len(r.LargestFiles), MaxLargestFiles)
	}
	if r.LargestFiles[0].Size != MaxLargestFiles+500 || r.LargestFiles[len(r.LargestFiles)-1].Size != 501 {
		t.Errorf("kept sizes from %d to %d", r.LargestFiles[0].Size, r.LargestFiles[len(r.LargestFiles)-1].Size)
	}
}

func TestQueryFiles(t *testing.T) {
	r := buildReport()

	items, total := QueryFiles(r, FileQuery{Category: CategoryVideo, SortBy: "size", Desc: true})
	if total != 3 || items[0].Size != 900*mb || items[2].Name != "intro.mov" {
		t.Errorf("videos by size: total=%d first=%+v last=%+v", total, items[0], items[2])
	}

	items, total = QueryFiles(r, FileQuery{Search: "REPORT"})
	if total != 1 || items[0].Key != "docs/report.pdf" {
		t.Errorf("search: total=%d items=%+v", total, items)
	}

	items, total = QueryFiles(r, FileQuery{Folder: "images/", SortBy: "name"})
	if total != 2 || items[0].Name != "logo.png" {
		t.Errorf("folder filter: total=%d items=%+v", total, items)
	}

	items, total = QueryFiles(r, FileQuery{SortBy: "size", Desc: true, Offset: 5, Limit: 10})
	if total != 7 || len(items) != 2 {
		t.Errorf("paging: total=%d len=%d", total, len(items))
	}
}

type fakeStore struct {
	storage.Store
	objects []storage.ObjectInfo
	block   chan struct{}
	err     error
}

func (f *fakeStore) Walk(ctx context.Context, _ string, fn func(storage.ObjectInfo) error) error {
	for _, o := range f.objects {
		if f.block != nil {
			select {
			case <-f.block:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		if err := fn(o); err != nil {
			return err
		}
	}
	return f.err
}

func waitFor(t *testing.T, s *Scanner, id string, want State) Status {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if st := s.Status(id); st.State == want {
			return st
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("scan state never became %s (now %s)", want, s.Status(id).State)
	return Status{}
}

func TestScannerCompletes(t *testing.T) {
	s := NewScanner()
	s.Start("c1", &fakeStore{objects: sampleObjects()})
	st := waitFor(t, s, "c1", StateDone)
	if st.ScannedObjects != int64(len(sampleObjects())) || st.ReportAt == nil {
		t.Errorf("status = %+v", st)
	}
	r, _ := s.Report("c1")
	if r == nil || r.TotalFiles != 7 {
		t.Fatalf("report = %+v", r)
	}
	if other, _ := s.Report("c2"); other != nil {
		t.Error("reports must be per connection")
	}
}

func TestScannerCancelKeepsPreviousReport(t *testing.T) {
	s := NewScanner()
	s.Start("c1", &fakeStore{objects: sampleObjects()})
	waitFor(t, s, "c1", StateDone)

	block := make(chan struct{})
	s.Start("c1", &fakeStore{objects: sampleObjects(), block: block})
	if again := s.Start("c1", &fakeStore{}); again.State != StateRunning {
		t.Errorf("second Start while running = %s, want running", again.State)
	}
	s.Cancel("c1")
	waitFor(t, s, "c1", StateCancelled)

	if r, _ := s.Report("c1"); r == nil || r.TotalFiles != 7 {
		t.Error("previous report should survive a cancelled rescan")
	}
}

func TestScannerFailure(t *testing.T) {
	s := NewScanner()
	s.Start("c1", &fakeStore{err: errors.New("access denied")})
	st := waitFor(t, s, "c1", StateFailed)
	if st.Error != "access denied" {
		t.Errorf("error = %q", st.Error)
	}
}

func TestRemoveKeys(t *testing.T) {
	s := NewScanner()
	s.Start("c1", &fakeStore{objects: sampleObjects()})
	waitFor(t, s, "c1", StateDone)
	before, _ := s.Report("c1")

	s.RemoveKeys("c1", []string{"docs/report.pdf", "videos/2026/"})
	r, _ := s.Report("c1")
	for _, f := range r.LargestFiles {
		if f.Key == "docs/report.pdf" || strings.HasPrefix(f.Key, "videos/2026/") {
			t.Errorf("%s should have been removed", f.Key)
		}
	}
	if len(r.LargestFiles) != 4 || len(before.LargestFiles) != 7 {
		t.Errorf("kept %d (before %d)", len(r.LargestFiles), len(before.LargestFiles))
	}
}
