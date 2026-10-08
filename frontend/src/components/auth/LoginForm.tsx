import { useState, type FormEvent } from 'react'
import Button from '../ui/Button'
import TextField from '../ui/TextField'

type Props = {
  username: string
  onUsernameChange: (v: string) => void
  password: string
  onPasswordChange: (v: string) => void
  loading: boolean
  error: string
  onSubmit: (e: FormEvent) => void
}

export default function LoginForm({ username, onUsernameChange, password, onPasswordChange, loading, error, onSubmit }: Props) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 md:pt-14" noValidate>
      <TextField
        label="Username"
        value={username}
        onChange={(e) => onUsernameChange(e.target.value)}
        autoComplete="username"
        autoFocus={!username}
        required
      />
      <div>
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete="current-password"
          autoFocus={!!username}
          required
        />
        <label className="flex items-center gap-3 mt-3 text-sm text-ink cursor-pointer w-fit">
          <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} className="w-4 h-4 accent-[var(--color-primary)]" />
          Show password
        </label>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 text-sm text-danger">
          <span className="icon text-[18px] mt-px">error</span>
          {error}
        </div>
      )}

      <div className="flex justify-end mt-4">
        <Button type="submit" loading={loading} className="px-6">
          Next
        </Button>
      </div>
    </form>
  )
}
