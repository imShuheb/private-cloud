import React, { useEffect, useState } from 'react'

type PasswordResetModalProps = {
  isOpen: boolean
  username: string
  onClose: () => void
  onConfirm: (password: string) => Promise<void> | void
}

const PasswordResetModal: React.FC<PasswordResetModalProps> = ({
  isOpen,
  username,
  onClose,
  onConfirm,
}) => {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    if (isOpen) {
      setPassword('')
      setConfirmPassword('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const canSubmit = password.trim().length > 0 && password === confirmPassword

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white border border-black overflow-hidden">
        <div className="px-6 py-6">
          <h3 className="text-lg font-bold text-black mb-2 uppercase tracking-wide">Reset Password</h3>
          <p className="text-[14px] text-gray-700 leading-relaxed mb-4">Set a new password for {username}.</p>

          <div className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              className="w-full px-3 py-2 border border-gray-300 bg-white text-sm outline-none focus:border-black"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full px-3 py-2 border border-gray-300 bg-white text-sm outline-none focus:border-black"
            />
            {confirmPassword && password !== confirmPassword && (
              <div className="text-xs font-semibold text-black">Passwords do not match.</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-white border-t border-black">
          <button className="px-4 py-2 text-[13px] font-semibold text-black border border-black" onClick={onClose}>
            Cancel
          </button>
          <button
            className="px-5 py-2 text-[13px] font-bold text-white border border-black bg-black disabled:opacity-50"
            onClick={() => canSubmit && onConfirm(password.trim())}
            disabled={!canSubmit}
          >
            Save Password
          </button>
        </div>
      </div>
    </div>
  )
}

export default PasswordResetModal
