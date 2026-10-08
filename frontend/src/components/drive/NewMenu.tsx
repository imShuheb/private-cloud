import { useCallback, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useDismiss } from '../../hooks/useDismiss'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import TextField from '../ui/TextField'

type Props = {
  open: boolean
  onClose: () => void
  onCreateFolder: (name: string) => Promise<void>
  onFiles: (files: File[]) => void
}

/** The "New" popover: new folder, file upload, folder upload. */
export default function NewMenu({ open, onClose, onCreateFolder, onFiles }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const [folderDialog, setFolderDialog] = useState(false)
  const close = useCallback(() => onClose(), [onClose])
  useDismiss(ref, open, close)

  function pick(input: HTMLInputElement | null) {
    input?.click()
    onClose()
  }

  function takeFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    onFiles(files)
  }

  return (
    <>
      <input ref={fileInput} type="file" multiple hidden onChange={takeFiles} />
      <input
        ref={folderInput}
        type="file"
        hidden
        onChange={takeFiles}
        // Non-standard attributes for picking a whole folder
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
      />

      {open && (
        <>
        <div className="lg:hidden fixed inset-0 z-[125] bg-black/30 anim-fade" aria-hidden />
        <div
          ref={ref}
          role="menu"
          className="fixed z-[130] bg-surface shadow-menu py-2 inset-x-0 bottom-0 rounded-t-[28px] pb-6 anim-slide-up lg:anim-pop lg:inset-x-auto lg:bottom-auto lg:left-4 lg:top-[88px] lg:w-[280px] lg:rounded-lg lg:pb-2 lg:origin-top-left"
        >
          <div className="lg:hidden mx-auto mt-1 mb-3 w-8 h-1 rounded-full bg-line" />
          <MenuButton icon="create_new_folder" label="New folder" onClick={() => { onClose(); setFolderDialog(true) }} />
          <div className="my-2 border-t border-line-soft" />
          <MenuButton icon="upload_file" label="File upload" onClick={() => pick(fileInput.current)} />
          <MenuButton icon="drive_folder_upload" label="Folder upload" onClick={() => pick(folderInput.current)} />
        </div>
        </>
      )}

      <NewFolderDialog open={folderDialog} onClose={() => setFolderDialog(false)} onCreate={onCreateFolder} />
    </>
  )
}

function MenuButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button role="menuitem" onClick={onClick} className="w-full flex items-center gap-4 h-12 px-4 text-sm text-ink hover:bg-hover">
      <span className="icon text-ink-2">{icon}</span>
      {label}
    </button>
  )
}

function NewFolderDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('Untitled folder')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const cleaned = name.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!cleaned) {
      setError('Enter a folder name')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onCreate(cleaned)
      setName('Untitled folder')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the folder')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New folder" width="sm">
      <form onSubmit={submit} className="pb-6">
        <TextField
          label="Folder name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.target.select()}
          hint={error || 'Use “/” to create nested folders, e.g. photos/2026'}
          aria-invalid={!!error}
        />
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="text" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="text" loading={busy} disabled={!cleaned}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  )
}
