import React from 'react'

type NewMenuProps = {
  isOpen: boolean
  onClose: () => void
  newFolder: string
  onNewFolderChange: (val: string) => void
  onCreateFolder: () => void
  onUpload: (files: FileList | null) => void
  loading: boolean
  fileRef: React.RefObject<HTMLInputElement>
  folderRef: React.RefObject<HTMLInputElement>
  folderInputRef: React.RefObject<HTMLInputElement>
}

const NewMenu: React.FC<NewMenuProps> = ({
  isOpen,
  onClose,
  newFolder,
  onNewFolderChange,
  onCreateFolder,
  onUpload,
  loading,
  fileRef,
  folderRef,
  folderInputRef
}) => {
  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div className="absolute left-6 top-32 z-[70] w-80 bg-white rounded-xl shadow-2xl border border-gray-100 py-3 animate-in fade-in zoom-in-95 duration-150 origin-top-left">
        <div className="px-5 py-4 border-b border-gray-100 last:border-0">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1a73e8]" />
            Create
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={folderInputRef}
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1a73e8] focus:ring-4 focus:ring-[#1a73e8]/10 placeholder-gray-400 transition-all font-medium"
              value={newFolder}
              onChange={(e) => onNewFolderChange(e.target.value)}
              placeholder="Folder name"
              onKeyDown={(e) => e.key === 'Enter' && onCreateFolder()}
              autoFocus
            />
            <button
              className="flex items-center justify-center w-10 h-10 bg-[#1a73e8] text-white rounded-lg hover:bg-[#1765cc] transition-all disabled:opacity-50 shadow-sm active:scale-95"
              onClick={onCreateFolder}
              disabled={loading || !newFolder.trim()}
            >
              <span className="material-symbols-outlined !text-xl">create_new_folder</span>
            </button>
          </div>
        </div>

        <div className="px-5 py-4 last:border-0">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1a73e8]" />
            File Upload
          </div>
          <div className="flex flex-col gap-3">
            <div className="relative group">
              <input
                ref={fileRef}
                type="file"
                multiple
                className="block w-full text-[13px] text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#e8f0fe] file:text-[#1967d2] hover:file:bg-[#d2e3fc] transition-all cursor-pointer"
                disabled={loading}
                onChange={(e) => onUpload(e.target.files)}
              />
              <div className="mt-2 text-[10px] text-gray-400 font-medium ml-1 italic group-hover:text-gray-500 transition-colors">
                Hold Ctrl/Shift to select multiple files
              </div>
            </div>

            <div className="h-px bg-gray-50 my-1" />

            <div className="relative group">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1a73e8]" />
                Folder Upload
              </div>
              <input
                ref={folderRef}
                type="file"
                /* @ts-ignore */
                webkitdirectory=""
                directory=""
                className="block w-full text-[13px] text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-gray-50 file:text-gray-600 hover:file:bg-gray-100 transition-all cursor-pointer"
                disabled={loading}
                onChange={(e) => onUpload(e.target.files)}
              />
            </div>
            
            {/* The single Upload button is now handled by onChange above, but we keep it for manual trigger if needed or as a placeholder */}
            <div className="mt-4 pt-4 border-t border-gray-50 text-[10px] text-gray-400 text-center italic">
              Files will start uploading immediately after selection
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default NewMenu
