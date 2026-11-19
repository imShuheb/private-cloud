package storage

import (
	"mime"
	"path"
	"strings"
)

// mediaTypes covers photo and video formats phones produce. Go's built-in table lacks most
// of them, and minimal container images have no /etc/mime.types to fill the gap.
var mediaTypes = map[string]string{
	".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
	".webp": "image/webp", ".heic": "image/heic", ".heif": "image/heif", ".avif": "image/avif",
	".bmp": "image/bmp", ".tif": "image/tiff", ".tiff": "image/tiff", ".svg": "image/svg+xml",
	".dng": "image/x-adobe-dng",
	".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".3gp": "video/3gpp",
	".webm": "video/webm", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo",
	".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav",
	".ogg": "audio/ogg", ".flac": "audio/flac", ".opus": "audio/ogg",
	".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".json": "application/json",
	".zip": "application/zip",
}

// ContentTypeFor returns given unless it is empty or generic, in which case the type is
// guessed from key's extension, so files uploaded over SFTP preview and play in browsers.
func ContentTypeFor(key, given string) string {
	given = strings.TrimSpace(given)
	if given != "" && given != "application/octet-stream" {
		return given
	}
	ext := strings.ToLower(path.Ext(key))
	if t, ok := mediaTypes[ext]; ok {
		return t
	}
	if t := mime.TypeByExtension(ext); t != "" {
		return t
	}
	return "application/octet-stream"
}
