import React from 'react'

type LoginFormProps = {
  username: string
  onUsernameChange: (v: string) => void
  password: string
  onPasswordChange: (v: string) => void
  loading: boolean
  error: string
  onSubmit: (e: React.FormEvent) => void
}

const LoginForm: React.FC<LoginFormProps> = ({
  username, onUsernameChange,
  password, onPasswordChange,
  loading, error,
  onSubmit,
}) => {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 text-left" id="login-form">
      <div className="relative">
        <label htmlFor="input-username" className="block text-xs font-semibold text-gray-600 mb-2 ml-0.5 tracking-wide uppercase">Username</label>
        <input
          id="input-username"
          className="w-full px-4 py-3 border border-gray-300 text-sm text-gray-900 bg-white transition-all outline-none focus:border-black placeholder-gray-400 font-medium"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          placeholder="e.g. mohammed"
          autoComplete="username"
        />
      </div>

      <div className="relative">
        <label htmlFor="input-password" className="block text-xs font-semibold text-gray-600 mb-2 ml-0.5 tracking-wide uppercase">Password</label>
        <input
          id="input-password"
          type="password"
          className="w-full px-4 py-3 border border-gray-300 text-sm text-gray-900 bg-white transition-all outline-none focus:border-black placeholder-gray-400 font-medium"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
        />
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-gray-100 border border-gray-300 text-gray-900 text-[13px] animate-in shake-in duration-300" role="alert">
          <span className="material-symbols-outlined !text-xl">warning</span>
          <span className="font-medium">{error}</span>
        </div>
      )}

      <div className="flex justify-end mt-4">
        <button
          id="btn-sign-in"
          className="w-full inline-flex items-center justify-center gap-3 px-8 py-3.5 bg-black hover:bg-neutral-900 text-white font-bold border border-black transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={loading}
          type="submit"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <span className="material-symbols-outlined !text-xl">login</span>
          )}
          {loading ? 'SIGNING IN...' : 'CONTINUE'}
        </button>
      </div>
    </form>
  )
}

export default LoginForm
