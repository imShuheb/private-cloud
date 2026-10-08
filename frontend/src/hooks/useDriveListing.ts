import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { errorMessage, isAbortError, listDrive } from '../api'
import type { FileInfo, FolderInfo } from '../types'

export type ListingState = {
  status: 'loading' | 'ready' | 'error' | 'notFound'
  folders: FolderInfo[]
  files: FileInfo[]
  nextToken?: string
  loadingMore: boolean
  error?: string
}

const initial: ListingState = { status: 'loading', folders: [], files: [], loadingMore: false }

/** Lists one folder, page by page. Changing prefix cancels any request still in flight. */
export function useDriveListing(prefix: string, enabled: boolean) {
  const [state, setState] = useState<ListingState>(initial)
  const [reloadKey, setReloadKey] = useState(0)
  const pageController = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!enabled) {
      setState({ ...initial, status: 'ready' })
      return
    }
    const controller = new AbortController()
    pageController.current?.abort()
    pageController.current = controller

    setState((prev) => ({ ...prev, status: 'loading', loadingMore: false, error: undefined }))
    listDrive(prefix, undefined, controller.signal)
      .then((data) => {
        setState({
          status: 'ready',
          folders: data.folders ?? [],
          files: data.files ?? [],
          nextToken: data.isTruncated ? data.nextContinuationToken : undefined,
          loadingMore: false,
        })
      })
      .catch((err) => {
        if (isAbortError(err)) return
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setState({ ...initial, status: 'notFound' })
          return
        }
        setState({ ...initial, status: 'error', error: errorMessage(err, 'Could not load this folder') })
      })

    return () => controller.abort()
  }, [prefix, enabled, reloadKey])

  const loadMore = useCallback(() => {
    const token = state.nextToken
    if (!token || state.loadingMore) return
    const controller = new AbortController()
    pageController.current = controller
    setState((prev) => ({ ...prev, loadingMore: true }))
    listDrive(prefix, token, controller.signal)
      .then((data) => {
        setState((prev) => ({
          ...prev,
          folders: [...prev.folders, ...(data.folders ?? [])],
          files: [...prev.files, ...(data.files ?? [])],
          nextToken: data.isTruncated ? data.nextContinuationToken : undefined,
          loadingMore: false,
        }))
      })
      .catch((err) => {
        if (isAbortError(err)) return
        setState((prev) => ({ ...prev, loadingMore: false, error: errorMessage(err, 'Could not load more items') }))
      })
  }, [prefix, state.nextToken, state.loadingMore])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { ...state, loadMore, reload }
}
