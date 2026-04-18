import React from 'react'

type ServerSettingsSectionProps = {
  sftpEnabled: boolean
  sftpAddr: string
  saving: boolean
  onSftpEnabledChange: (v: boolean) => void
  onSftpAddrChange: (v: string) => void
  onSave: () => void
}

const ServerSettingsSection: React.FC<ServerSettingsSectionProps> = ({
  sftpEnabled,
  sftpAddr,
  saving,
  onSftpEnabledChange,
  onSftpAddrChange,
  onSave,
}) => {
  return (
    <section className="p-3 sm:p-4 md:p-5 border border-gray-300 bg-white">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-black uppercase tracking-wide">Server Settings</h2>
          <p className="text-xs text-gray-700 mt-1">Control SFTP access directly from web settings.</p>
        </div>
        <span className="px-2 py-0.5 bg-black text-white text-[10px] font-bold uppercase tracking-wider border border-black">
          Uses App Users
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-center justify-between border border-gray-300 bg-white px-4 py-3 md:col-span-2">
          <div>
            <div className="text-sm font-semibold text-black">Enable SFTP</div>
            <div className="text-xs text-gray-700">Turn SFTP on or off. Login uses the same app users and permissions.</div>
          </div>
          <input
            type="checkbox"
            checked={sftpEnabled}
            onChange={(e) => onSftpEnabledChange(e.target.checked)}
            className="h-5 w-5"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-black uppercase tracking-wide">SFTP Bind Address</span>
          <input
            value={sftpAddr}
            onChange={(e) => onSftpAddrChange(e.target.value)}
            placeholder="0.0.0.0:2022"
            className="px-3 py-2 border border-gray-300 bg-white text-sm outline-none focus:border-black"
          />
        </label>

        <div className="md:col-span-2 p-3 border border-gray-300 bg-gray-50 text-xs text-gray-700">
          SFTP authentication uses your existing app users (owner/users). File access follows each user's read/write permissions and SFTP access permission.
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-bold text-white bg-black disabled:opacity-50 border border-black"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </section>
  )
}

export default ServerSettingsSection
