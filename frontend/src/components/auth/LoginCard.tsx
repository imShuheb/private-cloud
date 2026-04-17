import React from 'react'

type LoginCardProps = {
  children: React.ReactNode
}

const LoginCard: React.FC<LoginCardProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-white selection:bg-black selection:text-white">
      <div className="w-full max-w-[480px] bg-white border border-gray-300 p-8 sm:p-12 text-center shadow-xl animate-in fade-in zoom-in-95 duration-500">
        {/* Logo Section */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-12 h-12 border border-black bg-black flex items-center justify-center">
            <span className="material-symbols-outlined filled text-3xl text-white">cloud</span>
          </div>
          <span className="text-[26px] text-gray-900 font-semibold tracking-tight">Private Storage</span>
        </div>

        <h1 className="text-2xl text-gray-900 mt-6 mb-2 font-semibold">Welcome back</h1>
        <p className="text-[15px] text-gray-600 mb-10 leading-relaxed font-normal">
          Manage your files securely in your personal encrypted vault.
        </p>

        {children}

        {/* Footer info */}
        <div className="mt-12 pt-8 border-t border-gray-200 flex items-center justify-center gap-6">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium tracking-tight">
            <span className="material-symbols-outlined !text-sm">lock</span>
            SECURED
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium tracking-tight">
            <span className="material-symbols-outlined !text-sm">verified_user</span>
            S3 VAULT
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginCard
