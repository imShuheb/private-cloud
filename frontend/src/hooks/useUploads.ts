import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage, isAbortError, uploadFile } from '../api'

export type UploadItem = {
  id: string
  name: string
  key: string
  size: number
  progress: number
  status: 'queued' | 'uploading' | 'done' | 'error' | 'cancelled'
  error?: string
}

type Job = { item: UploadItem; file: File; controller: AbortController }

const CONCURRENCY = 3

/**
 * Upload queue: up to CONCURRENCY files at a time, each one cancellable, and one failure
 * never stops the rest. onBatchDone runs when the queue drains, e.g. to refresh the folder.
 */
export function useUploads(onBatchDone: (uploaded: number) => void) {
  const [items, setItems] = useState<UploadItem[]>([])
  const queue = useRef<Job[]>([])
  const running = useRef(0)
  const uploadedInBatch = useRef(0)
  const onBatchDoneRef = useRef(onBatchDone)
  const nextId = useRef(1)
  const jobsById = useRef(new Map<string, Job>())

  useEffect(() => {
    onBatchDoneRef.current = onBatchDone
  }, [onBatchDone])

  const update = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)))
  }, [])

  const pump = useCallback(() => {
    while (running.current < CONCURRENCY && queue.current.length > 0) {
      const job = queue.current.shift()!
      if (job.controller.signal.aborted) continue
      running.current++
      update(job.item.id, { status: 'uploading' })

      uploadFile(job.item.key, job.file, (progress) => update(job.item.id, { progress }), job.controller.signal)
        .then(() => {
          uploadedInBatch.current++
          update(job.item.id, { status: 'done', progress: 100 })
        })
        .catch((err) => {
          if (isAbortError(err)) update(job.item.id, { status: 'cancelled' })
          else update(job.item.id, { status: 'error', error: errorMessage(err, 'Upload failed') })
        })
        .finally(() => {
          running.current--
          if (running.current === 0 && queue.current.length === 0) {
            const uploaded = uploadedInBatch.current
            uploadedInBatch.current = 0
            onBatchDoneRef.current(uploaded)
          } else {
            pump()
          }
        })
    }
  }, [update])

  /** Queues files under prefix; folder uploads keep their relative paths. */
  const add = useCallback(
    (files: File[], prefix: string) => {
      if (files.length === 0) return
      const jobs: Job[] = files.map((file) => {
        const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
        const id = `u${nextId.current++}`
        return {
          file,
          controller: new AbortController(),
          item: { id, name: relative, key: `${prefix}${relative}`, size: file.size, progress: 0, status: 'queued' },
        }
      })
      queue.current.push(...jobs)
      setItems((list) => [...list, ...jobs.map((j) => j.item)])
      for (const job of jobs) jobsById.current.set(job.item.id, job)
      pump()
    },
    [pump],
  )

  const cancel = useCallback(
    (id: string) => {
      const job = jobsById.current.get(id)
      if (!job) return
      job.controller.abort()
      // Queued jobs never start, so mark them here; running ones are marked by their catch
      if (queue.current.includes(job)) {
        queue.current = queue.current.filter((j) => j !== job)
        update(id, { status: 'cancelled' })
      }
    },
    [update],
  )

  const cancelAll = useCallback(() => {
    for (const job of jobsById.current.values()) {
      if (!job.controller.signal.aborted) job.controller.abort()
    }
    const queued = new Set(queue.current.map((j) => j.item.id))
    queue.current = []
    setItems((list) => list.map((u) => (queued.has(u.id) ? { ...u, status: 'cancelled' } : u)))
  }, [])

  const clear = useCallback(() => {
    setItems((list) => list.filter((u) => u.status === 'queued' || u.status === 'uploading'))
  }, [])

  // Stop uploads still running when the page is left
  useEffect(() => {
    const jobs = jobsById.current
    return () => {
      for (const job of jobs.values()) job.controller.abort()
    }
  }, [])

  return { items, add, cancel, cancelAll, clear }
}
