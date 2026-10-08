package storage

import (
	"context"
	"errors"
	"io"
	"time"
)

var ErrNotFound = errors.New("not found")

type ObjectInfo struct {
	Key          string    `json:"key"`
	Name         string    `json:"name,omitempty"`
	Size         int64     `json:"size"`
	LastModified time.Time `json:"lastModified"`
	ETag         string    `json:"etag"`
}

type FolderInfo struct {
	Name   string `json:"name"`
	Prefix string `json:"prefix"`
}

type ListResult struct {
	Items                 []ObjectInfo `json:"items"`
	IsTruncated           bool         `json:"isTruncated"`
	NextContinuationToken string       `json:"nextContinuationToken,omitempty"`
}

type BrowserListResult struct {
	CurrentPrefix         string       `json:"currentPrefix"`
	ParentPrefix          string       `json:"parentPrefix,omitempty"`
	Folders               []FolderInfo `json:"folders"`
	Files                 []ObjectInfo `json:"files"`
	IsTruncated           bool         `json:"isTruncated"`
	NextContinuationToken string       `json:"nextContinuationToken,omitempty"`
}

type DownloadObject struct {
	Body          io.ReadCloser
	ContentType   string
	ContentLength int64
}

type PresignedRequest struct {
	URL       string            `json:"url"`
	Method    string            `json:"method"`
	Headers   map[string]string `json:"headers"`
	ExpiresAt time.Time         `json:"expiresAt"`
}

type DriveStats struct {
	TotalSize    int64 `json:"totalSize"`
	TotalFiles   int   `json:"totalFiles"`
	TotalFolders int   `json:"totalFolders"`
}

// ErrStopWalk can be returned from a Walk callback to stop early without an error.
var ErrStopWalk = errors.New("stop walk")

type Store interface {
	// Ping checks that the bucket is reachable with the configured credentials.
	Ping(ctx context.Context) error
	GetStats(ctx context.Context) (DriveStats, error)
	ListObjects(ctx context.Context, prefix, continuationToken string, limit int32) (ListResult, error)
	ListBrowser(ctx context.Context, prefix, continuationToken string, limit int32) (BrowserListResult, error)
	// Walk calls fn for every object under prefix, page by page.
	Walk(ctx context.Context, prefix string, fn func(ObjectInfo) error) error
	// UploadObject stores body under key; size is the body length, or -1 if unknown.
	UploadObject(ctx context.Context, key, contentType string, body io.Reader, size int64) error
	PresignUpload(ctx context.Context, key, contentType string, expires time.Duration) (PresignedRequest, error)
	DownloadObject(ctx context.Context, key string) (DownloadObject, error)
	// ReadRange returns length bytes of key starting at offset (fewer at the end of the object).
	ReadRange(ctx context.Context, key string, offset, length int64) ([]byte, error)
	// HeadObject returns size and modification time of key, or ErrNotFound.
	HeadObject(ctx context.Context, key string) (ObjectInfo, error)
	// PresignDownload signs a GET; with attachmentName set the browser saves the file under that name.
	PresignDownload(ctx context.Context, key string, expires time.Duration, attachmentName string) (PresignedRequest, error)
	DeleteObject(ctx context.Context, key string) error
	DeleteObjects(ctx context.Context, keys []string) error
}
