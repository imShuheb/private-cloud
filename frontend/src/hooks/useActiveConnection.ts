import { useEffect, useState } from 'react'
import { getActiveConnection } from '../api'
import type { ActiveConnection } from '../types'

export function useActiveConnection() {
  const [active, setActive] = useState<ActiveConnection | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    getActiveConnection()
      .then((conn) => !cancelled && setActive(conn))
      .catch(() => !cancelled && setActive(null))
    return () => {
      cancelled = true
    }
  }, [])
  return active
}
