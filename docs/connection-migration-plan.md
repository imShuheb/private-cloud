# Connection Migration Plan

## Scope

Two migration tracks are required:

1. Database schema migrations (upgrade guarantees).
2. Data migration between storage connections/buckets (operator workflow).

## 1) Database Schema Migrations

### Goal

Guarantee safe upgrades between versions with explicit, versioned migration files.

### Approach

- Add a schema_migrations table.
- Run pending migrations at startup before serving requests.
- Track applied version + checksum + applied_at.
- Stop startup on failed migration.

### Rules

- Migrations are immutable once released.
- Every migration has an up and rollback strategy.
- Breaking migrations require explicit release notes.

### Test Requirements

- Fresh install path test.
- Upgrade from previous release test.
- Failure simulation and recovery test.

## 2) Bucket-to-Bucket Connection Migration

### Goal

Allow moving/copying data from one configured connection to another from Connections manager.

### Access Model (v1)

- owner: can run dry-run, start, cancel, and retry migration jobs
- user: can view status only (no execute/cancel actions)

### v1 Feature Set

- Source connection select.
- Destination connection select.
- Prefix filter (optional).
- Mode: copy or move.
- Conflict policy: skip, overwrite, fail.
- Dry-run estimate (objects + bytes).

### Execution Model

- Create migration job record with status lifecycle:
  - pending -> running -> completed/failed/cancelled
- Track progress:
  - scanned_objects
  - migrated_objects
  - failed_objects
  - bytes_done
- Persist per-object errors for retry.

### Safety Controls

- Validate source != destination.
- Require confirmation for move mode.
- Require dry-run completion before execute.
- Keep delete step separate and explicit for move finalization.

### API Endpoints (proposed)

- POST /api/migrations/connections/dry-run
- POST /api/migrations/connections/start
- GET /api/migrations/connections/{id}
- POST /api/migrations/connections/{id}/cancel
- POST /api/migrations/connections/{id}/retry-failed

### UI Requirements

- New "Migrate Data" action in Connections page.
- Progress panel with live status and error summary.
- Final report with downloadable error list.

## Success Criteria

- No silent data loss.
- Resume/retry behavior works after restart.
- Operators can estimate cost/time before execution.
