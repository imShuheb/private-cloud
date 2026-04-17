import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getMe, getConnections } from './api'
import type { User } from './types'
import LoginPage from './pages/LoginPage'
import DrivePage from './pages/DrivePage'
import SettingsPage from './pages/SettingsPage'
import HealthPage from './pages/HealthPage'

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
          setHasConnections((conns?.connections?.length || 0) > 0)
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
      setHasConnections((conns?.connections?.length || 0) > 0)
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
            user ? <Navigate to={hasConnections ? "/drive" : "/settings"} replace /> : <LoginPage onLogin={handleLogin} />
          }
        />
        <Route
          path="/drive/*"
          element={
            user ? (
              hasConnections ? (
                <DrivePage user={user} onLogout={() => setUser(null)} />
              ) : (
                <Navigate to="/settings" replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/health"
          element={
            user ? (
              hasConnections ? (
                <HealthPage user={user} onLogout={() => setUser(null)} />
              ) : (
                <Navigate to="/settings" replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/settings"
          element={
            user ? (
              <SettingsPage user={user} onLogout={() => setUser(null)} onConnectionsChange={refreshConnections} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to={user ? (hasConnections ? "/drive" : "/settings") : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
