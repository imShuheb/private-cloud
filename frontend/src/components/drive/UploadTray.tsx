import React from 'react'

export type UploadStatus = {
  id: string
  name: string
  progress: number
  status: 'uploading' | 'completed' | 'error'
  error?: string
}

type UploadTrayProps = {
  uploads: UploadStatus[]
  onClose: () => void
}

const UploadTray: React.FC<UploadTrayProps> = ({ uploads, onClose }) => {
  if (uploads.length === 0) return null

  const completedCount = uploads.filter(u => u.status === 'completed').length
  const isAllDone = completedCount === uploads.length
  const totalProgress = uploads.reduce((acc, u) => acc + u.progress, 0) / uploads.length

  return (
    <div className="fixed bottom-3 right-3 md:bottom-6 md:right-6 w-[calc(100vw-1.5rem)] max-w-96 bg-white border border-gray-300 shadow-xl flex flex-col overflow-hidden animate-in slide-in-from-right-8 duration-300 z-50">
      <div className="flex items-center justify-between px-5 py-3.5 bg-black text-white">
        <div className="flex items-center gap-2">
          {isAllDone ? (
            <span className="material-symbols-outlined text-white text-xl">check_circle</span>
          ) : (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          <span className="text-[13px] font-semibold tracking-wide">
            {isAllDone ? `${uploads.length} uploads complete` : `Uploading ${uploads.length} items`}
          </span>
        </div>
        <button 
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center border border-white/30 transition-colors hover:border-white"
        >
          <span className="material-symbols-outlined !text-xl">close</span>
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto bg-white divide-y divide-gray-100">
        {uploads.map((upload) => (
          <div key={upload.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="material-symbols-outlined text-black text-lg shrink-0">
                  {upload.name.includes('.') ? 'description' : 'folder'}
                </span>
                <span className="text-[13px] text-black font-medium truncate" title={upload.name}>
                  {upload.name}
                </span>
              </div>
              <span className="text-[11px] font-bold text-black tabular-nums">
                {upload.status === 'completed' ? 'Done' : `${Math.round(upload.progress)}%`}
              </span>
            </div>
            
            <div className="h-1.5 w-full bg-gray-200 overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${
                  upload.status === 'error' ? 'bg-black' : 
                  upload.status === 'completed' ? 'bg-black' : 'bg-black'
                }`}
                style={{ width: `${upload.progress}%` }}
              />
            </div>
            {upload.status === 'error' && (
              <p className="mt-1.5 text-[10px] text-black font-medium">{upload.error}</p>
            )}
          </div>
        ))}
      </div>

      {!isAllDone && (
        <div className="px-5 py-2.5 bg-white border-t border-black">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-black uppercase tracking-widest">Overall Progress</span>
            <span className="text-[10px] font-bold text-black tracking-wider">
              {completedCount} of {uploads.length} complete
            </span>
          </div>
          <div className="h-1 w-full bg-gray-200 overflow-hidden">
            <div 
              className="h-full bg-black transition-all duration-300"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default UploadTray
