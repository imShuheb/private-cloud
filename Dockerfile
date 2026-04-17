# --- Stage 1: Frontend Build ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Backend Build ---
FROM golang:1.25-alpine AS backend-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Copy the built frontend so it can be embedded into the binary
COPY --from=frontend-builder /app/dist ./frontend/dist
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# --- Stage 3: Final Runtime ---
FROM alpine:latest
WORKDIR /app

RUN apk add --no-cache ca-certificates

# Copy ONLY the self-contained binary (frontend is embedded inside!)
COPY --from=backend-builder /app/main .

# Standard Environment Variables
ENV SERVER_ADDR=0.0.0.0:8080
ENV AUTH_USERNAME=admin
ENV AUTH_PASSWORD=admin@123
ENV ADMIN_API_KEY=
ENV CONFIG_DB_PATH=config/private-storage.db
ENV SFTP_ENABLED=false
ENV SFTP_ADDR=0.0.0.0:2022
ENV SFTP_USER=
ENV SFTP_PASSWORD=
ENV TLS_CERT_FILE=
ENV TLS_KEY_FILE=
ENV S3_BUCKET=
ENV S3_REGION=
ENV S3_ENDPOINT=
ENV S3_ACCESS_KEY=
ENV S3_SECRET_KEY=
ENV S3_USE_PATH_STYLE=false

EXPOSE 8080
EXPOSE 2022

CMD ["./main"]
