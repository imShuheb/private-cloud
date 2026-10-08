import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createUser, deleteUser, errorMessage, listUsers, resetUserPassword, updateUserActive, updateUserPermissions } from '../../api'
import { useUser } from '../../context/auth'
import { useToast } from '../../context/toast'
import { MIN_PASSWORD_LENGTH, cx } from '../../lib'
import type { ManagedUser, UserPermissions } from '../../types'
import Card from '../analytics/Card'
import Button, { IconButton, Spinner } from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import Menu from '../ui/Menu'
import Modal from '../ui/Modal'
import Switch from '../ui/Switch'
import TextField from '../ui/TextField'
import PasswordResetModal from './PasswordResetModal'

const permissionOptions: Array<{ key: keyof UserPermissions; label: string; description: string }> = [
  { key: 'canReadFiles', label: 'View files', description: 'Browse, search, preview and download' },
  { key: 'canWriteFiles', label: 'Edit files', description: 'Upload, create folders and delete' },
  { key: 'canUseSftp', label: 'SFTP login', description: 'Sign in over SFTP with the same rights' },
  { key: 'canManageConnections', label: 'Manage connections', description: 'Add, change and switch storage' },
  { key: 'canManageSettings', label: 'Manage settings', description: 'Change server settings such as SFTP' },
]

const defaultPermissions: UserPermissions = {
  canReadFiles: true,
  canWriteFiles: true,
  canUseSftp: true,
  canManageConnections: false,
  canManageSettings: false,
}

type Dialog =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; user: ManagedUser }
  | { kind: 'reset'; user: ManagedUser }
  | { kind: 'delete'; user: ManagedUser }

export default function UsersAccessSection() {
  const me = useUser()
  const toast = useToast()
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' })
  const [dialogKey, setDialogKey] = useState(0)

  const load = useCallback(async () => {
    try {
      setUsers(await listUsers())
      setLoadError('')
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load users'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const open = (next: Dialog) => {
    setDialogKey((k) => k + 1)
    setDialog(next)
  }
  const close = () => setDialog({ kind: 'none' })

  async function toggleActive(user: ManagedUser) {
    try {
      await updateUserActive(user.id, !user.isActive)
      toast.show(user.isActive ? `${user.username} disabled and signed out` : `${user.username} enabled`)
      await load()
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the user'))
    }
  }

  return (
    <Card
      title="Users"
      subtitle="The owner has every permission. Changes apply immediately, even to signed-in users."
      actions={<Button icon="person_add" onClick={() => open({ kind: 'create' })}>Add user</Button>}
    >
      {loadError && <p className="text-sm text-danger">{loadError}</p>}
      {!users && !loadError && (
        <div className="flex justify-center py-10 text-primary">
          <Spinner />
        </div>
      )}
      {users && (
        <ul className="divide-y divide-line-soft -mx-2">
          {users.map((u) => {
            const isOwner = u.role === 'owner'
            const granted = permissionOptions.filter((o) => u.permissions[o.key])
            return (
              <li key={u.id} className="flex items-center gap-4 px-2 py-3">
                <span className={cx('w-10 h-10 rounded-full flex items-center justify-center font-display font-medium shrink-0', u.isActive ? 'bg-primary text-white' : 'bg-raised text-ink-3')}>
                  {u.username.charAt(0).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink truncate">{u.username}</span>
                    {u.id === me.id && <span className="text-xs text-ink-3">(you)</span>}
                    {isOwner && <span className="px-2 py-0.5 rounded-full bg-primary-soft text-on-primary-soft text-xs font-medium">Owner</span>}
                    {!u.isActive && <span className="px-2 py-0.5 rounded-full bg-raised text-ink-2 text-xs font-medium">Disabled</span>}
                  </div>
                  <div className="text-xs text-ink-3 mt-0.5 truncate">
                    {isOwner ? 'All permissions' : granted.length ? granted.map((o) => o.label).join(' · ') : 'No permissions'}
                  </div>
                </div>
                <Menu
                  trigger={({ toggle }) => <IconButton icon="more_vert" label={`Actions for ${u.username}`} onClick={toggle} />}
                  items={[
                    { label: 'Edit permissions', icon: 'tune', disabled: isOwner, onSelect: () => open({ kind: 'edit', user: u }) },
                    { label: 'Reset password', icon: 'key', onSelect: () => open({ kind: 'reset', user: u }) },
                    { label: u.isActive ? 'Disable' : 'Enable', icon: u.isActive ? 'person_off' : 'person_check', disabled: isOwner, onSelect: () => void toggleActive(u) },
                    'divider',
                    { label: 'Delete user', icon: 'delete', danger: true, disabled: isOwner, onSelect: () => open({ kind: 'delete', user: u }) },
                  ]}
                />
              </li>
            )
          })}
        </ul>
      )}

      <CreateUserModal key={`c${dialogKey}`} open={dialog.kind === 'create'} onClose={close} onCreated={load} />
      {dialog.kind === 'edit' && <EditPermissionsModal key={`e${dialogKey}`} user={dialog.user} onClose={close} onSaved={load} />}
      <PasswordResetModal
        key={`r${dialogKey}`}
        open={dialog.kind === 'reset'}
        username={dialog.kind === 'reset' ? dialog.user.username : ''}
        onClose={close}
        onConfirm={async (password) => {
          if (dialog.kind !== 'reset') return
          await resetUserPassword(dialog.user.id, password)
          toast.show(`Password reset for ${dialog.user.username}`, { tone: 'success' })
        }}
      />
      <ConfirmDialog
        open={dialog.kind === 'delete'}
        title={`Delete ${dialog.kind === 'delete' ? dialog.user.username : ''}?`}
        message="The account is removed and signed out everywhere. Files they uploaded stay in storage."
        confirmLabel="Delete"
        danger
        onClose={close}
        onConfirm={async () => {
          if (dialog.kind !== 'delete') return
          try {
            await deleteUser(dialog.user.id)
            toast.show(`${dialog.user.username} deleted`)
            await load()
          } catch (err) {
            toast.error(errorMessage(err, 'Could not delete the user'))
            throw err
          }
        }}
      />
    </Card>
  )
}

function PermissionSwitches({ value, onChange }: { value: UserPermissions; onChange: (v: UserPermissions) => void }) {
  return (
    <div className="divide-y divide-line-soft">
      {permissionOptions.map((o) => (
        <Switch key={o.key} label={o.label} description={o.description} checked={value[o.key]} onChange={(v) => onChange({ ...value, [o.key]: v })} />
      ))}
    </div>
  )
}

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const toast = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [perms, setPerms] = useState<UserPermissions>(defaultPermissions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim()) return setError('Enter a username')
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    setSaving(true)
    setError('')
    try {
      const created = await createUser(username.trim(), password)
      if (created.role !== 'owner') await updateUserPermissions(created.id, perms)
      toast.show(`${created.username} added`, { tone: 'success' })
      await onCreated()
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not create the user'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} title="Add user">
      <form onSubmit={submit} className="pb-6 space-y-4">
        <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
        />
        <div>
          <div className="text-xs font-medium text-ink-2 mt-2">Permissions</div>
          <PermissionSwitches value={perms} onChange={setPerms} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="text" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Add user
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function EditPermissionsModal({ user, onClose, onSaved }: { user: ManagedUser; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast()
  const [perms, setPerms] = useState<UserPermissions>(user.permissions)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await updateUserPermissions(user.id, perms)
      toast.show(`Permissions updated for ${user.username}`, { tone: 'success' })
      await onSaved()
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update permissions'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title={`Permissions for ${user.username}`}
      footer={
        <>
          <Button variant="text" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <PermissionSwitches value={perms} onChange={setPerms} />
    </Modal>
  )
}
