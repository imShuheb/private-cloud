import { useState } from 'react'
import Button from './Button'
import Modal from './Modal'

type Props = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => Promise<void> | void
  onClose: () => void
}

/** Confirmation that stays open (with a spinner) until the action finishes. */
export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      width="sm"
      footer={
        <>
          <Button variant="text" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'filled'} onClick={confirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2 leading-relaxed">{message}</p>
    </Modal>
  )
}
