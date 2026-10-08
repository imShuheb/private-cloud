import { useEffect, useState } from 'react'
import { errorMessage, getSettings, updateSettings } from '../../api'
import { useToast } from '../../context/toast'
import type { AppSettings } from '../../types'
import Card from '../analytics/Card'
import Button, { Spinner } from '../ui/Button'
import Switch from '../ui/Switch'
import TextField from '../ui/TextField'

export default function ServerSettingsSection() {
  const toast = useToast()
  const [saved, setSaved] = useState<AppSettings | null>(null)
  const [form, setForm] = useState<AppSettings>({ sftpEnabled: false, sftpAddr: '0.0.0.0:2022' })
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    getSettings()
      .then((s) => {
        if (cancelled) return
        const value = { sftpEnabled: s.sftpEnabled, sftpAddr: s.sftpAddr || '0.0.0.0:2022' }
        setSaved(value)
        setForm(value)
      })
      .catch((err) => !cancelled && setLoadError(errorMessage(err, 'Could not load settings')))
    return () => {
      cancelled = true
    }
  }, [])

  const dirty = !!saved && (saved.sftpEnabled !== form.sftpEnabled || saved.sftpAddr !== form.sftpAddr)

  async function save() {
    setSaving(true)
    try {
      const next = await updateSettings(form)
      const value = { sftpEnabled: next.sftpEnabled, sftpAddr: next.sftpAddr }
      setSaved(value)
      setForm(value)
      toast.show('Settings saved and applied', { tone: 'success' })
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save settings'))
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <p className="text-sm text-danger">{loadError}</p>
  if (!saved) {
    return (
      <div className="flex justify-center py-10 text-primary">
        <Spinner />
      </div>
    )
  }

  return (
    <Card title="SFTP access" subtitle="Connect from file managers and phones; it uses the same users and permissions as the web app">
      <div className="max-w-xl">
        <Switch
          checked={form.sftpEnabled}
          onChange={(v) => setForm((f) => ({ ...f, sftpEnabled: v }))}
          label="Enable SFTP server"
          description="Users need the “SFTP login” permission"
        />
        <TextField
          label="Listen address"
          value={form.sftpAddr}
          onChange={(e) => setForm((f) => ({ ...f, sftpAddr: e.target.value }))}
          hint="host:port, for example 0.0.0.0:2022"
          mono
          className="mt-2"
        />
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="text" disabled={!dirty || saving} onClick={() => setForm(saved)}>
            Discard
          </Button>
          <Button onClick={save} loading={saving} disabled={!dirty}>
            Save
          </Button>
        </div>
      </div>
    </Card>
  )
}
