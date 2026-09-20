import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok } from '@/lib/server-utils'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const notifs = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 40,
  })
  return ok(notifs)
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean }
  if (body.all) {
    await db.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } })
  } else if (body.id) {
    await db.notification.updateMany({ where: { id: body.id, userId: user.id }, data: { read: true } })
  }
  return ok({ success: true })
}
