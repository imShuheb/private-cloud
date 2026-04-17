import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import type { Connection } from '../../types'

type Props = {
  isOpen: boolean
  onClose: () => void
  onSave: (conn: Connection) => Promise<void>
  editingConnection?: Connection | null
}

export default function ConnectionModal({ isOpen, onClose, onSave, editingConnection }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState<Connection>({
    id: '',
    name: '',
    bucket: '',
    region: 'us-east-1',
    endpoint: '',
    accessKey: '',
    secretKey: '',
    usePathStyle: true
  })

  useEffect(() => {
    if (editingConnection) {
      setForm(editingConnection)
    } else {
      setForm({
        id: 'conn-' + Date.now(),
        name: '',
        bucket: '',
        region: 'us-east-1',
        endpoint: '',
        accessKey: '',
        secretKey: '',
        usePathStyle: true
      })
    }
  }, [editingConnection, isOpen])

  if (!isOpen) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!form.name || !form.bucket || !form.accessKey || !form.secretKey) {
        throw new Error('Please fill in all required fields')
      }
      await onSave(form)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save connection')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-hidden border border-gray-300 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.22)] animate-in zoom-in-95 slide-in-from-bottom-3 duration-200">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-black tracking-tight">{editingConnection ? 'Edit Connection' : 'Add Connection'}</h2>
            <p className="text-[11px] sm:text-xs text-gray-600 mt-1 uppercase tracking-wide">Connect an S3-compatible storage target</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-9 h-9 border border-gray-300 text-gray-700 hover:text-black hover:border-black hover:bg-white transition-all"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto max-h-[calc(92vh-72px)]">
          {error && (
            <div className="flex items-center gap-3 p-3 border border-gray-300 bg-gray-100 text-xs sm:text-sm text-black" role="alert">
              <span className="material-symbols-outlined !text-base">warning</span>
              <span className="font-medium">{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Friendly Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 bg-white text-sm text-black outline-none transition-all focus:border-black"
                placeholder="e.g. Home Archive"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Bucket Name</label>
              <input
                type="text"
                required
                value={form.bucket}
                onChange={e => setForm({ ...form, bucket: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 bg-white text-sm text-black font-mono outline-none transition-all focus:border-black"
                placeholder="my-private-storage"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Region</label>
              <input
                type="text"
                value={form.region}
                onChange={e => setForm({ ...form, region: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 bg-white text-sm text-black outline-none transition-all focus:border-black"
                placeholder="us-east-1"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Endpoint (Optional)</label>
              <input
                type="text"
                value={form.endpoint}
                onChange={e => setForm({ ...form, endpoint: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 bg-white text-sm text-black outline-none transition-all focus:border-black"
                placeholder="https://s3.amazonaws.com"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Access Key</label>
              <input
                type="text"
                required
                value={form.accessKey}
                onChange={e => setForm({ ...form, accessKey: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 bg-white text-sm text-black font-mono outline-none transition-all focus:border-black"
                placeholder="AKIA..."
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Secret Key</label>
              <input
                type="password"
                required
                value={form.secretKey}
                onChange={e => setForm({ ...form, secretKey: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-300 bg-white text-sm text-black outline-none transition-all focus:border-black"
                placeholder="••••••••••••••••"
              />
            </div>

            <div className="sm:col-span-2 flex items-center gap-2.5 p-3 border border-gray-200 bg-gray-50">
              <input
                type="checkbox"
                id="modal-path-style"
                checked={form.usePathStyle}
                onChange={e => setForm({ ...form, usePathStyle: e.target.checked })}
                className="w-4 h-4 border-gray-400 accent-black"
              />
              <label htmlFor="modal-path-style" className="text-xs sm:text-sm text-gray-700">Use path-style URLs (MinIO, R2, Wasabi)</label>
            </div>
          </div>

          <div className="pt-1 flex flex-col-reverse sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:flex-1 py-2.5 border border-gray-300 bg-white hover:border-black text-black font-semibold text-sm transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:flex-1 py-2.5 border border-black bg-black hover:bg-neutral-900 text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (editingConnection ? 'Save Changes' : 'Add Connection')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
