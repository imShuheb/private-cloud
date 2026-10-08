// Package analytics scans a bucket and summarises where its storage goes.
package analytics

import (
	"container/heap"
	"path"
	"sort"
	"strings"
	"time"

	"private-storage/internal/storage"
)

const (
	// MaxLargestFiles is how many of the biggest files a report keeps for the sortable file list.
	MaxLargestFiles = 5000
	maxTopFolders   = 50
	maxExtensions   = 15
	maxDuplicates   = 25
	maxDuplicateKey = 5
	// Duplicates below this size don't matter for storage use and are not tracked.
	minDuplicateSize = 1 << 20
)

type Category string

const (
	CategoryImage    Category = "image"
	CategoryVideo    Category = "video"
	CategoryAudio    Category = "audio"
	CategoryDocument Category = "document"
	CategoryArchive  Category = "archive"
	CategoryCode     Category = "code"
	CategoryOther    Category = "other"
)

// Categories in display order.
var Categories = []Category{CategoryVideo, CategoryImage, CategoryAudio, CategoryDocument, CategoryArchive, CategoryCode, CategoryOther}

var extensionCategories = map[string]Category{}

func init() {
	groups := map[Category][]string{
		CategoryImage:    {"jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "heic", "heif", "tif", "tiff", "raw", "avif"},
		CategoryVideo:    {"mp4", "mkv", "avi", "mov", "webm", "m4v", "wmv", "flv", "ts", "m2ts", "mpg", "mpeg", "3gp"},
		CategoryAudio:    {"mp3", "wav", "flac", "ogg", "m4a", "aac", "opus", "wma", "aiff"},
		CategoryDocument: {"pdf", "doc", "docx", "txt", "rtf", "md", "odt", "xls", "xlsx", "csv", "ods", "ppt", "pptx", "odp", "pages", "numbers", "key", "epub"},
		CategoryArchive:  {"zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst", "iso", "dmg"},
		CategoryCode:     {"js", "jsx", "ts", "tsx", "py", "go", "rs", "java", "kt", "c", "h", "cpp", "cs", "rb", "php", "json", "xml", "html", "css", "sql", "yaml", "yml", "toml", "sh"},
	}
	for category, exts := range groups {
		for _, ext := range exts {
			extensionCategories[ext] = category
		}
	}
	// "ts" is far more often an MPEG transport stream (HLS segment) in a storage bucket than TypeScript
	extensionCategories["ts"] = CategoryVideo
}

// CategoryForName returns the category for a file name based on its extension.
func CategoryForName(name string) Category {
	if c, ok := extensionCategories[extensionOf(name)]; ok {
		return c
	}
	return CategoryOther
}

func extensionOf(name string) string {
	ext := strings.ToLower(strings.TrimPrefix(path.Ext(name), "."))
	if len(ext) > 10 {
		return ""
	}
	return ext
}

type Bucket struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Count int64  `json:"count"`
	Bytes int64  `json:"bytes"`
}

type FolderUsage struct {
	Prefix string `json:"prefix"`
	Files  int64  `json:"files"`
	Bytes  int64  `json:"bytes"`
}

type FileEntry struct {
	Key          string    `json:"key"`
	Name         string    `json:"name"`
	Folder       string    `json:"folder"`
	Extension    string    `json:"extension"`
	Category     Category  `json:"category"`
	Size         int64     `json:"size"`
	LastModified time.Time `json:"lastModified"`
}

type DuplicateGroup struct {
	Size        int64    `json:"size"`
	Count       int64    `json:"count"`
	WastedBytes int64    `json:"wastedBytes"`
	Keys        []string `json:"keys"`
}

type Report struct {
	GeneratedAt          time.Time        `json:"generatedAt"`
	TotalFiles           int64            `json:"totalFiles"`
	TotalFolders         int64            `json:"totalFolders"`
	TotalBytes           int64            `json:"totalBytes"`
	LargestFile          *FileEntry       `json:"largestFile,omitempty"`
	ByCategory           []Bucket         `json:"byCategory"`
	ByExtension          []Bucket         `json:"byExtension"`
	SizeDistribution     []Bucket         `json:"sizeDistribution"`
	AgeDistribution      []Bucket         `json:"ageDistribution"`
	TopFolders           []FolderUsage    `json:"topFolders"`
	RootFolders          []FolderUsage    `json:"rootFolders"`
	Duplicates           []DuplicateGroup `json:"duplicates"`
	DuplicateWastedBytes int64            `json:"duplicateWastedBytes"`
	// LargestFiles holds up to MaxLargestFiles files, biggest first.
	LargestFiles []FileEntry `json:"-"`
}

var sizeBuckets = []struct {
	key   string
	label string
	upTo  int64
}{
	{"lt1mb", "Under 1 MB", 1 << 20},
	{"lt10mb", "1–10 MB", 10 << 20},
	{"lt100mb", "10–100 MB", 100 << 20},
	{"lt1gb", "100 MB–1 GB", 1 << 30},
	{"gte1gb", "Over 1 GB", -1},
}

var ageBuckets = []struct {
	key   string
	label string
	upTo  time.Duration
}{
	{"7d", "Last 7 days", 7 * 24 * time.Hour},
	{"30d", "8–30 days", 30 * 24 * time.Hour},
	{"90d", "1–3 months", 90 * 24 * time.Hour},
	{"1y", "3–12 months", 365 * 24 * time.Hour},
	{"older", "Over a year", -1},
}

type dupState struct {
	size  int64
	count int64
	keys  []string
}

// Aggregator builds a Report from a stream of objects in a single pass.
type Aggregator struct {
	now        time.Time
	files      int64
	bytes      int64
	folders    map[string]struct{}
	usage      map[string]*FolderUsage
	categories map[Category]*Bucket
	extensions map[string]*Bucket
	sizes      []Bucket
	ages       []Bucket
	largest    fileHeap
	duplicates map[string]*dupState
}

func NewAggregator(now time.Time) *Aggregator {
	a := &Aggregator{
		now:        now,
		folders:    map[string]struct{}{},
		usage:      map[string]*FolderUsage{},
		categories: map[Category]*Bucket{},
		extensions: map[string]*Bucket{},
		duplicates: map[string]*dupState{},
	}
	for _, b := range sizeBuckets {
		a.sizes = append(a.sizes, Bucket{Key: b.key, Label: b.label})
	}
	for _, b := range ageBuckets {
		a.ages = append(a.ages, Bucket{Key: b.key, Label: b.label})
	}
	return a
}

// Add records one object from the bucket listing.
func (a *Aggregator) Add(obj storage.ObjectInfo) {
	if obj.Key == "" {
		return
	}
	if strings.HasSuffix(obj.Key, "/") {
		a.addFolders(obj.Key)
		return
	}

	folder := ""
	if i := strings.LastIndex(obj.Key, "/"); i >= 0 {
		folder = obj.Key[:i+1]
	}
	a.addFolders(folder)

	a.files++
	a.bytes += obj.Size

	name := path.Base(obj.Key)
	ext := extensionOf(name)
	category := CategoryForName(name)

	addTo(a.categories, category, string(category), obj.Size)
	extKey := ext
	if extKey == "" {
		extKey = "(none)"
	}
	addTo(a.extensions, extKey, extKey, obj.Size)

	a.addSize(obj.Size)
	a.addAge(obj.LastModified, obj.Size)
	a.addFolderUsage(folder, obj.Size)
	a.addDuplicate(obj)

	entry := FileEntry{
		Key:          obj.Key,
		Name:         name,
		Folder:       folder,
		Extension:    ext,
		Category:     category,
		Size:         obj.Size,
		LastModified: obj.LastModified,
	}
	if a.largest.Len() < MaxLargestFiles {
		heap.Push(&a.largest, entry)
	} else if a.largest[0].Size < obj.Size {
		a.largest[0] = entry
		heap.Fix(&a.largest, 0)
	}
}

func addTo[K comparable](m map[K]*Bucket, key K, label string, size int64) {
	b, ok := m[key]
	if !ok {
		b = &Bucket{Key: label, Label: label}
		m[key] = b
	}
	b.Count++
	b.Bytes += size
}

// addFolders records folder (a "a/b/" prefix) and all its parents.
func (a *Aggregator) addFolders(folder string) {
	for folder != "" {
		if _, seen := a.folders[folder]; seen {
			return
		}
		a.folders[folder] = struct{}{}
		folder = parentFolder(folder)
	}
}

func (a *Aggregator) addFolderUsage(folder string, size int64) {
	for folder != "" {
		u, ok := a.usage[folder]
		if !ok {
			u = &FolderUsage{Prefix: folder}
			a.usage[folder] = u
		}
		u.Files++
		u.Bytes += size
		folder = parentFolder(folder)
	}
}

func (a *Aggregator) addSize(size int64) {
	for i, b := range sizeBuckets {
		if b.upTo < 0 || size < b.upTo {
			a.sizes[i].Count++
			a.sizes[i].Bytes += size
			return
		}
	}
}

func (a *Aggregator) addAge(modified time.Time, size int64) {
	age := a.now.Sub(modified)
	for i, b := range ageBuckets {
		if b.upTo < 0 || age < b.upTo {
			a.ages[i].Count++
			a.ages[i].Bytes += size
			return
		}
	}
}

func (a *Aggregator) addDuplicate(obj storage.ObjectInfo) {
	etag := strings.Trim(obj.ETag, `"`)
	if obj.Size < minDuplicateSize || etag == "" {
		return
	}
	id := etag + ":" + itoa(obj.Size)
	d, ok := a.duplicates[id]
	if !ok {
		d = &dupState{size: obj.Size}
		a.duplicates[id] = d
	}
	d.count++
	if len(d.keys) < maxDuplicateKey {
		d.keys = append(d.keys, obj.Key)
	}
}

// Report returns the summary of everything added so far.
func (a *Aggregator) Report() *Report {
	r := &Report{
		GeneratedAt:      a.now,
		TotalFiles:       a.files,
		TotalFolders:     int64(len(a.folders)),
		TotalBytes:       a.bytes,
		SizeDistribution: a.sizes,
		AgeDistribution:  a.ages,
	}

	for _, c := range Categories {
		if b, ok := a.categories[c]; ok {
			r.ByCategory = append(r.ByCategory, *b)
		}
	}
	sort.SliceStable(r.ByCategory, func(i, j int) bool { return r.ByCategory[i].Bytes > r.ByCategory[j].Bytes })

	for _, b := range a.extensions {
		r.ByExtension = append(r.ByExtension, *b)
	}
	sort.Slice(r.ByExtension, func(i, j int) bool { return bucketLess(r.ByExtension[i], r.ByExtension[j]) })
	if len(r.ByExtension) > maxExtensions {
		r.ByExtension = r.ByExtension[:maxExtensions]
	}

	for _, u := range a.usage {
		r.TopFolders = append(r.TopFolders, *u)
		if strings.Count(u.Prefix, "/") == 1 {
			r.RootFolders = append(r.RootFolders, *u)
		}
	}
	byBytes := func(list []FolderUsage) {
		sort.Slice(list, func(i, j int) bool {
			if list[i].Bytes != list[j].Bytes {
				return list[i].Bytes > list[j].Bytes
			}
			return list[i].Prefix < list[j].Prefix
		})
	}
	byBytes(r.TopFolders)
	byBytes(r.RootFolders)
	if len(r.TopFolders) > maxTopFolders {
		r.TopFolders = r.TopFolders[:maxTopFolders]
	}

	for _, d := range a.duplicates {
		if d.count < 2 {
			continue
		}
		wasted := d.size * (d.count - 1)
		r.DuplicateWastedBytes += wasted
		r.Duplicates = append(r.Duplicates, DuplicateGroup{Size: d.size, Count: d.count, WastedBytes: wasted, Keys: d.keys})
	}
	sort.Slice(r.Duplicates, func(i, j int) bool {
		if r.Duplicates[i].WastedBytes != r.Duplicates[j].WastedBytes {
			return r.Duplicates[i].WastedBytes > r.Duplicates[j].WastedBytes
		}
		return r.Duplicates[i].Keys[0] < r.Duplicates[j].Keys[0]
	})
	if len(r.Duplicates) > maxDuplicates {
		r.Duplicates = r.Duplicates[:maxDuplicates]
	}

	r.LargestFiles = make([]FileEntry, len(a.largest))
	copy(r.LargestFiles, a.largest)
	sort.Slice(r.LargestFiles, func(i, j int) bool {
		if r.LargestFiles[i].Size != r.LargestFiles[j].Size {
			return r.LargestFiles[i].Size > r.LargestFiles[j].Size
		}
		return r.LargestFiles[i].Key < r.LargestFiles[j].Key
	})
	if len(r.LargestFiles) > 0 {
		largest := r.LargestFiles[0]
		r.LargestFile = &largest
	}
	return r
}

func bucketLess(a, b Bucket) bool {
	if a.Bytes != b.Bytes {
		return a.Bytes > b.Bytes
	}
	return a.Key < b.Key
}

func parentFolder(folder string) string {
	trimmed := strings.TrimSuffix(folder, "/")
	i := strings.LastIndex(trimmed, "/")
	if i < 0 {
		return ""
	}
	return trimmed[:i+1]
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

// fileHeap is a min-heap by size, so the smallest of the kept files is evicted first.
type fileHeap []FileEntry

func (h fileHeap) Len() int           { return len(h) }
func (h fileHeap) Less(i, j int) bool { return h[i].Size < h[j].Size }
func (h fileHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *fileHeap) Push(x any)        { *h = append(*h, x.(FileEntry)) }
func (h *fileHeap) Pop() any {
	old := *h
	n := len(old)
	item := old[n-1]
	*h = old[:n-1]
	return item
}
