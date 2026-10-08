import { useId, type InputHTMLAttributes } from 'react'
import { cx } from '../../lib'

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; mono?: boolean }

/** Outlined text field with a floating-style label above. */
export default function TextField({ label, hint, mono, className, id, ...rest }: Props) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={className}>
      <label htmlFor={inputId} className="block text-xs font-medium text-ink-2 mb-1.5">
        {label}
      </label>
      <input
        id={inputId}
        className={cx(
          'w-full h-12 px-4 rounded-[4px] border border-[#747775] bg-surface text-[15px] text-ink outline-none transition-[border-color,box-shadow] focus:border-primary focus:shadow-[inset_0_0_0_1px_var(--color-primary)] placeholder:text-ink-3/70',
          mono && 'font-mono text-sm',
        )}
        {...rest}
      />
      {hint && <p className="text-xs text-ink-3 mt-1.5">{hint}</p>}
    </div>
  )
}
