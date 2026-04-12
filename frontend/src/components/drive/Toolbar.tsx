import React, { useState, useRef, useEffect } from 'react'
import { buildPrefix, sortOptions } from '../../lib'

type ToolbarProps = {
  segments: string[]
  sortBy: string
  onSortByChange: (val: string) => void
  onUpClick: () => void
  onLoad: (prefix: string) => void
  parentPrefix: string
  loading: boolean
  selectedCount?: number
  onBulkDelete?: () => void
}

const Toolbar: React.FC<ToolbarProps> = ({
  segments,
  sortBy,
  onSortByChange,
  onUpClick,
  onLoad,
  parentPrefix,
  loading,
  selectedCount = 0,
  onBulkDelete
}) => {
  const [showSortMenu, setShowSortMenu] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setShowSortMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentSort = sortOptions.find(o => o.value === sortBy) || sortOptions[0]

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 px-6 py-2 bg-[#f8f9fa] border-b border-[#f1f3f4]">
      <nav className="flex items-center gap-0.5 text-sm flex-1 min-w-0" aria-label="Breadcrumbs">
        <button
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${segments.length === 0 ? 'text-gray-900 bg-white shadow-sm border border-gray-100' : 'text-gray-500 hover:bg-gray-100'}`}
          onClick={() => onLoad('')}
        >
          <span className="material-symbols-outlined !text-lg">home</span>
          My Drive
        </button>

        {segments.map((part, i) => (
          <div key={part + i} className="flex items-center">
            <span className="text-gray-400">
              <span className="material-symbols-outlined !text-base">chevron_right</span>
            </span>
            <button
              className={`px-3 py-1.5 rounded-md font-medium transition-colors truncate max-w-[150px] ${i === segments.length - 1 ? 'text-gray-900 bg-white shadow-sm border border-gray-100' : 'text-gray-500 hover:bg-gray-100'}`}
              onClick={() => i < segments.length - 1 && onLoad(buildPrefix(segments, i))}
            >
              {part}
            </button>
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        {selectedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 rounded-lg border border-red-100 animate-in zoom-in-95 duration-200">
            <span className="text-[11px] font-bold uppercase tracking-wider">{selectedCount} selected</span>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-600 hover:text-white transition-all shadow-sm"
              onClick={onBulkDelete}
              title="Delete selected items"
            >
              <span className="material-symbols-outlined !text-[18px]">delete_sweep</span>
            </button>
          </div>
        )}

        <div className="h-6 w-px bg-gray-200 mx-1" />

        <div className="relative" ref={sortMenuRef}>
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
          >
            <span className="material-symbols-outlined !text-[18px] text-gray-500">sort</span>
            <span>{currentSort.label}</span>
            <span className={`material-symbols-outlined !text-[16px] text-gray-400 transition-transform duration-200 ${showSortMenu ? 'rotate-180' : ''}`}>expand_more</span>
          </button>

          {showSortMenu && (
            <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1.5 animate-in fade-in zoom-in-95 duration-200">
              <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 mb-1 ">
                Sort By
              </div>
              {sortOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onSortByChange(opt.value)
                    setShowSortMenu(false)
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-gray-600 hover:bg-[#f3f6fc] hover:text-[#1a73e8] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined !text-[18px] opacity-70">
                      {opt.value.includes('name') ? 'sort_by_alpha' : opt.value.includes('date') ? 'calendar_today' : 'database'}
                    </span>
                    <span>{opt.label}</span>
                  </div>
                  {sortBy === opt.value && (
                    <span className="material-symbols-outlined !text-[16px] text-[#1a73e8]">check</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-30 border border-transparent hover:border-gray-200 active:scale-90"
          disabled={!parentPrefix || loading}
          onClick={onUpClick}
          title="Go up a level"
        >
          <span className="material-symbols-outlined">arrow_upward</span>
        </button>
      </div>
    </div>
  )
}

export default Toolbar
