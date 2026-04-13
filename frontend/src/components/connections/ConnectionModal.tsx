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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{editingConnection ? 'Edit Connection' : 'Add New Storage'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <span className="material-symbols-outlined text-gray-500">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Friendly Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                placeholder="e.g. My AWS Bucket"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Bucket Name</label>
              <input
                type="text"
                required
                value={form.bucket}
                onChange={e => setForm({ ...form, bucket: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-mono"
                placeholder="my-cool-storage"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Region</label>
              <input
                type="text"
                value={form.region}
                onChange={e => setForm({ ...form, region: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                placeholder="us-east-1"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Endpoint (Opt)</label>
              <input
                type="text"
                value={form.endpoint}
                onChange={e => setForm({ ...form, endpoint: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                placeholder="https://s3.amazonaws.com"
              />
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Access Key</label>
              <input
                type="text"
                required
                value={form.accessKey}
                onChange={e => setForm({ ...form, accessKey: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-mono"
                placeholder="AKIA..."
              />
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Secret Key</label>
              <input
                type="password"
                required
                value={form.secretKey}
                onChange={e => setForm({ ...form, secretKey: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                placeholder="••••••••••••••••"
              />
            </div>
            
            <div className="col-span-2 flex items-center gap-2 py-2">
              <input
                type="checkbox"
                id="modal-path-style"
                checked={form.usePathStyle}
                onChange={e => setForm({ ...form, usePathStyle: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="modal-path-style" className="text-xs text-gray-600">Use Path Style (MinIO, R2, Wasabi)</label>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Testing...
                </>
              ) : (editingConnection ? 'Update' : 'Add Connection')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
