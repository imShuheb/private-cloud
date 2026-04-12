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

type Store interface {
	GetStats(ctx context.Context) (DriveStats, error)
	ListObjects(ctx context.Context, prefix, continuationToken string, limit int32) (ListResult, error)
	ListBrowser(ctx context.Context, prefix, continuationToken string, limit int32) (BrowserListResult, error)
	UploadObject(ctx context.Context, key, contentType string, body io.Reader) error
	PresignUpload(ctx context.Context, key, contentType string, expires time.Duration) (PresignedRequest, error)
	DownloadObject(ctx context.Context, key string) (DownloadObject, error)
	PresignDownload(ctx context.Context, key string, expires time.Duration) (PresignedRequest, error)
	DeleteObject(ctx context.Context, key string) error
	DeleteObjects(ctx context.Context, keys []string) error
}
