import React from 'react'

type ConfirmModalProps = {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  isDangerous?: boolean
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 animate-in fade-in duration-300" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-md bg-white border border-black overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="px-6 py-6">
          <h3 className="text-lg font-bold text-black mb-2 uppercase tracking-wide">
            {title}
          </h3>
          <p className="text-[14px] text-gray-700 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-white border-t border-black">
          <button
            className="px-4 py-2 text-[13px] font-semibold text-black border border-black transition-colors"
            onClick={onClose}
          >
            {cancelText}
          </button>
          <button
            className={`px-5 py-2 text-[13px] font-bold text-white border border-black transition-all ${
              isDangerous 
                ? 'bg-black' 
                : 'bg-black'
            }`}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
