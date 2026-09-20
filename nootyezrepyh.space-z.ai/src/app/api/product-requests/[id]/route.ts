import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit } from '@/lib/audit'

function isManager(roles: string[]): boolean {
  return canUser(roles, PERMISSIONS.MANAGE_PRODUCTS) ||
    canUser(roles, PERMISSIONS.APPROVE_ORDERS) ||
    canUser(roles, PERMISSIONS.VIEW_REPORTS)
}

/** PATCH /api/product-requests/[id]  { status: 'APPROVED' | 'REJECTED' } — managers only */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!isManager(session.roles)) {
    return Response.json({ error: 'فقط مدیران می‌توانند پیشنهاد را بررسی کنند' }, { status: 403 })
  }
  const { id } = await ctx.params

  const body = (await req.json().catch(() => null)) as { status?: string } | null
  const status = String(body?.status || '')
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return Response.json({ error: 'وضعیت نامعتبر است' }, { status: 400 })
  }

  const request = await db.productRequest.findUnique({ where: { id } })
  if (!request) return Response.json({ error: 'پیشنهاد یافت نشد' }, { status: 404 })
  if (request.status !== 'PENDING') {
    return Response.json({ error: 'این پیشنهاد قبلاً بررسی شده است' }, { status: 400 })
  }

  const updated = await db.productRequest.update({
    where: { id },
    data: { status, reviewedById: session.id },
  })
  await logAudit(session.id, session.name, status === 'APPROVED' ? 'APPROVE_PRODUCT_REQUEST' : 'REJECT_PRODUCT_REQUEST', 'PRODUCT_REQUEST', id, {
    productName: request.productName,
    status,
  })

  return Response.json({ request: updated })
}
