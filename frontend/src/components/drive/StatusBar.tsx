import React from 'react'

type StatusBarProps = {
  loading: boolean
  status: string
}

const StatusBar: React.FC<StatusBarProps> = ({ loading, status }) => {
  return (
    <div className={`flex items-center gap-3 px-3 md:px-6 py-2 bg-white border-t border-gray-200 text-[11px] text-black shrink-0 select-none ${loading ? 'opacity-90' : ''}`}>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full transition-all duration-500 ${loading ? 'bg-black animate-pulse' : 'bg-black'}`} />
        <span className="font-semibold tracking-wide uppercase">
          {loading ? 'Loading' : 'Synced'}
        </span>
      </div>
      <div className="w-px h-3 bg-gray-300 mx-1" />
      <span className="truncate flex-1 max-w-[60vw] md:max-w-100 text-black">
        {loading ? 'Fetching latest data...' : status}
      </span>
      <div className="ml-auto flex items-center gap-2 md:gap-4">
        <div className="flex items-center gap-1.5 cursor-default transition-colors group">
          <span className="material-symbols-outlined text-sm!">cloud_done</span>
          <span>Online</span>
        </div>
      </div>
    </div>
  )
}

export default StatusBar
