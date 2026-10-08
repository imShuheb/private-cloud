import { useCallback, useEffect, useState } from 'react'
import { deleteConnection, errorMessage, getConnections, saveConnection, switchConnection } from '../api'
import ConnectionModal from '../components/connections/ConnectionModal'
import AppShell from '../components/layout/AppShell'
import Button, { IconButton, Spinner } from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import { useToast } from '../context/toast'
import { cx } from '../lib'
import type { Connection, ConnectionInput, ConnectionsList } from '../types'

export default function ConnectionsPage() {
  const toast = useToast()
  const [data, setData] = useState<ConnectionsList | null>(null)
  const [loadError, setLoadError] = useState('')
  const [modal, setModal] = useState<{ open: boolean; editing: Connection | null; key: number }>({ open: false, editing: null, key: 0 })
  const [pendingDelete, setPendingDelete] = useState<Connection | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await getConnections())
      setLoadError('')
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load connections'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openModal = (editing: Connection | null) => setModal((m) => ({ open: true, editing, key: m.key + 1 }))

  async function save(conn: ConnectionInput) {
    const firstConnection = !data || data.connections.length === 0
    const next = await saveConnection(conn)
    setData(next)
    toast.show(`“${conn.name}” saved`, { tone: 'success' })
    if (firstConnection) window.location.assign('/drive')
  }

  async function activate(id: string) {
    setSwitching(id)
    try {
      await switchConnection(id)
      window.location.assign('/drive')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not switch storage'))
      setSwitching(null)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      setData(await deleteConnection(pendingDelete.id))
      toast.show(`“${pendingDelete.name}” removed`)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove the connection'))
      throw err
    }
  }

  return (
    <AppShell onNew={() => openModal(null)}>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
        <div className="max-w-4xl px-4 sm:px-6 py-5">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl text-ink">Connections</h1>
              <p className="text-sm text-ink-2 mt-0.5">S3-compatible buckets this drive can use. One is active at a time.</p>
            </div>
            <Button icon="add" onClick={() => openModal(null)}>
              Add storage
            </Button>
          </div>

          {!data && !loadError && (
            <div className="flex justify-center py-16 text-primary">
              <Spinner />
            </div>
          )}
          {loadError && (
            <EmptyState icon="cloud_off" title="Couldn’t load connections" action={<Button icon="refresh" onClick={load}>Try again</Button>}>
              {loadError}
            </EmptyState>
          )}
          {data && data.connections.length === 0 && (
            <EmptyState icon="add_link" title="Connect your first bucket" action={<Button icon="add" onClick={() => openModal(null)}>Add storage</Button>}>
              Works with AWS S3, Cloudflare R2, MinIO, Wasabi and other S3-compatible services.
            </EmptyState>
          )}

          {data && data.connections.length > 0 && (
            <ul className="grid gap-3">
              {data.connections.map((c) => {
                const active = c.id === data.activeId
                return (
                  <li
                    key={c.id}
                    className={cx('rounded-2xl border p-4 sm:p-5 flex flex-wrap items-center gap-4 anim-fade', active ? 'border-primary bg-[#f3f8ff]' : 'border-line-soft')}
                  >
                    <span className={cx('w-12 h-12 rounded-full flex items-center justify-center shrink-0', active ? 'bg-primary-soft text-on-primary-soft' : 'bg-raised text-ink-2')}>
                      <span className={cx('icon', active && 'filled')}>database</span>
                    </span>
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-medium text-ink truncate">{c.name}</span>
                        {active && <span className="px-2 py-0.5 rounded-full bg-primary text-white text-xs font-medium">Active</span>}
                      </div>
                      <div className="text-sm text-ink-2 mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
                        <span className="font-mono text-[13px]">{c.bucket}</span>
                        <span>{endpointHost(c.endpoint)} · {c.region}</span>
                        {c.accessKeyHint && <span className="text-ink-3">Key {c.accessKeyHint}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!active && (
                        <Button variant="outlined" onClick={() => activate(c.id)} loading={switching === c.id} disabled={!!switching}>
                          Use this storage
                        </Button>
                      )}
                      <IconButton icon="edit" label={`Edit ${c.name}`} onClick={() => openModal(c)} />
                      <IconButton
                        icon="delete"
                        label={active ? 'The active connection can’t be removed' : `Remove ${c.name}`}
                        onClick={() => setPendingDelete(c)}
                        disabled={active}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <ConnectionModal key={modal.key} open={modal.open} editing={modal.editing} onSave={save} onClose={() => setModal((m) => ({ ...m, open: false }))} />
      <ConfirmDialog
        open={!!pendingDelete}
        title={`Remove “${pendingDelete?.name ?? ''}”?`}
        message="This only removes the saved connection. Files in the bucket are not touched."
        confirmLabel="Remove"
        danger
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </AppShell>
  )
}

function endpointHost(endpoint?: string): string {
  if (!endpoint) return 'AWS S3'
  try {
    return new URL(endpoint).host || endpoint
  } catch {
    return endpoint
  }
}
