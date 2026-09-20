import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, getSetting } from '@/lib/server-utils'
import { isoDay, addDays, toFaDigits, JALALI_MONTHS, toJalali } from '@/lib/jalali'

// Manager analytics: sales trend, category mix, top products, order flow, margin estimate
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.isManager) return fail('دسترسی غیرمجاز', 403)

  const now = new Date()
  const daysReq = Number(req.nextUrl.searchParams.get('days') ?? '30')
  const days = [7, 30, 90].includes(daysReq) ? daysReq : 30
  const since = addDays(now, -days)

  const [sales, orders, products, cheques] = await Promise.all([
    db.productSale.findMany({
      where: { date: { gte: since } },
      include: { product: { select: { name: true, category: true, buyPrice: true, sellPrice: true } } },
    }),
    db.order.findMany({
      where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
      select: { createdAt: true, status: true, finalAmount: true, providerName: true },
    }),
    db.product.findMany({ where: { status: 'ACTIVE' }, select: { stock: true, buyPrice: true, minStock: true, category: true } }),
    db.cheque.aggregate({
      where: { status: { in: ['PENDING_OWNER', 'SIGNED', 'DELIVERED'] } },
      _sum: { amount: true }, _count: true,
    }),
  ])

  // daily sales
  const daily = new Map<string, number>()
  for (const s of sales) {
    const k = isoDay(s.date)
    daily.set(k, (daily.get(k) ?? 0) + s.amount)
  }
  const salesTrend: { label: string; amount: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(now, -i)
    const j = toJalali(d)
    salesTrend.push({
      label: `${toFaDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1].slice(0, 3)}`,
      amount: Math.round(daily.get(isoDay(d)) ?? 0),
    })
  }

  // by category + top products + margin
  const catMap = new Map<string, number>()
  const prodMap = new Map<string, { name: string; category: string; qty: number; amount: number; margin: number }>()
  for (const s of sales) {
    const cat = s.product?.category ?? 'سایر'
    catMap.set(cat, (catMap.get(cat) ?? 0) + s.amount)
    const key = s.productId
    const cur = prodMap.get(key) ?? { name: s.product?.name ?? '—', category: cat, qty: 0, amount: 0, margin: 0 }
    cur.qty += s.qty
    cur.amount += s.amount
    cur.margin += s.qty * ((s.product?.sellPrice ?? 0) - (s.product?.buyPrice ?? 0))
    prodMap.set(key, cur)
  }
  const byCategory = [...catMap.entries()].map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value)
  const topProducts = [...prodMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 8).map((p) => ({ ...p, amount: Math.round(p.amount), margin: Math.round(p.margin) }))

  // orders per day (14d)
  const orderDaily = new Map<string, number>()
  for (const o of orders) {
    const k = isoDay(o.createdAt)
    orderDaily.set(k, (orderDaily.get(k) ?? 0) + 1)
  }
  const orderTrend: { label: string; count: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = addDays(now, -i)
    const j = toJalali(d)
    orderTrend.push({ label: `${toFaDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1].slice(0, 3)}`, count: orderDaily.get(isoDay(d)) ?? 0 })
  }

  const statusDist = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {})

  const salesN = Math.round(sales.reduce((s, x) => s + x.amount, 0))
  const marginN = Math.round(sales.reduce((s, x) => s + x.qty * ((x.product?.sellPrice ?? 0) - (x.product?.buyPrice ?? 0)), 0))
  const stockValue = Math.round(products.reduce((s, p) => s + p.stock * p.buyPrice, 0))
  const outOfStock = products.filter((p) => p.stock <= 0).length
  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= p.minStock).length

  // SPHL — Sales Per Hour of Labor (بهره‌وری هر ساعت کار نیرو)
  const [activeStaff, laborHoursStr] = await Promise.all([
    db.user.count({ where: { active: true } }),
    getSetting('labor_hours_per_day', '8'),
  ])
  const laborHours = Math.max(1, Number(laborHoursStr) || 8)
  const sales7 = Math.round(sales.filter((s) => s.date >= addDays(now, -7)).reduce((s, x) => s + x.amount, 0))
  const laborHours7 = Math.max(1, activeStaff * 7 * laborHours)
  const sphl = Math.round(sales7 / laborHours7)

  return ok({
    days,
    kpis: {
      sales30: salesN,
      margin30: marginN,
      marginRate: salesN > 0 ? Math.round((marginN / salesN) * 100) : 0,
      stockValue,
      outOfStock,
      lowStock,
      openCheques: cheques._count ?? 0,
      openChequesAmount: cheques._sum.amount ?? 0,
      orders30: orders.length,
      sales7,
      sphl,
      staffCount: activeStaff,
      laborHours,
    },
    salesTrend,
    byCategory,
    topProducts,
    orderTrend,
    statusDist,
  })
}
