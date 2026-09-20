import { NextResponse } from 'next/server'
import { db, ensurePrismaModel } from '@/lib/db'
import { toFaDigits, isoToJalali } from '@/lib/jalali'
import { hasRole, type PUser } from '@/lib/types'
import {
  PILOT_SIZES, PILOT_STATUSES, PILOT_SIZE_LABELS_FA, PILOT_STATUS_LABELS_FA,
  pilotModuleFa,
} from '@/lib/pilot-modules'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Field Pilot Program «آزمون میدانی» (Task 13-a) — external tester companies.
 *
 * GET  /api/pilot?userId=            → { testers[], modules[], summary{} }
 *      (manager gate: OWNER|GENERAL_MANAGER|OPERATION_MANAGER|IT_ADMIN|PRODUCT_MANAGER)
 * GET  /api/pilot?export=csv&userId= → text/csv (UTF-8 BOM) of every feedback row
 * POST /api/pilot {userId, companyName, contactName, phone?, city?, sizeKey, notes?}
 *      → creates a tester with a unique invite code «HZP-XXXX» + PILOT_TESTER_ADDED audit
 * PATCH /api/pilot {userId, id, status?, notes?} → status/notes update + PILOT_TESTER_UPDATED audit
 */

/** unambiguous invite-code alphabet (no 0/O/1/I/L) */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/** roles allowed to manage the pilot program */
function canManagePilot(u: { roles: string } | null | undefined): boolean {
  if (!u) return false
  const pseudo = { roles: u.roles } as PUser
  return (
    hasRole(pseudo, 'OWNER') || hasRole(pseudo, 'GENERAL_MANAGER') ||
    hasRole(pseudo, 'OPERATION_MANAGER') || hasRole(pseudo, 'IT_ADMIN') ||
    hasRole(pseudo, 'PRODUCT_MANAGER')
  )
}

/** «HZP-» + 4 unambiguous chars, retried until unique */
async function generateInviteCode(conn: ReturnType<typeof ensurePrismaModel>): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const buf = new Uint32Array(4)
    crypto.getRandomValues(buf)
    const code = 'HZP-' + Array.from(buf, (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('')
    const clash = await conn.pilotTester.findUnique({ where: { inviteCode: code }, select: { id: true } })
    if (!clash) return code
  }
  // 32^4 ≈ 1M combinations — practically unreachable; still, fail loudly
  throw new Error('تولید کد دعوت یکتا ممکن نشد')
}

type TesterRow = {
  id: number; companyName: string; contactName: string; phone: string | null; city: string | null
  sizeKey: string; inviteCode: string; status: string; notes: string | null
  createdAt: Date
  feedback: { id: number; moduleKey: string; rating: number; timeSavedMin: number | null; comment: string | null; createdAt: Date }[]
}

function serializeTester(t: TesterRow) {
  const count = t.feedback.length
  const totalTimeSavedMin = t.feedback.reduce((s, f) => s + (f.timeSavedMin ?? 0), 0)
  const avgRating = count > 0 ? Math.round((t.feedback.reduce((s, f) => s + f.rating, 0) / count) * 100) / 100 : null
  return {
    id: t.id,
    companyName: t.companyName,
    contactName: t.contactName,
    phone: t.phone,
    city: t.city,
    sizeKey: t.sizeKey,
    inviteCode: t.inviteCode,
    status: t.status,
    notes: t.notes,
    createdAt: t.createdAt.toISOString(),
    feedback: t.feedback
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((f) => ({
        id: f.id,
        moduleKey: f.moduleKey,
        rating: f.rating,
        timeSavedMin: f.timeSavedMin,
        comment: f.comment,
        createdAt: f.createdAt.toISOString(),
      })),
    _feedbackCount: count,
    _avgRating: avgRating,
    _totalTimeSavedMin: totalTimeSavedMin,
  }
}

/* ---------- CSV helpers ---------- */

function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? '')
  return `"${s.replace(/"/g, '""')}"`
}

function csvResponse(rows: string[][], filename: string): Response {
  // UTF-8 BOM so Excel opens Persian text correctly
  const body = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename=${filename}`,
      'Cache-Control': 'no-store',
    },
  })
}

async function exportCsv(conn: ReturnType<typeof ensurePrismaModel>, actor: { id: number; name: string }) {
  const testers = await conn.pilotTester.findMany({
    include: { feedback: { orderBy: { createdAt: 'desc' } } },
    orderBy: { id: 'desc' },
  })

  const header = ['آزمونگر', 'شرکت', 'اندازه', 'ماژول', 'امتیاز', 'دقیقه صرفه‌جویی در هفته', 'نظر', 'تاریخ ثبت']
  const rows: string[][] = [
    ['هایپر زیتون — بازخورد آزمون میدانی | Hyper Zeytoon Field Pilot Feedback'],
    [],
    header,
  ]

  let totalSaved = 0
  let ratingSum = 0
  let ratingCount = 0
  for (const t of testers) {
    for (const f of t.feedback) {
      totalSaved += f.timeSavedMin ?? 0
      ratingSum += f.rating
      ratingCount += 1
      const j = isoToJalali(f.createdAt)
      rows.push([
        t.contactName,
        t.companyName,
        PILOT_SIZE_LABELS_FA[t.sizeKey] ?? t.sizeKey,
        pilotModuleFa(f.moduleKey),
        toFaDigits(f.rating),
        f.timeSavedMin !== null ? toFaDigits(f.timeSavedMin) : '',
        f.comment ?? '',
        toFaDigits(`${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`),
      ])
    }
  }

  rows.push([])
  rows.push([
    'جمع', `${toFaDigits(testers.length)} شرکت`, '', `${toFaDigits(ratingCount)} بازخورد`,
    ratingCount ? toFaDigits(Math.round((ratingSum / ratingCount) * 100) / 100) : '—',
    toFaDigits(totalSaved), '', '',
  ])

  const jNow = isoToJalali(new Date())
  const filename = `pilot-feedback-${jNow.jy}-${jNow.jm}.csv`

  await conn.auditLog.create({
    data: {
      userId: actor.id,
      userName: actor.name,
      action: 'PILOT_FEEDBACK_EXPORT',
      entity: 'PilotFeedback',
      entityId: null,
      detail: `خروجی CSV بازخوردهای میدانی — ${toFaDigits(ratingCount)} ردیف از ${toFaDigits(testers.length)} آزمونگر`,
    },
  })

  return csvResponse(rows, filename)
}

/* ================= GET ================= */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = Number(searchParams.get('userId') ?? 0)
    if (!userId) return NextResponse.json({ error: 'پارامتر userId الزامی است | userId is required' }, { status: 400 })

    const conn = ensurePrismaModel('pilotTester')
    const actor = await conn.user.findUnique({ where: { id: userId } })
    if (!canManagePilot(actor)) {
      return NextResponse.json({ error: 'دسترسی مجاز نیست | Forbidden' }, { status: 403 })
    }

    if ((searchParams.get('export') ?? '').toLowerCase() === 'csv') {
      return await exportCsv(conn, { id: userId, name: actor?.name ?? 'سیستم' })
    }

    const rows = (await conn.pilotTester.findMany({
      include: { feedback: true },
      orderBy: { id: 'desc' },
    })) as unknown as TesterRow[]

    const testers = rows.map(serializeTester)

    // module leaderboard — only modules that received at least one rating
    const byModule = new Map<string, { count: number; ratingSum: number; saved: number }>()
    for (const t of rows) {
      for (const f of t.feedback) {
        const cur = byModule.get(f.moduleKey) ?? { count: 0, ratingSum: 0, saved: 0 }
        cur.count += 1
        cur.ratingSum += f.rating
        cur.saved += f.timeSavedMin ?? 0
        byModule.set(f.moduleKey, cur)
      }
    }
    const modules = Array.from(byModule.entries())
      .map(([moduleKey, v]) => ({
        moduleKey,
        count: v.count,
        avgRating: Math.round((v.ratingSum / v.count) * 100) / 100,
        totalTimeSavedMin: v.saved,
      }))
      .sort((a, b) => b.count - a.count || b.totalTimeSavedMin - a.totalTimeSavedMin || a.moduleKey.localeCompare(b.moduleKey))

    const feedbackCount = testers.reduce((s, t) => s + t._feedbackCount, 0)
    const totalTimeSavedMin = testers.reduce((s, t) => s + t._totalTimeSavedMin, 0)
    const ratedCount = testers.reduce((s, t) => s + t.feedback.length, 0)
    const ratingSum = testers.reduce((s, t) => s + t.feedback.reduce((x, f) => x + f.rating, 0), 0)

    const summary = {
      testers: testers.length,
      invited: testers.filter((t) => t.status === 'INVITED').length,
      active: testers.filter((t) => t.status === 'ACTIVE').length,
      completed: testers.filter((t) => t.status === 'COMPLETED').length,
      feedbackCount,
      avgRating: ratedCount > 0 ? Math.round((ratingSum / ratedCount) * 100) / 100 : null,
      totalTimeSavedMin,
    }

    return NextResponse.json({ testers, modules, summary })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'خطا در دریافت داده‌های آزمون میدانی' },
      { status: 500 },
    )
  }
}

/* ================= POST — add tester ================= */

export async function POST(request: Request) {
  try {
    const conn = ensurePrismaModel('pilotTester')
    const body = await request.json().catch(() => null)
    const userId = Number(body?.userId ?? 0)
    if (!userId) return NextResponse.json({ error: 'پارامتر userId الزامی است | userId is required' }, { status: 400 })

    const actor = await conn.user.findUnique({ where: { id: userId } })
    if (!canManagePilot(actor)) {
      return NextResponse.json({ error: 'دسترسی مجاز نیست | Forbidden' }, { status: 403 })
    }

    const companyName = String(body?.companyName ?? '').trim()
    const contactName = String(body?.contactName ?? '').trim()
    if (!companyName || !contactName) {
      return NextResponse.json(
        { error: 'نام شرکت و نام رابط الزامی است | companyName and contactName are required' },
        { status: 400 },
      )
    }

    const sizeKey = String(body?.sizeKey ?? 'MID').trim().toUpperCase()
    if (!(PILOT_SIZES as readonly string[]).includes(sizeKey)) {
      return NextResponse.json(
        { error: 'اندازه شرکت معتبر نیست — یکی از BOUTIQUE / MID / LARGE را انتخاب کنید | Invalid sizeKey' },
        { status: 400 },
      )
    }

    const phone = String(body?.phone ?? '').trim() || null
    const city = String(body?.city ?? '').trim() || null
    const notes = String(body?.notes ?? '').trim() || null

    const inviteCode = await generateInviteCode(conn)
    const tester = await conn.pilotTester.create({
      data: { companyName, contactName, phone, city, sizeKey, inviteCode, notes, createdById: userId },
      include: { feedback: true },
    })

    await conn.auditLog.create({
      data: {
        userId,
        userName: actor?.name ?? 'سیستم',
        action: 'PILOT_TESTER_ADDED',
        entity: 'PilotTester',
        entityId: tester.id,
        detail: `افزودن آزمونگر میدانی — ${companyName} — کد دعوت ${inviteCode}`,
      },
    })

    return NextResponse.json({ tester: serializeTester(tester as unknown as TesterRow) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'خطا در افزودن آزمونگر' },
      { status: 500 },
    )
  }
}

/* ================= PATCH — status / notes ================= */

export async function PATCH(request: Request) {
  try {
    const conn = ensurePrismaModel('pilotTester')
    const body = await request.json().catch(() => null)
    const userId = Number(body?.userId ?? 0)
    if (!userId) return NextResponse.json({ error: 'پارامتر userId الزامی است | userId is required' }, { status: 400 })

    const actor = await conn.user.findUnique({ where: { id: userId } })
    if (!canManagePilot(actor)) {
      return NextResponse.json({ error: 'دسترسی مجاز نیست | Forbidden' }, { status: 403 })
    }

    const id = Number(body?.id ?? 0)
    if (!id) return NextResponse.json({ error: 'شناسه آزمونگر الزامی است | id is required' }, { status: 400 })

    const tester = await conn.pilotTester.findUnique({ where: { id }, include: { feedback: true } })
    if (!tester) {
      return NextResponse.json({ error: 'آزمونگر یافت نشد | Tester not found' }, { status: 404 })
    }

    const data: { status?: string; notes?: string | null } = {}
    const statusRaw = body?.status !== undefined && body?.status !== null ? String(body.status).trim().toUpperCase() : null
    if (statusRaw !== null) {
      if (!(PILOT_STATUSES as readonly string[]).includes(statusRaw)) {
        return NextResponse.json(
          { error: 'وضعیت معتبر نیست — یکی از INVITED / ACTIVE / COMPLETED / DECLINED | Invalid status' },
          { status: 400 },
        )
      }
      data.status = statusRaw
    }
    if (body?.notes !== undefined) {
      data.notes = String(body?.notes ?? '').trim() || null
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'چیزی برای به‌روزرسانی ارسال نشده است | Nothing to update' }, { status: 400 })
    }

    const updated = await conn.pilotTester.update({ where: { id }, data, include: { feedback: true } })

    const detail = data.status
      ? `به‌روزرسانی آزمونگر ${updated.companyName} — وضعیت: ${PILOT_STATUS_LABELS_FA[data.status] ?? data.status}`
      : `به‌روزرسانی آزمونگر ${updated.companyName} — یادداشت‌ها ویرایش شد`

    await conn.auditLog.create({
      data: {
        userId,
        userName: actor?.name ?? 'سیستم',
        action: 'PILOT_TESTER_UPDATED',
        entity: 'PilotTester',
        entityId: id,
        detail,
      },
    })

    return NextResponse.json({ tester: serializeTester(updated as unknown as TesterRow) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'خطا در به‌روزرسانی آزمونگر' },
      { status: 500 },
    )
  }
}
