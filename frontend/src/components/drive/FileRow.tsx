import React from 'react'
import { formatBytes, formatDate, getFileIcon } from '../../lib'
import type { FileInfo, FolderInfo } from '../../types'

type FileRowProps = {
  item: FileInfo | FolderInfo
  isFolder: boolean
  onClick: () => void
  onDownload?: (f: FileInfo) => void
  onDelete: (item: any) => void
  location?: string
  selected?: boolean
  onToggleSelect?: () => void
}

const FileRow: React.FC<FileRowProps> = ({ 
  item, 
  isFolder, 
  onClick, 
  onDownload, 
  onDelete, 
  location,
  selected,
  onToggleSelect
}) => {
  const iconInfo = getFileIcon(isFolder ? 'folder' : (item as FileInfo).name || (item as FileInfo).key)
  const name = isFolder ? (item as FolderInfo).name : ((item as FileInfo).name || (item as FileInfo).key)
  const size = isFolder ? '–' : formatBytes(Number((item as FileInfo).size || 0))
  const modified = isFolder ? '–' : formatDate((item as FileInfo).lastModified)

  return (
    <div
      className={`flex items-center gap-4 px-4 py-3 border-b border-gray-50 transition-colors group cursor-default select-none ${selected ? 'bg-[#e8f0fe]' : 'hover:bg-[#e8f0fe]/40'}`}
      onClick={() => {
        if (isFolder) onClick()
        else onToggleSelect?.()
      }}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => e.key === 'Enter' && (isFolder ? onClick() : onToggleSelect?.())}
    >
      <div 
        className="w-8 shrink-0 flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <input 
          type="checkbox" 
          className="w-4 h-4 rounded border-gray-300 text-[#1a73e8] focus:ring-[#1a73e8] cursor-pointer"
          checked={!!selected}
          onChange={onToggleSelect}
        />
      </div>
      <div className="flex-1 flex items-center gap-4 min-w-0">
        <span className={`material-symbols-outlined text-2xl shrink-0 ${isFolder ? 'filled text-[#5f6368] group-hover:text-[#1a73e8]' : iconInfo.className}`}>
          {isFolder ? 'folder' : iconInfo.icon}
        </span>
        <span className={`text-sm text-gray-900 truncate ${isFolder ? 'font-medium' : ''}`}>{name}</span>
      </div>
      {location !== undefined && (
        <span className="w-48 shrink-0 text-left text-[11px] text-gray-400 font-medium truncate px-2 bg-gray-50/50 py-1 rounded truncate" title={location}>
          {location || 'Root'}
        </span>
      )}
      <span className="w-24 shrink-0 text-right text-[13px] text-gray-500 font-normal">{size}</span>
      <span className="w-40 shrink-0 text-right text-[13px] text-gray-500 font-normal">{modified}</span>
      
      <div className="w-24 shrink-0 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isFolder && onDownload && (
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-white hover:shadow-sm hover:text-[#1a73e8] transition-all"
            title="Download"
            onClick={(e) => { e.stopPropagation(); onDownload(item as FileInfo) }}
          >
            <span className="material-symbols-outlined !text-xl">download</span>
          </button>
        )}
        <button
          className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-white hover:shadow-sm hover:text-red-500 transition-all"
          title="Delete"
          onClick={(e) => { e.stopPropagation(); onDelete(item) }}
        >
          <span className="material-symbols-outlined !text-xl">delete</span>
        </button>
      </div>
    </div>
  )
}

export default FileRow
