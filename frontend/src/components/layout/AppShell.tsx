import { useState, type ReactNode } from 'react'
import { permissionsOf, useUser } from '../../context/auth'
import { useDriveStats } from '../../hooks/useDriveStats'
import Header, { type SearchProps } from './Header'
import Sidebar from './Sidebar'

type Props = {
  children: ReactNode
  search?: SearchProps
  onNew?: () => void
  newDisabled?: boolean
}

/** Drive-style frame: header, navigation rail and a rounded content surface. */
export default function AppShell({ children, search, onNew, newDisabled }: Props) {
  const user = useUser()
  const [navOpen, setNavOpen] = useState(false)
  const { stats } = useDriveStats(permissionsOf(user).canRead)

  return (
    <div className="h-full flex flex-col bg-app overflow-hidden">
      <Header onMenuClick={() => setNavOpen(true)} search={search} />
      <div className="flex-1 flex min-h-0">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} onNew={onNew} newDisabled={newDisabled} stats={stats} />
        <main className="flex-1 min-w-0 flex flex-col bg-surface rounded-t-2xl lg:rounded-2xl lg:mr-4 lg:mb-4 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
