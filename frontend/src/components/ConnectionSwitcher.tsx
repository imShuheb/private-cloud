import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getConnections, switchConnection } from '../api'
import type { ConnectionsList } from '../types'

export default function ConnectionSwitcher() {
  const navigate = useNavigate()
  const [data, setData] = useState<ConnectionsList | null>(null)
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const list = await getConnections()
      setData(list)
    } catch (err) {
      console.error('Failed to load connections', err)
    }
  }

  async function handleSwitch(id: string) {
    if (id === data?.activeId) return
    setLoading(true)
    try {
      await switchConnection(id)
      window.location.reload() // Fastest way to refresh all data for new store
    } catch (err) {
      alert('Failed to switch storage: ' + err)
    } finally {
      setLoading(false)
    }
  }

  const activeConn = data?.connections?.find(c => c.id === data.activeId)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 transition-all border border-gray-300 hover:border-black max-w-[220px]"
      >
        <div className="w-2 h-2 rounded-full bg-black animate-pulse" />
        <span className="text-sm font-medium text-gray-800 truncate">
          {activeConn?.name || 'Loading storage...'}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 bg-white shadow-xl border border-gray-300 z-50 py-2 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              Switch Connection
            </div>
            {data?.connections?.map((conn) => (
              <button
                key={conn.id}
                onClick={() => handleSwitch(conn.id)}
                disabled={loading}
                className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-gray-50 transition-colors group ${conn.id === data.activeId ? 'bg-black text-white' : ''}`}
              >
                <div>
                  <div className={`text-sm font-semibold ${conn.id === data.activeId ? 'text-white' : 'text-gray-800'}`}>
                    {conn.name}
                  </div>
                  <div className={`text-[10px] ${conn.id === data.activeId ? 'text-gray-200' : 'text-gray-500'}`}>{conn.bucket}</div>
                </div>
                {conn.id === data.activeId && (
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
            <div className="mt-2 border-t border-gray-200 pt-2 px-2">
              <button
                className="w-full px-3 py-2 text-xs font-medium text-gray-700 hover:text-black hover:bg-gray-50 border border-transparent hover:border-gray-300 transition-all flex items-center gap-2"
                onClick={() => {
                  setIsOpen(false)
                  navigate('/connections')
                }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Manage Connections
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
