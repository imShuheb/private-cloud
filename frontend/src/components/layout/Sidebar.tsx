import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { formatBytes } from '../../lib'

type SidebarProps = {
  onNewClick: () => void
  filesCount: number
  foldersCount: number
  totalSize: number
  isConfigured: boolean
}

const Sidebar: React.FC<SidebarProps> = ({ onNewClick, filesCount, totalSize, isConfigured }) => {
  const { pathname } = useLocation()

  const hasConnections = isConfigured

  return (
    <aside className="w-64 p-3 shrink-0 overflow-y-auto border-r border-[#f1f3f4] bg-white flex flex-col h-full">
      <button
        className="flex items-center gap-2.5 px-5 py-3.5 rounded-2xl bg-white shadow-md border border-gray-100 text-sm font-medium text-gray-700 transition-all hover:shadow-lg hover:bg-[#f8f9fa] mb-6 group active:scale-95 mx-auto w-full disabled:opacity-50"
        onClick={onNewClick}
        disabled={!hasConnections && pathname !== '/connections'}
      >
        <span className="material-symbols-outlined text-3xl text-gray-900 group-hover:scale-110 transition-transform">add</span>
        <span className="text-gray-900">New</span>
      </button>

      <nav className="flex-1 space-y-1">
        {hasConnections && (
          <>
            <Link
              to="/drive"
              className={`flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-r-full transition-all ${pathname.startsWith('/drive') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <span className="material-symbols-outlined text-lg">folder_open</span>
              My Drive
            </Link>
            <Link
                to="/health"
                className={`flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-r-full transition-all ${pathname === '/health' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
            >
                <span className="material-symbols-outlined text-lg">query_stats</span>
                Health
            </Link>
          </>
        )}
        <Link
          to="/settings"
          className={`flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-r-full transition-all ${pathname === '/settings' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
        >
          <span className="material-symbols-outlined text-lg">settings</span>
          Settings
        </Link>
      </nav>

      <div className="px-3 mt-4 pt-4 border-t border-gray-100">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest py-1 mb-2">
            Drive Stats
          </div>

          <div className="flex justify-between items-center text-xs text-gray-600 py-1.5 px-1 border-b border-gray-50 last:border-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined !text-base text-gray-400">description</span>
              <span>Files</span>
            </div>
            <span className="font-semibold text-gray-900">{filesCount}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-gray-600 py-1.5 px-1 border-b border-gray-50 last:border-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined !text-base text-gray-400">database</span>
              <span>Storage</span>
            </div>
            <span className="font-semibold text-gray-900">{formatBytes(totalSize)}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
