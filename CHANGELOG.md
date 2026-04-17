# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-04-18

### Backend
- Added built-in SFTP server (shared active web connection) and runtime settings API (`GET/PUT /api/settings`).
- Added optional HTTPS startup via TLS cert/key environment variables.
- Moved persistent config to SQLite (`config/private-storage.db`).

### Security
- Switched admin password storage to bcrypt hash.
- Stored S3 credentials encrypted at rest.
- Improved auth flow and secure cookie behavior.

### Frontend
- Added Connections server settings panel for SFTP control.
- Updated app layout to compact black/white style across login, drive, and connections pages.
- Improved drive table usability (folder metadata/actions visibility, responsive actions).
- Improved connections page structure and responsiveness to match drive shell behavior.

## [1.1.0] - 2026-04-15

### Added
- **Multi-Storage Support**: Add and manage multiple S3 accounts easily.
- **Fast Switcher**: Instantly swap between active storage connections.
- **Secured Keys**: AES-GCM encryption for all stored S3 credentials.
- **Improved Connection UI**: Support for custom endpoints and Path Style (MinIO, R2, etc).

### Changed
- **New Onboarding**: Simplified flow (Login -> Add Connection).
- **Dynamic Config**: All settings are now saved to `config.json`.
- **UI Refinement**: Cleaner design with better spacing and rounding.
- **Smart Sidebar**: "My Drive" now only appears when storage is ready.

### Technical
- Added backend resilience to prevent errors on fresh starts.
- Implemented frontend null-safety to ensure stability during loads.
- Centralized state for storage awareness.

---

## [1.0.0] - 2026-04-12

### Added
- Initial release of Private Storage.
- Basic S3 file management (List, Upload, Download, Delete).
- Simple authentication system.
- Environment-variable based configuration.
- Docker support.
