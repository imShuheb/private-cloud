import { useCallback, useEffect, useState } from 'react'
import { getDriveStats, isAbortError } from '../api'
import type { DriveStats } from '../types'

const POLL_MS = 3000

/** Storage totals from the latest scan; polls while the first scan is still running. */
export function useDriveStats(enabled: boolean) {
  const [stats, setStats] = useState<DriveStats | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let timer: number | undefined

    getDriveStats(controller.signal)
      .then((next) => {
        setStats(next)
        if (next.scanning) timer = window.setTimeout(() => setTick((t) => t + 1), POLL_MS)
      })
      .catch((err) => {
        if (!isAbortError(err)) setStats(null)
      })

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [enabled, tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  return { stats, refresh }
}
