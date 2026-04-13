package frontend

import (
	"embed"
	"io/fs"
)

// DistFS holds our embedded frontend assets
//
//go:embed dist/*
var distFS embed.FS

// GetDistFS returns the subtree of the embedded FS starting at 'dist'
func GetDistFS() fs.FS {
	f, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err)
	}
	return f
}
