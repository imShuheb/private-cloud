import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createUser, deleteUser, getDriveStats, getSettings, listUsers, resetUserPassword, updateSettings, updateUserActive, updateUserPermissions } from '../api'
import type { ManagedUser, User, UserPermissions } from '../types'
import Header from '../components/layout/Header'
import Sidebar from '../components/layout/Sidebar'
import StatusBar from '../components/drive/StatusBar'
import PasswordResetModal from '../components/settings/PasswordResetModal'
import ServerSettingsSection from '../components/settings/ServerSettingsSection'
import UsersAccessSection from '../components/settings/UsersAccessSection'

type Props = {
  user: User
  onLogout: () => void
}

type TabKey = 'server' | 'users'

export default function SettingsPage({ user, onLogout }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const canManageConnections = !!user.permissions?.canManageConnections
  const canManageSettings = !!user.permissions?.canManageSettings
  const isOwner = user.role === 'owner'

  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [stats, setStats] = useState({ totalSize: 0, totalFiles: 0, totalFolders: 0, isConfigured: false })
  const [statsLoaded, setStatsLoaded] = useState(false)

  const [savingSettings, setSavingSettings] = useState(false)
  const [sftpEnabled, setSFTPEnabled] = useState(false)
  const [sftpAddr, setSFTPAddr] = useState('0.0.0.0:2022')

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)
  const [savingPermissionsUserId, setSavingPermissionsUserId] = useState<number | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null)
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null)

  const availableTabs = useMemo(() => {
    const tabs: TabKey[] = []
    if (canManageSettings) tabs.push('server')
    if (isOwner) tabs.push('users')
    return tabs
  }, [canManageSettings, isOwner])

  const initialTabParam = (searchParams.get('tab') || '').toLowerCase()
  const initialTab: TabKey = initialTabParam === 'users' ? 'users' : 'server'
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)

  function setActiveTabWithUrl(tab: TabKey) {
    setActiveTab(tab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(activeTab)) {
      setActiveTabWithUrl(availableTabs[0])
    }
  }, [availableTabs, activeTab])

  useEffect(() => {
    const tabParam = (searchParams.get('tab') || '').toLowerCase()
    if (tabParam === 'server' || tabParam === 'users') {
      const tab = tabParam as TabKey
      if (tab !== activeTab) {
        setActiveTab(tab)
      }
    }
  }, [searchParams])

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (isOwner) {
      void loadUsers()
    }
  }, [isOwner])

  async function load() {
        setLoading(true)
    try {
      const s = await getDriveStats()
      setStats(s)

      if (canManageSettings) {
        const appSettings = await getSettings()
        setSFTPEnabled(appSettings.sftpEnabled)
        setSFTPAddr(appSettings.sftpAddr || '0.0.0.0:2022')
      }

      setStatus('Settings loaded')
    } catch {
      setStatus('Failed to load settings')
    } finally {
      setLoading(false)
      setStatsLoaded(true)
    }
  }

  async function loadUsers() {
    setUsersLoading(true)
    try {
      const allUsers = await listUsers()
      setUsers(allUsers)
    } catch {
      setUsers([])
    } finally {
      setUsersLoading(false)
    }
  }

  async function handleSaveSettings() {
    if (!canManageSettings) {
      setStatus('You do not have permission to update settings')
      return
    }

    setSavingSettings(true)
    try {
      const updated = await updateSettings({
        sftpEnabled,
        sftpAddr,
      })
      setSFTPEnabled(updated.sftpEnabled)
      setSFTPAddr(updated.sftpAddr || '0.0.0.0:2022')
      setStatus('Settings saved and applied')
    } catch (err: any) {
      setStatus(err?.response?.data ?? 'Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  async function handleCreateUser(username: string, password: string, permissions: UserPermissions) {
    if (!isOwner) return
    if (!username.trim() || !password.trim()) {
      setStatus('Username and password are required to create a user')
      return
    }

    setCreatingUser(true)
    try {
      const created = await createUser({ username: username.trim(), password })
      if (created.role !== 'owner') {
        await updateUserPermissions(created.id, permissions)
      }
      await loadUsers()
      setStatus('User created')
    } catch (err: any) {
      setStatus(err?.response?.data ?? 'Failed to create user')
    } finally {
      setCreatingUser(false)
    }
  }

  async function handleSavePermissions(target: ManagedUser, next: UserPermissions) {
    if (!isOwner || target.role === 'owner') return
    setSavingPermissionsUserId(target.id)
    try {
      await updateUserPermissions(target.id, next)
      await loadUsers()
      setStatus(`Updated permissions for ${target.username}`)
    } catch (err: any) {
      setStatus(err?.response?.data ?? 'Failed to update permissions')
    } finally {
      setSavingPermissionsUserId(null)
    }
  }

  async function handleActiveToggle(target: ManagedUser, isActive: boolean) {
    if (!isOwner || target.role === 'owner') return
    try {
      await updateUserActive(target.id, isActive)
      await loadUsers()
      setStatus(`Updated user status for ${target.username}`)
    } catch (err: any) {
      setStatus(err?.response?.data ?? 'Failed to update user status')
    }
  }

  async function handleResetPassword(target: ManagedUser) {
    if (!isOwner) return
    setResetTarget(target)
  }

  async function handleDeleteUser(target: ManagedUser) {
    if (!isOwner || target.role === 'owner') return
    setDeletingUserId(target.id)
    try {
      await deleteUser(target.id)
      await loadUsers()
      setStatus(`Deleted user ${target.username}`)
    } catch (err: any) {
      setStatus(err?.response?.data ?? 'Failed to delete user')
    } finally {
      setDeletingUserId(null)
    }
  }

  async function handleSubmitResetPassword(password: string) {
    if (!resetTarget) return
    try {
      await resetUserPassword(resetTarget.id, password.trim())
      setStatus(`Password updated for ${resetTarget.username}`)
      setResetTarget(null)
    } catch (err: any) {
      setStatus(err?.response?.data ?? 'Failed to reset password')
    }
  }

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden selection:bg-black selection:text-white">
      <Header
        user={user}
        loading={loading}
        query=""
        onQueryChange={() => {}}
        onRefresh={load}
        onLogout={onLogout}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar
          onNewClick={() => {}}
          filesCount={stats.totalFiles}
          foldersCount={stats.totalFolders}
          totalSize={stats.totalSize}
          isConfigured={stats.isConfigured}
          connectionsLoading={!statsLoaded}
          disableNew={true}
          canSeeConnections={canManageConnections}
          canSeeSettings={canManageSettings || isOwner}
        />

        <main className="flex-1 flex flex-col overflow-hidden bg-white border-l border-gray-200 min-h-0 relative">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="max-w-5xl mx-auto w-full p-3 sm:p-4 md:p-6 lg:p-8">
              <div className="mb-6">
                <h1 className="text-xl sm:text-2xl font-bold text-black uppercase tracking-wide">Settings</h1>
                <p className="text-gray-700 text-sm mt-1">Separate controls for server configuration and user access.</p>
              </div>

              {availableTabs.length === 0 ? (
                <div className="p-4 border border-gray-300 bg-gray-50 text-sm text-black">
                  Your account does not have access to settings.
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
                    {canManageSettings && (
                      <button
                        onClick={() => setActiveTabWithUrl('server')}
                        className={`px-3 py-1.5 text-xs font-bold border ${activeTab === 'server' ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-300 hover:border-black'}`}
                      >
                        Server Settings
                      </button>
                    )}
                    {isOwner && (
                      <button
                        onClick={() => setActiveTabWithUrl('users')}
                        className={`px-3 py-1.5 text-xs font-bold border ${activeTab === 'users' ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-300 hover:border-black'}`}
                      >
                        Users & Access
                      </button>
                    )}
                  </div>

                  {activeTab === 'server' && canManageSettings && (
                    <ServerSettingsSection
                      sftpEnabled={sftpEnabled}
                      sftpAddr={sftpAddr}
                      saving={savingSettings}
                      onSftpEnabledChange={setSFTPEnabled}
                      onSftpAddrChange={setSFTPAddr}
                      onSave={handleSaveSettings}
                    />
                  )}

                  {activeTab === 'users' && isOwner && (
                    <UsersAccessSection
                      users={users}
                      usersLoading={usersLoading}
                      creatingUser={creatingUser}
                      savingPermissionsUserId={savingPermissionsUserId}
                      deletingUserId={deletingUserId}
                      onCreateUser={handleCreateUser}
                      onSavePermissions={handleSavePermissions}
                      onActiveToggle={handleActiveToggle}
                      onDeleteUser={handleDeleteUser}
                      onOpenResetPassword={handleResetPassword}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      <PasswordResetModal
        isOpen={!!resetTarget}
        username={resetTarget?.username || ''}
        onClose={() => setResetTarget(null)}
        onConfirm={handleSubmitResetPassword}
      />

      <StatusBar loading={loading} status={status} />
    </div>
  )
}
