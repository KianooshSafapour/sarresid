import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/suppliers → suppliers with companies + productsCount + lowCount,
// plus `priceImport` = latest PRODUCT_PRICE_IMPORT audit row (recency hint for stale price lists),
// plus per-supplier `lastPriceImport` = newest import audit whose ` | suppliers=<ids>` marker
// includes this supplier (older audits lack the marker → they simply don't attribute).
export async function GET() {
  try {
    const [suppliers, products, lastImport, recentImports] = await Promise.all([
      db.supplier.findMany({
        include: { companies: { include: { company: true } }, _count: { select: { products: true } } },
        orderBy: { name: 'asc' },
      }),
      db.product.findMany({
        where: { supplierId: { not: null } },
        select: { supplierId: true, stock: true, minStock: true, active: true },
      }),
      db.auditLog.findFirst({
        where: { action: 'PRODUCT_PRICE_IMPORT' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, userName: true },
      }),
      db.auditLog.findMany({
        where: { action: 'PRODUCT_PRICE_IMPORT' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { createdAt: true, userName: true, detail: true },
      }),
    ])
    // per-supplier product counts + low-stock counts (active products with stock <= minStock)
    const counts = new Map<number, { count: number; low: number }>()
    for (const p of products) {
      if (p.supplierId == null) continue
      const entry = counts.get(p.supplierId) ?? { count: 0, low: 0 }
      entry.count++
      if (p.active && p.stock <= p.minStock) entry.low++
      counts.set(p.supplierId, entry)
    }
    // per-supplier price-import recency: for each supplier the FIRST (newest)
    // audit whose `suppliers=` marker contains its id wins
    const lastPerSupplier = new Map<number, { at: Date; by: string }>()
    for (const a of recentImports) {
      const m = /suppliers=([\d,]+)/.exec(a.detail ?? '')
      if (!m) continue
      for (const part of m[1].split(',')) {
        const id = Number(part)
        if (id && !lastPerSupplier.has(id)) lastPerSupplier.set(id, { at: a.createdAt, by: a.userName })
      }
    }
    return NextResponse.json({
      suppliers: suppliers.map((s) => {
        const last = lastPerSupplier.get(s.id)
        return {
          ...s,
          productsCount: counts.get(s.id)?.count ?? 0,
          lowCount: counts.get(s.id)?.low ?? 0,
          lastPriceImport: last ? { at: last.at, by: last.by } : null,
        }
      }),
      priceImport: lastImport ? { at: lastImport.createdAt, by: lastImport.userName } : null,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/suppliers {name,kind,companyIds,paymentTerms,chequeDays,phone}
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = String(body?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'نام تأمین‌کننده الزامی است' }, { status: 400 })
    const companyIds: number[] = Array.isArray(body?.companyIds) ? body.companyIds.map(Number).filter(Boolean) : []
    const supplier = await db.supplier.create({
      data: {
        name,
        kind: String(body?.kind ?? 'DISTRIBUTOR'),
        phone: body?.phone ? String(body.phone) : null,
        note: body?.note ? String(body.note) : null,
        paymentTerms: String(body?.paymentTerms ?? 'CASH'),
        chequeDays: Number(body?.chequeDays ?? 30),
        companies: { create: companyIds.map((companyId) => ({ companyId })) },
      },
      include: { companies: { include: { company: true } }, _count: { select: { products: true } } },
    })
    await db.auditLog.create({
      data: {
        userId: Number(body?.userId ?? 0),
        userName: String(body?.userName ?? 'سیستم'),
        action: 'SUPPLIER_CREATE',
        entity: 'Supplier',
        entityId: supplier.id,
        detail: `تأمین‌کننده جدید: ${supplier.name}`,
      },
    })
    return NextResponse.json(supplier)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/suppliers {id, ...fields, companyIds?}
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const id = Number(body?.id)
    if (!id) return NextResponse.json({ error: 'شناسه تأمین‌کننده الزامی است' }, { status: 400 })
    const existing = await db.supplier.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'تأمین‌کننده یافت نشد' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (body?.name !== undefined) data.name = String(body.name).trim()
    if (body?.kind !== undefined) data.kind = String(body.kind)
    if (body?.phone !== undefined) data.phone = body.phone ? String(body.phone) : null
    if (body?.note !== undefined) data.note = body.note ? String(body.note) : null
    if (body?.paymentTerms !== undefined) data.paymentTerms = String(body.paymentTerms)
    if (body?.chequeDays !== undefined) data.chequeDays = Number(body.chequeDays)

    const supplier = await db.supplier.update({ where: { id }, data })

    if (body?.companyIds !== undefined && Array.isArray(body.companyIds)) {
      const companyIds = body.companyIds.map(Number).filter(Boolean)
      await db.supplierCompany.deleteMany({ where: { supplierId: id } })
      if (companyIds.length) {
        await db.supplierCompany.createMany({ data: companyIds.map((companyId) => ({ supplierId: id, companyId })) })
      }
    }

    await db.auditLog.create({
      data: {
        userId: Number(body?.userId ?? 0),
        userName: String(body?.userName ?? 'سیستم'),
        action: 'SUPPLIER_UPDATE',
        entity: 'Supplier',
        entityId: id,
        detail: `ویرایش تأمین‌کننده ${existing.name}`,
      },
    })

    const full = await db.supplier.findUnique({
      where: { id },
      include: { companies: { include: { company: true } }, _count: { select: { products: true } } },
    })
    return NextResponse.json(full)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
