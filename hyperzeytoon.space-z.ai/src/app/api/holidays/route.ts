import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireManager, fail, ok, logActivity, setSetting } from '@/lib/server-utils'
import { isoDay, addDays, toJalali, pad2 } from '@/lib/jalali'
import { fixedHolidaysForYear } from '@/lib/holidays-data'

// list holidays within a window (default: today..+120d)
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const from = url.searchParams.get('from') || isoDay(new Date())
  const to = url.searchParams.get('to') || isoDay(addDays(new Date(), 180))
  const list = await db.holiday.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: 'asc' },
  })
  return ok(list)
}

// add / update a holiday manually
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.isManager) return fail('دسترسی غیرمجاز', 403)
  const body = (await req.json()) as { date: string; name: string }
  if (!body.date || !body.name) return fail('تاریخ و نام لازم است')
  await db.holiday.upsert({
    where: { date: body.date },
    create: { date: body.date, name: body.name, source: 'MANUAL' },
    update: { name: body.name, source: 'MANUAL' },
  })
  await logActivity(user.id, user.name, 'ثبت روز تعطیل', 'Holiday', body.date, body.name)
  return ok({ success: true })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.isManager) return fail('دسترسی غیرمجاز', 403)
  const date = new URL(req.url).searchParams.get('date')
  if (!date) return fail('تاریخ لازم است')
  await db.holiday.deleteMany({ where: { date } })
  await logActivity(user.id, user.name, 'حذف روز تعطیل', 'Holiday', date)
  return ok({ success: true })
}

// sync endpoint: attempts to refresh fixed-holiday dataset from curated source for current + next Jalali year.
export async function PUT(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.isManager) return fail('دسترسی غیرمجاز', 403)
  const jy = toJalali(new Date()).jy
  let added = 0
  for (const year of [jy, jy + 1]) {
    for (const h of fixedHolidaysForYear(year)) {
      const existing = await db.holiday.findUnique({ where: { date: h.iso } })
      if (!existing) {
        await db.holiday.create({ data: { date: h.iso, name: h.name, source: 'TIME_IR' } })
        added++
      }
    }
  }
  await setSetting('holidays_last_sync', new Date().toISOString())
  await logActivity(user.id, user.name, 'همگام‌سازی تعطیلات', 'Holiday', undefined, `${added} روز اضافه شد`)
  return ok({ success: true, added })
}
