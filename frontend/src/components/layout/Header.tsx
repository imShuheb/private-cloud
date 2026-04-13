import React from 'react'
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
  const userInitial = user.username?.charAt(0) || '?'

  return (
    <header className="flex items-center gap-3 px-4 py-2 bg-white border-b border-[#f1f3f4] h-16 shrink-0 shadow-sm z-20">
      <div className="flex items-center gap-2 px-2 py-1 min-w-[200px] shrink-0">
        <span className="material-symbols-outlined filled text-[32px] text-[#1a73e8]">cloud</span>
        <span className="font-['Google_Sans'] text-[22px] text-gray-700 font-normal tracking-tight">Private Storage</span>
      </div>

      <div className="flex-1 max-w-[720px] relative group h-10">
        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-xl group-focus-within:text-[#1a73e8] transition-colors pointer-events-none">search</span>
        <input
          id="search-input"
          className="w-full pl-11 pr-4 py-2 border-none rounded-lg bg-[#f1f3f4] text-sm text-gray-900 outline-none transition-all focus:bg-white focus:ring-1 focus:ring-gray-200 focus:shadow-sm"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search in Drive"
          type="search"
        />
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <ConnectionSwitcher />
        
        <div className="flex items-center gap-1 border-l border-gray-100 pl-3">
          <button
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors disabled:opacity-40"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh"
          >
            <span className={`material-symbols-outlined text-xl ${loading ? 'animate-spin' : ''}`}>refresh</span>
          </button>
          <button
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            onClick={onLogout}
            title="Sign out"
          >
            <span className="material-symbols-outlined text-xl">logout</span>
          </button>
          <div
            className="w-8 h-8 rounded-full bg-[#1a73e8] text-white flex items-center justify-center text-sm font-semibold uppercase cursor-pointer hover:ring-4 hover:ring-[#1a73e8]/10 transition-all ml-1 shadow-sm"
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
