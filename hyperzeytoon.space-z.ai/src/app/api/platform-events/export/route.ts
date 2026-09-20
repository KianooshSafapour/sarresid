import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail } from '@/lib/server-utils'

const FORBIDDEN_MSG = 'دسترسی به تحلیل‌های سامانه تنها برای مدیر ارشد سامانه مجاز است'

const ACTION_FA: Record<string, string> = {
  POST: 'ایجاد',
  PATCH: 'ویرایش',
  PUT: 'بروزرسانی',
  DELETE: 'حذف',
  section_view: 'مشاهده بخش',
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

/** GET → CSV export (UTF-8 BOM, RTL-safe) — root administrator only. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (user.isRoot !== true) return fail(FORBIDDEN_MSG, 403)

  const url = new URL(req.url)
  const section = url.searchParams.get('section')
  const q = url.searchParams.get('q')
  const where: {
    section?: string
    OR?: { userName?: { contains: string }; section?: { contains: string }; action?: { contains: string }; detail?: { contains: string } }[]
  } = {}
  if (section) where.section = section
  if (q) {
    where.OR = [
      { userName: { contains: q } },
      { section: { contains: q } },
      { action: { contains: q } },
      { detail: { contains: q } },
    ]
  }

  const events = await db.platformEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10000,
  })

  const header = ['زمان', 'کاربر', 'بخش', 'عمل', 'جزئیات'].join(',')
  const lines = [header]
  for (const e of events) {
    lines.push(
      [
        csvCell(e.createdAt.toISOString()),
        csvCell(e.userName ?? ''),
        csvCell(e.section),
        csvCell(ACTION_FA[e.action] ?? e.action),
        csvCell(e.detail ?? ''),
      ].join(',')
    )
  }
  // UTF-8 BOM so Excel renders Persian correctly (RTL-safe)
  const csv = '\uFEFF' + lines.join('\r\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="platform-events-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
