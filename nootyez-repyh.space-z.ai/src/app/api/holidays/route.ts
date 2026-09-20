import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function audit(
  userId: number | null | undefined,
  action: string,
  entity: string,
  entityId: number | null,
  detail?: string
) {
  let userName = 'سیستم'
  if (userId) {
    const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
    if (u) userName = u.name
  }
  await db.auditLog.create({
    data: { userId: userId ?? 0, userName, action, entity, entityId, detail: detail ?? null },
  })
}

// GET /api/holidays → {holidays} sorted by date asc (past + future, all rows)
export async function GET() {
  try {
    const holidays = await db.holiday.findMany({ orderBy: { date: 'asc' } })
    return NextResponse.json({ holidays })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/holidays {date (yyyy-mm-dd), title, userId?} → upsert by date
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const date = String(b?.date ?? '').trim()
    const title = String(b?.title ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return NextResponse.json({ error: 'تاریخ باید با فرمت yyyy-mm-dd باشد' }, { status: 400 })
    if (!title) return NextResponse.json({ error: 'عنوان تعطیلی الزامی است' }, { status: 400 })
    const userId = b?.userId ? Number(b.userId) : null

    const holiday = await db.holiday.upsert({
      where: { date },
      create: { date, title, source: 'MANUAL' },
      update: { title, source: 'MANUAL' },
    })
    await audit(userId, 'HOLIDAY_ADD', 'Holiday', holiday.id, `${date} — ${title}`)
    return NextResponse.json({ holiday })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// DELETE /api/holidays?date=yyyy-mm-dd&userId=
export async function DELETE(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const date = sp.get('date')
    if (!date) return NextResponse.json({ error: 'پارامتر date الزامی است' }, { status: 400 })
    const userId = sp.get('userId') ? Number(sp.get('userId')) : null
    const existing = await db.holiday.findUnique({ where: { date } })
    if (!existing) return NextResponse.json({ error: 'تعطیلی برای این تاریخ یافت نشد' }, { status: 400 })
    await db.holiday.delete({ where: { date } })
    await audit(userId, 'HOLIDAY_DELETE', 'Holiday', existing.id, `${existing.date} — ${existing.title}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
