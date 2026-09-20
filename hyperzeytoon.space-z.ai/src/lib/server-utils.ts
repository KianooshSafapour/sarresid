import { NextResponse } from 'next/server'
import { db } from './db'
import { getSessionUser, type SessionUser } from './auth'

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as object, init)
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function requireUser(req: Request): Promise<SessionUser | null> {
  return getSessionUser(req.headers.get('cookie'))
}

export async function requireManager(req: Request): Promise<SessionUser | null> {
  const user = await requireUser(req)
  return user?.isManager ? user : null
}

export async function logActivity(
  userId: string | null | undefined,
  userName: string,
  action: string,
  entity?: string,
  entityId?: string,
  detail?: string
) {
  try {
    await db.activityLog.create({
      data: { userId: userId ?? null, userName, action, entity, entityId, detail },
    })
  } catch (e) {
    console.error('logActivity failed', e)
  }
}

export async function notify(
  userId: string,
  title: string,
  body?: string,
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' = 'INFO',
  link?: string
) {
  try {
    await db.notification.create({ data: { userId, title, body, type, link } })
  } catch (e) {
    console.error('notify failed', e)
  }
}

/** notify every user holding any of the role keys */
export async function notifyRoles(
  roleKeys: string[],
  title: string,
  body?: string,
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' = 'INFO',
  link?: string,
  excludeUserId?: string
) {
  try {
    const users = await db.user.findMany({
      where: { active: true, roles: { some: { role: { key: { in: roleKeys } } } } },
      select: { id: true },
    })
    await db.notification.createMany({
      data: users
        .filter((u) => u.id !== excludeUserId)
        .map((u) => ({ userId: u.id, title, body, type, link })),
    })
  } catch (e) {
    console.error('notifyRoles failed', e)
  }
}

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const s = await db.settings.findUnique({ where: { key } })
  return s?.value ?? fallback
}

export async function setSetting(key: string, value: string) {
  await db.settings.upsert({ where: { key }, create: { key, value }, update: { value } })
}
