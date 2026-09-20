import { NextResponse } from 'next/server'
import { db, ensurePrismaModel } from '@/lib/db'
import { toFaDigits } from '@/lib/jalali'
import { hasRole, type PUser } from '@/lib/types'
import { generateDemoCompany, DEMO_SIZES, DEMO_SIZE_LABELS_FA, type DemoData, type DemoSizeKey } from './generator'

export const dynamic = 'force-dynamic'

/**
 * Industry Demo Lab (Task 12-a) — virtual demo-company showcase.
 *
 * GET  /api/demo → { company: null } | { company: { id, name, sizeKey, createdAt, data } }
 *                  (data = parsed JSON snapshot of the latest generated DemoCompany)
 * POST /api/demo { userId, sizeKey: 'BOUTIQUE'|'MID'|'LARGE' }
 *      → manager-gated (OWNER|GENERAL_MANAGER|OPERATION_MANAGER|IT_ADMIN → 403 otherwise)
 *      → generates the virtual company (deterministic, see ./generator.ts),
 *        persists ONE DemoCompany row, trims the table to the newest 8 rows,
 *        writes a DEMO_GENERATED audit row with a Persian fa-IR detail.
 */

/** newest-8 retention: keep the 8 latest demo companies, delete anything older */
const KEEP_NEWEST = 8

/** manager gate via the shared hasRole helper (src/lib/types.ts) */
function isDemoManager(u: { roles: string } | null | undefined): boolean {
  if (!u) return false
  const pseudo = { roles: u.roles } as PUser
  return (
    hasRole(pseudo, 'OWNER') || hasRole(pseudo, 'GENERAL_MANAGER') ||
    hasRole(pseudo, 'OPERATION_MANAGER') || hasRole(pseudo, 'IT_ADMIN')
  )
}

function serializeCompany(row: { id: number; name: string; sizeKey: string; createdAt: Date; data: string }) {
  let data: DemoData | null = null
  try {
    data = JSON.parse(row.data) as DemoData
  } catch {
    data = null
  }
  return { id: row.id, name: row.name, sizeKey: row.sizeKey, createdAt: row.createdAt.toISOString(), data }
}

// GET /api/demo → latest demo company (or { company: null })
export async function GET() {
  try {
    // DemoCompany was pushed while the dev server was already running — get a client that has it
    const conn = ensurePrismaModel('demoCompany')
    const row = await conn.demoCompany.findFirst({ orderBy: { id: 'desc' } })
    if (!row) return NextResponse.json({ company: null })
    return NextResponse.json({ company: serializeCompany(row) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'خطا در دریافت شرکت نمونه' },
      { status: 500 },
    )
  }
}

// POST /api/demo { userId, sizeKey } → { company }
export async function POST(request: Request) {
  try {
    const conn = ensurePrismaModel('demoCompany')
    const body = await request.json().catch(() => null)
    const userId = Number(body?.userId ?? 0)
    if (!userId) return NextResponse.json({ error: 'پارامتر userId الزامی است | userId is required' }, { status: 400 })

    const sizeKey = String(body?.sizeKey ?? '').trim().toUpperCase() as DemoSizeKey
    if (!DEMO_SIZES.includes(sizeKey)) {
      return NextResponse.json(
        { error: 'اندازه شرکت نمونه معتبر نیست — یکی از BOUTIQUE / MID / LARGE را انتخاب کنید | Invalid sizeKey' },
        { status: 400 },
      )
    }

    const actor = await conn.user.findUnique({ where: { id: userId } })
    if (!isDemoManager(actor)) {
      return NextResponse.json({ error: 'دسترسی مجاز نیست | Forbidden' }, { status: 403 })
    }

    // deterministic generation (same sizeKey → same virtual company)
    const data = generateDemoCompany(sizeKey)
    const json = JSON.stringify(data)

    const row = await conn.demoCompany.create({
      data: {
        name: data.profile.name,
        sizeKey,
        data: json,
        createdById: userId,
      },
    })

    // retention: keep only the newest KEEP_NEWEST rows
    const keep = await conn.demoCompany.findMany({ orderBy: { id: 'desc' }, take: KEEP_NEWEST, select: { id: true } })
    if (keep.length === KEEP_NEWEST) {
      await conn.demoCompany.deleteMany({ where: { id: { notIn: keep.map((r) => r.id) } } })
    }

    // audit — Persian detail with fa-IR digits
    await conn.auditLog.create({
      data: {
        userId,
        userName: actor?.name ?? 'سیستم',
        action: 'DEMO_GENERATED',
        entity: 'DemoCompany',
        entityId: row.id,
        detail:
          `تولید شرکت نمونه «${data.profile.name}» — اندازه: ${DEMO_SIZE_LABELS_FA[sizeKey]} — ` +
          `${toFaDigits(data.profile.branchCount)} شعبه، ${toFaDigits(data.profile.staffCount)} نفر پرسنل، ` +
          `${toFaDigits(data.profile.supplierCount)} تأمین‌کننده، ${toFaDigits(data.profile.orderCount)} سفارش`,
      },
    })

    return NextResponse.json({ company: serializeCompany(row) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'خطا در تولید شرکت نمونه' },
      { status: 500 },
    )
  }
}
