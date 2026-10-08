import type { ReactNode } from 'react'

export default function EmptyState({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6 anim-fade">
      <div className="w-[120px] h-[120px] rounded-full bg-raised flex items-center justify-center mb-6">
        <span className="icon text-[56px] text-primary">{icon}</span>
      </div>
      <h3 className="text-[22px] text-ink mb-2">{title}</h3>
      {children && <div className="text-sm text-ink-2 max-w-sm leading-relaxed">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
