# 🛡️ Private Storage

A secure, modern S3-compatible cloud storage explorer. Manage multiple cloud storage accounts with ease using a high-performance Go backend and a responsive React interface.

## ✨ Highlights
- **Drive-style Web App**: List and grid views, breadcrumbs, multi-select (click, Ctrl/Cmd, Shift, Ctrl/Cmd+A), drag & drop uploads, folder uploads and an upload panel with per-file cancel.
- **Storage Insights**: Scan a bucket in the background to see storage by file type, the largest folders (at any depth), size and age breakdowns, possible duplicates, and a sortable, filterable list of the 5,000 largest files.
- **Bucket-wide Search**: Finds files by name anywhere in the bucket, not just the current folder.
- **Multi-Connection Ready**: Add and manage multiple S3 storage profiles (AWS, MinIO, R2, Wasabi).
- **SQLite Persistence**: Admin identity + connections are persisted in SQLite (`config/private-storage.db`).
- **Encryption at Rest**: S3 Access/Secret keys are AES-GCM encrypted before being written to SQLite.
- **Hardened Auth**: Admin password is stored as a bcrypt hash (not plaintext).
- **Owner + User Access Model**: Owner can create users and manage per-user permissions.
- **Dynamic Switching**: Swap between active buckets instantly via the dashboard.
- **In-app Preview**: Images, SVG, video, audio, PDF and text/code files open in a full-screen viewer; Download saves the file.
- **Built-in SFTP Bridge**: SFTP uses the same active web connection for consistent file access.
- **Settings Page**: Manage server settings and users access from a dedicated settings area.
- **Optional HTTPS**: Native TLS support via cert/key environment variables.
- **Modern Stack**: Built with Go 1.25+, React 18+, and Tailwind CSS.
- **Security First**: Presigned URL support for secure uploads/downloads.

---

## 🐳 Quick Start (No Code)

If you do not want to clone the repo or build anything, run the prebuilt image directly.

### Option A: One command (docker run)

1. Pull image:
    ```bash
    docker pull shuheb04/private-cloud:latest
    ```

2. Run container:
    ```bash
    docker run -d \
       --name private-cloud \
       -p 8080:8080 \
       -p 2022:2022 \
       -v private-cloud-config:/app/config \
       -e AUTH_USERNAME=admin \
       -e AUTH_PASSWORD=admin@123 \
       -e SFTP_ENABLED=false \
       shuheb04/private-cloud:latest
    ```

3. Open app:
    - Web UI: `http://localhost:8080`
    - Login: `admin` / `admin@123`

### Option B: Prebuilt image with docker compose

Create `docker-compose.yml`:

```yaml
services:
   app:
      image: shuheb04/private-cloud:latest
      ports:
         - "8080:8080"
         - "2022:2022"
      volumes:
         - private-cloud-config:/app/config
      environment:
         AUTH_USERNAME: admin
         AUTH_PASSWORD: admin@123
         SFTP_ENABLED: "false"
      restart: unless-stopped

volumes:
   private-cloud-config:
```

Start:

```bash
docker compose up -d
```

### Upgrade to latest image

```bash
docker pull shuheb04/private-cloud:latest
docker stop private-cloud
docker rm private-cloud
docker run -d \
   --name private-cloud \
   -p 8080:8080 \
   -p 2022:2022 \
   -v private-cloud-config:/app/config \
   -e AUTH_USERNAME=admin \
   -e AUTH_PASSWORD=admin@123 \
   -e SFTP_ENABLED=false \
   shuheb04/private-cloud:latest
```

---

## 🐳 Quick Start (Repo + Docker Compose)

If you want local source files and full project control:

1. **Clone & Launch**:
   ```bash
   git clone https://github.com/yourusername/private-storage.git
   cd private-storage
   docker compose up -d
   ```

2. **Login & Setup**:
   - Access the dashboard at `http://localhost:8080`.
   - Login with default credentials: `admin` / `admin@123`.
   - Go to **Connections** to add your first storage bucket.
   - Optional: configure SFTP in **Settings -> Server Settings**.

3. **Optional SFTP Access**:
   - Connect your phone/file manager to `<host>:2022`.
   - SFTP uses the same active storage connection selected in the web UI.

---

## ⚙️ Configuration

While storage is managed via the UI, you can set these environment variables in your `.env` for the server setup:

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_USERNAME` | Master Admin Username | `admin` |
| `AUTH_PASSWORD` | Master Admin Password | `admin@123` |
| `ADMIN_API_KEY` | Optional API key for non-cookie API access (`Authorization: Bearer ...` / `X-API-Key`) | empty |
| `SERVER_ADDR` | Server bind address | `0.0.0.0:8080` |
| `CONFIG_DB_PATH` | SQLite file path for app state | `config/private-storage.db` |
| `SFTP_ENABLED` | Enable built-in SFTP server bound to active web connection | `false` |
| `SFTP_ADDR` | SFTP bind address | `0.0.0.0:2022` |
| `TLS_CERT_FILE` | Path to TLS cert PEM (enables HTTPS when set with key) | empty |
| `TLS_KEY_FILE` | Path to TLS private key PEM | empty |
| `APP_SECRET` | Secret used for credential encryption (any length; e.g. `openssl rand -hex 32`) | Random key generated in `config/app.key` |

Notes:
- If `TLS_CERT_FILE` + `TLS_KEY_FILE` are set, server starts with HTTPS.
- SFTP can also be configured at runtime from the web settings page.

---

## 🛠️ Run from Source

### 1. Backend (Go)
```bash
go run main.go
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 🔐 Security Note
All storage credentials added through the dashboard are stored in SQLite (`config/private-storage.db`). To protect these keys, the application encrypts access/secret keys at rest using AES-GCM. For production deployments:

- set a custom `APP_SECRET` (without it, a random key is generated in `config/app.key`; back it up together with the database, since credentials can't be decrypted without it)
- run behind HTTPS (or set `TLS_CERT_FILE` + `TLS_KEY_FILE`)
- set `ADMIN_API_KEY` only if you need token-based API access

### Samsung / Phone Access
Built-in SFTP is available now. When enabled, SFTP always uses the same active connection selected in the web UI, so list/upload/download stay in sync.

Authentication uses app users. Access is controlled by each user's permissions (including SFTP access).

Quick setup:

1. Set `SFTP_ENABLED=true`
2. Create/manage users in **Settings -> Users & Access**
3. Enable `Allow SFTP login` for users who need SFTP access
4. Start app and connect phone file manager to `<host>:2022` over SFTP

### File Access Behavior (Web)
- **Preview**: opens supported files (images, SVG, video, audio, PDF, text up to 1 MB) in the in-app viewer. PDFs, SVGs and text are fetched by the browser, which also needs the bucket's CORS rule.
- **Download**: triggers an actual attachment download.
- Uploads and downloads go **directly between the browser and the bucket** with presigned URLs, so the bucket needs a CORS rule allowing `GET`/`PUT` from the app's origin and exposing `ETag`.

### Storage Insights
**Storage insights** (left menu) scans the active bucket's object listing, never the file contents. The first scan starts automatically; **Rescan** refreshes it, and a scan can be stopped at any time (the previous results are kept). Results stay in memory per connection and are lost on restart. On very large buckets a scan takes a while: it pages through the listing 1,000 objects at a time.

### Security behaviour
- Changing a user's permissions, disabling them or deleting them applies **immediately**, including to sessions that are already signed in.
- After 10 failed sign-ins for one username from one address within 15 minutes, further attempts are refused for the rest of that window.
- The API never returns stored S3 keys; editing a connection with blank keys keeps the saved ones.
- New and edited connections are tested against the bucket before they are saved.

### API (main endpoints)
All endpoints except `/api/auth/*` and `/api/health` need a session cookie or `ADMIN_API_KEY`. Errors are JSON: `{"error": "..."}`.

| Method & path | Purpose |
|---|---|
| `GET /api/drive/list?prefix=&continuationToken=` | One folder, paginated |
| `GET /api/drive/search?q=&limit=` | Name search across the bucket |
| `GET /api/drive/stats` | Totals from the latest scan (starts one if needed) |
| `POST /api/drive/presign/upload` | Presigned PUT for a key |
| `GET /api/drive/presign/download?key=&download=1` | Presigned GET; `download=1` forces a file save |
| `POST /api/bulk-objects-delete` | Delete files and folders (`{"keys": [...]}`) |
| `GET /api/analytics` | Scan status and report summary |
| `POST /api/analytics/scan`, `POST /api/analytics/scan/cancel` | Start or stop a scan |
| `GET /api/analytics/files?sort=size\|name\|modified\|type&order=&category=&q=&minSize=&folder=&offset=&limit=` | Largest files, filtered and paged |
| `GET /api/connections/active` | Active storage name and bucket |

---
## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
## 🤝 Contributing

Contributions are welcome.

- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Discussion post draft for inviting contributors: [docs/help-wanted-discussion.md](docs/help-wanted-discussion.md)
- Public roadmap: [ROADMAP.md](ROADMAP.md)

---
Made with ❤️ for private storage.
