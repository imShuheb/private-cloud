import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { errorMessage, login } from '../api'
import LoginCard from '../components/auth/LoginCard'
import LoginForm from '../components/auth/LoginForm'
import { homePath, useAuth } from '../context/auth'

function rememberedUsername(): string {
  try {
    return localStorage.getItem('ps_username') ?? ''
  } catch {
    return ''
  }
}

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState(rememberedUsername)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Enter your username and password')
      return
    }

    setError('')
    setLoading(true)
    try {
      const user = await login(username.trim(), password)
      try {
        localStorage.setItem('ps_username', username.trim())
      } catch {
        // Not remembering the username is fine
      }
      signIn(user)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : homePath(user), { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Sign-in failed'))
      setPassword('')
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
