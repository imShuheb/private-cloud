import { useEffect, useState } from 'react'
import { addConnection, deleteConnection, getConnections, getDriveStats, switchConnection } from '../api'
import type { Connection, ConnectionsList, User } from '../types'
import Header from '../components/layout/Header'
import Sidebar from '../components/layout/Sidebar'
import StatusBar from '../components/drive/StatusBar'
import ConnectionModal from '../components/connections/ConnectionModal'
import ConfirmModal from '../components/drive/ConfirmModal'

type Props = {
  user: User
  onLogout: () => void
}

export default function ConnectionsPage({ user, onLogout }: Props) {
  const canManageConnections = !!user.permissions?.canManageConnections
  const canManageSettings = !!user.permissions?.canManageSettings || user.role === 'owner'

  const [data, setData] = useState<ConnectionsList | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [stats, setStats] = useState({ totalSize: 0, totalFiles: 0, totalFolders: 0, isConfigured: false })
  const [statsLoaded, setStatsLoaded] = useState(false)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const s = await getDriveStats()
      setStats(s)

      if (canManageConnections) {
        const list = await getConnections()
        setData(list)
        setStatus(`Managing ${list.connections.length} saved connections`)
      } else {
        setData({ connections: [], activeId: '' })
        setStatus('Connection management is restricted for your account')
      }
    } catch {
      setStatus('Failed to load connections')
    } finally {
      setLoading(false)
      setStatsLoaded(true)
    }
  }

  async function handleSave(conn: Connection) {
    if (!canManageConnections) {
      setStatus('You do not have permission to manage connections')
      return
    }
    await addConnection(conn)
    await load()
    setStatus(`Connection "${conn.name}" saved`)
  }

  async function handleSetActive(id: string) {
    if (!canManageConnections) {
      setStatus('You do not have permission to switch connections')
      return
    }
    if (id === data?.activeId) return

    setLoading(true)
    try {
      await switchConnection(id)
      window.location.reload()
    } catch {
      setStatus('Failed to switch storage')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!canManageConnections) {
      setStatus('You do not have permission to delete connections')
      return
    }
    if (id === data?.activeId) {
      setStatus('Cannot delete the active connection')
      return
    }

    setDeleteTargetId(id)
  }

  async function confirmDelete() {
    if (!deleteTargetId) return

    try {
      await deleteConnection(deleteTargetId)
      await load()
      setStatus('Connection deleted')
    } catch {
      setStatus('Delete failed')
    } finally {
      setDeleteTargetId(null)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden selection:bg-black selection:text-white">
      <Header
        user={user}
        loading={loading}
        query=""
        onQueryChange={() => {}}
        onRefresh={load}
        onLogout={onLogout}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar
          onNewClick={() => {
            if (!canManageConnections) return
            setEditingConnection(null)
            setIsModalOpen(true)
          }}
          filesCount={stats.totalFiles}
          foldersCount={stats.totalFolders}
          totalSize={stats.totalSize}
          isConfigured={stats.isConfigured}
          connectionsLoading={!statsLoaded}
          disableNew={!canManageConnections}
          canSeeConnections={canManageConnections}
          canSeeSettings={canManageSettings}
        />

        <main className="flex-1 flex flex-col overflow-hidden bg-white border-l border-gray-200 min-h-0 relative">
          {loading && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-500 animate-pulse z-20" />
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="max-w-5xl mx-auto w-full p-3 sm:p-4 md:p-6 lg:p-8">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-5 md:mb-6">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-black uppercase tracking-wide">Connections</h1>
                  <p className="text-gray-700 text-sm mt-1">Manage cloud storage endpoints from one compact panel.</p>
                </div>
                <button
                  onClick={() => {
                    if (!canManageConnections) return
                    setEditingConnection(null)
                    setIsModalOpen(true)
                  }}
                  disabled={!canManageConnections}
                  className="flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-bold border border-black w-full md:w-auto justify-center hover:bg-neutral-900 disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-xl">add</span>
                  Add Storage
                </button>
              </div>

              {!canManageConnections && (
                <div className="mb-4 px-3 py-2 border border-gray-300 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-black">
                  Connection management is restricted for your account.
                </div>
              )}

              {loading && data && (
                <div className="mb-4 flex items-center gap-2 px-3 py-2 border border-gray-300 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-black">
                  <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Updating connections...
                </div>
              )}

              <div className="grid gap-3 sm:gap-4">
                {loading && !data && (
                  <div className="space-y-3">
                    <div className="h-20 border border-gray-200 bg-gray-50 animate-pulse" />
                    <div className="h-20 border border-gray-200 bg-gray-50 animate-pulse" />
                    <div className="h-20 border border-gray-200 bg-gray-50 animate-pulse" />
                  </div>
                )}

                {canManageConnections && data?.connections?.map((conn) => (
                  <div key={conn.id} className={`p-3 sm:p-4 border transition-all ${conn.id === data.activeId ? 'bg-black text-white border-black' : 'bg-white border-gray-300 hover:border-gray-500'}`}>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 border flex items-center justify-center shrink-0 ${conn.id === data.activeId ? 'bg-white border-white' : 'bg-black border-black'}`}>
                          <span className={`material-symbols-outlined ${conn.id === data.activeId ? 'text-black' : 'text-white'}`}>hub</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold tracking-wide truncate">{conn.name}</h3>
                            {conn.id === data.activeId && (
                              <span className="px-2 py-0.5 bg-white text-black text-[10px] font-bold uppercase tracking-wider border border-white">Active</span>
                            )}
                          </div>
                        
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 sm:gap-2 self-end sm:self-auto">
                        {conn.id !== data.activeId && (
                          <button
                            onClick={() => handleSetActive(conn.id)}
                            className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold text-black border border-gray-300 hover:border-black bg-white"
                          >
                            Set Active
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditingConnection(conn)
                            setIsModalOpen(true)
                          }}
                          className={`p-2 border border-transparent ${conn.id === data.activeId ? 'text-white' : 'text-black'} hover:bg-gray-100`}
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(conn.id)}
                          disabled={conn.id === data.activeId}
                          className={`p-2 border border-transparent ${conn.id === data.activeId ? 'text-white' : 'text-black'} disabled:opacity-30 hover:bg-gray-100`}
                          title="Delete"
                        >
                          <span className="material-symbols-outlined text-xl">delete</span>
                        </button>
                      </div>
                    </div>

                    <div className={`mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t pt-3 ${conn.id === data.activeId ? 'border-gray-600' : 'border-gray-300'}`}>
                      <div className={`flex items-center gap-1.5 text-[11px] sm:text-xs min-w-0 ${conn.id === data.activeId ? 'text-gray-300' : 'text-gray-700'}`}>
                        <span className="material-symbols-outlined text-sm">link</span>
                        <span className="truncate max-w-[220px] sm:max-w-[340px]">{conn.endpoint || 'AWS Standard'}</span>
                      </div>
                      <div className={`flex items-center gap-1.5 text-[11px] sm:text-xs ${conn.id === data.activeId ? 'text-gray-300' : 'text-gray-700'}`}>
                        <span className="material-symbols-outlined text-sm">enhanced_encryption</span>
                        {conn.accessKey.slice(0, 8)}...
                      </div>
                    </div>
                  </div>
                ))}

                {canManageConnections && (!data?.connections || data.connections.length === 0) && (
                  <div className="text-center py-10 sm:py-14 bg-white border border-gray-300">
                    <div className="w-16 h-16 bg-black border border-black flex items-center justify-center mx-auto mb-4">
                      <span className="material-symbols-outlined text-white text-3xl">cloud_off</span>
                    </div>
                    <h3 className="font-bold text-black uppercase tracking-wide">No connections yet</h3>
                    <p className="text-gray-700 text-sm mt-1 mb-6">Start by adding your first cloud storage account.</p>
                    <button
                      onClick={() => canManageConnections && setIsModalOpen(true)}
                      className="px-6 py-2.5 bg-black text-white text-sm font-bold border border-black"
                    >
                      Add My First Connection
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {loading && data && (
            <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px] pointer-events-none flex items-start justify-center pt-14 z-10">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 shadow-sm text-xs font-semibold uppercase tracking-wider text-black">
                <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Loading
              </div>
            </div>
          )}
        </main>
      </div>

      <StatusBar loading={loading} status={status} />

      <ConnectionModal
        isOpen={isModalOpen && canManageConnections}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        editingConnection={editingConnection}
      />

      <ConfirmModal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={confirmDelete}
        title="Delete Connection"
        message="Are you sure you want to remove this connection? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
      />
    </div>
  )
}
