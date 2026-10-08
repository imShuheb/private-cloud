import type { ReactNode } from 'react'
import { cx } from '../../lib'

export default function Card({ title, subtitle, actions, children, className }: { title?: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-2xl border border-line-soft bg-surface p-5 anim-fade', className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {title && <h2 className="text-base font-medium text-ink">{title}</h2>}
            {subtitle && <div className="text-xs text-ink-3 mt-0.5">{subtitle}</div>}
          </div>
          {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
