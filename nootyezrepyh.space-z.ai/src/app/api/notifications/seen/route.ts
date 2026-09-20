import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'

/**
 * Server-side notification seen-state (per user).
 * Stored on User.notifSeen as JSON {notificationId: count} — persists across devices.
 * GET  → { map }       POST { map } → merge & save
 */

async function readMap(userId: string): Promise<Record<string, number>> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { notifSeen: true } })
  try {
    return u ? JSON.parse(u.notifSeen || '{}') : {}
  } catch {
    return {}
  }
}

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  return Response.json({ map: await readMap(session.id) })
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const body = (await req.json().catch(() => null)) as { map?: Record<string, number> } | null
  if (!body?.map || typeof body.map !== 'object') {
    return Response.json({ error: 'داده نامعتبر است' }, { status: 400 })
  }
  // sanitize: only numeric finite counts (-1 = seen-sentinel for count-less items), cap size
  const clean: Record<string, number> = {}
  for (const [k, v] of Object.entries(body.map).slice(0, 50)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= -1 && /^[a-z0-9-]{1,40}$/i.test(k)) {
      clean[k] = Math.round(v)
    }
  }
  await db.user.update({ where: { id: session.id }, data: { notifSeen: JSON.stringify(clean) } })
  return Response.json({ ok: true, map: clean })
}
