# Desktop uploader (Windows)

A desktop app that does the heavy work on your own computer: it uploads straight to R2
and makes thumbnails. The web server then only needs read access, for browsing from a phone.

```
Desktop app (this folder)               Web server (repo root, READ_ONLY=true)
 - same React interface                  - phone opens it in the browser
 - uploads from disk straight to R2      - R2 token with Object Read only
 - large files in parts, parallel,       - signs links; photo bytes go
   resume, skips files already uploaded    straight from R2 to the phone
 - writes thumbnails to .thumbs/
                 \                              /
                  '-------------> R2 <---------'
```

## Plan

1. Wails app shell (Go + the existing React frontend), reusing `internal/storage`
   for multipart uploads, copies and listings.
2. Upload queue: pick files or folders, parallel uploads, progress, resume after
   restarts, skip files that already exist with the same size.
3. Thumbnails for JPEG and PNG at upload time, plus "make missing thumbnails" for
   files uploaded by other tools (phone, rclone).
4. Video thumbnails with a bundled ffmpeg.
5. R2 keys stored with Windows DPAPI, never in plain text.

## Thumbnail layout

For every photo or video `KEY`, the thumbnail is a JPEG at `.thumbs/KEY.jpg`, at most
400 px on its longest side, uploaded with `Cache-Control: private, max-age=604800`.
The web app hides `.thumbs/` from listings, search and storage insights, deletes
thumbnails together with their files, and falls back to the file icon when one is missing.
