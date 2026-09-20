import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit } from '@/lib/audit'

const VALID = ['OPEN', 'ORDERED', 'RESOLVED']

function isManager(roles: string[]): boolean {
  return canUser(roles, PERMISSIONS.MANAGE_ORDERS) ||
    canUser(roles, PERMISSIONS.MANAGE_PRODUCTS) ||
    canUser(roles, PERMISSIONS.APPROVE_ORDERS) ||
    canUser(roles, PERMISSIONS.VIEW_REPORTS)
}

/** PATCH /api/customer-requests/[id]  { status: 'OPEN' | 'ORDERED' | 'RESOLVED' } — managers only */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!isManager(session.roles)) {
    return Response.json({ error: 'فقط مدیران می‌توانند وضعیت را تغییر دهند' }, { status: 403 })
  }
  const { id } = await ctx.params

  const body = (await req.json().catch(() => null)) as { status?: string } | null
  const status = String(body?.status || '')
  if (!VALID.includes(status)) {
    return Response.json({ error: 'وضعیت نامعتبر است' }, { status: 400 })
  }

  const request = await db.customerRequest.findUnique({ where: { id } })
  if (!request) return Response.json({ error: 'درخواست یافت نشد' }, { status: 404 })

  const updated = await db.customerRequest.update({ where: { id }, data: { status } })
  await logAudit(session.id, session.name, 'UPDATE_CUSTOMER_REQUEST', 'CUSTOMER_REQUEST', id, {
    productName: request.productName,
    from: request.status,
    to: status,
  })

  return Response.json({ request: updated })
}
