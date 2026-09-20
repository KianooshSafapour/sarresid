import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { ACTIVITY_TYPES } from '@/lib/constants'
import { logAudit } from '@/lib/audit'

const RECEIVE_POINTS = 2

function isStorekeeper(roles: string[]): boolean {
  return roles.includes('INVENTORY_SUPERVISOR') ||
    roles.includes('GENERAL_MANAGER') ||
    roles.includes('OPERATION_MANAGER')
}

/**
 * PATCH /api/warehouse-requests/[id]  { action: 'prepare' | 'send' | 'receive' }
 * Flow: PENDING → (prepare, storekeeper) PREPARED → (send, storekeeper) SENT → (receive, requester) RECEIVED
 * On receive the merchandiser earns +2 points (Activity SHELF_STOCK, note 'بررسی انبار').
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await ctx.params

  const body = (await req.json().catch(() => null)) as { action?: string } | null
  const action = body?.action
  if (!action || !['prepare', 'send', 'receive'].includes(action)) {
    return Response.json({ error: 'عملیات نامعتبر است' }, { status: 400 })
  }

  const request = await db.warehouseRequest.findUnique({ where: { id } })
  if (!request) return Response.json({ error: 'درخواست یافت نشد' }, { status: 404 })

  let updated
  if (action === 'prepare') {
    if (!isStorekeeper(session.roles)) {
      return Response.json({ error: 'فقط سرپرست انبار می‌تواند آماده‌سازی را ثبت کند' }, { status: 403 })
    }
    if (request.status !== 'PENDING') {
      return Response.json({ error: 'این درخواست در وضعیت مناسبی برای آماده‌سازی نیست' }, { status: 400 })
    }
    updated = await db.warehouseRequest.update({
      where: { id },
      data: { status: 'PREPARED', preparedById: session.id },
    })
    await logAudit(session.id, session.name, 'WAREHOUSE_PREPARED', 'WAREHOUSE_REQUEST', id, {
      productName: request.productName,
      quantity: request.quantity,
    })
  } else if (action === 'send') {
    if (!isStorekeeper(session.roles)) {
      return Response.json({ error: 'فقط سرپرست انبار می‌تواند ارسال را ثبت کند' }, { status: 403 })
    }
    if (request.status !== 'PREPARED') {
      return Response.json({ error: 'اول باید آماده‌سازی ثبت شود' }, { status: 400 })
    }
    updated = await db.warehouseRequest.update({
      where: { id },
      data: { status: 'SENT' },
    })
    await logAudit(session.id, session.name, 'WAREHOUSE_SENT', 'WAREHOUSE_REQUEST', id, {
      productName: request.productName,
      quantity: request.quantity,
      toUserId: request.requestedById,
    })
  } else {
    // receive — only the requester
    if (request.requestedById !== session.id) {
      return Response.json({ error: 'فقط درخواست‌دهنده می‌تواند دریافت را تأیید کند' }, { status: 403 })
    }
    if (request.status !== 'SENT') {
      return Response.json({ error: 'این درخواست هنوز به طبقه ارسال نشده است' }, { status: 400 })
    }
    updated = await db.warehouseRequest.update({
      where: { id },
      data: { status: 'RECEIVED' },
    })
    // +2 points server-side
    await db.activity.create({
      data: {
        userId: session.id,
        type: 'SHELF_STOCK',
        title: `دریافت «${request.productName}» از انبار`,
        points: RECEIVE_POINTS,
        note: 'بررسی انبار',
      },
    })
    await db.user.update({ where: { id: session.id }, data: { points: { increment: RECEIVE_POINTS } } })
    await logAudit(session.id, session.name, 'WAREHOUSE_RECEIVED', 'WAREHOUSE_REQUEST', id, {
      productName: request.productName,
      quantity: request.quantity,
      points: RECEIVE_POINTS,
      activityType: ACTIVITY_TYPES.SHELF_STOCK.label,
    })
  }

  return Response.json({ request: updated })
}
