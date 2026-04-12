import React from 'react'

type LoginCardProps = {
  children: React.ReactNode
}

const LoginCard: React.FC<LoginCardProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#f8f9fa] selection:bg-blue-100 selection:text-blue-700">
      <div className="w-full max-w-[480px] bg-white border border-[#f1f3f4] rounded-3xl p-8 sm:p-12 text-center ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-500">
        {/* Logo Section */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-[#e8f0fe] flex items-center justify-center">
            <span className="material-symbols-outlined filled text-3xl text-[#1a73e8]">cloud</span>
          </div>
          <span className="font-['Google_Sans'] text-[26px] text-gray-800 font-medium tracking-tight">Private Storage</span>
        </div>

        <h1 className="text-2xl font-['Google_Sans'] text-gray-900 mt-6 mb-2">Welcome back</h1>
        <p className="text-[15px] text-gray-500 mb-10 leading-relaxed font-normal">
          Manage your files securely in your personal encrypted vault.
        </p>

        {children}

        {/* Footer info */}
        <div className="mt-12 pt-8 border-t border-gray-100 flex items-center justify-center gap-6">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium tracking-tight">
            <span className="material-symbols-outlined !text-sm">lock</span>
            SECURED
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium tracking-tight">
            <span className="material-symbols-outlined !text-sm">verified_user</span>
            S3 VAULT
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginCard
