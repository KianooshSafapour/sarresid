import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/* Stale price-list nudges (round-10 rec #5):
 *  GET  /api/suppliers/nudges?userId=<viewer> → { stale: [{ id, name, days, productCount }] }
 *       manager-gated (GENERAL_MANAGER | OPERATION_MANAGER | OWNER | PRODUCT_MANAGER).
 *  POST /api/suppliers/nudges { userId }      → one WARNING notification per
 *       (recipient × stale supplier) to active PRODUCT_MANAGERs (fallback GM/OM),
 *       with a 7-day idempotency guard per supplier, and ONE PRICE_NUDGE_SENT audit row.
 *       AFTER the notification pass, ESCALATION (round-11 rec #3): a stale
 *       supplier nudged ≥2× in the last 14 days gets ONE auto-created HIGH
 *       "تماس با <supplier>" Task for the GM (fallback OWNER) — idempotent on
 *       (exact title, OPEN/IN_PROGRESS) — plus a NUDGE_ESCALATED audit row.
 *       Response gains the additive `escalated: [{ supplierId, name, taskId }]`.
 *
 * A supplier is stale when it has ≥1 ACTIVE product AND its last price import
 * is missing or older than 30 days. Last-import recency reuses the same audit-marker
 * logic as GET /api/suppliers (newest PRODUCT_PRICE_IMPORT audit whose
 * ` | suppliers=<ids>` detail marker includes the supplier id; older audits
 * without the marker simply don't attribute).
 */

const PRICE_STALE_MS = 30 * 24 * 3600 * 1000
const NUDGE_TITLE_PREFIX = 'یادآوری فهرست قیمت — '
const NUDGE_REPEAT_MS = 7 * 24 * 3600 * 1000
const NUDGE_ESCALATE_MS = 14 * 24 * 3600 * 1000

type StaleSupplier = { id: number; name: string; days: number | null; productCount: number }

function isNudgeManager(u: { roles: string } | null | undefined): boolean {
  if (!u) return false
  const roles = u.roles.split(',').map((r) => r.trim())
  return (
    roles.includes('GENERAL_MANAGER') || roles.includes('OPERATION_MANAGER') ||
    roles.includes('OWNER') || roles.includes('PRODUCT_MANAGER')
  )
}

/** Suppliers with ≥1 active (non-merged) product whose last price import is null or >30d old.
 *  Sorted: never-imported FIRST (most urgent), then by days stale desc. */
async function computeStaleSuppliers(): Promise<StaleSupplier[]> {
  const [suppliers, grouped, recentImports] = await Promise.all([
    db.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.product.groupBy({
      by: ['supplierId'],
      _count: { _all: true },
      where: { supplierId: { not: null }, active: true, mergedInto: null },
    }),
    // same bounded window as GET /api/suppliers so the two views can't disagree
    db.auditLog.findMany({
      where: { action: 'PRODUCT_PRICE_IMPORT' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { createdAt: true, detail: true },
    }),
  ])
  const activeCounts = new Map<number, number>()
  for (const g of grouped) {
    if (g.supplierId == null) continue
    activeCounts.set(g.supplierId, g._count._all)
  }
  // newest import per supplier via the ` | suppliers=<ids>` audit marker (mirror of GET /api/suppliers)
  const lastPerSupplier = new Map<number, Date>()
  for (const a of recentImports) {
    const m = /suppliers=([\d,]+)/.exec(a.detail ?? '')
    if (!m) continue
    for (const part of m[1].split(',')) {
      const id = Number(part)
      if (id && !lastPerSupplier.has(id)) lastPerSupplier.set(id, a.createdAt)
    }
  }
  const now = Date.now()
  const stale: StaleSupplier[] = []
  for (const s of suppliers) {
    const productCount = activeCounts.get(s.id) ?? 0
    if (productCount <= 0) continue
    const at = lastPerSupplier.get(s.id)
    const ms = at ? now - new Date(at).getTime() : null
    if (ms !== null && ms <= PRICE_STALE_MS) continue
    stale.push({ id: s.id, name: s.name, days: ms !== null ? Math.floor(ms / 86400000) : null, productCount })
  }
  stale.sort((a, b) => {
    if (a.days === null && b.days !== null) return -1
    if (b.days === null && a.days !== null) return 1
    if (a.days !== null && b.days !== null && a.days !== b.days) return b.days - a.days
    return a.name.localeCompare(b.name)
  })
  return stale
}

// GET /api/suppliers/nudges?userId=<viewer> → { stale: [...] } (manager gate)
export async function GET(request: Request) {
  try {
    const userId = Number(new URL(request.url).searchParams.get('userId') ?? 0)
    if (!userId) return NextResponse.json({ error: 'پارامتر userId الزامی است' }, { status: 400 })
    const viewer = await db.user.findUnique({ where: { id: userId } })
    if (!isNudgeManager(viewer)) {
      return NextResponse.json({ error: 'دسترسی مجاز نیست | Forbidden' }, { status: 403 })
    }
    const stale = await computeStaleSuppliers()
    return NextResponse.json({ stale })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'خطا در محاسبه فهرست قیمت‌های قدیمی' },
      { status: 500 },
    )
  }
}

// POST /api/suppliers/nudges { userId } → { created, suppliers, recipients }
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const userId = Number(body?.userId ?? 0)
    if (!userId) return NextResponse.json({ error: 'پارامتر userId الزامی است' }, { status: 400 })
    const actor = await db.user.findUnique({ where: { id: userId } })
    if (!isNudgeManager(actor)) {
      return NextResponse.json({ error: 'دسترسی مجاز نیست | Forbidden' }, { status: 403 })
    }

    // recompute server-side — never trust the client's view of "stale"
    const stale = await computeStaleSuppliers()
    if (stale.length === 0) {
      return NextResponse.json({ error: 'تأمین‌کننده‌ای با فهرست قیمت قدیمی وجود ندارد' }, { status: 400 })
    }

    // recipients = all ACTIVE users holding PRODUCT_MANAGER (price-list owner); fallback GM/OM
    const activeUsers = await db.user.findMany({ where: { active: true }, select: { id: true, name: true, roles: true } })
    const tokens = (u: { roles: string }) => u.roles.split(',').map((r) => r.trim())
    let recipients = activeUsers.filter((u) => tokens(u).includes('PRODUCT_MANAGER'))
    if (recipients.length === 0) {
      recipients = activeUsers.filter(
        (u) => tokens(u).includes('GENERAL_MANAGER') || tokens(u).includes('OPERATION_MANAGER'),
      )
    }
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'کاربری برای دریافت یادآوری یافت نشد (نقش مدیر محصول خالی است)' }, { status: 400 })
    }

    // 7-day idempotency: skip any supplier already nudged in the last week (for ANY recipient)
    const sevenDaysAgo = new Date(Date.now() - NUDGE_REPEAT_MS)
    const recentTitles = (
      await db.notification.findMany({
        where: { title: { startsWith: NUDGE_TITLE_PREFIX }, createdAt: { gte: sevenDaysAgo } },
        select: { title: true },
      })
    ).map((n) => n.title)
    const fresh = stale.filter((s) => !recentTitles.some((t) => t.startsWith(NUDGE_TITLE_PREFIX + s.name)))
    const skippedIds = new Set(stale.filter((s) => !fresh.some((f) => f.id === s.id)).map((s) => s.id))

    let created = 0
    if (fresh.length > 0) {
      const data = fresh.flatMap((s) =>
        recipients.map((r) => ({
          userId: r.id,
          title: NUDGE_TITLE_PREFIX + s.name,
          body:
            s.days === null
              ? `هنوز فهرست قیمتی برای تأمین‌کننده ${s.name} وارد نشده است — لطفاً با تأمین‌کننده تماس بگیرید و فهرست جدید را در سامانه وارد کنید.`
              : `فهرست قیمت تأمین‌کننده ${s.name} بیشتر از ${toFaDigits(s.days)} روز به‌روزرسانی نشده — لطفاً با تأمین‌کننده تماس بگیرید و فهرست جدید را در سامانه وارد کنید.`,
          type: 'WARNING',
        })),
      )
      const res = await db.notification.createMany({ data })
      created = res.count
      // ONE audit row per send (entityId null — the nudge targets the suppliers domain, not one supplier)
      await db.auditLog.create({
        data: {
          userId,
          userName: actor?.name ?? 'سیستم',
          action: 'PRICE_NUDGE_SENT',
          entity: 'Supplier',
          entityId: null,
          detail: `ارسال یادآوری فهرست قیمت — ${toFaDigits(fresh.length)} تأمین‌کننده — ${toFaDigits(recipients.length)} گیرنده`,
        },
      })
    }

    // ---- ESCALATION (round-11 rec #3, additive — runs after the notification
    // pass, over the full stale list incl. 7d-skipped suppliers): a supplier
    // nudged ≥2 times in the last 14 days that still hasn't imported prices
    // gets ONE auto-Task for the GM (fallback OWNER). Per-supplier nudge count
    // reuses the existing marker: WARNING notifications whose title startsWith
    // «یادآوری فهرست قیمت — <name>» + PRICE_NUDGE_SENT audits attributable to
    // the supplier (entityId match, or its name appearing in the detail).
    // Idempotent: skipped when an OPEN/IN_PROGRESS task with the exact same
    // title already exists. Best-effort: never fails the nudge response. ----
    const escalated: { supplierId: number; name: string; taskId: number }[] = []
    try {
      const sinceEscalate = new Date(Date.now() - NUDGE_ESCALATE_MS)
      const [recentNudges, recentSendAudits] = await Promise.all([
        db.notification.findMany({
          where: { title: { startsWith: NUDGE_TITLE_PREFIX }, type: 'WARNING', createdAt: { gte: sinceEscalate } },
          select: { title: true },
        }),
        db.auditLog.findMany({
          where: { action: 'PRICE_NUDGE_SENT', entity: 'Supplier', createdAt: { gte: sinceEscalate } },
          select: { entityId: true, detail: true },
        }),
      ])
      // assignee: first ACTIVE user holding GENERAL_MANAGER, fallback first OWNER
      const gmOrOwner = activeUsers
        .filter((u) => {
          const t = tokens(u)
          return t.includes('GENERAL_MANAGER') || t.includes('OWNER')
        })
        .sort((a, b) => a.id - b.id)
      const assignee =
        gmOrOwner.find((u) => tokens(u).includes('GENERAL_MANAGER')) ??
        gmOrOwner.find((u) => tokens(u).includes('OWNER'))
      if (assignee) {
        for (const s of stale) {
          const nudgeCount =
            recentNudges.filter((n) => n.title.startsWith(NUDGE_TITLE_PREFIX + s.name)).length +
            recentSendAudits.filter((a) => a.entityId === s.id || (a.detail ?? '').includes(s.name)).length
          if (nudgeCount < 2) continue
          const taskTitle = `تماس با ${s.name}`
          const existing = await db.task.findFirst({
            where: { title: taskTitle, status: { in: ['OPEN', 'IN_PROGRESS'] } },
            select: { id: true },
          })
          if (existing) continue
          const task = await db.task.create({
            data: {
              title: taskTitle,
              description: 'فهرست قیمت این تأمین‌کننده بیش از دو بار یادآوری شده و به‌روزرسانی نشده است — لطفاً تماس بگیرید.',
              priority: 'HIGH',
              status: 'OPEN',
              assignedToId: assignee.id,
              createdById: userId,
            },
          })
          escalated.push({ supplierId: s.id, name: s.name, taskId: task.id })
          await db.auditLog.create({
            data: {
              userId,
              userName: actor?.name ?? 'سیستم',
              action: 'NUDGE_ESCALATED',
              entity: 'Supplier',
              entityId: s.id,
              detail: `تشدید پیگیری — ${s.name} — تسک خودکار برای مدیرعامل`,
            },
          })
        }
      }
    } catch (escErr) {
      console.error('[nudges] escalation failed (best-effort):', escErr)
    }

    return NextResponse.json({
      created,
      suppliers: stale.map((s) => ({ id: s.id, name: s.name, ...(skippedIds.has(s.id) ? { skipped: true } : {}) })),
      recipients: recipients.length,
      escalated,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'خطا در ارسال یادآوری' }, { status: 500 })
  }
}
