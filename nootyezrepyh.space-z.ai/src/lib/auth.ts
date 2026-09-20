import { createHmac, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'

const SECRET = 'zeytoon-hyper-secret-1404'

export interface SessionUser {
  id: string
  name: string
  roles: string[]
  primaryRole: string
  color: string
  points: number
}

export function signToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString('base64url')
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyToken(token: string): string | null {
  try {
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return null
    const expected = createHmac('sha256', SECRET).update(payload).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    // token valid for 30 days
    if (Date.now() - data.ts > 30 * 24 * 3600 * 1000) return null
    return data.userId
  } catch {
    return null
  }
}

export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const userId = verifyToken(token)
  if (!userId) return null
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || !user.active) return null
  return {
    id: user.id,
    name: user.name,
    roles: JSON.parse(user.roles),
    primaryRole: user.primaryRole,
    color: user.color,
    points: user.points,
  }
}

export function unauthorized() {
  return Response.json({ error: 'دسترسی غیرمجاز - لطفاً وارد شوید' }, { status: 401 })
}

export async function requireUser(req: Request): Promise<SessionUser | null> {
  return getSessionUser(req)
}
