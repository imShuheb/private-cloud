import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getMe, getConnections } from './api'
import type { User } from './types'
import LoginPage from './pages/LoginPage'
import DrivePage from './pages/DrivePage'
import ConnectionsPage from './pages/ConnectionsPage'

function App() {
  const [checking, setChecking] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [hasConnections, setHasConnections] = useState<boolean>(false)

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
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#f8f9fa] z-[100]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#1a73e8]/30 border-t-[#1a73e8] rounded-full animate-spin" />
          <span className="text-sm font-medium text-gray-600 animate-pulse">Initializing Private Storage…</span>
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
