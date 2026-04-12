import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getMe } from './api'
import type { User } from './types'
import LoginPage from './pages/LoginPage'
import DrivePage from './pages/DrivePage'

function App() {
  const [checking, setChecking] = useState(true)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    getMe()
      .then((me) => {
        if (me.authenticated && me.user) setUser(me.user)
      })
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#f8f9fa] z-[100]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#1a73e8]/30 border-t-[#1a73e8] rounded-full animate-spin" />
          <span className="text-sm font-medium text-gray-600 animate-pulse">Checking session…</span>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            user ? <Navigate to="/drive" replace /> : <LoginPage onLogin={setUser} />
          }
        />
        <Route
          path="/drive/*"
          element={
            user ? (
              <DrivePage
                user={user}
                onLogout={() => setUser(null)}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to={user ? '/drive' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
