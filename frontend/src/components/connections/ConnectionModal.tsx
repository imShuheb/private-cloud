import { useState, type FormEvent } from 'react'
import { errorMessage } from '../../api'
import type { Connection, ConnectionInput } from '../../types'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Switch from '../ui/Switch'
import TextField from '../ui/TextField'

type Props = {
  open: boolean
  onClose: () => void
  onSave: (conn: ConnectionInput) => Promise<void>
  editing: Connection | null
}

const presets = [
  { label: 'AWS S3', region: 'us-east-1', endpoint: '', pathStyle: false },
  { label: 'Cloudflare R2', region: 'auto', endpoint: 'https://<account-id>.r2.cloudflarestorage.com', pathStyle: true },
  { label: 'MinIO', region: 'us-east-1', endpoint: 'http://localhost:9000', pathStyle: true },
]

function emptyForm(): ConnectionInput {
  return { id: `conn-${Date.now()}`, name: '', bucket: '', region: 'us-east-1', endpoint: '', accessKey: '', secretKey: '', usePathStyle: false }
}

/** The parent mounts this with a key per connection, so the form starts fresh each time. */
export default function ConnectionModal({ open, onClose, onSave, editing }: Props) {
  const [form, setForm] = useState<ConnectionInput>(() =>
    editing ? { ...editing, endpoint: editing.endpoint ?? '', accessKey: '', secretKey: '' } : emptyForm(),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = <K extends keyof ConnectionInput>(key: K, value: ConnectionInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form.bucket.trim()) return setError('Bucket name is required')
    if (!editing && (!form.accessKey.trim() || !form.secretKey)) return setError('Access key and secret key are required')
    setSaving(true)
    setError('')
    try {
      await onSave({ ...form, name: form.name.trim() || form.bucket.trim() })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not save the connection'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} title={editing ? 'Edit connection' : 'Add storage'} width="lg">
      <form onSubmit={submit} className="pb-6">
        {!editing && (
          <div className="flex flex-wrap gap-2 mb-5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setForm((f) => ({ ...f, region: p.region, endpoint: p.endpoint, usePathStyle: p.pathStyle }))}
                className="h-8 px-3 rounded-lg border border-[#747775] text-sm text-ink-2 hover:bg-hover"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Display name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Home archive" className="sm:col-span-2" />
          <TextField label="Bucket" value={form.bucket} onChange={(e) => set('bucket', e.target.value)} mono required className="sm:col-span-2" />
          <TextField label="Region" value={form.region} onChange={(e) => set('region', e.target.value)} placeholder="us-east-1" />
          <TextField label="Endpoint (optional)" value={form.endpoint ?? ''} onChange={(e) => set('endpoint', e.target.value)} placeholder="Leave empty for AWS" />
          <TextField
            label="Access key ID"
            value={form.accessKey}
            onChange={(e) => set('accessKey', e.target.value)}
            mono
            autoComplete="off"
            placeholder={editing?.accessKeyHint ? `Unchanged (${editing.accessKeyHint})` : ''}
          />
          <TextField
            label="Secret access key"
            type="password"
            value={form.secretKey}
            onChange={(e) => set('secretKey', e.target.value)}
            autoComplete="new-password"
            placeholder={editing ? 'Unchanged' : ''}
          />
        </div>
        {editing && <p className="text-xs text-ink-3 mt-2">Leave the keys empty to keep the saved ones.</p>}

        <div className="mt-2 border-t border-line-soft">
          <Switch
            checked={form.usePathStyle}
            onChange={(v) => set('usePathStyle', v)}
            label="Path-style URLs"
            description="Needed for MinIO and most self-hosted S3 servers"
          />
        </div>

        {error && (
          <div role="alert" className="mt-3 px-4 py-3 rounded-xl bg-danger-soft text-sm text-danger flex gap-2">
            <span className="icon text-[18px]">error</span>
            <span className="break-words min-w-0">{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="text" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? 'Testing connection…' : editing ? 'Save' : 'Connect'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
