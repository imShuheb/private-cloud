import React from 'react'
import { formatBytes, formatDate, getFileIcon } from '../../lib'
import type { FileInfo, FolderInfo } from '../../types'

type FileRowProps = {
  item: FileInfo | FolderInfo
  isFolder: boolean
  onClick: () => void
  onPreview?: (f: FileInfo) => void
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
  onPreview,
  onDownload, 
  onDelete, 
  location,
  selected,
  onToggleSelect
}) => {
  const iconInfo = getFileIcon(isFolder ? 'folder' : (item as FileInfo).name || (item as FileInfo).key)
  const name = isFolder ? (item as FolderInfo).name : ((item as FileInfo).name || (item as FileInfo).key)
  const folderItem = item as FolderInfo
  const folderSize = folderItem.size
  const folderModified = folderItem.lastModified
  const size = isFolder
    ? (folderSize !== undefined && folderSize !== null ? formatBytes(Number(folderSize || 0)) : '–')
    : formatBytes(Number((item as FileInfo).size || 0))
  const modified = isFolder
    ? (folderModified ? formatDate(folderModified) : '–')
    : formatDate((item as FileInfo).lastModified)

  return (
    <div
      className={`flex items-center gap-3 md:gap-4 px-4 py-3 border-b border-gray-100 transition-colors group cursor-default select-none ${selected ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
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
          className="w-4 h-4 border-gray-400 text-black cursor-pointer"
          checked={!!selected}
          onChange={onToggleSelect}
        />
      </div>
      <div className="flex-1 flex items-center gap-4 min-w-0">
        <span className={`material-symbols-outlined text-2xl shrink-0 ${selected ? 'text-white' : isFolder ? 'filled text-black' : iconInfo.className}`}>
          {isFolder ? 'folder' : iconInfo.icon}
        </span>
        <span className={`text-sm truncate ${isFolder ? 'font-medium' : ''}`}>{name}</span>
      </div>
      {location !== undefined && (
        <span className={`w-48 shrink-0 text-left text-[11px] font-medium truncate px-2 py-1 border ${selected ? 'text-white border-white' : 'text-gray-700 border-gray-200'}`} title={location}>
          {location || 'Root'}
        </span>
      )}
      <span className={`w-24 shrink-0 text-right text-[13px] font-normal ${selected ? 'text-white' : 'text-gray-700'}`}>{size}</span>
      <span className={`w-40 shrink-0 text-right text-[13px] font-normal ${selected ? 'text-white' : 'text-gray-700'}`}>{modified}</span>
      
      <div className="w-32 shrink-0 flex justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        {isFolder && (
          <button
            className={`w-8 h-8 flex items-center justify-center border transition-all ${selected ? 'text-white border-white' : 'text-black border-gray-300 hover:border-black'}`}
            title="Open"
            onClick={(e) => { e.stopPropagation(); onClick() }}
          >
            <span className="material-symbols-outlined !text-xl">folder_open</span>
          </button>
        )}
        {!isFolder && onPreview && (
          <button
            className={`w-8 h-8 flex items-center justify-center border transition-all ${selected ? 'text-white border-white' : 'text-black border-gray-300 hover:border-black'}`}
            title="Preview"
            onClick={(e) => { e.stopPropagation(); onPreview(item as FileInfo) }}
          >
            <span className="material-symbols-outlined !text-xl">visibility</span>
          </button>
        )}
        {!isFolder && onDownload && (
          <button
            className={`w-8 h-8 flex items-center justify-center border transition-all ${selected ? 'text-white border-white' : 'text-black border-gray-300 hover:border-black'}`}
            title="Download"
            onClick={(e) => { e.stopPropagation(); onDownload(item as FileInfo) }}
          >
            <span className="material-symbols-outlined !text-xl">download</span>
          </button>
        )}
        <button
          className={`w-8 h-8 flex items-center justify-center border transition-all ${selected ? 'text-white border-white' : 'text-black border-gray-300 hover:border-black'}`}
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
