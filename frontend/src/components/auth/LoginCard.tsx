import type { ReactNode } from 'react'

/** Centered sign-in layout: brand mark, one focused card, short reassurance line. */
export default function LoginCard({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-10 bg-app bg-[radial-gradient(1200px_600px_at_50%_-10%,#dbe8ff_0%,transparent_60%)]">
      <div className="w-full max-w-[420px] anim-pop">
        <div className="flex items-center justify-center gap-3 mb-8">
          <span className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-card">
            <span className="icon filled text-[28px] text-white">cloud</span>
          </span>
          <span className="font-display text-[24px] text-ink">Private Storage</span>
        </div>

        <div className="bg-surface rounded-[28px] shadow-card px-6 py-8 sm:px-10 sm:py-10">
          <h1 className="text-[28px] leading-9 text-ink text-center">Welcome back</h1>
          <p className="text-sm text-ink-2 text-center mt-2 mb-8">Sign in to your drive</p>
          {children}
        </div>

        <p className="flex items-center justify-center gap-1.5 text-xs text-ink-3 mt-6">
          <span className="icon text-[16px]">lock</span>
          Files stay in your own S3-compatible storage
        </p>
      </div>
    </div>
  )
}
