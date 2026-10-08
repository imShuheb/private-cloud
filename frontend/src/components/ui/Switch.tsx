import { cx } from '../../lib'

type Props = { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }

export default function Switch({ checked, onChange, label, description, disabled }: Props) {
  return (
    <label className={cx('flex items-center justify-between gap-4 py-3', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-3 mt-0.5">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative shrink-0 w-[52px] h-8 rounded-full border-2 transition-colors duration-150',
          checked ? 'bg-primary border-primary' : 'bg-raised border-[#747775]',
        )}
      >
        <span
          className={cx(
            'absolute top-1/2 -translate-y-1/2 rounded-full transition-all duration-150 flex items-center justify-center',
            checked ? 'left-[22px] w-6 h-6 bg-white' : 'left-[6px] w-4 h-4 bg-[#747775]',
          )}
        >
          {checked && <span className="icon text-[16px] text-primary">check</span>}
        </span>
      </button>
    </label>
  )
}
