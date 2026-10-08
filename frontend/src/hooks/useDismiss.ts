import { useEffect, useRef, type RefObject } from 'react'

type Refs = RefObject<HTMLElement | null> | Array<RefObject<HTMLElement | null>>

/** Calls onDismiss on Escape or a pointer press outside all of refs while active. */
export function useDismiss(refs: Refs, active: boolean, onDismiss: () => void) {
  // Callers usually pass an inline array; keep the latest without re-subscribing every render
  const latest = useRef(refs)
  useEffect(() => {
    latest.current = refs
  })

  useEffect(() => {
    if (!active) return
    const onPointer = (e: PointerEvent) => {
      const list = Array.isArray(latest.current) ? latest.current : [latest.current]
      if (!list.some((r) => r.current?.contains(e.target as Node))) onDismiss()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [active, onDismiss])
}
