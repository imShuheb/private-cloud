import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { formatBytes } from '../../lib'

type SidebarProps = {
  onNewClick: () => void
  filesCount: number
  foldersCount: number
  totalSize: number
  isConfigured: boolean
  connectionsLoading?: boolean
  disableNew?: boolean
  canSeeConnections?: boolean
  canSeeSettings?: boolean
}

const Sidebar: React.FC<SidebarProps> = ({
  onNewClick,
  filesCount,
  totalSize,
  isConfigured,
  connectionsLoading = false,
  disableNew = false,
  canSeeConnections = true,
  canSeeSettings = false,
}) => {
  const { pathname } = useLocation()

  const hasConnections = isConfigured

  return (
    <aside className="w-14 md:w-64 p-2 md:p-3 shrink-0 overflow-y-auto border-r border-gray-200 bg-white flex flex-col h-full min-h-0">
      <button
        className="flex items-center justify-center md:justify-start gap-2 px-2 md:px-4 py-2.5 border border-gray-300 bg-white text-sm font-medium text-black transition-all mb-4 md:mb-6 w-full disabled:opacity-50 hover:border-black"
        onClick={onNewClick}
        disabled={disableNew || (!hasConnections && pathname !== '/connections')}
      >
        <span className="material-symbols-outlined text-2xl text-black">add</span>
        <span className="text-black hidden md:inline">New</span>
      </button>

      <nav className="flex-1 space-y-1">
        {connectionsLoading ? (
          <div className="h-10 border border-gray-200 bg-gray-50 animate-pulse" />
        ) : (
          <Link
            to="/drive"
            className={`flex items-center justify-center md:justify-start gap-2 px-2 md:px-3 py-2 text-sm font-medium transition-all border ${pathname.startsWith('/drive') ? 'bg-black text-white border-black' : 'text-black border-transparent hover:border-gray-300 hover:bg-gray-50'} ${!hasConnections ? 'opacity-40 pointer-events-none' : ''}`}
            aria-disabled={!hasConnections}
          >
            <span className="material-symbols-outlined text-lg">folder_open</span>
            <span className="hidden md:inline">My Drive</span>
          </Link>
        )}
        {canSeeConnections && (
          <Link
            to="/connections"
            className={`flex items-center justify-center md:justify-start gap-2 px-2 md:px-3 py-2 text-sm font-medium transition-all border ${pathname === '/connections' ? 'bg-black text-white border-black' : 'text-black border-transparent hover:border-gray-300 hover:bg-gray-50'}`}
          >
            <span className="material-symbols-outlined text-lg">hub</span>
            <span className="hidden md:inline">Connections</span>
          </Link>
        )}
        {canSeeSettings && (
          <Link
            to="/settings"
            className={`flex items-center justify-center md:justify-start gap-2 px-2 md:px-3 py-2 text-sm font-medium transition-all border ${pathname === '/settings' ? 'bg-black text-white border-black' : 'text-black border-transparent hover:border-gray-300 hover:bg-gray-50'}`}
          >
            <span className="material-symbols-outlined text-lg">settings</span>
            <span className="hidden md:inline">Settings</span>
          </Link>
        )}
      </nav>

      <div className="hidden md:block px-2 mt-4 pt-4 border-t border-gray-200">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-black uppercase tracking-widest py-1 mb-2">
            Drive Stats
          </div>

          <div className="flex justify-between items-center text-xs text-black py-1.5 px-1 border-b border-gray-200 last:border-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined !text-base text-black">description</span>
              <span>Files</span>
            </div>
            <span className="font-semibold text-black">{filesCount}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-black py-1.5 px-1 border-b border-gray-200 last:border-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined !text-base text-black">database</span>
              <span>Storage</span>
            </div>
            <span className="font-semibold text-black">{formatBytes(totalSize)}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
