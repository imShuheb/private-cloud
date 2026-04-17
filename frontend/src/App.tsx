import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getMe, getConnections } from './api'
import type { User } from './types'
import LoginPage from './pages/LoginPage'
import DrivePage from './pages/DrivePage'
import ConnectionsPage from './pages/ConnectionsPage'

const APP_TITLE = 'Private Storage'
const APP_DESCRIPTION = 'Secure personal cloud drive with web, preview, and direct download support.'

function App() {
  const [checking, setChecking] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [hasConnections, setHasConnections] = useState<boolean>(false)

  useEffect(() => {
    document.title = APP_TITLE

    let descriptionTag = document.querySelector('meta[name="description"]')
    if (!descriptionTag) {
      descriptionTag = document.createElement('meta')
      descriptionTag.setAttribute('name', 'description')
      document.head.appendChild(descriptionTag)
    }
    descriptionTag.setAttribute('content', APP_DESCRIPTION)
  }, [])

  useEffect(() => {
    async function init() {
      try {
        const me = await getMe()
        if (me.authenticated && me.user) {
          setUser(me.user)
          const conns = await getConnections()
          setHasConnections(conns.connections.length > 0)
        }
      } catch (err) {
        console.error('Initial check failed:', err)
      } finally {
        setChecking(false)
      }
    }
    init()
  }, [])

  if (checking) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-[100]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-black border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-black uppercase tracking-wider">Loading workspace</span>
        </div>
      </div>
    )
  }

  const refreshConnections = async () => {
    try {
      const conns = await getConnections()
      setHasConnections(conns.connections.length > 0)
    } catch (e) {
      setHasConnections(false)
    }
  }

  const handleLogin = async (u: User) => {
    setUser(u)
    refreshConnections()
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            user ? <Navigate to={hasConnections ? "/drive" : "/connections"} replace /> : <LoginPage onLogin={handleLogin} />
          }
        />
        <Route
          path="/drive/*"
          element={
            user ? (
              hasConnections ? (
                <DrivePage user={user} onLogout={() => setUser(null)} />
              ) : (
                <Navigate to="/connections" replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/connections"
          element={
            user ? (
              <ConnectionsPage user={user} onLogout={() => setUser(null)} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to={user ? (hasConnections ? "/drive" : "/connections") : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
