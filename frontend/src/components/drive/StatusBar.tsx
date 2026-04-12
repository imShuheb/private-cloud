import React from 'react'

type StatusBarProps = {
  loading: boolean
  status: string
}

const StatusBar: React.FC<StatusBarProps> = ({ loading, status }) => {
  return (
    <div className={`flex items-center gap-3 px-6 py-2 bg-white border-t border-[#f1f3f4] text-[11px] text-gray-500 shrink-0 select-none shadow-[0_-1px_3px_rgba(0,0,0,0.02)] ${loading ? 'opacity-90' : ''}`}>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ring-4 ring-offset-0 transition-all duration-500 ${loading ? 'bg-[#fbbc04] ring-[#fbbc04]/10 animate-pulse' : 'bg-[#188038] ring-[#188038]/5'}`} />
        <span className="font-medium tracking-wide">
          {loading ? 'Refreshing storage...' : 'Vault is synchronized'}
        </span>
      </div>
      <div className="w-px h-3 bg-gray-200 mx-1" />
      <span className="truncate flex-1 max-w-[400px]">
        {loading ? 'Fetching latest data from S3...' : status}
      </span>
      <div className="ml-auto flex items-center gap-4">
        <div className="flex items-center gap-1.5 hover:text-[#1a73e8] cursor-pointer transition-colors group">
          <span className="material-symbols-outlined !text-sm group-hover:rotate-12 transition-transform">cloud_done</span>
          <span>Online</span>
        </div>
      </div>
    </div>
  )
}

export default StatusBar
