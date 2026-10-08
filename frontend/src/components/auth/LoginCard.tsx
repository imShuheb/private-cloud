import type { ReactNode } from 'react'

/** Google sign-in style card: brand and heading on the left, form on the right. */
export default function LoginCard({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center p-4 sm:p-6 bg-app">
      <div className="w-full max-w-[1040px] bg-surface rounded-[28px] p-6 sm:p-10 grid gap-8 md:grid-cols-2 anim-pop">
        <div>
          <span className="icon filled text-[48px] text-primary">cloud</span>
          <h1 className="text-[36px] leading-[44px] text-ink mt-4">Sign in</h1>
          <p className="text-base text-ink mt-4">to continue to Private Storage</p>
        </div>
        <div>{children}</div>
      </div>
      <p className="text-xs text-ink-3 mt-6">Your files stay in your own S3-compatible storage.</p>
    </div>
  )
}
