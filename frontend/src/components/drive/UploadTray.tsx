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
    <div className="fixed bottom-6 right-6 w-96 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 flex flex-col overflow-hidden animate-in slide-in-from-right-8 duration-300 z-50">
      <div className="flex items-center justify-between px-5 py-3.5 bg-gray-900 text-white">
        <div className="flex items-center gap-2">
          {isAllDone ? (
            <span className="material-symbols-outlined text-green-400 text-xl">check_circle</span>
          ) : (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          <span className="text-[13px] font-semibold tracking-wide">
            {isAllDone ? `${uploads.length} uploads complete` : `Uploading ${uploads.length} items`}
          </span>
        </div>
        <button 
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
        >
          <span className="material-symbols-outlined !text-xl">close</span>
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto bg-white divide-y divide-gray-50 scrollbar-thin scrollbar-thumb-gray-200">
        {uploads.map((upload) => (
          <div key={upload.id} className="px-5 py-4 hover:bg-gray-50/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="material-symbols-outlined text-gray-400 text-lg shrink-0">
                  {upload.name.includes('.') ? 'description' : 'folder'}
                </span>
                <span className="text-[13px] text-gray-700 font-medium truncate" title={upload.name}>
                  {upload.name}
                </span>
              </div>
              <span className="text-[11px] font-bold text-gray-400 tabular-nums">
                {upload.status === 'completed' ? 'Done' : `${Math.round(upload.progress)}%`}
              </span>
            </div>
            
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${
                  upload.status === 'error' ? 'bg-red-500' : 
                  upload.status === 'completed' ? 'bg-green-500' : 'bg-[#1a73e8]'
                }`}
                style={{ width: `${upload.progress}%` }}
              />
            </div>
            {upload.status === 'error' && (
              <p className="mt-1.5 text-[10px] text-red-500 font-medium">{upload.error}</p>
            )}
          </div>
        ))}
      </div>

      {!isAllDone && (
        <div className="px-5 py-2.5 bg-blue-50/50 border-t border-blue-50">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Overall Progress</span>
            <span className="text-[10px] font-bold text-blue-600 tracking-wider">
              {completedCount} of {uploads.length} complete
            </span>
          </div>
          <div className="h-1 w-full bg-blue-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-300 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default UploadTray
