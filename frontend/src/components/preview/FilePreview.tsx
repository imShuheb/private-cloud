import { useCallback, useEffect, useRef, useState, type Ref } from 'react'
import { errorMessage, presignDownload } from '../../api'
import { cx, formatBytes, formatDate, getFileIcon, previewKind } from '../../lib'
import { Spinner } from '../ui/Button'

export type PreviewFile = { key: string; name: string; size: number; lastModified: string }

type Props = {
  files: PreviewFile[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  onDownload: (file: PreviewFile) => void
}

const MAX_TEXT_BYTES = 1 << 20
const MAX_FETCHED_BYTES = 200 << 20

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; url: string; text?: string }

/**
 * Full-screen viewer like Drive's. Images, video and audio play straight from the signed URL.
 * PDFs and SVGs are fetched and re-typed in the browser, so a file stored as
 * "application/octet-stream" still shows instead of downloading.
 */
export default function FilePreview({ files, index, onIndexChange, onClose, onDownload }: Props) {
  const file = files[index]
  const kind = file ? previewKind(file.name) : 'none'
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  const closeRef = useRef<HTMLButtonElement>(null)

  const hasPrev = index > 0
  const hasNext = index < files.length - 1
  const prev = useCallback(() => hasPrev && onIndexChange(index - 1), [hasPrev, index, onIndexChange])
  const next = useCallback(() => hasNext && onIndexChange(index + 1), [hasNext, index, onIndexChange])

  // Load the current file
  useEffect(() => {
    if (!file) return
    let cancelled = false
    let objectUrl: string | null = null
    const controller = new AbortController()
    setLoaded({ status: 'loading' })

    if (kind === 'none') {
      setLoaded({ status: 'ready', url: '' })
      return
    }
    if (kind === 'text' && file.size > MAX_TEXT_BYTES) {
      setLoaded({ status: 'error', message: `Text previews are limited to ${formatBytes(MAX_TEXT_BYTES)}. Download the file to open it.` })
      return
    }
    if ((kind === 'pdf' || kind === 'svg') && file.size > MAX_FETCHED_BYTES) {
      setLoaded({ status: 'error', message: `This file is too large to preview (${formatBytes(file.size)}). Download it instead.` })
      return
    }

    ;(async () => {
      try {
        const signed = await presignDownload(file.key, false)
        if (cancelled) return
        if (kind === 'image' || kind === 'video' || kind === 'audio') {
          setLoaded({ status: 'ready', url: signed.url })
          return
        }
        const res = await fetch(signed.url, { signal: controller.signal })
        if (!res.ok) throw new Error(`Storage returned ${res.status}`)
        if (kind === 'text') {
          const text = await res.text()
          if (!cancelled) setLoaded({ status: 'ready', url: signed.url, text })
          return
        }
        const type = kind === 'pdf' ? 'application/pdf' : 'image/svg+xml'
        const blob = new Blob([await res.arrayBuffer()], { type })
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setLoaded({ status: 'ready', url: objectUrl })
      } catch (err) {
        if (cancelled || controller.signal.aborted) return
        const message = err instanceof TypeError ? 'The storage didn’t allow the browser to read this file (check the bucket’s CORS settings).' : errorMessage(err, 'Couldn’t load the preview')
        setLoaded({ status: 'error', message })
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file, kind])

  // Keyboard, focus and page scroll
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && !(e.target instanceof HTMLMediaElement)) prev()
      else if (e.key === 'ArrowRight' && !(e.target instanceof HTMLMediaElement)) next()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, prev, next])

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [])

  if (!file) return null
  const icon = getFileIcon(file.name)

  return (
    <div role="dialog" aria-modal="true" aria-label={`Preview of ${file.name}`} className="fixed inset-0 z-[170] flex flex-col bg-[#202124] text-white anim-fade">
      <header className="h-16 shrink-0 flex items-center gap-2 px-2 sm:px-4">
        <DarkButton buttonRef={closeRef} icon="arrow_back" label="Close preview" onClick={onClose} />
        <span className={cx('icon text-[22px] ml-1', icon.className)}>{icon.icon}</span>
        <div className="min-w-0 flex-1 ml-1">
          <div className="truncate text-[15px] font-medium" title={file.name}>
            {file.name}
          </div>
          <div className="text-xs text-white/60 truncate">
            {formatBytes(file.size)} · {formatDate(file.lastModified)}
          </div>
        </div>
        {loaded.status === 'ready' && loaded.url && kind !== 'pdf' && kind !== 'svg' && (
          <DarkButton icon="open_in_new" label="Open in new tab" onClick={() => window.open(loaded.url, '_blank', 'noopener')} className="hidden sm:flex" />
        )}
        <DarkButton icon="download" label="Download" onClick={() => onDownload(file)} />
      </header>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 sm:px-16 pb-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {loaded.status === 'loading' && <Spinner className="text-white" />}
        {loaded.status === 'error' && <Unavailable message={loaded.message} onDownload={() => onDownload(file)} />}
        {loaded.status === 'ready' && <Viewer key={file.key} kind={kind} url={loaded.url} text={loaded.text} name={file.name} onDownload={() => onDownload(file)} />}

        {hasPrev && <NavArrow side="left" onClick={prev} />}
        {hasNext && <NavArrow side="right" onClick={next} />}
      </div>

      {files.length > 1 && <div className="shrink-0 pb-3 text-center text-xs text-white/60 tabular-nums">{index + 1} / {files.length}</div>}
    </div>
  )
}

function Viewer({ kind, url, text, name, onDownload }: { kind: ReturnType<typeof previewKind>; url: string; text?: string; name: string; onDownload: () => void }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <Unavailable message="Your browser can’t play or display this file." onDownload={onDownload} />

  switch (kind) {
    case 'image':
    case 'svg':
      return <img src={url} alt={name} onError={() => setFailed(true)} className="max-w-full max-h-full object-contain rounded shadow-raised select-none anim-pop" draggable={false} />
    case 'video':
      return <video src={url} controls autoPlay playsInline onError={() => setFailed(true)} className="max-w-full max-h-full rounded bg-black shadow-raised" />
    case 'audio':
      return (
        <div className="w-full max-w-md rounded-2xl bg-white/10 p-6 flex flex-col items-center gap-5">
          <span className="icon text-[72px] text-white/80">music_note</span>
          <div className="text-sm text-white/80 truncate max-w-full">{name}</div>
          <audio src={url} controls autoPlay onError={() => setFailed(true)} className="w-full" />
        </div>
      )
    case 'pdf':
      return <iframe src={url} title={name} className="w-full max-w-5xl h-full rounded-lg bg-white shadow-raised" />
    case 'text':
      return (
        <pre className="w-full max-w-5xl h-full overflow-auto scroll-thin rounded-lg bg-white text-ink text-[13px] leading-relaxed p-5 font-mono whitespace-pre-wrap break-words shadow-raised">
          {text}
        </pre>
      )
    default:
      return <Unavailable message="There’s no preview for this type of file." onDownload={onDownload} />
  }
}

function Unavailable({ message, onDownload }: { message: string; onDownload: () => void }) {
  return (
    <div className="max-w-sm text-center rounded-2xl bg-white/10 px-8 py-10 anim-pop">
      <span className="icon text-[56px] text-white/70">visibility_off</span>
      <p className="mt-3 text-sm text-white/85 leading-relaxed">{message}</p>
      <button onClick={onDownload} className="mt-6 h-10 px-5 rounded-full bg-[#a8c7fa] text-[#062e6f] text-sm font-medium inline-flex items-center gap-2 hover:bg-[#c2e7ff]">
        <span className="icon text-[18px]">download</span>
        Download
      </button>
    </div>
  )
}

function NavArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous file' : 'Next file'}
      className={cx(
        'absolute top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center',
        side === 'left' ? 'left-2 sm:left-4' : 'right-2 sm:right-4',
      )}
    >
      <span className="icon text-[28px]">{side === 'left' ? 'chevron_left' : 'chevron_right'}</span>
    </button>
  )
}

function DarkButton({ icon, label, onClick, className, buttonRef }: { icon: string; label: string; onClick: () => void; className?: string; buttonRef?: Ref<HTMLButtonElement> }) {
  return (
    <button ref={buttonRef} onClick={onClick} aria-label={label} title={label} className={cx('w-10 h-10 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 shrink-0', className)}>
      <span className="icon">{icon}</span>
    </button>
  )
}
