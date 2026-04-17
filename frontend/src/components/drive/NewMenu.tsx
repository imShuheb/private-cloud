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
      <div className="fixed inset-0 z-60" onClick={onClose} />
      <div className="absolute left-3 md:left-6 top-20 md:top-24 z-70 w-[calc(100vw-1.5rem)] max-w-80 bg-white border border-gray-300 shadow-lg py-3 animate-in fade-in zoom-in-95 duration-150 origin-top-left">
        <div className="px-5 py-4 border-b border-gray-300 last:border-0">
          <div className="text-[10px] font-bold text-black uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-black" />
            Create
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={folderInputRef}
              className="flex-1 px-3 py-2.5 border border-gray-300 text-sm outline-none placeholder-gray-500 transition-all font-medium focus:border-black"
              value={newFolder}
              onChange={(e) => onNewFolderChange(e.target.value)}
              placeholder="Folder name"
              onKeyDown={(e) => e.key === 'Enter' && onCreateFolder()}
              autoFocus
            />
            <button
              className="flex items-center justify-center w-10 h-10 bg-black text-white border border-black transition-all disabled:opacity-50"
              onClick={onCreateFolder}
              disabled={loading || !newFolder.trim()}
            >
              <span className="material-symbols-outlined !text-xl">create_new_folder</span>
            </button>
          </div>
        </div>

        <div className="px-5 py-4 last:border-0">
          <div className="text-[10px] font-bold text-black uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-black" />
            File Upload
          </div>
          <div className="flex flex-col gap-3">
            <div className="relative group">
              <input
                ref={fileRef}
                type="file"
                multiple
                className="block w-full text-[13px] text-gray-700 file:mr-3 file:py-2 file:px-4 file:border file:border-gray-300 file:text-xs file:font-semibold file:bg-white file:text-black transition-all cursor-pointer"
                disabled={loading}
                onChange={(e) => onUpload(e.target.files)}
              />
              <div className="mt-2 text-[10px] text-gray-600 font-medium ml-1 italic transition-colors">
                Hold Ctrl/Shift to select multiple files
              </div>
            </div>

            <div className="h-px bg-gray-300 my-1" />

            <div className="relative group">
              <div className="text-[10px] font-bold text-black uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-black" />
                Folder Upload
              </div>
              <input
                ref={folderRef}
                type="file"
                /* @ts-ignore */
                webkitdirectory=""
                directory=""
                className="block w-full text-[13px] text-gray-600 file:mr-3 file:py-2 file:px-4 file:border file:border-gray-300 file:text-xs file:font-semibold file:bg-white file:text-black transition-all cursor-pointer"
                disabled={loading}
                onChange={(e) => onUpload(e.target.files)}
              />
            </div>
            
            {/* The single Upload button is now handled by onChange above, but we keep it for manual trigger if needed or as a placeholder */}
            <div className="mt-4 pt-4 border-t border-gray-300 text-[10px] text-gray-700 text-center italic">
              Files will start uploading immediately after selection
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default NewMenu
