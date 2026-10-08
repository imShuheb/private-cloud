import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getMe, logout, setUnauthorizedHandler } from '../api'
import type { User } from '../types'
import { AuthContext, type AuthState } from './auth'
import { useToast } from './toast'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null })
  const toast = useToast()

  const refresh = useCallback(async () => {
    try {
      const me = await getMe()
      setState(me.authenticated && me.user ? { status: 'signedIn', user: me.user } : { status: 'signedOut', user: null })
    } catch {
      setState({ status: 'signedOut', user: null })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const statusRef = useRef(state.status)
  useEffect(() => {
    statusRef.current = state.status
  }, [state.status])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (statusRef.current === 'signedIn') toast.show('Your session ended. Please sign in again.')
      statusRef.current = 'signedOut'
      setState({ status: 'signedOut', user: null })
    })
    return () => setUnauthorizedHandler(null)
  }, [toast])

  const signIn = useCallback((user: User) => setState({ status: 'signedIn', user }), [])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } finally {
      setState({ status: 'signedOut', user: null })
    }
  }, [])

  const value = useMemo(() => ({ ...state, signIn, signOut, refresh }), [state, signIn, signOut, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
