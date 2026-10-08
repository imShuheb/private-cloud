import { useState, type FormEvent } from 'react'
import { errorMessage } from '../../api'
import { MIN_PASSWORD_LENGTH } from '../../lib'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import TextField from '../ui/TextField'

type Props = {
  open: boolean
  username: string
  onClose: () => void
  onConfirm: (password: string) => Promise<void>
}

/** Mounted with a key per user so the fields start empty. */
export default function PasswordResetModal({ open, username, onClose, onConfirm }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const mismatch = confirm.length > 0 && password !== confirm
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && password === confirm

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      await onConfirm(password)
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not reset the password'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} title={`Reset password for ${username}`} width="sm">
      <form onSubmit={submit} className="pb-6 space-y-4">
        <p className="text-sm text-ink-2">{username} will be signed out everywhere and must use the new password.</p>
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={tooShort ? `At least ${MIN_PASSWORD_LENGTH} characters` : undefined}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          hint={mismatch ? 'Passwords don’t match' : undefined}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="text" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!canSubmit}>
            Reset password
          </Button>
        </div>
      </form>
    </Modal>
  )
}
