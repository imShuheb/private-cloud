import { useEffect, useState } from 'react'
import { errorMessage, getAnalyticsFiles, isAbortError } from '../api'
import type { AnalyticsFilesPage, AnalyticsFilesQuery } from '../types'

/** Loads one page of the largest-files list; re-runs when the query or the report changes. */
export function useAnalyticsFiles(query: AnalyticsFilesQuery, reportAt: string | undefined, version: number) {
  const [page, setPage] = useState<AnalyticsFilesPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { sort, order, category, q, minSize, folder, offset, limit } = query

  useEffect(() => {
    if (!reportAt) {
      setPage(null)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    getAnalyticsFiles({ sort, order, category, q, minSize, folder, offset, limit }, controller.signal)
      .then((next) => {
        setPage(next)
        setError(null)
        setLoading(false)
      })
      .catch((err) => {
        if (isAbortError(err)) return
        setError(errorMessage(err, 'Could not load files'))
        setLoading(false)
      })
    return () => controller.abort()
  }, [sort, order, category, q, minSize, folder, offset, limit, reportAt, version])

  return { page, loading, error }
}
