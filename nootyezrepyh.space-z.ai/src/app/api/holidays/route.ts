import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export async function GET() {
  const holidays = await db.holiday.findMany({ orderBy: { date: 'asc' } })
  return Response.json(holidays)
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const body = await req.json()
  const { date, title } = body
  if (!date || !title) return Response.json({ error: 'تاریخ و عنوان الزامی است' }, { status: 400 })
  const holiday = await db.holiday.upsert({ where: { date }, update: { title }, create: { date, title } })
  await logAudit(session.id, session.name, 'ADD_HOLIDAY', 'HOLIDAY', holiday.id, { date, title })
  return Response.json(holiday)
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'شناسه الزامی است' }, { status: 400 })
  await db.holiday.delete({ where: { id } })
  await logAudit(session.id, session.name, 'DELETE_HOLIDAY', 'HOLIDAY', id)
  return Response.json({ ok: true })
}
