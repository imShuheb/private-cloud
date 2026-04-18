package api

import (
  "bytes"
  "context"
  "database/sql"
  "encoding/json"
  "errors"
  "fmt"
  "io"
  "net/http"
  "strconv"
  "strings"

  "private-storage/internal/appconfig"
  "private-storage/internal/storage"
)

type connectionMigrationRequest struct {
  SourceConnectionID      string `json:"sourceConnectionId"`
  DestinationConnectionID string `json:"destinationConnectionId"`
  PrefixFilter            string `json:"prefixFilter"`
  Mode                    string `json:"mode"`
  ConflictPolicy          string `json:"conflictPolicy"`
}

type connectionMigrationJob struct {
  ID                      int64   `json:"id"`
  CreatedByUserID         int64   `json:"createdByUserId"`
  SourceConnectionID      string  `json:"sourceConnectionId"`
  DestinationConnectionID string  `json:"destinationConnectionId"`
  PrefixFilter            string  `json:"prefixFilter"`
  Mode                    string  `json:"mode"`
  ConflictPolicy          string  `json:"conflictPolicy"`
  Status                  string  `json:"status"`
  DryRunScannedObjects    int64   `json:"dryRunScannedObjects"`
  DryRunBytes             int64   `json:"dryRunBytes"`
  ScannedObjects          int64   `json:"scannedObjects"`
  MigratedObjects         int64   `json:"migratedObjects"`
  FailedObjects           int64   `json:"failedObjects"`
  BytesDone               int64   `json:"bytesDone"`
  ErrorSummary            string  `json:"errorSummary"`
  CreatedAt               string  `json:"createdAt"`
  StartedAt               *string `json:"startedAt,omitempty"`
  FinishedAt              *string `json:"finishedAt,omitempty"`
  UpdatedAt               string  `json:"updatedAt"`
}

type connectionMigrationJobError struct {
  ObjectKey    string `json:"objectKey"`
  ErrorMessage string `json:"errorMessage"`
  CreatedAt    string `json:"createdAt"`
}

type dryRunResult struct {
  ScannedObjects int64 `json:"scannedObjects"`
  Bytes          int64 `json:"bytes"`
}

func (s *Server) handleConnectionMigrationDryRun(w http.ResponseWriter, r *http.Request) {
  if r.Method != http.MethodPost {
    http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
    return
  }

  req, srcConn, dstConn, err := s.decodeAndValidateConnectionMigrationRequest(r)
  if err != nil {
    http.Error(w, err.Error(), http.StatusBadRequest)
    return
  }

  result, err := s.performConnectionMigrationDryRun(r.Context(), srcConn, req.PrefixFilter)
  if err != nil {
    http.Error(w, "dry-run failed: "+err.Error(), http.StatusBadGateway)
    return
  }

  writeJSON(w, http.StatusOK, map[string]any{
    "sourceConnectionId":      req.SourceConnectionID,
    "destinationConnectionId": req.DestinationConnectionID,
    "sourceBucket":            srcConn.Bucket,
    "destinationBucket":       dstConn.Bucket,
    "prefixFilter":            req.PrefixFilter,
    "mode":                    req.Mode,
    "conflictPolicy":          req.ConflictPolicy,
    "dryRun":                  result,
  })
}

func (s *Server) handleConnectionMigrationStart(w http.ResponseWriter, r *http.Request) {
  if r.Method != http.MethodPost {
    http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
    return
  }

  req, srcConn, dstConn, err := s.decodeAndValidateConnectionMigrationRequest(r)
  if err != nil {
    http.Error(w, err.Error(), http.StatusBadRequest)
    return
  }

  p, ok := principalFromRequest(r)
  if !ok {
    http.Error(w, "unauthorized", http.StatusUnauthorized)
    return
  }

  dryRun, err := s.performConnectionMigrationDryRun(r.Context(), srcConn, req.PrefixFilter)
  if err != nil {
    http.Error(w, "dry-run failed: "+err.Error(), http.StatusBadGateway)
    return
  }

  db := s.cfg.DB()
  if db == nil {
    http.Error(w, "database unavailable", http.StatusServiceUnavailable)
    return
  }

  res, err := db.Exec(`
    INSERT INTO connection_migration_jobs (
      created_by_user_id,
      source_connection_id,
      destination_connection_id,
      prefix_filter,
      mode,
      conflict_policy,
      status,
      dry_run_scanned_objects,
      dry_run_bytes,
      error_summary,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, '', CURRENT_TIMESTAMP)
  `,
    p.userID,
    req.SourceConnectionID,
    req.DestinationConnectionID,
    req.PrefixFilter,
    req.Mode,
    req.ConflictPolicy,
    dryRun.ScannedObjects,
    dryRun.Bytes,
  )
  if err != nil {
    http.Error(w, "failed to create migration job", http.StatusInternalServerError)
    return
  }

  jobID, err := res.LastInsertId()
  if err != nil {
    http.Error(w, "failed to create migration job", http.StatusInternalServerError)
    return
  }

  ctx, cancel := context.WithCancel(context.Background())
  s.registerConnectionMigrationCancel(jobID, cancel)

  go func() {
    defer s.unregisterConnectionMigrationCancel(jobID)
    s.runConnectionMigrationJob(ctx, jobID, req, srcConn, dstConn)
  }()

  writeJSON(w, http.StatusAccepted, map[string]any{
    "jobId":                    jobID,
    "status":                   "pending",
    "dryRunScannedObjects":     dryRun.ScannedObjects,
    "dryRunBytes":              dryRun.Bytes,
    "sourceConnectionId":       req.SourceConnectionID,
    "destinationConnectionId":  req.DestinationConnectionID,
  })
}

func (s *Server) handleConnectionMigrationStatus(w http.ResponseWriter, r *http.Request) {
  if r.Method != http.MethodGet {
    http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
    return
  }

  idText := strings.TrimPrefix(r.URL.Path, "/api/migrations/connections/")
  idText = strings.TrimSpace(idText)
  if idText == "" || strings.Contains(idText, "/") {
    http.Error(w, "invalid migration id", http.StatusBadRequest)
    return
  }

  id, err := strconv.ParseInt(idText, 10, 64)
  if err != nil || id <= 0 {
    http.Error(w, "invalid migration id", http.StatusBadRequest)
    return
  }

  job, err := s.getConnectionMigrationJob(id)
  if err != nil {
    if errors.Is(err, sql.ErrNoRows) {
      http.Error(w, "migration job not found", http.StatusNotFound)
      return
    }
    http.Error(w, "failed to load migration job", http.StatusInternalServerError)
    return
  }

  errs, err := s.listConnectionMigrationErrors(id, 200)
  if err != nil {
    http.Error(w, "failed to load migration errors", http.StatusInternalServerError)
    return
  }

  writeJSON(w, http.StatusOK, map[string]any{
    "job":    job,
    "errors": errs,
  })
}

func (s *Server) handleConnectionMigrationActions(w http.ResponseWriter, r *http.Request) {
  if r.Method != http.MethodPost {
    http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
    return
  }

  path := strings.TrimPrefix(r.URL.Path, "/api/migrations/connections/")
  parts := strings.Split(strings.Trim(path, "/"), "/")
  if len(parts) != 2 {
    http.Error(w, "invalid migration action path", http.StatusBadRequest)
    return
  }

  id, err := strconv.ParseInt(parts[0], 10, 64)
  if err != nil || id <= 0 {
    http.Error(w, "invalid migration id", http.StatusBadRequest)
    return
  }

  switch strings.TrimSpace(parts[1]) {
  case "cancel":
    s.handleConnectionMigrationCancel(w, id)
  case "retry-failed":
    s.handleConnectionMigrationRetryFailed(w, id)
  default:
    http.Error(w, "unknown migration action", http.StatusNotFound)
  }
}

func (s *Server) handleConnectionMigrationCancel(w http.ResponseWriter, jobID int64) {
  db := s.cfg.DB()
  if db == nil {
    http.Error(w, "database unavailable", http.StatusServiceUnavailable)
    return
  }

  cancel := s.getConnectionMigrationCancel(jobID)
  if cancel != nil {
    cancel()
  }

  if _, err := db.Exec(`
    UPDATE connection_migration_jobs
    SET status='cancelled', error_summary='cancel requested', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
    WHERE id = ? AND status IN ('pending','running')
  `, jobID); err != nil {
    http.Error(w, "failed to cancel migration", http.StatusInternalServerError)
    return
  }

  writeJSON(w, http.StatusOK, map[string]any{"cancelled": true})
}

func (s *Server) handleConnectionMigrationRetryFailed(w http.ResponseWriter, jobID int64) {
  job, err := s.getConnectionMigrationJob(jobID)
  if err != nil {
    if errors.Is(err, sql.ErrNoRows) {
      http.Error(w, "migration job not found", http.StatusNotFound)
      return
    }
    http.Error(w, "failed to load migration job", http.StatusInternalServerError)
    return
  }

  keys, err := s.listConnectionMigrationFailedKeys(jobID)
  if err != nil {
    http.Error(w, "failed to load failed objects", http.StatusInternalServerError)
    return
  }
  if len(keys) == 0 {
    http.Error(w, "no failed objects to retry", http.StatusBadRequest)
    return
  }

  srcConn, dstConn, err := s.resolveConnections(job.SourceConnectionID, job.DestinationConnectionID)
  if err != nil {
    http.Error(w, err.Error(), http.StatusBadRequest)
    return
  }

  req := connectionMigrationRequest{
    SourceConnectionID:      job.SourceConnectionID,
    DestinationConnectionID: job.DestinationConnectionID,
    PrefixFilter:            job.PrefixFilter,
    Mode:                    job.Mode,
    ConflictPolicy:          job.ConflictPolicy,
  }

  ctx, cancel := context.WithCancel(context.Background())
  s.registerConnectionMigrationCancel(jobID, cancel)

  go func() {
    defer s.unregisterConnectionMigrationCancel(jobID)
    s.retryConnectionMigrationJobKeys(ctx, jobID, req, srcConn, dstConn, keys)
  }()

  writeJSON(w, http.StatusAccepted, map[string]any{"retryStarted": true})
}

func (s *Server) performConnectionMigrationDryRun(ctx context.Context, sourceConn appconfig.Connection, prefix string) (dryRunResult, error) {
  srcStore, err := s.initStorage(ctx, &sourceConn)
  if err != nil {
    return dryRunResult{}, err
  }

  var totalObjects int64
  var totalBytes int64
  continuation := ""
  for {
    result, err := srcStore.ListObjects(ctx, normalizeMigrationPrefix(prefix), continuation, 1000)
    if err != nil {
      return dryRunResult{}, err
    }
    for _, item := range result.Items {
      totalObjects++
      totalBytes += item.Size
    }
    if !result.IsTruncated {
      break
    }
    continuation = result.NextContinuationToken
  }

  return dryRunResult{ScannedObjects: totalObjects, Bytes: totalBytes}, nil
}

func (s *Server) runConnectionMigrationJob(ctx context.Context, jobID int64, req connectionMigrationRequest, srcConn, dstConn appconfig.Connection) {
  _ = s.updateConnectionMigrationJobRunning(jobID)

  srcStore, err := s.initStorage(ctx, &srcConn)
  if err != nil {
    _ = s.updateConnectionMigrationJobTerminal(jobID, "failed", "failed to initialize source store: "+err.Error())
    return
  }
  dstStore, err := s.initStorage(ctx, &dstConn)
  if err != nil {
    _ = s.updateConnectionMigrationJobTerminal(jobID, "failed", "failed to initialize destination store: "+err.Error())
    return
  }

  if err := s.executeConnectionMigration(ctx, jobID, req, srcStore, dstStore, nil); err != nil {
    if errors.Is(err, context.Canceled) {
      _ = s.updateConnectionMigrationJobTerminal(jobID, "cancelled", "cancelled")
      return
    }
    _ = s.updateConnectionMigrationJobTerminal(jobID, "failed", err.Error())
    return
  }

  _ = s.updateConnectionMigrationJobTerminal(jobID, "completed", "")
}

func (s *Server) retryConnectionMigrationJobKeys(ctx context.Context, jobID int64, req connectionMigrationRequest, srcConn, dstConn appconfig.Connection, keys []string) {
  _ = s.updateConnectionMigrationJobRunning(jobID)

  srcStore, err := s.initStorage(ctx, &srcConn)
  if err != nil {
    _ = s.updateConnectionMigrationJobTerminal(jobID, "failed", "failed to initialize source store: "+err.Error())
    return
  }
  dstStore, err := s.initStorage(ctx, &dstConn)
  if err != nil {
    _ = s.updateConnectionMigrationJobTerminal(jobID, "failed", "failed to initialize destination store: "+err.Error())
    return
  }

  if err := s.clearConnectionMigrationErrors(jobID); err != nil {
    _ = s.updateConnectionMigrationJobTerminal(jobID, "failed", "failed to reset previous errors")
    return
  }

  if err := s.executeConnectionMigration(ctx, jobID, req, srcStore, dstStore, keys); err != nil {
    if errors.Is(err, context.Canceled) {
      _ = s.updateConnectionMigrationJobTerminal(jobID, "cancelled", "cancelled")
      return
    }
    _ = s.updateConnectionMigrationJobTerminal(jobID, "failed", err.Error())
    return
  }

  _ = s.updateConnectionMigrationJobTerminal(jobID, "completed", "")
}

func (s *Server) executeConnectionMigration(ctx context.Context, jobID int64, req connectionMigrationRequest, srcStore, dstStore storage.Store, onlyKeys []string) error {
  if len(onlyKeys) > 0 {
    for _, key := range onlyKeys {
      if err := s.processMigrationObject(ctx, jobID, req, srcStore, dstStore, key); err != nil {
        return err
      }
    }
    return nil
  }

  continuation := ""
  for {
    select {
    case <-ctx.Done():
      return context.Canceled
    default:
    }

    result, err := srcStore.ListObjects(ctx, normalizeMigrationPrefix(req.PrefixFilter), continuation, 1000)
    if err != nil {
      return fmt.Errorf("list source objects failed: %w", err)
    }

    for _, item := range result.Items {
      if err := s.processMigrationObject(ctx, jobID, req, srcStore, dstStore, item.Key); err != nil {
        return err
      }
    }

    if !result.IsTruncated {
      break
    }
    continuation = result.NextContinuationToken
  }

  return nil
}

func (s *Server) processMigrationObject(ctx context.Context, jobID int64, req connectionMigrationRequest, srcStore, dstStore storage.Store, key string) error {
  select {
  case <-ctx.Done():
    return context.Canceled
  default:
  }

  bytesDone := int64(0)
  srcObj, err := srcStore.DownloadObject(ctx, key)
  if err != nil {
    _ = s.recordConnectionMigrationObjectError(jobID, key, "source download failed: "+err.Error())
    _ = s.incrementConnectionMigrationProgress(jobID, 1, 0, 1, 0)
    if req.ConflictPolicy == "fail" {
      return fmt.Errorf("object %s failed: %w", key, err)
    }
    return nil
  }
  defer srcObj.Body.Close()

  exists, err := objectExists(ctx, dstStore, key)
  if err != nil {
    _ = s.recordConnectionMigrationObjectError(jobID, key, "destination check failed: "+err.Error())
    _ = s.incrementConnectionMigrationProgress(jobID, 1, 0, 1, 0)
    if req.ConflictPolicy == "fail" {
      return fmt.Errorf("object %s failed: %w", key, err)
    }
    return nil
  }

  if exists && req.ConflictPolicy == "skip" {
    _ = s.incrementConnectionMigrationProgress(jobID, 1, 1, 0, 0)
    return nil
  }
  if exists && req.ConflictPolicy == "fail" {
    msg := "destination object exists"
    _ = s.recordConnectionMigrationObjectError(jobID, key, msg)
    _ = s.incrementConnectionMigrationProgress(jobID, 1, 0, 1, 0)
    return fmt.Errorf("object %s failed: %s", key, msg)
  }

  contentType := strings.TrimSpace(srcObj.ContentType)
  if contentType == "" {
    contentType = "application/octet-stream"
  }

  // Buffer the source payload so the downstream SDK can set a deterministic length.
  payload, err := io.ReadAll(srcObj.Body)
  if err != nil {
    _ = s.recordConnectionMigrationObjectError(jobID, key, "source read failed: "+err.Error())
    _ = s.incrementConnectionMigrationProgress(jobID, 1, 0, 1, 0)
    if req.ConflictPolicy == "fail" {
      return fmt.Errorf("object %s failed: %w", key, err)
    }
    return nil
  }

  if err := dstStore.UploadObject(ctx, key, contentType, bytes.NewReader(payload)); err != nil {
    _ = s.recordConnectionMigrationObjectError(jobID, key, "destination upload failed: "+err.Error())
    _ = s.incrementConnectionMigrationProgress(jobID, 1, 0, 1, 0)
    if req.ConflictPolicy == "fail" {
      return fmt.Errorf("object %s failed: %w", key, err)
    }
    return nil
  }
  if len(payload) > 0 {
    bytesDone = int64(len(payload))
  } else if srcObj.ContentLength > 0 {
    bytesDone = srcObj.ContentLength
  }

  if req.Mode == "move" {
    if err := srcStore.DeleteObject(ctx, key); err != nil {
      _ = s.recordConnectionMigrationObjectError(jobID, key, "source delete after move failed: "+err.Error())
      _ = s.incrementConnectionMigrationProgress(jobID, 1, 0, 1, bytesDone)
      if req.ConflictPolicy == "fail" {
        return fmt.Errorf("object %s failed: %w", key, err)
      }
      return nil
    }
  }

  _ = s.incrementConnectionMigrationProgress(jobID, 1, 1, 0, bytesDone)
  return nil
}

func objectExists(ctx context.Context, store storage.Store, key string) (bool, error) {
  obj, err := store.DownloadObject(ctx, key)
  if err != nil {
    return false, nil
  }
  if obj.Body != nil {
    _, _ = io.CopyN(io.Discard, obj.Body, 1)
    _ = obj.Body.Close()
  }
  return true, nil
}

func (s *Server) decodeAndValidateConnectionMigrationRequest(r *http.Request) (connectionMigrationRequest, appconfig.Connection, appconfig.Connection, error) {
  var req connectionMigrationRequest
  if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
    return req, appconfig.Connection{}, appconfig.Connection{}, errors.New("invalid payload")
  }

  req.SourceConnectionID = strings.TrimSpace(req.SourceConnectionID)
  req.DestinationConnectionID = strings.TrimSpace(req.DestinationConnectionID)
  req.PrefixFilter = normalizeMigrationPrefix(req.PrefixFilter)
  req.Mode = strings.ToLower(strings.TrimSpace(req.Mode))
  req.ConflictPolicy = strings.ToLower(strings.TrimSpace(req.ConflictPolicy))

  if req.SourceConnectionID == "" || req.DestinationConnectionID == "" {
    return req, appconfig.Connection{}, appconfig.Connection{}, errors.New("sourceConnectionId and destinationConnectionId are required")
  }
  if req.SourceConnectionID == req.DestinationConnectionID {
    return req, appconfig.Connection{}, appconfig.Connection{}, errors.New("source and destination must be different")
  }
  if req.Mode != "copy" && req.Mode != "move" {
    return req, appconfig.Connection{}, appconfig.Connection{}, errors.New("mode must be copy or move")
  }
  if req.ConflictPolicy != "skip" && req.ConflictPolicy != "overwrite" && req.ConflictPolicy != "fail" {
    return req, appconfig.Connection{}, appconfig.Connection{}, errors.New("conflictPolicy must be skip, overwrite, or fail")
  }

  srcConn, dstConn, err := s.resolveConnections(req.SourceConnectionID, req.DestinationConnectionID)
  if err != nil {
    return req, appconfig.Connection{}, appconfig.Connection{}, err
  }

  return req, srcConn, dstConn, nil
}

func (s *Server) resolveConnections(sourceID, destinationID string) (appconfig.Connection, appconfig.Connection, error) {
  s.mu.RLock()
  defer s.mu.RUnlock()

  var srcConn *appconfig.Connection
  var dstConn *appconfig.Connection
  for i := range s.cfg.Connections {
    c := s.cfg.Connections[i]
    if c.ID == sourceID {
      cc := c
      srcConn = &cc
    }
    if c.ID == destinationID {
      cc := c
      dstConn = &cc
    }
  }

  if srcConn == nil {
    return appconfig.Connection{}, appconfig.Connection{}, errors.New("source connection not found")
  }
  if dstConn == nil {
    return appconfig.Connection{}, appconfig.Connection{}, errors.New("destination connection not found")
  }

  return *srcConn, *dstConn, nil
}

func normalizeMigrationPrefix(prefix string) string {
  p := strings.TrimSpace(strings.TrimLeft(prefix, "/"))
  if p == "" {
    return ""
  }
  if strings.HasSuffix(p, "/") {
    return p
  }
  return p + "/"
}

func (s *Server) registerConnectionMigrationCancel(jobID int64, cancel context.CancelFunc) {
  s.migrationMu.Lock()
  s.connectionMigrationRuns[jobID] = cancel
  s.migrationMu.Unlock()
}

func (s *Server) unregisterConnectionMigrationCancel(jobID int64) {
  s.migrationMu.Lock()
  delete(s.connectionMigrationRuns, jobID)
  s.migrationMu.Unlock()
}

func (s *Server) getConnectionMigrationCancel(jobID int64) context.CancelFunc {
  s.migrationMu.Lock()
  cancel := s.connectionMigrationRuns[jobID]
  s.migrationMu.Unlock()
  return cancel
}

func (s *Server) markStaleRunningConnectionMigrationJobs() error {
  db := s.cfg.DB()
  if db == nil {
    return errors.New("database unavailable")
  }

  _, err := db.Exec(`
    UPDATE connection_migration_jobs
    SET status='failed',
        error_summary='job interrupted during server restart',
        finished_at=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP
    WHERE status='running'
  `)
  return err
}

func (s *Server) updateConnectionMigrationJobRunning(jobID int64) error {
  db := s.cfg.DB()
  if db == nil {
    return errors.New("database unavailable")
  }

  _, err := db.Exec(`
    UPDATE connection_migration_jobs
    SET status='running',
        started_at=COALESCE(started_at, CURRENT_TIMESTAMP),
        error_summary='',
        updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `, jobID)
  return err
}

func (s *Server) updateConnectionMigrationJobTerminal(jobID int64, status, errorSummary string) error {
  db := s.cfg.DB()
  if db == nil {
    return errors.New("database unavailable")
  }

  _, err := db.Exec(`
    UPDATE connection_migration_jobs
    SET status=?,
        error_summary=?,
        finished_at=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `, status, strings.TrimSpace(errorSummary), jobID)
  return err
}

func (s *Server) incrementConnectionMigrationProgress(jobID, scannedInc, migratedInc, failedInc, bytesInc int64) error {
  db := s.cfg.DB()
  if db == nil {
    return errors.New("database unavailable")
  }

  _, err := db.Exec(`
    UPDATE connection_migration_jobs
    SET scanned_objects = scanned_objects + ?,
        migrated_objects = migrated_objects + ?,
        failed_objects = failed_objects + ?,
        bytes_done = bytes_done + ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, scannedInc, migratedInc, failedInc, bytesInc, jobID)
  return err
}

func (s *Server) recordConnectionMigrationObjectError(jobID int64, key, message string) error {
  db := s.cfg.DB()
  if db == nil {
    return errors.New("database unavailable")
  }

  _, err := db.Exec(`
    INSERT INTO connection_migration_job_errors(job_id, object_key, error_message)
    VALUES (?, ?, ?)
  `, jobID, key, message)
  return err
}

func (s *Server) clearConnectionMigrationErrors(jobID int64) error {
  db := s.cfg.DB()
  if db == nil {
    return errors.New("database unavailable")
  }

  _, err := db.Exec(`DELETE FROM connection_migration_job_errors WHERE job_id = ?`, jobID)
  if err != nil {
    return err
  }

  _, err = db.Exec(`
    UPDATE connection_migration_jobs
    SET failed_objects=0, error_summary='', finished_at=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `, jobID)
  return err
}

func (s *Server) listConnectionMigrationFailedKeys(jobID int64) ([]string, error) {
  db := s.cfg.DB()
  if db == nil {
    return nil, errors.New("database unavailable")
  }

  rows, err := db.Query(`
    SELECT DISTINCT object_key
    FROM connection_migration_job_errors
    WHERE job_id=?
    ORDER BY object_key ASC
  `, jobID)
  if err != nil {
    return nil, err
  }
  defer rows.Close()

  keys := make([]string, 0)
  for rows.Next() {
    var key string
    if err := rows.Scan(&key); err != nil {
      return nil, err
    }
    key = strings.TrimSpace(key)
    if key != "" {
      keys = append(keys, key)
    }
  }
  return keys, rows.Err()
}

func (s *Server) getConnectionMigrationJob(jobID int64) (connectionMigrationJob, error) {
  db := s.cfg.DB()
  if db == nil {
    return connectionMigrationJob{}, errors.New("database unavailable")
  }

  var job connectionMigrationJob
  var startedAt sql.NullString
  var finishedAt sql.NullString

  err := db.QueryRow(`
    SELECT
      id,
      created_by_user_id,
      source_connection_id,
      destination_connection_id,
      prefix_filter,
      mode,
      conflict_policy,
      status,
      dry_run_scanned_objects,
      dry_run_bytes,
      scanned_objects,
      migrated_objects,
      failed_objects,
      bytes_done,
      error_summary,
      created_at,
      started_at,
      finished_at,
      updated_at
    FROM connection_migration_jobs
    WHERE id = ?
  `, jobID).Scan(
    &job.ID,
    &job.CreatedByUserID,
    &job.SourceConnectionID,
    &job.DestinationConnectionID,
    &job.PrefixFilter,
    &job.Mode,
    &job.ConflictPolicy,
    &job.Status,
    &job.DryRunScannedObjects,
    &job.DryRunBytes,
    &job.ScannedObjects,
    &job.MigratedObjects,
    &job.FailedObjects,
    &job.BytesDone,
    &job.ErrorSummary,
    &job.CreatedAt,
    &startedAt,
    &finishedAt,
    &job.UpdatedAt,
  )
  if err != nil {
    return connectionMigrationJob{}, err
  }

  if startedAt.Valid {
    v := startedAt.String
    job.StartedAt = &v
  }
  if finishedAt.Valid {
    v := finishedAt.String
    job.FinishedAt = &v
  }

  return job, nil
}

func (s *Server) listConnectionMigrationErrors(jobID int64, limit int) ([]connectionMigrationJobError, error) {
  db := s.cfg.DB()
  if db == nil {
    return nil, errors.New("database unavailable")
  }

  rows, err := db.Query(`
    SELECT object_key, error_message, created_at
    FROM connection_migration_job_errors
    WHERE job_id = ?
    ORDER BY id DESC
    LIMIT ?
  `, jobID, limit)
  if err != nil {
    return nil, err
  }
  defer rows.Close()

  items := make([]connectionMigrationJobError, 0)
  for rows.Next() {
    var item connectionMigrationJobError
    if err := rows.Scan(&item.ObjectKey, &item.ErrorMessage, &item.CreatedAt); err != nil {
      return nil, err
    }
    items = append(items, item)
  }
  return items, rows.Err()
}
