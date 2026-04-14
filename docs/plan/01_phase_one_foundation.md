# Phase 1: Community Foundation

**Goal**: Prepare the backend architecture for high-performance metadata processing and widespread community scalability.

## 🏗️ Technical Architecture
We are transitioning from a simple configuration-based tool to a **Database-Driven Platform**.

### 1. Database Integration (PostgreSQL + TimescaleDB)
The current JSON persistence is insufficient for object-level analytics.
- **Why Postgres?**: Relational data (connections, users, metadata) fits perfectly.
- **Why TimescaleDB?**: Object usage, egress costs, and bucket sizes are time-series data. This allows us to generate "Usage over Time" graphs with sub-second performance.
- **Migration**: A `migration/` engine will be added to the Go backend to handle schema updates automatically.

### 2. Background Worker System
Processing billions of objects via the S3-API is slow. We need a way to process data without locking the UI.
- **The Worker**: A built-in Go background manager using channels and worker pools.
- **Job Tracking**: A `jobs` table in Postgres to track the status of Inventory Ingestion, Usage aggregation, and Permission scans.

### 3. Connection & Secret Management
- Secrets will move from `config.user` to the `connections` table in Postgres.
- **Master Key**: Still derived from `APP_SECRET` to keep the AES-GCM encryption robust.

---

## ✅ Deliverables (v1.2.0)
- [ ] Docker Compose updated with a PostgreSQL/TimescaleDB container.
- [ ] Go Backend refactored to use `pgx` and a database repository pattern.
- [ ] Initial Schema Migration (Users, Connections, Buckets).
- [ ] Background job dashboard in the frontend (Basic list showing active tasks).

> [!IMPORTANT]
> The focus of this phase is **Infrastructure Resilience**. We must ensure the engine is ready to handle large-scale data for all community users before we build the analytics.
