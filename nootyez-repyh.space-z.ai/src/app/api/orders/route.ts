import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const ACTIVE_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'CONFIRMED']

// users having any of the given roles (active only)
async function usersWithRoles(roles: string[]) {
  const users = await db.user.findMany({ where: { active: true } })
  return users.filter((u) => u.roles.split(',').some((r) => roles.includes(r.trim())))
}

// GET /api/orders?status=&supplierId=&active=1&code=HZ-1005
// `code` = exact unique-code lookup (used by the deliveries scan-in box to
// resolve a scanned order code even when it is not in any loaded status list).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')?.trim() ?? ''
    const supplierId = searchParams.get('supplierId')?.trim() ?? ''
    const active = searchParams.get('active') === '1'
    const code = searchParams.get('code')?.trim().toUpperCase() ?? ''

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (supplierId) where.supplierId = Number(supplierId)
    if (active) where.status = { in: ACTIVE_STATUSES }
    if (code) where.code = code

    const orders = await db.order.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, paymentTerms: true, chequeDays: true } },
        items: { select: { qty: true, deliveredQty: true, confirmedQty: true, unitCost: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ orders })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/orders {supplierId, createdById, receivingDate, paymentType, note, status, items:[...]}
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supplierId = Number(body?.supplierId)
    const createdById = Number(body?.createdById ?? body?.userId ?? 0)
    if (!supplierId) return NextResponse.json({ error: 'تأمین‌کننده الزامی است' }, { status: 400 })
    const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
    if (!supplier) return NextResponse.json({ error: 'تأمین‌کننده یافت نشد' }, { status: 404 })

    const creator = await db.user.findUnique({ where: { id: createdById } })
    const creatorName = creator?.name ?? 'سیستم'

    const status = body?.status === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT'
    const receivingDate = body?.receivingDate ? new Date(body.receivingDate) : new Date()
    const paymentType = String(body?.paymentType ?? supplier.paymentTerms ?? 'CHEQUE')
    const items: Array<{ productId?: number; name: string; barcode?: string; qty: number; unitCost: number; sellPrice: number }> =
      Array.isArray(body?.items) ? body.items : []

    const subtotal = items.reduce((s, it) => s + Number(it.qty ?? 0) * Number(it.unitCost ?? 0), 0)

    // code generation: HZ-(1000 + count + 1), retry on unique clash
    const count = await db.order.count()
    let code = `HZ-${1000 + count + 1}`
    let clash = await db.order.findUnique({ where: { code } })
    let attempt = 0
    while (clash && attempt < 50) {
      attempt++
      code = `HZ-${1000 + count + 1 + attempt}`
      clash = await db.order.findUnique({ where: { code } })
    }

    const order = await db.order.create({
      data: {
        code,
        supplierId,
        createdById,
        status,
        paymentType,
        receivingDate: isNaN(receivingDate.getTime()) ? new Date() : receivingDate,
        note: body?.note ? String(body.note) : null,
        subtotal,
        total: subtotal,
        items: {
          create: items.map((it) => ({
            productId: it.productId ? Number(it.productId) : null,
            name: String(it.name ?? ''),
            barcode: it.barcode ? String(it.barcode) : null,
            qty: Number(it.qty ?? 0),
            unitCost: Number(it.unitCost ?? 0),
            sellPrice: Number(it.sellPrice ?? 0),
          })),
        },
        events: {
          create: {
            userName: creatorName,
            action: 'CREATED',
            detail: `سفارش با ${items.length} قلم ثبت شد`,
          },
        },
      },
      include: {
        supplier: { select: { id: true, name: true, paymentTerms: true, chequeDays: true } },
        items: true,
        events: true,
      },
    })

    await db.auditLog.create({
      data: {
        userId: createdById,
        userName: creatorName,
        action: 'ORDER_CREATE',
        entity: 'Order',
        entityId: order.id,
        detail: `سفارش ${order.code} برای ${supplier.name} با ${items.length} قلم`,
      },
    })

    if (status === 'SUBMITTED') {
      const gms = await usersWithRoles(['GENERAL_MANAGER'])
      if (gms.length) {
        await db.notification.createMany({
          data: gms.map((u) => ({
            userId: u.id,
            title: 'سفارش جدید',
            body: `Order ${order.code} awaiting approval`,
            type: 'INFO',
          })),
        })
      }
    }

    return NextResponse.json(order)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
