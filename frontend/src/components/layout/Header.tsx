import React from 'react'
import { useLocation } from 'react-router-dom'
import type { User } from '../../types'
import ConnectionSwitcher from '../ConnectionSwitcher'

type HeaderProps = {
  user: User
  loading: boolean
  query: string
  onQueryChange: (q: string) => void
  onRefresh: () => void
  onLogout: () => void
}

const Header: React.FC<HeaderProps> = ({ user, loading, query, onQueryChange, onRefresh, onLogout }) => {
  const { pathname } = useLocation()
  const userInitial = user.username?.charAt(0) || '?'
  const showSearch = pathname.startsWith('/drive')

  return (
    <header className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white border-b border-gray-200 h-14 shrink-0 z-20">
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <span className="material-symbols-outlined filled text-[24px] text-black">cloud</span>
        <span className="text-[16px] md:text-[18px] text-black font-semibold tracking-tight truncate">Private Storage</span>
      </div>

      {showSearch && (
        <div className="hidden sm:block flex-1 max-w-[640px] relative group h-9">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-lg group-focus-within:text-black transition-colors pointer-events-none">search</span>
          <input
            id="search-input"
            className="w-full pl-10 pr-3 py-2 border border-gray-300 bg-white text-sm text-black outline-none transition-all focus:border-black"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search in Drive"
            type="search"
          />
        </div>
      )}

      <div className="flex items-center gap-1 md:gap-2 ml-auto min-w-0">
        <ConnectionSwitcher />
        
        <div className="flex items-center gap-1 border-l border-gray-200 pl-2 md:pl-3">
          <button
            className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center border border-gray-300 text-black transition-colors disabled:opacity-40 hover:border-black"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh"
          >
            <span className={`material-symbols-outlined text-xl ${loading ? 'animate-spin' : ''}`}>refresh</span>
          </button>
          <button
            className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center border border-gray-300 text-black transition-colors hover:border-black"
            onClick={onLogout}
            title="Sign out"
          >
            <span className="material-symbols-outlined text-xl">logout</span>
          </button>
          <div
            className="w-8 h-8 border border-black bg-black text-white flex items-center justify-center text-sm font-semibold uppercase cursor-pointer ml-1"
            title={`${user.username}`}
          >
            {userInitial}
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
