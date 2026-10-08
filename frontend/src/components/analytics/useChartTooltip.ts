import { useCallback, useRef, useState, type ReactNode } from 'react'

export type TipState = { x: number; y: number; content: ReactNode } | null

/** Hover tooltip state, positioned relative to containerRef. */
export function useChartTooltip() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<TipState>(null)

  const show = useCallback((e: { clientX: number; clientY: number }, content: ReactNode) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, content })
  }, [])
  const hide = useCallback(() => setTip(null), [])

  return { containerRef, tip, show, hide }
}
