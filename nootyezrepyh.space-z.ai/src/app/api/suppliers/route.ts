import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

function canManageSuppliers(roles: string[]): boolean {
  return canUser(roles, PERMISSIONS.MANAGE_SUPPLIERS) || canUser(roles, PERMISSIONS.MANAGE_ORDERS)
}

// ==================== GET /api/suppliers — suppliers + companies + products ====================
// Query: ?withStats=1 → adds order counts per supplier
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const withStats = new URL(req.url).searchParams.get('withStats') === '1'

  const suppliers = await db.supplier.findMany({
    where: { active: true },
    include: {
      companies: {
        include: {
          products: { where: { active: true, mergedInto: null }, orderBy: { name: 'asc' } },
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  const allCompanies = await db.company.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })

  let orderCounts: Record<string, { count: number; total: number }> = {}
  if (withStats) {
    const agg = await db.order.groupBy({
      by: ['supplierId'],
      _count: { _all: true },
      _sum: { totalAmount: true },
      where: { status: { not: 'CANCELLED' } },
    })
    for (const g of agg) orderCounts[g.supplierId] = { count: g._count._all, total: g._sum.totalAmount || 0 }
  }

  return Response.json({
    suppliers: suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      contactName: s.contactName,
      type: s.type,
      paymentType: s.paymentType,
      notes: s.notes,
      active: s.active,
      companies: s.companies.map((c) => ({
        id: c.id,
        name: c.name,
        productCount: c.products.length,
        products: c.products.map((p) => ({
          id: p.id,
          name: p.name,
          barcode: p.barcode,
          price: p.price,
          cost: p.cost,
          stock: p.stock,
          minStock: p.minStock,
          unit: p.unit,
          category: p.category,
          image: p.image,
        })),
      })),
      orderCount: orderCounts[s.id]?.count || 0,
      totalSpend: orderCounts[s.id]?.total || 0,
    })),
    companies: allCompanies,
  })
}

// ==================== POST /api/suppliers — create supplier ====================
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canManageSuppliers(session.roles))
    return Response.json({ error: 'شما اجازه مدیریت تأمین‌کنندگان را ندارید' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const { name, phone, contactName, type, paymentType, notes, companyIds } = (body || {}) as {
    name?: string
    phone?: string
    contactName?: string
    type?: string
    paymentType?: string
    notes?: string
    companyIds?: string[]
  }

  if (!name || !name.trim()) return Response.json({ error: 'نام تأمین‌کننده الزامی است' }, { status: 400 })

  const dup = await db.supplier.findFirst({ where: { name: name.trim() } })
  if (dup) return Response.json({ error: 'تأمین‌کننده‌ای با این نام از قبل ثبت شده است' }, { status: 400 })

  const supplier = await db.supplier.create({
    data: {
      name: name.trim(),
      phone: phone || null,
      contactName: contactName || null,
      type: ['MANUFACTURER', 'DISTRIBUTOR', 'BOTH'].includes(type || '') ? type! : 'DISTRIBUTOR',
      paymentType: paymentType === 'CASH_ON_DELIVERY' ? 'CASH_ON_DELIVERY' : 'CHEQUE',
      notes: notes || null,
      companies: { connect: (companyIds || []).map((id) => ({ id })) },
    },
    include: { companies: true },
  })

  await logAudit(session.id, session.name, 'CREATE_SUPPLIER', 'SUPPLIER', supplier.id, {
    name: supplier.name,
    companies: supplier.companies.map((c) => c.name),
  })
  return Response.json(supplier)
}

// ==================== PATCH /api/suppliers — update supplier ====================
export async function PATCH(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canManageSuppliers(session.roles))
    return Response.json({ error: 'شما اجازه مدیریت تأمین‌کنندگان را ندارید' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const { id, name, phone, contactName, type, paymentType, notes, companyIds, active } = (body || {}) as {
    id?: string
    name?: string
    phone?: string
    contactName?: string
    type?: string
    paymentType?: string
    notes?: string
    companyIds?: string[]
    active?: boolean
  }

  if (!id) return Response.json({ error: 'شناسه تأمین‌کننده الزامی است' }, { status: 400 })
  const existing = await db.supplier.findUnique({ where: { id }, include: { companies: true } })
  if (!existing) return Response.json({ error: 'تأمین‌کننده یافت نشد' }, { status: 404 })
  if (name !== undefined && !name.trim()) return Response.json({ error: 'نام تأمین‌کننده نمی‌تواند خالی باشد' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = name.trim()
  if (phone !== undefined) data.phone = phone || null
  if (contactName !== undefined) data.contactName = contactName || null
  if (type !== undefined && ['MANUFACTURER', 'DISTRIBUTOR', 'BOTH'].includes(type)) data.type = type
  if (paymentType !== undefined && ['CASH_ON_DELIVERY', 'CHEQUE'].includes(paymentType)) data.paymentType = paymentType
  if (notes !== undefined) data.notes = notes || null
  if (active !== undefined) data.active = !!active
  if (companyIds !== undefined) {
    data.companies = { set: companyIds.map((cid) => ({ id: cid })) }
  }

  const supplier = await db.supplier.update({ where: { id }, data, include: { companies: true } })

  await logAudit(session.id, session.name, 'UPDATE_SUPPLIER', 'SUPPLIER', id, {
    name: supplier.name,
    companies: supplier.companies.map((c) => c.name),
  })
  return Response.json(supplier)
}
