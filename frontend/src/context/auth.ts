import { createContext, useContext } from 'react'
import type { User } from '../types'

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signedOut'; user: null }
  | { status: 'signedIn'; user: User }

export type AuthContextValue = AuthState & {
  signIn: (user: User) => void
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** The signed-in user; only call below a route that requires sign-in. */
export function useUser(): User {
  const auth = useAuth()
  if (auth.status !== 'signedIn') throw new Error('useUser requires a signed-in user')
  return auth.user
}

export function permissionsOf(user: User) {
  const p = user.permissions
  const isOwner = user.role === 'owner'
  return {
    isOwner,
    canRead: !!p?.canReadFiles,
    canWrite: !!p?.canWriteFiles,
    canManageConnections: !!p?.canManageConnections,
    canManageSettings: !!p?.canManageSettings || isOwner,
  }
}

/** Where a user lands after sign-in: the drive if they can read files, otherwise what they manage. */
export function homePath(user: User): string {
  const p = permissionsOf(user)
  if (p.canRead) return '/drive'
  if (p.canManageConnections) return '/connections'
  if (p.canManageSettings) return '/settings'
  return '/drive'
}
