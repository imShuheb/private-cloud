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
    <div className="sticky top-0 z-10 flex items-center gap-2 px-3 md:px-6 py-2 bg-white border-b border-gray-200">
      <nav className="flex items-center gap-0.5 text-sm flex-1 min-w-0 overflow-x-auto" aria-label="Breadcrumbs">
        <button
          className={`flex items-center gap-1.5 px-3 py-1.5 border font-medium transition-colors whitespace-nowrap ${segments.length === 0 ? 'text-white bg-black border-black' : 'text-black border-transparent hover:border-gray-300 hover:bg-gray-50'}`}
          onClick={() => onLoad('')}
        >
          <span className="material-symbols-outlined !text-lg">home</span>
          My Drive
        </button>

        {segments.map((part, i) => (
          <div key={part + i} className="flex items-center">
            <span className="text-black">
              <span className="material-symbols-outlined !text-base">chevron_right</span>
            </span>
            <button
              className={`px-3 py-1.5 border font-medium transition-colors truncate max-w-[150px] whitespace-nowrap ${i === segments.length - 1 ? 'text-white bg-black border-black' : 'text-black border-transparent hover:border-gray-300 hover:bg-gray-50'}`}
              onClick={() => i < segments.length - 1 && onLoad(buildPrefix(segments, i))}
            >
              {part}
            </button>
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2 shrink-0">
        {selectedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 bg-black text-white border border-black animate-in zoom-in-95 duration-200">
            <span className="text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">{selectedCount} selected</span>
            <button
              className="w-7 h-7 flex items-center justify-center border border-white"
              onClick={onBulkDelete}
              title="Delete selected items"
            >
              <span className="material-symbols-outlined !text-[18px]">delete_sweep</span>
            </button>
          </div>
        )}

        <div className="h-6 w-px bg-gray-300 mx-1" />

        <div className="relative" ref={sortMenuRef}>
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium text-black bg-white border border-gray-300 transition-all hover:border-black"
          >
            <span className="material-symbols-outlined !text-[18px] text-black">sort</span>
            <span>{currentSort.label}</span>
            <span className={`material-symbols-outlined !text-[16px] text-black transition-transform duration-200 ${showSortMenu ? 'rotate-180' : ''}`}>expand_more</span>
          </button>

          {showSortMenu && (
            <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-300 shadow-lg z-50 py-1.5 animate-in fade-in zoom-in-95 duration-200">
              <div className="px-3 py-1.5 text-[10px] font-bold text-black uppercase tracking-widest border-b border-gray-200 mb-1 ">
                Sort By
              </div>
              {sortOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onSortByChange(opt.value)
                    setShowSortMenu(false)
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-black hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined !text-[18px] opacity-90">
                      {opt.value.includes('name') ? 'sort_by_alpha' : opt.value.includes('date') ? 'calendar_today' : 'database'}
                    </span>
                    <span>{opt.label}</span>
                  </div>
                  {sortBy === opt.value && (
                    <span className="material-symbols-outlined !text-[16px] text-black">check</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="w-9 h-9 flex items-center justify-center text-black transition-colors disabled:opacity-30 border border-gray-300 hover:border-black"
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
