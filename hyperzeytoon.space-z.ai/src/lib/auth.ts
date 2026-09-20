import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { db } from './db'

const SECRET = process.env.AUTH_SECRET || 'hyper-zeytoon-secret-1404'

export function hashPin(pin: string): string {
  return createHash('sha256').update(`hz:${pin}`).digest('hex')
}

export function signSession(userId: string): string {
  const sig = createHmac('sha256', SECRET).update(userId).digest('hex').slice(0, 32)
  return `${userId}.${sig}`
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot < 1) return null
  const userId = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', SECRET).update(userId).digest('hex').slice(0, 32)
  try {
    if (timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return userId
  } catch {
    return null
  }
  return null
}

export interface SessionUser {
  id: string
  name: string
  username: string
  title: string
  gender: string
  color: string
  points: number
  roles: { key: string; name: string; isManager: boolean; color: string }[]
  isManager: boolean
  roleKeys: string[]
  isRoot: boolean // root administrator — ultimate authority (analytics, admin grants)
  prefs: string | null // JSON — UI personalization (theme, accent, density, sidebar order)
  locale: string // fa | en | ar | tr
}

export async function getSessionUser(cookieHeader: string | null | undefined): Promise<SessionUser | null> {
  if (!cookieHeader) return null
  const cookies = cookieHeader.split(';').map((c) => c.trim())
  const sessionCookie = cookies.find((c) => c.startsWith('hz_session='))
  if (!sessionCookie) return null
  const token = decodeURIComponent(sessionCookie.slice('hz_session='.length))
  const userId = verifySession(token)
  if (!userId) return null
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  })
  if (!user || !user.active) return null
  const roles = user.roles.map((ur) => ({
    key: ur.role.key,
    name: ur.role.name,
    isManager: ur.role.isManager,
    color: ur.role.color,
  }))
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    title: user.title,
    gender: user.gender,
    color: user.color,
    points: user.points,
    roles,
    isManager: roles.some((r) => r.isManager),
    roleKeys: roles.map((r) => r.key),
    isRoot: user.isRoot === true,
    prefs: user.prefs ?? null,
    locale: user.locale ?? 'fa',
  }
}

/** Role check helper — managers always pass */
export function hasRole(user: SessionUser | null, ...keys: string[]): boolean {
  if (!user) return false
  if (user.isManager) return true
  return keys.some((k) => user.roleKeys.includes(k))
}

export const MANAGER_KEYS = ['owner', 'gm', 'om', 'pm', 'accountant', 'it_admin']
