import { useNavigate } from 'react-router-dom'
import { useAuth, useUser } from '../../context/auth'
import ConnectionSwitcher from '../ConnectionSwitcher'
import { IconButton } from '../ui/Button'
import Menu from '../ui/Menu'

export type SearchProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  busy?: boolean
}

type Props = {
  onMenuClick: () => void
  search?: SearchProps
}

export default function Header({ onMenuClick, search }: Props) {
  const user = useUser()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const initial = user.username.charAt(0).toUpperCase() || '?'

  return (
    <header className="h-16 shrink-0 flex items-center gap-2 px-2 sm:px-4">
      <IconButton icon="menu" label="Main menu" className="lg:hidden" onClick={onMenuClick} />
      <button className="flex items-center gap-2 pl-1 pr-3 h-12 rounded-full hover:bg-hover shrink-0" onClick={() => navigate('/drive')}>
        <span className="icon filled text-[32px] text-primary">cloud</span>
        <span className="font-display text-[22px] text-ink-2 hidden sm:inline">Private Storage</span>
      </button>

      <div className="flex-1 min-w-0 flex justify-center lg:justify-start lg:pl-[88px]">
        {search && <SearchBox {...search} />}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <ConnectionSwitcher />
        <Menu
          trigger={({ toggle }) => (
            <button
              onClick={toggle}
              className="ml-1 w-10 h-10 rounded-full flex items-center justify-center hover:bg-hover"
              aria-label={`Account: ${user.username}`}
              title={user.username}
            >
              <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-display font-medium">{initial}</span>
            </button>
          )}
          header={
            <div className="px-4 pt-2 pb-3 mb-1 border-b border-line-soft">
              <div className="text-sm font-medium text-ink truncate">{user.username}</div>
              <div className="text-xs text-ink-3 capitalize">{user.role ?? 'user'}</div>
            </div>
          }
          items={[
            { label: 'Storage insights', icon: 'data_usage', onSelect: () => navigate('/storage') },
            { label: 'Sign out', icon: 'logout', onSelect: () => void signOut() },
          ]}
        />
      </div>
    </header>
  )
}

function SearchBox({ value, onChange, placeholder = 'Search in Drive', busy }: SearchProps) {
  return (
    <div className="relative w-full max-w-[720px] h-12 group">
      <span className="icon absolute left-3 top-1/2 -translate-y-1/2 text-ink-2 pointer-events-none">search</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full h-full rounded-full bg-hover pl-12 pr-12 text-[16px] text-ink outline-none transition-[background-color,box-shadow] focus:bg-surface focus:shadow-menu placeholder:text-ink-2 [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
        {busy ? (
          <span className="w-10 h-10 flex items-center justify-center text-primary">
            <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
          </span>
        ) : (
          value && <IconButton icon="close" label="Clear search" onClick={() => onChange('')} />
        )}
      </div>
    </div>
  )
}
