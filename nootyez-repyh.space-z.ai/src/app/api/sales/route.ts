import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

type SaleRow = {
  id: number
  productId: number | null
  name: string
  qty: number
  unitPrice: number
  total: number
  customerId: number | null
  customerName: string | null
  channel: string
  salespersonId: number
  cashierId: number | null
  preOrderId: number | null
  note: string | null
  createdAt: Date
}

// attach salesperson / cashier users (no prisma relations on Sale)
async function withUsers(sales: SaleRow[]) {
  const ids = [...new Set(sales.flatMap((s) => [s.salespersonId, ...(s.cashierId ? [s.cashierId] : [])]))]
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, color: true } })
  const umap = new Map(users.map((u) => [u.id, u]))
  return sales.map((s) => ({
    ...s,
    salesperson: umap.get(s.salespersonId) ?? null,
    cashier: s.cashierId ? umap.get(s.cashierId) ?? null : null,
  }))
}

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

/** local calendar day key YYYY-MM-DD (server clock) */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// GET /api/sales?from=&to=&salespersonId=&limit=200 → { sales (+salesperson/cashier), summary }
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const from = sp.get('from') ? new Date(String(sp.get('from'))) : null
    const to = sp.get('to') ? new Date(String(sp.get('to'))) : null
    const salespersonId = sp.get('salespersonId') ? Number(sp.get('salespersonId')) : null
    const limit = Math.min(Math.max(Number(sp.get('limit') ?? 200) || 200, 1), 1000)

    const where: Record<string, unknown> = {}
    if (from || to) {
      where.createdAt = { ...(from && !isNaN(from.getTime()) ? { gte: from } : {}), ...(to && !isNaN(to.getTime()) ? { lte: to } : {}) }
    }
    if (salespersonId) where.salespersonId = salespersonId

    const sales = await db.sale.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit })

    // ---------- summary over the standard windows (salespersonId filter applies) ----------
    const now = new Date()
    const dayStart = new Date(now)
    dayStart.setHours(0, 0, 0, 0)
    const weekStart = new Date(now.getTime() - 7 * 86400000)
    const monthStart = new Date(now.getTime() - 30 * 86400000)

    const baseWhere: Record<string, unknown> = salespersonId ? { salespersonId } : {}
    const winWhere = (gte: Date) => ({ ...baseWhere, createdAt: { gte } })

    const [todayAgg, weekAgg, monthAgg] = await Promise.all([
      db.sale.aggregate({ where: winWhere(dayStart), _sum: { total: true }, _count: true }),
      db.sale.aggregate({ where: winWhere(weekStart), _sum: { total: true }, _count: true }),
      db.sale.aggregate({ where: winWhere(monthStart), _sum: { total: true }, _count: true }),
    ])

    // lightweight rows for byDay / bySalesperson / topProducts (30d window)
    const rows = await db.sale.findMany({
      where: winWhere(monthStart),
      select: { createdAt: true, total: true, qty: true, name: true, salespersonId: true },
    })

    // byDay — last 14 days, missing days filled with 0
    const dayTotals = new Map<string, number>()
    for (const r of rows) {
      const k = dayKey(new Date(r.createdAt))
      dayTotals.set(k, (dayTotals.get(k) ?? 0) + r.total)
    }
    const byDay: { day: string; total: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const k = dayKey(new Date(now.getTime() - i * 86400000))
      byDay.push({ day: k, total: Math.round(dayTotals.get(k) ?? 0) })
    }

    // bySalesperson — SPHL = total ÷ (shiftHours × distinctDaysWorked)
    const perPerson = new Map<number, { total: number; count: number; days: Set<string> }>()
    for (const r of rows) {
      const e = perPerson.get(r.salespersonId) ?? { total: 0, count: 0, days: new Set<string>() }
      e.total += r.total
      e.count += 1
      e.days.add(dayKey(new Date(r.createdAt)))
      perPerson.set(r.salespersonId, e)
    }
    const shiftRow = await db.setting.findUnique({ where: { key: 'shiftHours' } })
    const shiftVal = parseFloat(shiftRow?.value ?? '')
    const shiftHours = Number.isFinite(shiftVal) && shiftVal > 0 ? shiftVal : 8

    const personIds = [...perPerson.keys()]
    const persons = personIds.length
      ? await db.user.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true, color: true } })
      : []
    const pmap = new Map(persons.map((p) => [p.id, p]))

    const bySalesperson = personIds
      .map((uid) => {
        const e = perPerson.get(uid)!
        const workedDays = Math.max(1, e.days.size)
        const p = pmap.get(uid)
        return {
          userId: uid,
          name: p?.name ?? `کاربر #${uid}`,
          color: p?.color ?? '#5F7A4E',
          total: Math.round(e.total),
          count: e.count,
          sphl: Math.round(e.total / (shiftHours * workedDays)),
        }
      })
      .sort((a, b) => b.total - a.total)

    // sphlOverall — monthTotal ÷ (activeSalespersons × shiftHours × 30)
    const monthTotal = monthAgg._sum.total ?? 0
    const sphlOverall =
      bySalesperson.length > 0 ? Math.max(0, Math.round(monthTotal / (bySalesperson.length * shiftHours * 30))) : 0

    // topProducts — top 8 by total (30d window)
    const prodAgg = new Map<string, { qty: number; total: number }>()
    for (const r of rows) {
      const e = prodAgg.get(r.name) ?? { qty: 0, total: 0 }
      e.qty += r.qty
      e.total += r.total
      prodAgg.set(r.name, e)
    }
    const topProducts = [...prodAgg.entries()]
      .map(([name, e]) => ({ name, qty: Math.round(e.qty * 10) / 10, total: Math.round(e.total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)

    const summary = {
      todayTotal: Math.round(todayAgg._sum.total ?? 0),
      todayCount: todayAgg._count ?? 0,
      weekTotal: Math.round(weekAgg._sum.total ?? 0),
      monthTotal: Math.round(monthTotal),
      count: monthAgg._count ?? 0,
      byDay,
      bySalesperson,
      sphlOverall,
      topProducts,
    }

    return NextResponse.json({ sales: await withUsers(sales), summary })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/sales {userId (actor), productId?, name, qty, unitPrice, salespersonId, cashierId?, customerId?, customerName?, channel?, note?}
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const name = String(b?.name ?? '').trim()
    const qty = Number(b?.qty)
    const unitPrice = Number(b?.unitPrice)
    const salespersonId = Number(b?.salespersonId)
    const actorId = b?.userId ? Number(b.userId) : null
    if (!name) return NextResponse.json({ error: 'نام محصول الزامی است' }, { status: 400 })
    if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: 'تعداد باید بزرگ‌تر از صفر باشد' }, { status: 400 })
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return NextResponse.json({ error: 'قیمت واحد نامعتبر است' }, { status: 400 })
    if (!salespersonId) return NextResponse.json({ error: 'فروشنده الزامی است' }, { status: 400 })
    const seller = await db.user.findUnique({ where: { id: salespersonId }, select: { id: true } })
    if (!seller) return NextResponse.json({ error: 'فروشنده یافت نشد' }, { status: 400 })

    const total = qty * unitPrice
    const sale = await db.sale.create({
      data: {
        productId: b?.productId ? Number(b.productId) : null,
        name,
        qty,
        unitPrice,
        total,
        customerId: b?.customerId ? Number(b.customerId) : null,
        customerName: b?.customerName ? String(b.customerName) : null,
        channel: b?.channel === 'PREORDER' ? 'PREORDER' : 'WALKIN',
        salespersonId,
        cashierId: b?.cashierId ? Number(b.cashierId) : null,
        preOrderId: b?.preOrderId ? Number(b.preOrderId) : null,
        note: b?.note ? String(b.note) : null,
      },
    })

    // gamification: +2 points to the salesperson
    await db.pointsLog.create({
      data: { userId: salespersonId, points: 2, reason: 'ثبت فروش | Sale logged', awardedById: actorId },
    })
    await db.user.update({ where: { id: salespersonId }, data: { points: { increment: 2 } } })

    await audit(actorId, 'SALE_CREATE', 'Sale', sale.id, `${name} × ${qty} — ${total.toLocaleString('fa-IR')} تومان`)

    const [withU] = await withUsers([sale])
    return NextResponse.json({ sale: withU })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// DELETE /api/sales?id=&userId= (compensating -2 points, never below 0)
export async function DELETE(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const id = Number(sp.get('id'))
    const userId = sp.get('userId') ? Number(sp.get('userId')) : null
    if (!id) return NextResponse.json({ error: 'شناسه فروش الزامی است' }, { status: 400 })
    const sale = await db.sale.findUnique({ where: { id } })
    if (!sale) return NextResponse.json({ error: 'فروش یافت نشد' }, { status: 404 })

    await db.sale.delete({ where: { id } })

    const person = await db.user.findUnique({ where: { id: sale.salespersonId }, select: { id: true, points: true } })
    if (person) {
      await db.pointsLog.create({
        data: { userId: sale.salespersonId, points: -2, reason: 'حذف فروش | Sale removed', awardedById: userId },
      })
      await db.user.update({ where: { id: sale.salespersonId }, data: { points: Math.max(0, person.points - 2) } })
    }

    await audit(userId, 'SALE_DELETE', 'Sale', sale.id, `${sale.name} × ${sale.qty} — ${sale.total.toLocaleString('fa-IR')} تومان`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
