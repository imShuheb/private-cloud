import { useState, type FormEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../../lib'
import { Spinner } from '../ui/Button'

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
  const [capsLock, setCapsLock] = useState(false)
  const canSubmit = username.trim().length > 0 && password.length > 0 && !loading

  const trackCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState('CapsLock'))

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field
        icon="person"
        label="Username"
        value={username}
        onChange={(e) => onUsernameChange(e.target.value)}
        autoComplete="username"
        autoFocus={!username}
        invalid={!!error}
      />
      <Field
        icon="lock"
        label="Password"
        type={showPassword ? 'text' : 'password'}
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        onKeyDown={trackCaps}
        onKeyUp={trackCaps}
        onBlur={() => setCapsLock(false)}
        autoComplete="current-password"
        autoFocus={!!username}
        invalid={!!error}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
            className="w-10 h-10 rounded-full flex items-center justify-center text-ink-2 hover:bg-hover"
          >
            <span className="icon">{showPassword ? 'visibility_off' : 'visibility'}</span>
          </button>
        }
      />

      {capsLock && (
        <p className="flex items-center gap-2 text-xs text-ink-2 -mt-1">
          <span className="icon text-[16px]">keyboard_capslock</span>
          Caps Lock is on
        </p>
      )}

      {error && (
        <div role="alert" key={error} className="flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger animate-[shake_300ms_ease-in-out]">
          <span className="icon text-[18px] mt-px">error</span>
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-2 h-12 rounded-full bg-primary text-white font-display font-medium text-[15px] inline-flex items-center justify-center gap-2 transition-[background-color,box-shadow] hover:bg-primary-hover hover:shadow-card disabled:opacity-50 disabled:pointer-events-none"
      >
        {loading && <Spinner small />}
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { icon: string; label: string; trailing?: ReactNode; invalid?: boolean }

function Field({ icon, label, trailing, invalid, id, ...rest }: FieldProps) {
  const inputId = id ?? `login-${label.toLowerCase()}`
  return (
    <div>
      <label htmlFor={inputId} className="block text-xs font-medium text-ink-2 mb-1.5 ml-1">
        {label}
      </label>
      <div
        className={cx(
          'flex items-center h-12 rounded-xl border bg-surface transition-[border-color,box-shadow] focus-within:border-primary focus-within:shadow-[inset_0_0_0_1px_var(--color-primary)]',
          invalid ? 'border-danger' : 'border-[#747775]',
        )}
      >
        <span className="icon text-ink-2 ml-3.5">{icon}</span>
        <input id={inputId} className="flex-1 min-w-0 h-full bg-transparent px-3 text-[15px] text-ink outline-none" aria-invalid={invalid} {...rest} />
        {trailing && <span className="mr-1">{trailing}</span>}
      </div>
    </div>
  )
}
