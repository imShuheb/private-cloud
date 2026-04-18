import React, { useEffect, useState } from 'react'
import { migrationCancel, migrationDryRun, migrationRetryFailed, migrationStart, migrationStatus } from '../../api'
import type {
  ConnectionMigrationConflictPolicy,
  ConnectionMigrationJob,
  ConnectionMigrationJobError,
  ConnectionMigrationMode,
  ConnectionsList,
} from '../../types'

type SettingsMigrationsSectionProps = {
  data: ConnectionsList | null
  canManageConnections: boolean
  onStatus: (message: string) => void
}

const SettingsMigrationsSection: React.FC<SettingsMigrationsSectionProps> = ({ data, canManageConnections, onStatus }) => {
  const [sourceId, setSourceId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [prefixFilter, setPrefixFilter] = useState('')
  const [mode, setMode] = useState<ConnectionMigrationMode>('copy')
  const [conflictPolicy, setConflictPolicy] = useState<ConnectionMigrationConflictPolicy>('skip')
  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState<ConnectionMigrationJob | null>(null)
  const [errors, setErrors] = useState<ConnectionMigrationJobError[]>([])

  useEffect(() => {
    if (!sourceId && data?.connections?.length) {
      setSourceId(data.connections[0].id)
    }
    if (!destinationId && data?.connections && data.connections.length > 1) {
      setDestinationId(data.connections[1].id)
    }
  }, [data, sourceId, destinationId])

  useEffect(() => {
    let timer: number | null = null

    async function poll() {
      if (!job?.id) return
      try {
        const res = await migrationStatus(job.id)
        setJob(res.job)
        setErrors(res.errors)
      } catch {
      }
    }

    if (job && (job.status === 'pending' || job.status === 'running')) {
      timer = window.setInterval(() => {
        void poll()
      }, 1500)
    }

    return () => {
      if (timer) window.clearInterval(timer)
    }
  }, [job?.id, job?.status])

  async function doDryRun() {
    if (!canManageConnections) return
    if (!sourceId || !destinationId || sourceId === destinationId) {
      onStatus('Source and destination must be selected and different')
      return
    }

    setLoading(true)
    try {
      const res = await migrationDryRun({
        sourceConnectionId: sourceId,
        destinationConnectionId: destinationId,
        prefixFilter,
        mode,
        conflictPolicy,
      })
      onStatus(`Dry-run: ${res.scannedObjects} objects, ${res.bytes} bytes`)
    } catch {
      onStatus('Dry-run failed')
    } finally {
      setLoading(false)
    }
  }

  async function doStart() {
    if (!canManageConnections) return
    if (!sourceId || !destinationId || sourceId === destinationId) {
      onStatus('Source and destination must be selected and different')
      return
    }

    setLoading(true)
    try {
      const started = await migrationStart({
        sourceConnectionId: sourceId,
        destinationConnectionId: destinationId,
        prefixFilter,
        mode,
        conflictPolicy,
      })
      const snapshot = await migrationStatus(started.jobId)
      setJob(snapshot.job)
      setErrors(snapshot.errors)
      onStatus(`Migration job #${started.jobId} started`)
    } catch {
      onStatus('Failed to start migration')
    } finally {
      setLoading(false)
    }
  }

  async function doCancel() {
    if (!canManageConnections || !job?.id) return
    setLoading(true)
    try {
      await migrationCancel(job.id)
      const snapshot = await migrationStatus(job.id)
      setJob(snapshot.job)
      setErrors(snapshot.errors)
      onStatus('Migration cancelled')
    } catch {
      onStatus('Failed to cancel migration')
    } finally {
      setLoading(false)
    }
  }

  async function doRetryFailed() {
    if (!canManageConnections || !job?.id) return
    setLoading(true)
    try {
      await migrationRetryFailed(job.id)
      const snapshot = await migrationStatus(job.id)
      setJob(snapshot.job)
      setErrors(snapshot.errors)
      onStatus('Retry started for failed objects')
    } catch {
      onStatus('Failed to retry migration')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="p-3 sm:p-4 md:p-5 border border-gray-300 bg-white">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-black uppercase tracking-wide">Migrations</h2>
          <p className="text-xs text-gray-700 mt-1">Move/copy data between configured connections with tracked progress.</p>
        </div>
      </div>

      {!canManageConnections && (
        <div className="mb-3 px-3 py-2 border border-gray-300 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-black">
          You do not have permission to run migrations.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold uppercase tracking-wide">Source</span>
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="px-3 py-2 border border-gray-300 bg-white text-sm" disabled={!canManageConnections}>
            <option value="">Select source</option>
            {data?.connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold uppercase tracking-wide">Destination</span>
          <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)} className="px-3 py-2 border border-gray-300 bg-white text-sm" disabled={!canManageConnections}>
            <option value="">Select destination</option>
            {data?.connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold uppercase tracking-wide">Prefix (optional)</span>
          <input value={prefixFilter} onChange={(e) => setPrefixFilter(e.target.value)} placeholder="folder/subfolder" className="px-3 py-2 border border-gray-300 bg-white text-sm" disabled={!canManageConnections} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold uppercase tracking-wide">Mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as ConnectionMigrationMode)} className="px-3 py-2 border border-gray-300 bg-white text-sm" disabled={!canManageConnections}>
              <option value="copy">copy</option>
              <option value="move">move</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold uppercase tracking-wide">Conflict</span>
            <select value={conflictPolicy} onChange={(e) => setConflictPolicy(e.target.value as ConnectionMigrationConflictPolicy)} className="px-3 py-2 border border-gray-300 bg-white text-sm" disabled={!canManageConnections}>
              <option value="skip">skip</option>
              <option value="overwrite">overwrite</option>
              <option value="fail">fail</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => void doDryRun()} disabled={loading || !canManageConnections} className="px-3 py-1.5 text-xs font-bold border border-gray-300 bg-white disabled:opacity-50">Dry Run</button>
        <button onClick={() => void doStart()} disabled={loading || !canManageConnections} className="px-3 py-1.5 text-xs font-bold border border-black bg-black text-white disabled:opacity-50">Start Migration</button>
        {job && (job.status === 'pending' || job.status === 'running') && (
          <button onClick={() => void doCancel()} disabled={loading || !canManageConnections} className="px-3 py-1.5 text-xs font-bold border border-gray-300 bg-white disabled:opacity-50">Cancel</button>
        )}
        {job && job.failedObjects > 0 && job.status !== 'running' && (
          <button onClick={() => void doRetryFailed()} disabled={loading || !canManageConnections} className="px-3 py-1.5 text-xs font-bold border border-gray-300 bg-white disabled:opacity-50">Retry Failed</button>
        )}
      </div>

      {job && (
        <div className="mt-3 border border-gray-300 p-3 bg-gray-50 text-xs">
          <div className="font-bold uppercase tracking-wide mb-2">Job #{job.id} • {job.status}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>Scanned: {job.scannedObjects}</div>
            <div>Migrated: {job.migratedObjects}</div>
            <div>Failed: {job.failedObjects}</div>
            <div>Bytes: {job.bytesDone}</div>
          </div>
          {job.errorSummary && <div className="mt-2 text-black">{job.errorSummary}</div>}
          {errors.length > 0 && (
            <div className="mt-2 max-h-28 overflow-y-auto border border-gray-300 bg-white p-2">
              {errors.slice(0, 10).map((e, idx) => (
                <div key={idx} className="text-[11px] mb-1"><span className="font-semibold">{e.objectKey}</span>: {e.errorMessage}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default SettingsMigrationsSection
