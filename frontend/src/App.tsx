import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Spinner } from './components/ui/Button'
import { homePath, permissionsOf, useAuth } from './context/auth'
import AuthProvider from './context/AuthProvider'
import ToastProvider from './context/ToastProvider'
import ConnectionsPage from './pages/ConnectionsPage'
import DrivePage from './pages/DrivePage'
import LoginPage from './pages/LoginPage'
import SettingsPage from './pages/SettingsPage'
import StoragePage from './pages/StoragePage'

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  )
}

function AppRoutes() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-primary bg-app">
        <span className="icon filled text-[56px]">cloud</span>
        <Spinner />
      </div>
    )
  }

  const user = auth.status === 'signedIn' ? auth.user : null
  const perms = user ? permissionsOf(user) : null

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homePath(user)} replace /> : <LoginPage />} />
      <Route path="/drive/*" element={<RequireUser>{<DrivePage />}</RequireUser>} />
      <Route path="/storage" element={<RequireUser>{<StoragePage />}</RequireUser>} />
      <Route
        path="/connections"
        element={<RequireUser allowed={!!perms?.canManageConnections}>{<ConnectionsPage />}</RequireUser>}
      />
      <Route path="/settings" element={<RequireUser allowed={!!perms?.canManageSettings}>{<SettingsPage />}</RequireUser>} />
      <Route path="*" element={<Navigate to={user ? homePath(user) : '/login'} replace />} />
    </Routes>
  )
}

function RequireUser({ children, allowed = true }: { children: ReactNode; allowed?: boolean }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status !== 'signedIn') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (!allowed) return <Navigate to={homePath(auth.user)} replace />
  return <>{children}</>
}
