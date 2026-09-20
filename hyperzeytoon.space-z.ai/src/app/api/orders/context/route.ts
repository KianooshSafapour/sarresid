import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok } from '@/lib/server-utils'
import { isoDay, addDays } from '@/lib/jalali'

/**
 * Catalog bundle for the commerce wizard + product-history popovers.
 * Self-contained so the order pipeline works even before the
 * products/providers modules expose their own endpoints.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const since30 = addDays(new Date(), -30)
  const holidayFrom = isoDay(addDays(new Date(), -30))
  const holidayTo = isoDay(addDays(new Date(), 300))

  const [providers, products, salesRows, holidays, recentOrders] = await Promise.all([
    db.provider.findMany({
      orderBy: { name: 'asc' },
      include: { companies: { include: { company: { select: { id: true, name: true, kind: true } } } } },
    }),
    db.product.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      include: { barcodes: { select: { id: true, code: true, isPrimary: true } } },
    }),
    db.productSale.groupBy({
      by: ['productId'],
      _sum: { qty: true, amount: true },
      where: { date: { gte: since30 } },
    }),
    db.holiday.findMany({ where: { date: { gte: holidayFrom, lte: holidayTo } }, orderBy: { date: 'asc' } }),
    db.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 40,
      where: { status: { not: 'CANCELLED' } },
      select: {
        id: true, code: true, createdAt: true, receivingDate: true,
        items: { select: { productId: true, name: true, qty: true } },
      },
    }),
  ])

  const sales30: Record<string, { qty: number; amount: number }> = {}
  for (const s of salesRows) sales30[s.productId] = { qty: s._sum.qty ?? 0, amount: s._sum.amount ?? 0 }

  return ok({
    providers: providers.map((p) => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      kind: p.kind, // DIRECT | DISTRIBUTOR
      color: p.color,
      companies: p.companies.map((pc) => ({ id: pc.company.id, name: pc.company.name, kind: pc.company.kind })),
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      altName: p.altName,
      category: p.category,
      brand: p.brand,
      unit: p.unit,
      sellPrice: p.sellPrice,
      buyPrice: p.buyPrice,
      taxRate: p.taxRate,
      stock: p.stock,
      minStock: p.minStock,
      image: p.image,
      status: p.status,
      barcodes: p.barcodes,
    })),
    sales30,
    holidays: holidays.map((h) => ({ date: h.date, name: h.name })),
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      code: o.code,
      createdAt: o.createdAt,
      receivingDate: o.receivingDate,
      items: o.items,
    })),
  })
}
