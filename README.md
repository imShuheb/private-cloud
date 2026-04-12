# 🛡️ Private Storage

A secure, modern S3-compatible cloud storage explorer. Manage your files with ease using a high-performance Go backend and a responsive React interface.

<p align="center">
  <img src="docs/assets/login.png" width="48%" alt="Login Screen" />
  <img src="docs/assets/inner.png" width="48%" alt="Dashboard Interface" />
</p>

## 🐳 Quick Start (Docker)

The fastest way to run Private Storage is using Docker.

1. **Clone & Configure**:
   ```bash
   git clone https://github.com/yourusername/private-storage.git
   cd private-storage
   cp .env.example .env
   # Edit .env and enter your S3 credentials (see Configuration below)
   ```

2. **Launch**:
   ```bash
   docker compose up -d
   ```

The application is now available at `http://localhost:8080`.

### Alternative: Manual Docker Setup

If you prefer building and running the image manually without Docker Compose:

1. **Build the image**:
   ```bash
   docker build -t private-storage .
   ```

2. **Run the container** (using your `.env` file):
   ```bash
   docker run -d -p 8080:8080 --env-file .env --name private-storage private-storage
   ```

   *Alternatively, run with explicit environment variables:*
   ```bash
   docker run -d -p 8080:8080 \
     -e S3_BUCKET=your-bucket-name \
     -e S3_ACCESS_KEY=your-access-key \
     -e S3_SECRET_KEY=your-secret-key \
     -e S3_REGION=us-east-1 \
     --name private-storage private-storage
   ```

---

## 🛠️ Run from Source

If you prefer to run the components manually:

### 1. Backend (Go)
```bash
go run main.go
```

### 2. Frontend (Vite)
```bash
cd frontend
npm install
npm run dev
```

---

## ⚙️ Configuration

Set these variables in your `.env` file to connect to your storage provider:

| Variable | Description |
|----------|-------------|
| `S3_BUCKET` | Your S3 bucket name |
| `S3_ACCESS_KEY` | S3 Access Key |
| `S3_SECRET_KEY` | S3 Secret Key |
| `S3_REGION` | S3 region (default: `us-east-1`) |
| `S3_ENDPOINT` | Custom endpoint (for MinIO, R2, etc.) |
| `AUTH_USERNAME` | Admin login username (default: `admin`) |
| `AUTH_PASSWORD` | Admin login password (default: `admin@123`) |

---

## ✨ Highlights
- **S3 Ready**: Works with AWS, MinIO, Cloudflare R2, and more.
- **Secure**: Direct & Presigned URL support for safe transfers.
- **Modern**: Built with Go 1.25, React 18, and Tailwind CSS v4.
- **Lightweight**: Optimized for speed and minimal resource usage.

---
Made with ❤️ for private storage.
