import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { db as sharedDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Prisma client accessor with a self-healing guard.
 *
 * The long-running dev server can hold a PrismaClient generated BEFORE the
 * round-12 models existed (client regenerated while the process was already
 * up; globalThis/module instances keep serving the stale one). We probe the
 * shared `db` for the delegates this route needs and, when missing, fall back
 * to a lazily-created fresh client stored under a dedicated global key.
 */
function pdb(): PrismaClient {
  const g = globalThis as unknown as { __hzDbFresh12b?: PrismaClient }
  const probe = sharedDb as unknown as Record<string, unknown>
  if (probe && typeof probe.shrinkageLog === 'object' && probe.shrinkageLog !== null) return sharedDb
  if (!g.__hzDbFresh12b) g.__hzDbFresh12b = new PrismaClient()
  return g.__hzDbFresh12b
}

/**
 * دفتر نزولات و ضایعات | Shrinkage & Waste Ledger
 *
 * Research basis: grocery shrinkage runs 1–3% of revenue (ECR Shrinkage
 * roadmap / ECR Loss 2020); main causes are spoilage, expiry, damage, theft.
 *
 * GET  /api/shrinkage?userId=&days=30
 *   → role-gated (INVENTORY_SUPERVISOR | PRODUCT_MANAGER | DELIVERY_RECEIVER |
 *     OWNER | GENERAL_MANAGER | OPERATION_MANAGER | IT_ADMIN) → 403 otherwise.
 *   → { rows: [latest 50 logs in window + value + reporterName], summary: {
 *     count, totalValue, byReason {SPOILAGE,EXPIRED,DAMAGED,THEFT,OTHER},
 *     ratioPct }, days } — ratioPct = shrinkage value ÷ sales value over the
 *     same window ×100 (null when the window has no recorded sales).
 *
 * POST /api/shrinkage { userId, productId?, name, qty, unitCost?, reason, note? }
 *   → role-gated same as GET (7 roles, warehouse staff reporting included).
 *   → validates name/qty/reason (400 Persian), auto-fills unitCost from
 *     product.buyPrice when omitted, decrements product.stock floored at 0
 *     (clamped=true when stock < qty — never goes negative), audits
 *     SHRINKAGE_REPORT with fa-IR digits.
 */

const MGMT_ROLES = ['OWNER', 'GENERAL_MANAGER', 'OPERATION_MANAGER', 'IT_ADMIN']
// Task 12-b spec: GET and POST share the SAME 7-role gate (warehouse staff
// reporting spoilage must also see the ledger they feed).
const SHRINK_ROLES = [...MGMT_ROLES, 'INVENTORY_SUPERVISOR', 'PRODUCT_MANAGER', 'DELIVERY_RECEIVER']
const VIEW_ROLES = SHRINK_ROLES
const REPORT_ROLES = SHRINK_ROLES

const REASONS = ['SPOILAGE', 'EXPIRED', 'DAMAGED', 'THEFT', 'OTHER'] as const
type ReasonKey = (typeof REASONS)[number]

const REASON_FA: Record<ReasonKey, string> = {
  SPOILAGE: 'فاسدشدن',
  EXPIRED: 'انقضا',
  DAMAGED: 'آسیب/شکست',
  THEFT: 'سرقت',
  OTHER: 'سایر',
}

const FORBIDDEN = { error: 'دسترسی به دفتر نزولات برای نقش شما مجاز نیست | Forbidden' }

async function audit(
  client: PrismaClient,
  userId: number | null | undefined,
  action: string,
  entity: string,
  entityId: number | null,
  detail?: string
) {
  let userName = 'سیستم'
  if (userId) {
    const u = await client.user.findUnique({ where: { id: userId }, select: { name: true } })
    if (u) userName = u.name
  }
  await client.auditLog.create({
    data: { userId: userId ?? 0, userName, action, entity, entityId, detail: detail ?? null },
  })
}

async function loadUser(client: PrismaClient, userId: number) {
  if (!Number.isFinite(userId) || userId <= 0) return null
  try {
    return await client.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, roles: true, active: true },
    })
  } catch {
    return null
  }
}

function hasAny(roles: string, allowed: string[]): boolean {
  return roles.split(',').map((r) => r.trim()).some((r) => allowed.includes(r))
}

// GET /api/shrinkage?userId=&days=30
export async function GET(request: Request) {
  const db = pdb()
  const sp = new URL(request.url).searchParams
  const userId = Number(sp.get('userId'))
  const user = await loadUser(db, userId)
  if (!user || !user.active || !hasAny(user.roles, VIEW_ROLES)) {
    return NextResponse.json(FORBIDDEN, { status: 403 })
  }

  try {
    const daysRaw = Number(sp.get('days'))
    const days = Math.min(Math.max(Number.isFinite(daysRaw) && daysRaw > 0 ? Math.floor(daysRaw) : 30, 1), 365)
    const since = new Date(Date.now() - days * 86400000)

    const [logs, salesAgg] = await Promise.all([
      db.shrinkageLog.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } }),
      db.sale.aggregate({ where: { createdAt: { gte: since } }, _sum: { total: true } }),
    ])

    const byReason: Record<ReasonKey, number> = { SPOILAGE: 0, EXPIRED: 0, DAMAGED: 0, THEFT: 0, OTHER: 0 }
    let totalValue = 0
    for (const log of logs) {
      const v = log.qty * log.unitCost
      totalValue += v
      if ((REASONS as readonly string[]).includes(log.reason)) byReason[log.reason as ReasonKey] += v
    }
    const salesTotal = salesAgg._sum.total ?? 0
    const ratioPct = salesTotal > 0 ? Math.round((totalValue / salesTotal) * 10000) / 100 : null

    const rows = logs.slice(0, 50)
    const reporterIds = [...new Set(rows.map((r) => r.reportedById))]
    const users = reporterIds.length
      ? await db.user.findMany({ where: { id: { in: reporterIds } }, select: { id: true, name: true } })
      : []
    const umap = new Map(users.map((u) => [u.id, u]))

    return NextResponse.json({
      rows: rows.map((r) => ({
        ...r,
        value: Math.round(r.qty * r.unitCost),
        reporterName: umap.get(r.reportedById)?.name ?? null,
        reporter: umap.get(r.reportedById) ?? null,
      })),
      summary: {
        count: logs.length,
        totalValue: Math.round(totalValue),
        byReason: {
          SPOILAGE: Math.round(byReason.SPOILAGE),
          EXPIRED: Math.round(byReason.EXPIRED),
          DAMAGED: Math.round(byReason.DAMAGED),
          THEFT: Math.round(byReason.THEFT),
          OTHER: Math.round(byReason.OTHER),
        },
        ratioPct,
      },
      days,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/shrinkage { userId, productId?, name, qty, unitCost?, reason, note? }
export async function POST(request: Request) {
  const db = pdb()
  try {
    const b = await request.json()
    const userId = Number(b?.userId)
    const user = await loadUser(db, userId)
    if (!user || !user.active || !hasAny(user.roles, REPORT_ROLES)) {
      return NextResponse.json(FORBIDDEN, { status: 403 })
    }

    const name = String(b?.name ?? '').trim()
    const qty = Number(b?.qty)
    const reason = String(b?.reason ?? '')
    if (!name) return NextResponse.json({ error: 'نام کالا الزامی است' }, { status: 400 })
    if (!Number.isFinite(qty) || qty <= 0)
      return NextResponse.json({ error: 'تعداد باید بزرگ‌تر از صفر باشد' }, { status: 400 })
    if (!(REASONS as readonly string[]).includes(reason))
      return NextResponse.json({ error: 'علت نزول نامعتبر است' }, { status: 400 })

    let product: { id: number; name: string; stock: number; buyPrice: number; unit: string } | null = null
    if (b?.productId) {
      const found = await db.product.findUnique({
        where: { id: Number(b.productId) },
        select: { id: true, name: true, stock: true, buyPrice: true, unit: true },
      })
      if (!found) return NextResponse.json({ error: 'کالا یافت نشد' }, { status: 400 })
      product = found
    }

    // unitCost: explicit value wins; otherwise auto-fill from product buy price
    let unitCost = Number(b?.unitCost)
    if (!Number.isFinite(unitCost) || unitCost < 0) unitCost = product ? product.buyPrice : 0

    // stock adjustment: decrement, floored at 0 (never negative)
    let clamped = false
    let stockAfter: number | null = null
    if (product) {
      stockAfter = Math.max(0, product.stock - qty)
      clamped = product.stock < qty
      await db.product.update({ where: { id: product.id }, data: { stock: stockAfter } })
    }

    const log = await db.shrinkageLog.create({
      data: {
        productId: product?.id ?? null,
        name,
        qty,
        unitCost,
        reason,
        note: b?.note ? String(b.note) : null,
        reportedById: userId,
      },
    })

    const value = qty * unitCost
    // Task 12-b audit contract: «ثبت نزولات — <name> — <qty> <reason fa> — <value> تومان»
    await audit(
      db,
      userId,
      'SHRINKAGE_REPORT',
      'ShrinkageLog',
      log.id,
      `ثبت نزولات — ${name} — ${qty.toLocaleString('fa-IR')} ${REASON_FA[reason as ReasonKey]} — ${value.toLocaleString('fa-IR')} تومان${clamped ? ' — موجودی به صفر رسید' : ''}`
    )

    return NextResponse.json({ log, clamped, productStock: stockAfter })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
