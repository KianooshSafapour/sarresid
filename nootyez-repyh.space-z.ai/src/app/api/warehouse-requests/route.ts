import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

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

async function notifyRoles(roles: string[], title: string, body?: string, type = 'INFO', excludeUserId?: number) {
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, roles: true } })
  const targets = users.filter(
    (u) => u.id !== excludeUserId && roles.some((r) => u.roles.split(',').map((s) => s.trim()).includes(r))
  )
  if (targets.length)
    await db.notification.createMany({
      data: targets.map((u) => ({ userId: u.id, title, body: body ?? null, type })),
    })
}

// GET /api/warehouse-requests → OPEN first, then createdAt desc
export async function GET() {
  try {
    const requests = await db.warehouseRequest.findMany({ orderBy: { createdAt: 'desc' } })
    const productIds = [...new Set(requests.map((r) => r.productId))]
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sellPrice: true, stock: true },
    })
    const pmap = new Map(products.map((p) => [p.id, p]))
    const userIds = [...new Set(requests.map((r) => r.requestedById))]
    const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    const umap = new Map(users.map((u) => [u.id, u]))

    const out = requests
      .map((r) => ({
        ...r,
        product: pmap.get(r.productId) ?? null,
        requestedBy: umap.get(r.requestedById) ?? null,
      }))
      .sort((a, b) => {
        const oa = a.status === 'OPEN' ? 0 : 1
        const ob = b.status === 'OPEN' ? 0 : 1
        if (oa !== ob) return oa - ob
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
    return NextResponse.json({ requests: out })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/warehouse-requests {productId, qty, requestedById, note?}
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const productId = Number(b?.productId)
    const qty = Number(b?.qty)
    const requestedById = Number(b?.requestedById ?? 0)
    if (!productId) return NextResponse.json({ error: 'کالا الزامی است' }, { status: 400 })
    if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: 'تعداد باید بزرگ‌تر از صفر باشد' }, { status: 400 })

    const product = await db.product.findUnique({ where: { id: productId } })
    if (!product) return NextResponse.json({ error: 'کالا یافت نشد' }, { status: 400 })

    const wr = await db.warehouseRequest.create({
      data: {
        productId,
        qty,
        requestedById,
        note: b?.note ? String(b.note) : null,
      },
    })
    await notifyRoles(
      ['INVENTORY_SUPERVISOR'],
      'درخواست انبار جدید',
      `${product.name} × ${qty.toLocaleString('fa-IR')}`,
      'INFO',
      requestedById
    )
    await audit(requestedById, 'WAREHOUSE_REQUEST_CREATE', 'WarehouseRequest', wr.id, `${product.name} × ${qty}`)
    return NextResponse.json({ request: wr })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/warehouse-requests {id, action:'prepare'|'receive'|'cancel', userId}
export async function PATCH(request: Request) {
  try {
    const b = await request.json()
    const id = Number(b?.id)
    if (!id) return NextResponse.json({ error: 'شناسه درخواست الزامی است' }, { status: 400 })
    const userId = Number(b?.userId ?? 0)
    const wr = await db.warehouseRequest.findUnique({ where: { id } })
    if (!wr) return NextResponse.json({ error: 'درخواست یافت نشد' }, { status: 400 })

    const action = String(b?.action ?? '')
    let data: Record<string, unknown> = {}
    let auditAction = 'WAREHOUSE_REQUEST_UPDATE'
    let detail = ''

    switch (action) {
      case 'prepare': {
        data = { status: 'PREPARED', preparedAt: new Date() }
        auditAction = 'WAREHOUSE_REQUEST_PREPARE'
        detail = `آماده‌سازی درخواست #${id}`
        await db.notification.create({
          data: { userId: wr.requestedById, title: 'درخواست آماده شد', body: `درخواست #${id} در انبار آماده تحویل است`, type: 'SUCCESS' },
        })
        break
      }
      case 'receive': {
        data = { status: 'RECEIVED' }
        auditAction = 'WAREHOUSE_REQUEST_RECEIVE'
        detail = `تحویل و دریافت درخواست #${id} — افزایش موجودی به اندازه ${wr.qty}`
        await db.product.update({ where: { id: wr.productId }, data: { stock: { increment: wr.qty } } })
        break
      }
      case 'cancel': {
        data = { status: 'CANCELLED' }
        auditAction = 'WAREHOUSE_REQUEST_CANCEL'
        detail = `لغو درخواست #${id}`
        break
      }
      default:
        return NextResponse.json({ error: 'اکشن نامعتبر است' }, { status: 400 })
    }

    const updated = await db.warehouseRequest.update({ where: { id }, data })
    await audit(userId, auditAction, 'WarehouseRequest', id, detail)
    return NextResponse.json({ request: updated })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
