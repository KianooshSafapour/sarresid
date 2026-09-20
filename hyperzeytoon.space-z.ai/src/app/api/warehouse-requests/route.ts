import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity, notifyRoles, notify } from '@/lib/server-utils'

async function grantAward(userId: string, points: number, reason: string) {
  await db.award.create({ data: { userId, points, reason } })
  await db.user.update({ where: { id: userId }, data: { points: { increment: points } } })
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const isInventory = user.roleKeys.includes('inventory')

  // merchandiser: own + still-open ; inventory & managers: everything
  const requests = await db.warehouseRequest.findMany({
    where: isInventory || user.isManager
      ? undefined
      : {
          OR: [
            { requestedById: user.id },
            { status: { in: ['PENDING', 'PREPARING', 'SENT'] } },
          ],
        },
    include: {
      product: { select: { id: true, name: true, unit: true, stock: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const requesterIds = Array.from(new Set(requests.map((r) => r.requestedById)))
  const requesters = requesterIds.length
    ? await db.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true, color: true } })
    : []
  return ok({
    requests: requests.map((r) => ({
      ...r,
      requesterName: requesters.find((u) => u.id === r.requestedById)?.name ?? null,
      requesterColor: requesters.find((u) => u.id === r.requestedById)?.color ?? null,
    })),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!user.isManager && !user.roleKeys.some((k) => ['merchandiser', 'sales'].includes(k)))
    return fail('دسترسی غیرمجاز', 403)
  const body = (await req.json().catch(() => ({}))) as { productId?: string; qty?: number; note?: string }
  if (!body.productId || !body.qty || body.qty <= 0) return fail('کالا و تعداد الزامی است')
  const product = await db.product.findUnique({ where: { id: body.productId } })
  if (!product) return fail('کالا یافت نشد', 404)

  const created = await db.warehouseRequest.create({
    data: {
      productId: body.productId,
      qty: body.qty,
      requestedById: user.id,
      note: body.note?.trim() || null,
    },
  })
  await notifyRoles(['inventory'], 'درخواست جنس از انبار 📦', `${product.name} — ${body.qty} ${product.unit}`, 'INFO', 'floor', user.id)
  await logActivity(user.id, user.name, 'ثبت درخواست انبار', 'WarehouseRequest', created.id, `${product.name} × ${body.qty}`)
  return ok({ success: true, id: created.id })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string }
  if (!body.id || !body.status) return fail('داده ناقص است')
  const request = await db.warehouseRequest.findUnique({
    where: { id: body.id },
    include: { product: { select: { name: true, unit: true } } },
  })
  if (!request) return fail('درخواست یافت نشد', 404)

  const isInventory = user.roleKeys.includes('inventory') || user.isManager
  const isRequester = request.requestedById === user.id
  const status = body.status

  const data: Record<string, unknown> = { status }

  if (['PREPARING', 'SENT'].includes(status)) {
    if (!isInventory) return fail('این مرحله با انباردار است', 403)
    if (request.status !== 'PENDING' && request.status !== 'PREPARING')
      return fail('این درخواست در مرحله قابل تغییر نیست')
    if (status === 'SENT' && request.status !== 'PREPARING') return fail('اول «آماده‌سازی» را بزنید')
    data.handledById = user.id
  } else if (status === 'DELIVERED') {
    if (!isRequester && !user.isManager) return fail('فقط درخواست‌دهنده تحویل را تأیید می‌کند', 403)
    if (request.status !== 'SENT') return fail('انباردار هنوز ارسال نکرده است')
  } else {
    return fail('وضعیت نامعتبر است', 403)
  }

  await db.warehouseRequest.update({ where: { id: request.id }, data })

  // delivery confirmation → +2 to both the handler and the requester 🎉
  if (status === 'DELIVERED') {
    const reason = `تحویل درخواست انبار: ${request.product.name}`
    await grantAward(request.requestedById, 2, reason)
    if (request.handledById) await grantAward(request.handledById, 2, reason)
    await notify(request.requestedById, 'آفرین! +۲ امتیاز ⭐', `${request.product.name} تحویل شد`, 'SUCCESS', 'floor')
    if (request.handledById) {
      await notify(request.handledById, 'آفرین! +۲ امتیاز ⭐', `${request.product.name} تحویل شد`, 'SUCCESS', 'floor')
    }
  } else if (status === 'SENT' && request.requestedById !== user.id) {
    await notify(request.requestedById, 'درخواستت از انبار ارسال شد 🚚', `${request.product.name} در راه قفسه است`, 'INFO', 'floor')
  }

  await logActivity(user.id, user.name, 'بروزرسانی درخواست انبار', 'WarehouseRequest', request.id, `${request.product.name} → ${status}`)
  return ok({ success: true })
}
