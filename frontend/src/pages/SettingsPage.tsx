import { useSearchParams } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import ServerSettingsSection from '../components/settings/ServerSettingsSection'
import UsersAccessSection from '../components/settings/UsersAccessSection'
import { permissionsOf, useUser } from '../context/auth'
import { cx } from '../lib'

type Tab = 'server' | 'users'

export default function SettingsPage() {
  const user = useUser()
  const { isOwner, canManageSettings } = permissionsOf(user)
  const [params, setParams] = useSearchParams()

  const tabs: Array<{ key: Tab; label: string; icon: string }> = [
    ...(canManageSettings ? [{ key: 'server' as const, label: 'Server', icon: 'dns' }] : []),
    ...(isOwner ? [{ key: 'users' as const, label: 'Users & access', icon: 'group' }] : []),
  ]
  const requested = params.get('tab') as Tab | null
  const active: Tab | undefined = tabs.find((t) => t.key === requested)?.key ?? tabs[0]?.key

  return (
    <AppShell>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
        <div className="max-w-4xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl text-ink">Settings</h1>

          {tabs.length > 1 && (
            <div role="tablist" className="flex gap-1 mt-4 mb-6 border-b border-line-soft">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active === t.key}
                  onClick={() => setParams({ tab: t.key }, { replace: true })}
                  className={cx(
                    'relative h-12 px-4 flex items-center gap-2 text-sm font-medium transition-colors rounded-t-lg hover:bg-hover',
                    active === t.key ? 'text-primary' : 'text-ink-2',
                  )}
                >
                  <span className={cx('icon text-[20px]', active === t.key && 'filled')}>{t.icon}</span>
                  {t.label}
                  {active === t.key && <span className="absolute left-2 right-2 bottom-0 h-[3px] rounded-t-full bg-primary" />}
                </button>
              ))}
            </div>
          )}
          {tabs.length <= 1 && <div className="h-6" />}

          {active === 'server' && <ServerSettingsSection />}
          {active === 'users' && <UsersAccessSection />}
          {!active && <p className="text-sm text-ink-2">Your account doesn’t have access to settings.</p>}
        </div>
      </div>
    </AppShell>
  )
}
