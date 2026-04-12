import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api'
import type { User } from '../types'
import LoginCard from '../components/auth/LoginCard'
import LoginForm from '../components/auth/LoginForm'

type Props = {
  onLogin: (u: User) => void
}

export default function LoginPage({ onLogin }: Props) {
  const navigate = useNavigate()
  const [username, setUsername] = useState(localStorage.getItem('ps_username') || '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError('Username and password are required')
      return
    }

    setLoading(true)
    try {
      localStorage.setItem('ps_username', username.trim())
      const user = await login(username.trim(), password)
      onLogin(user)
      navigate('/drive')
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <LoginCard>
      <LoginForm
        username={username}
        onUsernameChange={setUsername}
        password={password}
        onPasswordChange={setPassword}
        loading={loading}
        error={error}
        onSubmit={submit}
      />
    </LoginCard>
  )
}
