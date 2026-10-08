import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const perms = permissionsOf(user)
  const navigate = useNavigate()
  const [navOpen, setNavOpen] = useState(false)
  const { stats } = useDriveStats(perms.canRead)

  // Outside the drive, "New" opens the drive with its New menu
  const handleNew = onNew ?? (perms.canWrite ? () => navigate('/drive', { state: { openNew: true } }) : undefined)

  return (
    <div className="h-full flex flex-col bg-app overflow-hidden">
      <Header onMenuClick={() => setNavOpen(true)} search={search} />
      <div className="flex-1 flex min-h-0">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} onNew={handleNew} newDisabled={newDisabled} stats={stats} />
        <main className="flex-1 min-w-0 flex flex-col bg-surface rounded-t-2xl lg:rounded-2xl lg:mr-4 lg:mb-4 overflow-hidden">
          {children}
        </main>
        {handleNew && !newDisabled && (
          <button
            onClick={handleNew}
            aria-label="New"
            className="lg:hidden fixed right-4 bottom-6 z-[80] w-14 h-14 rounded-2xl bg-surface shadow-raised flex items-center justify-center text-primary active:shadow-card"
          >
            <span className="icon text-[28px]">add</span>
          </button>
        )}
      </div>
    </div>
  )
}
