# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
