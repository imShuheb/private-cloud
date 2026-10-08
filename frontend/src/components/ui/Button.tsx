import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../../lib'

type Variant = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger'

const variants: Record<Variant, string> = {
  filled: 'bg-primary text-white hover:bg-primary-hover hover:shadow-card',
  tonal: 'bg-primary-soft text-on-primary-soft hover:shadow-card',
  outlined: 'border border-line text-primary hover:bg-[#e8f0fe]',
  text: 'text-primary hover:bg-[#e8f0fe]',
  danger: 'bg-danger text-white hover:bg-[#8c1d18] hover:shadow-card',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  icon?: string
  loading?: boolean
  children?: ReactNode
}

export default function Button({ variant = 'filled', icon, loading, children, className, disabled, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full text-sm font-medium font-display transition-[background-color,box-shadow] duration-150 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner small /> : icon ? <span className="icon text-[18px]">{icon}</span> : null}
      {children}
    </button>
  )
}

export function IconButton({
  icon,
  label,
  className,
  filled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; filled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'w-10 h-10 rounded-full inline-flex items-center justify-center text-ink-2 hover:bg-hover active:bg-press transition-colors disabled:opacity-40 disabled:pointer-events-none',
        className,
      )}
      {...rest}
    >
      <span className={cx('icon', filled && 'filled')}>{icon}</span>
    </button>
  )
}

export function Spinner({ small, className }: { small?: boolean; className?: string }) {
  return (
    <span
      role="progressbar"
      aria-label="Loading"
      className={cx(
        'inline-block rounded-full border-2 border-current border-t-transparent animate-spin',
        small ? 'w-4 h-4' : 'w-6 h-6',
        className,
      )}
    />
  )
}
