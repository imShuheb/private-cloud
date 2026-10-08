import { useCallback, useEffect, useRef, useState } from 'react'
import { cancelScan, errorMessage, getAnalytics, isAbortError, startScan } from '../api'
import type { AnalyticsResponse } from '../types'

const POLL_MS = 1000

export function useAnalytics() {
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined

    getAnalytics(controller.signal)
      .then((next) => {
        setData(next)
        setError(null)
        if (next.status.state === 'running') timer = window.setTimeout(() => setTick((t) => t + 1), POLL_MS)
      })
      .catch((err) => {
        if (!isAbortError(err)) setError(errorMessage(err, 'Could not load storage insights'))
      })

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [tick])

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await action()
      setTick((t) => t + 1)
    } catch (err) {
      if (mounted.current) setError(errorMessage(err))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }, [])

  const scan = useCallback(() => run(startScan), [run])
  const cancel = useCallback(() => run(cancelScan), [run])
  const reload = useCallback(() => setTick((t) => t + 1), [])

  return { data, error, busy, scan, cancel, reload }
}
