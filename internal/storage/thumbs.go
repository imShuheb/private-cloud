package storage

import (
	"path"
	"strings"
)

// ThumbPrefix holds small JPEG previews, stored as ThumbPrefix + original key + ".jpg".
// The desktop uploader writes them; listings, search and analytics hide this folder.
const ThumbPrefix = ".thumbs/"

// ThumbKey returns where the thumbnail for key is stored.
func ThumbKey(key string) string {
	return ThumbPrefix + key + ".jpg"
}

// IsThumbKey reports whether key is inside the thumbnail folder.
func IsThumbKey(key string) bool {
	return strings.HasPrefix(key, ThumbPrefix)
}

var thumbnailExts = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true, ".bmp": true,
	".heic": true, ".heif": true, ".tif": true, ".tiff": true, ".dng": true, ".avif": true,
	".mp4": true, ".m4v": true, ".mov": true, ".3gp": true, ".webm": true, ".mkv": true, ".avi": true,
}

// MayHaveThumbnail reports whether files like key get a thumbnail (photos and videos).
func MayHaveThumbnail(key string) bool {
	return !IsThumbKey(key) && thumbnailExts[strings.ToLower(path.Ext(key))]
}

// hideThumbs reports whether listing prefix should leave out the thumbnail folder:
// always, unless the caller is listing inside it on purpose.
func hideThumbs(prefix string) bool {
	return !IsThumbKey(prefix)
}
