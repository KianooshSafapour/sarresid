import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

type PreOrderItem = { productId?: number | null; name: string; qty: number; sellPrice: number }

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

async function awardPoints(userId: number, points: number, reason: string, awardedById?: number | null) {
  await db.pointsLog.create({ data: { userId, points, reason, awardedById: awardedById ?? null } })
  await db.user.update({ where: { id: userId }, data: { points: { increment: points } } })
}

// attach salesperson / cashier users (no prisma relations on PreOrder)
async function withUsers<T extends { salespersonId: number; cashierId: number | null }>(preorders: T[]) {
  const ids = [...new Set(preorders.flatMap((p) => [p.salespersonId, ...(p.cashierId ? [p.cashierId] : [])]))]
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, color: true } })
  const umap = new Map(users.map((u) => [u.id, u]))
  return preorders.map((p) => ({
    ...p,
    salesperson: umap.get(p.salespersonId) ?? null,
    cashier: p.cashierId ? umap.get(p.cashierId) ?? null : null,
  }))
}

// GET /api/preorders?status=&salespersonId= → PENDING first, then createdAt desc
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const status = sp.get('status')
    const salespersonId = sp.get('salespersonId') ? Number(sp.get('salespersonId')) : null
    const where: { status?: string; salespersonId?: number } = {}
    if (status) where.status = status
    if (salespersonId) where.salespersonId = salespersonId

    const preorders = await db.preOrder.findMany({ where, orderBy: { createdAt: 'desc' } })
    preorders.sort((a, b) => {
      const pa = a.status === 'PENDING' ? 0 : 1
      const pb = b.status === 'PENDING' ? 0 : 1
      if (pa !== pb) return pa - pb
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    return NextResponse.json({
      preorders: (await withUsers(preorders)).map((p) => ({ ...p, items: JSON.parse(p.items || '[]') })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/preorders {customerId?, customerName, salespersonId, items:[{productId?,name,qty,sellPrice}], note?}
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const salespersonId = Number(b?.salespersonId)
    if (!salespersonId) return NextResponse.json({ error: 'فروشنده الزامی است' }, { status: 400 })
    const rawItems = Array.isArray(b?.items) ? b.items : []
    const items: PreOrderItem[] = rawItems
      .map((it: Record<string, unknown>) => ({
        productId: it?.productId ? Number(it.productId) : null,
        name: String(it?.name ?? '').trim(),
        qty: Number(it?.qty),
        sellPrice: Number(it?.sellPrice ?? 0),
      }))
      .filter((it: PreOrderItem) => it.name && Number.isFinite(it.qty) && it.qty > 0)
    if (!items.length) return NextResponse.json({ error: 'حداقل یک قلم کالا الزامی است' }, { status: 400 })

    const total = items.reduce((s, it) => s + it.qty * it.sellPrice, 0)
    const customerName = b?.customerName ? String(b.customerName) : null

    const preOrder = await db.preOrder.create({
      data: {
        customerId: b?.customerId ? Number(b.customerId) : null,
        customerName,
        salespersonId,
        items: JSON.stringify(items),
        total,
        note: b?.note ? String(b.note) : null,
      },
    })
    await notifyRoles(
      ['CASHIER'],
      'پیش‌صورتحساب جدید از فروشنده',
      `${customerName ?? 'مشتری'} — ${items.length} قلم — ${total.toLocaleString('fa-IR')} تومان`,
      'INFO',
      salespersonId
    )
    await audit(salespersonId, 'PREORDER_CREATE', 'PreOrder', preOrder.id, `${customerName ?? 'مشتری'} — ${items.length} قلم — ${total.toLocaleString('fa-IR')}`)
    const [withU] = await withUsers([preOrder])
    return NextResponse.json({ preorder: { ...withU, items } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/preorders {id, action:'prepare'|'done'|'cancel', cashierId?, userId}
export async function PATCH(request: Request) {
  try {
    const b = await request.json()
    const id = Number(b?.id)
    if (!id) return NextResponse.json({ error: 'شناسه پیش‌صورتحساب الزامی است' }, { status: 400 })
    const userId = Number(b?.userId ?? 0)
    const po = await db.preOrder.findUnique({ where: { id } })
    if (!po) return NextResponse.json({ error: 'پیش‌صورتحساب یافت نشد' }, { status: 400 })

    const action = String(b?.action ?? '')
    let data: Record<string, unknown> = {}
    let auditAction = 'PREORDER_UPDATE'
    let detail = ''

    switch (action) {
      case 'prepare': {
        const cashierId = Number(b?.cashierId) || po.cashierId
        if (!cashierId) return NextResponse.json({ error: 'صندوق‌دار الزامی است' }, { status: 400 })
        data = { status: 'PREPARED', cashierId }
        auditAction = 'PREORDER_PREPARE'
        detail = `آماده‌سازی پیش‌صورتحساب #${id} توسط صندوق`
        await db.notification.create({
          data: {
            userId: po.salespersonId,
            title: 'سفارش شما آماده شد',
            body: `${po.customerName ?? 'مشتری'} — مبلغ ${po.total.toLocaleString('fa-IR')} تومان`,
            type: 'SUCCESS',
          },
        })
        break
      }
      case 'done': {
        data = { status: 'DONE' }
        auditAction = 'PREORDER_DONE'
        // Idempotency guard: sales AND completion points are awarded only the first
        // time a preorder reaches DONE (proxy: Sale rows linked to this preorder).
        const existingSales = await db.sale.count({ where: { preOrderId: po.id } })
        if (existingSales === 0) {
          await awardPoints(po.salespersonId, 2, 'تکمیل فروش پیش‌صورتحساب', userId)
          detail = `تکمیل پیش‌صورتحساب #${id} (+۲ امتیاز به فروشنده)`
          const parsedItems: PreOrderItem[] = JSON.parse(po.items || '[]')
          const validItems = parsedItems.filter(
            (it) => it?.name && Number.isFinite(Number(it.qty)) && Number(it.qty) > 0
          )
          if (validItems.length) {
            await db.sale.createMany({
              data: validItems.map((it) => ({
                productId: it.productId ?? null,
                name: String(it.name),
                qty: Number(it.qty),
                unitPrice: Number(it.sellPrice ?? 0),
                total: Number(it.qty) * Number(it.sellPrice ?? 0),
                customerId: po.customerId,
                customerName: po.customerName,
                channel: 'PREORDER',
                salespersonId: po.salespersonId,
                cashierId: userId || po.cashierId,
                preOrderId: po.id,
              })),
            })
            detail += ` — ${validItems.length} قلم فروش خودکار ثبت شد`
          }
        } else {
          detail = `تکمیل مجدد پیش‌صورتحساب #${id} — امتیاز و فروش قبلاً ثبت شده بود (تکراری)`
        }
        break
      }
      case 'cancel': {
        data = { status: 'CANCELLED' }
        auditAction = 'PREORDER_CANCEL'
        detail = `لغو پیش‌صورتحساب #${id}`
        break
      }
      default:
        return NextResponse.json({ error: 'اکشن نامعتبر است' }, { status: 400 })
    }

    const updated = await db.preOrder.update({ where: { id }, data })
    await audit(userId, auditAction, 'PreOrder', id, detail)
    const [withU] = await withUsers([updated])
    return NextResponse.json({ preorder: { ...withU, items: JSON.parse(withU.items || '[]') } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
