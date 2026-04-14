import { useEffect, useState } from 'react'
import { getConnections, addConnection, switchConnection, getDriveStats } from '../api'
import type { Connection, ConnectionsList, User } from '../types'
import Header from '../components/layout/Header'
import Sidebar from '../components/layout/Sidebar'
import StatusBar from '../components/drive/StatusBar'
import ConnectionModal from '../components/connections/ConnectionModal'

type Props = {
  user: User
  onLogout: () => void
}

export default function ConnectionsPage({ user, onLogout }: Props) {
  const [data, setData] = useState<ConnectionsList | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [stats, setStats] = useState({ totalSize: 0, totalFiles: 0, totalFolders: 0, isConfigured: false })

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [list, s] = await Promise.all([getConnections(), getDriveStats()])
      setData(list)
      setStats(s)
      setStatus(`Managing ${list.connections.length} saved connections`)
    } catch (err: any) {
      setStatus('Failed to load connections')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(conn: Connection) {
    await addConnection(conn)
    await load()
    setStatus(`Connection "${conn.name}" saved`)
  }

  async function handleSetActive(id: string) {
    if (id === data?.activeId) return
    setLoading(true)
    try {
      await switchConnection(id)
      window.location.reload()
    } catch (err: any) {
      setStatus('Failed to switch storage')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (id === data?.activeId) {
      alert('Cannot delete the active connection')
      return
    }
    if (!confirm('Are you sure you want to remove this connection?')) return

    try {
      await fetch(`/api/connections/${id}`, { method: 'DELETE' })
      await load()
    } catch (err: any) {
      alert('Delete failed')
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#f8f9fa] overflow-hidden">
      <Header
        user={user}
        loading={loading}
        query=""
        onQueryChange={() => { }}
        onRefresh={load}
        onLogout={onLogout}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          onNewClick={() => {
            setEditingConnection(null)
            setIsModalOpen(true)
          }}
          filesCount={stats.totalFiles}
          foldersCount={stats.totalFolders}
          totalSize={stats.totalSize}
          isConfigured={stats.isConfigured}
        />

        <main className="flex-1 flex flex-col overflow-hidden bg-white mt-1.5 ml-1.5 rounded-tl-xl border-t border-l border-gray-100 shadow-sm p-8">
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Connections Manager</h1>
                <p className="text-gray-500 text-sm mt-1">Manage all your cloud storage accounts from one place.</p>
              </div>
              <button
                onClick={() => {
                  setEditingConnection(null)
                  setIsModalOpen(true)
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-all "
              >
                <span className="material-symbols-outlined text-xl">add</span>
                Add Storage
              </button>
            </div>

            <div className="grid gap-4">
              {data?.connections?.map((conn: Connection) => (
                <div
                  key={conn.id}
                  className={`p-6 rounded-lg border transition-all ${conn.id === data?.activeId ? 'bg-blue-50/30 border-blue-200 ring-1 ring-blue-100' : 'bg-white border-gray-100 hover:border-gray-400'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${conn.id === data?.activeId ? 'bg-blue-600' : 'bg-gray-100'}`}>
                        <span className={`material-symbols-outlined ${conn.id === data?.activeId ? 'text-white' : 'text-gray-400'}`}>hub</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-gray-900">{conn.name}</h3>
                          {conn.id === data?.activeId && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider rounded-full">Active</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 font-mono mt-0.5">{conn.bucket} ({conn.region})</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {conn.id !== data?.activeId && (
                        <button
                          onClick={() => handleSetActive(conn.id)}
                          className="px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                        >
                          Set Active
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingConnection(conn)
                          setIsModalOpen(true)
                        }}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Edit"
                      >
                        <span className="material-symbols-outlined text-xl">edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(conn.id)}
                        disabled={conn.id === data?.activeId}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Delete"
                      >
                        <span className="material-symbols-outlined text-xl">delete</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-4 border-t border-gray-50 pt-4">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span className="material-symbols-outlined text-sm">link</span>
                      {conn.endpoint || 'AWS Standard'}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span className="material-symbols-outlined text-sm">enhanced_encryption</span>
                      {conn.accessKey?.slice(0, 8) || '********'}...
                    </div>
                  </div>
                </div>
              ))}

              {(!data?.connections || data.connections.length === 0) && (
                <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-gray-300 text-3xl">cloud_off</span>
                  </div>
                  <h3 className="font-bold text-gray-900">No connections yet</h3>
                  <p className="text-gray-500 text-sm mt-1 mb-6">Start by adding your first cloud storage account.</p>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-500/20"
                  >
                    Add My First Connection
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <StatusBar
        loading={loading}
        status={status}
      />

      <ConnectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        editingConnection={editingConnection}
      />
    </div>
  )
}
