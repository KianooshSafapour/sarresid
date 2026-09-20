import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * POST /api/scan-log  { userId, code, source: 'manual'|'camera', outcome: 'hit'|'closed'|'warn'|'miss'|'error' }
 *
 * SCAN_IN audit logging for the delivery ScanBar — the server-side base for
 * scan-adoption analytics (read back via GET /api/scan-log/stats). The client
 * fires this fire-and-forget on EVERY scan submit (hits and misses alike).
 *
 * One audit row per call:
 *   action 'SCAN_IN', entity 'Order', entityId = matched order id (null when
 *   the code matches no order), detail = Persian summary + a compact machine
 *   marker `| scan=<outcome>,<source>` (same convention as the round-9
 *   `| suppliers=` price-import marker) that /api/scan-log/stats parses.
 *
 * 400 only for an invalid/unknown user or an empty code after normalization.
 * Never 5xx on data issues — analytics is best-effort, so any internal failure
 * still returns { ok: true } and simply skips the row.
 */

const SOURCES = ['manual', 'camera'] as const
const OUTCOMES = ['hit', 'closed', 'warn', 'miss', 'error'] as const

const OUTCOME_FA: Record<string, string> = {
  hit: 'موفق',
  closed: 'بسته',
  warn: 'بدون تحویل',
  miss: 'یافت نشد',
  error: 'خطا',
}

type ScanSourceT = (typeof SOURCES)[number]
type ScanOutcomeT = (typeof OUTCOMES)[number]

/** server-side backstop of the client's normalizeOrderCode: strip Code39
 * start/stop `*` + whitespace, map Persian/Arabic digits, uppercase */
function normalizeCode(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\s*]+/g, '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .toUpperCase()
}

export async function POST(request: Request) {
  let body: { userId?: unknown; code?: unknown; source?: unknown; outcome?: unknown } | null = null
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بدنه درخواست نامعتبر است | Invalid body' }, { status: 400 })
  }

  const userId = Number(body?.userId)
  const code = normalizeCode(body?.code)
  // unknown values clamp to the safe defaults instead of erroring — the row
  // must never be lost to a client typo, and the client never sends garbage
  const source: ScanSourceT = (SOURCES as readonly string[]).includes(String(body?.source))
    ? (String(body?.source) as ScanSourceT)
    : 'manual'
  const outcome: ScanOutcomeT = (OUTCOMES as readonly string[]).includes(String(body?.outcome))
    ? (String(body?.outcome) as ScanOutcomeT)
    : 'warn'

  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: 'پارامتر userId الزامی است | userId is required' }, { status: 400 })
  }
  if (!code) {
    return NextResponse.json({ error: 'کد اسکن الزامی است | Scan code is required' }, { status: 400 })
  }

  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, active: true } })
    if (!user || !user.active) {
      return NextResponse.json(
        { error: 'کاربر یافت نشد یا غیرفعال است | User not found or inactive' },
        { status: 400 },
      )
    }

    const order = await db.order.findUnique({
      where: { code },
      select: { id: true, supplier: { select: { name: true } } },
    })

    let detail = `اسکن تحویل ${code} — منبع: ${source === 'camera' ? 'دوربین' : 'دستی'} — نتیجه: ${OUTCOME_FA[outcome]}`
    if (order?.supplier?.name) detail += ` — تأمین‌کننده: ${order.supplier.name}`
    detail += ` | scan=${outcome},${source}`

    await db.auditLog.create({
      data: {
        userId,
        userName: user.name,
        action: 'SCAN_IN',
        entity: 'Order',
        entityId: order?.id ?? null,
        detail,
      },
    })
  } catch {
    // analytics is fire-and-forget — the client never surfaces scan-log failures
  }

  return NextResponse.json({ ok: true })
}
