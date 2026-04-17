import React from 'react'
import type { FileInfo, FolderInfo } from '../../types'
import FileRow from './FileRow'

type FileListProps = {
  folders: FolderInfo[]
  files: (FileInfo & { location?: string })[]
  onFolderClick: (prefix: string) => void
  onPreview: (f: FileInfo) => void
  onDownload: (f: FileInfo) => void
  onDelete: (item: any) => void
  isSearching: boolean
  selectedKeys: Set<string>
  onSelectionChange: (keys: Set<string>) => void
}

const FileList: React.FC<FileListProps> = ({
  folders,
  files,
  onFolderClick,
  onPreview,
  onDownload,
  onDelete,
  isSearching,
  selectedKeys,
  onSelectionChange
}) => {
  const isEmpty = folders.length === 0 && files.length === 0

  const allVisibleKeys = [...folders.map(f => f.prefix), ...files.map(f => f.key)]
  const isAllSelected = allVisibleKeys.length > 0 && allVisibleKeys.every(k => selectedKeys.has(k))

  const toggleAll = () => {
    if (isAllSelected) {
      const next = new Set(selectedKeys)
      allVisibleKeys.forEach(k => next.delete(k))
      onSelectionChange(next)
    } else {
      const next = new Set(selectedKeys)
      allVisibleKeys.forEach(k => next.add(k))
      onSelectionChange(next)
    }
  }

  const toggleOne = (key: string) => {
    const next = new Set(selectedKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onSelectionChange(next)
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="w-40 h-40 border border-black flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-7xl text-black">
            {isSearching ? 'search_off' : 'cloud_upload'}
          </span>
        </div>
        <h3 className="text-xl text-black font-semibold mb-2 uppercase tracking-wide">
          {isSearching ? 'No results found' : 'My Drive is empty'}
        </h3>
        <p className="text-gray-700 max-w-xs mx-auto leading-relaxed">
          {isSearching
            ? "We couldn't find anything matching your search. Try a different term."
            : 'Click the "New" button to upload your first file or create a folder to get started.'}
        </p>
      </div>
    )
  }

  return (
    <div className="pb-6 animate-in fade-in duration-300">
      <div className="min-w-[760px] md:min-w-full">
        {/* Column headers */}
        <div className="flex items-center gap-4 px-4 py-3 text-[11px] font-bold text-black uppercase tracking-widest border-b border-gray-200 bg-white sticky top-0 ">
          <div className="w-8 shrink-0 flex items-center justify-center">
            <input
              type="checkbox"
              className="w-4 h-4 border-gray-400 text-black cursor-pointer"
              checked={isAllSelected}
              onChange={toggleAll}
            />
          </div>
          <span className="flex-1">Name</span>
          {isSearching && <span className="w-48 shrink-0 text-left px-2">Location</span>}
          <span className="w-24 shrink-0 text-right">Size</span>
          <span className="w-40 shrink-0 text-right">Modified</span>
          <span className="w-32 shrink-0 text-right pr-2">Actions</span>
        </div>

        {/* Folders List */}
        {folders.length > 0 && (
          <div className="mb-2">
            <div className="text-xs font-bold text-gray-400 px-4 py-3 uppercase tracking-wider">Folders</div>
            <div className="divide-y divide-gray-200">
              {folders.map((f) => (
                <FileRow
                  key={f.prefix}
                  item={f}
                  isFolder={true}
                  onClick={() => onFolderClick(f.prefix)}
                  onDelete={onDelete}
                  location={isSearching ? (f as any).location : undefined}
                  selected={selectedKeys.has(f.prefix)}
                  onToggleSelect={() => toggleOne(f.prefix)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Files List */}
        {files.length > 0 && (
          <div>
            <div className="text-xs font-bold text-gray-400 px-4 py-3 uppercase tracking-wider">Files</div>
            <div className="divide-y divide-gray-200">
              {files.map((f) => (
                <FileRow
                  key={f.key}
                  item={f}
                  isFolder={false}
                  onClick={() => { }}
                  onPreview={onPreview}
                  onDownload={onDownload}
                  onDelete={onDelete}
                  location={f.location}
                  selected={selectedKeys.has(f.key)}
                  onToggleSelect={() => toggleOne(f.key)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default FileList
