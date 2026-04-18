import React, { useState } from 'react'
import type { ManagedUser, UserPermissions } from '../../types'
import ConfirmModal from '../drive/ConfirmModal'

type UsersAccessSectionProps = {
  users: ManagedUser[]
  usersLoading: boolean
  creatingUser: boolean
  savingPermissionsUserId: number | null
  deletingUserId: number | null
  onCreateUser: (username: string, password: string, permissions: UserPermissions) => Promise<void> | void
  onSavePermissions: (target: ManagedUser, permissions: UserPermissions) => Promise<void> | void
  onActiveToggle: (target: ManagedUser, isActive: boolean) => Promise<void> | void
  onDeleteUser: (target: ManagedUser) => Promise<void> | void
  onOpenResetPassword: (target: ManagedUser) => void
}

const permissionOptions: Array<{ key: keyof UserPermissions; label: string }> = [
  { key: 'canUseSftp', label: 'Allow SFTP login' },
  { key: 'canReadFiles', label: 'Read files' },
  { key: 'canWriteFiles', label: 'Write files' },
  { key: 'canManageConnections', label: 'Manage connections' },
  { key: 'canManageSettings', label: 'Manage settings' },
]

function toSelectedKeys(permissions: UserPermissions): string[] {
  return permissionOptions.filter((opt) => permissions[opt.key]).map((opt) => opt.key)
}

function toPermissions(selectedKeys: string[]): UserPermissions {
  const selectedSet = new Set(selectedKeys)
  return {
    canReadFiles: selectedSet.has('canReadFiles'),
    canWriteFiles: selectedSet.has('canWriteFiles'),
    canManageConnections: selectedSet.has('canManageConnections'),
    canManageSettings: selectedSet.has('canManageSettings'),
    canUseSftp: selectedSet.has('canUseSftp'),
  }
}

const UsersAccessSection: React.FC<UsersAccessSectionProps> = ({
  users,
  usersLoading,
  creatingUser,
  savingPermissionsUserId,
  deletingUserId,
  onCreateUser,
  onSavePermissions,
  onActiveToggle,
  onDeleteUser,
  onOpenResetPassword,
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createUsername, setCreateUsername] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createSelectedKeys, setCreateSelectedKeys] = useState<string[]>([
    'canUseSftp',
    'canReadFiles',
    'canWriteFiles',
  ])
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null)
  const [editSelectedKeys, setEditSelectedKeys] = useState<string[]>([])
  const [editIsActive, setEditIsActive] = useState(true)
  const [deletingTarget, setDeletingTarget] = useState<ManagedUser | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  function getPermissionLabels(permissions: UserPermissions): string[] {
    return permissionOptions.filter((opt) => permissions[opt.key]).map((opt) => opt.label)
  }

  function openEditModal(user: ManagedUser) {
    setEditTarget(user)
    setEditSelectedKeys(toSelectedKeys(user.permissions))
    setEditIsActive(user.isActive)
  }

  function toggleEditPermission(permissionKey: string) {
    setEditSelectedKeys((prev) =>
      prev.includes(permissionKey) ? prev.filter((k) => k !== permissionKey) : [...prev, permissionKey]
    )
  }

  function toggleCreatePermission(permissionKey: string) {
    setCreateSelectedKeys((prev) =>
      prev.includes(permissionKey) ? prev.filter((k) => k !== permissionKey) : [...prev, permissionKey]
    )
  }

  async function handleCreateSubmit() {
    if (!createUsername.trim() || !createPassword.trim()) return
    await onCreateUser(createUsername.trim(), createPassword, toPermissions(createSelectedKeys))
    setCreateUsername('')
    setCreatePassword('')
    setCreateSelectedKeys(['canUseSftp', 'canReadFiles', 'canWriteFiles'])
    setIsCreateModalOpen(false)
  }

  async function handleSaveEdit() {
    if (!editTarget || editTarget.role === 'owner') return
    setSavingEdit(true)
    try {
      if (editTarget.isActive !== editIsActive) {
        await onActiveToggle(editTarget, editIsActive)
      }
      await onSavePermissions(editTarget, toPermissions(editSelectedKeys))
      setEditTarget(null)
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <section className="p-3 sm:p-4 md:p-5 border border-gray-300 bg-white">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-black uppercase tracking-wide">Users</h2>
          <p className="text-xs text-gray-700 mt-1">Manage users with clean row actions for edit, reset, and delete.</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2 text-sm font-bold text-white bg-black border border-black"
        >
          Create User
        </button>
      </div>

      {usersLoading ? (
        <div className="h-16 border border-gray-200 bg-gray-50 animate-pulse" />
      ) : (
        <div className="border border-gray-300 overflow-x-auto">
          <table className="w-full min-w-190 text-sm">
            <thead className="bg-gray-50 border-b border-gray-300">
              <tr>
                <th className="text-left px-3 py-2 font-bold">User</th>
                <th className="text-left px-3 py-2 font-bold">Role</th>
                <th className="text-left px-3 py-2 font-bold">Status</th>
                <th className="text-left px-3 py-2 font-bold">Permissions</th>
                <th className="text-right px-3 py-2 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const labels = getPermissionLabels(u.permissions)
                return (
                  <tr key={u.id} className="border-b border-gray-200">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-black">{u.username}</div>
                    </td>
                    <td className="px-3 py-2 uppercase text-xs tracking-wide">
                      {u.role}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-1 text-[11px] font-bold border ${u.isActive ? 'border-black text-black' : 'border-gray-300 text-gray-600'}`}>
                        {u.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {labels.length === 0 ? (
                          <span className="text-xs text-gray-500">No permissions</span>
                        ) : (
                          labels.map((label) => (
                            <span key={label} className="px-2 py-0.5 text-[11px] border border-gray-300">
                              {label}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(u)}
                          disabled={u.role === 'owner'}
                          className="px-2.5 py-1.5 text-[11px] font-bold border border-gray-300 disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onOpenResetPassword(u)}
                          className="px-2.5 py-1.5 text-[11px] font-bold border border-gray-300"
                        >
                          Reset
                        </button>
                        <button
                          onClick={() => setDeletingTarget(u)}
                          disabled={u.role === 'owner' || deletingUserId === u.id}
                          className="px-2.5 py-1.5 text-[11px] font-bold border border-black text-black disabled:opacity-50"
                        >
                          {deletingUserId === u.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsCreateModalOpen(false)} />
          <div className="relative w-full max-w-md bg-white border border-black overflow-hidden">
            <div className="px-6 py-5">
              <h3 className="text-lg font-bold uppercase tracking-wide">Create User</h3>
              <div className="mt-4 space-y-3">
                <input
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  placeholder="username"
                  className="w-full px-3 py-2 border border-gray-300 bg-white text-sm outline-none focus:border-black"
                />
                <input
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="password"
                  className="w-full px-3 py-2 border border-gray-300 bg-white text-sm outline-none focus:border-black"
                />

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mb-2">Permissions</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {permissionOptions.map((opt) => {
                      const checked = createSelectedKeys.includes(opt.key)
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => toggleCreatePermission(opt.key)}
                          className={`flex items-center justify-between px-3 py-2 border text-sm ${checked ? 'border-black bg-gray-100' : 'border-gray-300 bg-white'}`}
                        >
                          <span>{opt.label}</span>
                          <span className="text-xs font-bold">{checked ? 'ON' : 'OFF'}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-black">
              <button className="px-4 py-2 text-[13px] font-semibold border border-black" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </button>
              <button
                className="px-5 py-2 text-[13px] font-bold text-white border border-black bg-black disabled:opacity-50"
                disabled={creatingUser || !createUsername.trim() || !createPassword.trim()}
                onClick={() => void handleCreateSubmit()}
              >
                {creatingUser ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditTarget(null)} />
          <div className="relative w-full max-w-xl bg-white border border-black overflow-hidden">
            <div className="px-6 py-5">
              <h3 className="text-lg font-bold uppercase tracking-wide">Edit User: {editTarget.username}</h3>

              <div className="mt-4 grid gap-4">
                <label className="flex items-center justify-between border border-gray-300 px-3 py-2">
                  <span className="text-sm font-semibold">User Active</span>
                  <input type="checkbox" checked={editIsActive} onChange={(e) => setEditIsActive(e.target.checked)} />
                </label>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mb-2">Permissions</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {permissionOptions.map((opt) => {
                      const checked = editSelectedKeys.includes(opt.key)
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => toggleEditPermission(opt.key)}
                          className={`flex items-center justify-between px-3 py-2 border text-sm ${checked ? 'border-black bg-gray-100' : 'border-gray-300 bg-white'}`}
                        >
                          <span>{opt.label}</span>
                          <span className="text-xs font-bold">{checked ? 'ON' : 'OFF'}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-black">
              <button className="px-4 py-2 text-[13px] font-semibold border border-black" onClick={() => setEditTarget(null)}>
                Cancel
              </button>
              <button
                className="px-5 py-2 text-[13px] font-bold text-white border border-black bg-black disabled:opacity-50"
                disabled={savingEdit || savingPermissionsUserId === editTarget.id}
                onClick={() => void handleSaveEdit()}
              >
                {savingEdit || savingPermissionsUserId === editTarget.id ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deletingTarget}
        onClose={() => setDeletingTarget(null)}
        onConfirm={() => {
          if (deletingTarget) {
            void onDeleteUser(deletingTarget)
          }
        }}
        title="Delete User"
        message={deletingTarget ? `Delete ${deletingTarget.username}? This action cannot be undone.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
      />
    </section>
  )
}

export default UsersAccessSection
