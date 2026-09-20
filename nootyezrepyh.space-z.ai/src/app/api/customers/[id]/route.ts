import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

// GET /api/customers/[id] → detail + their sale orders history
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id } })
  if (!customer) return Response.json({ error: 'مشتری یافت نشد' }, { status: 404 })
  const orders = await db.saleOrder.findMany({
    where: { customerId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return Response.json({
    customer: { ...customer, preferences: customer.preferences },
    orders: orders.map((o) => ({ ...o, items: JSON.parse(o.items || '[]') })),
  })
}

// PATCH /api/customers/[id] { name?, phone?, birthday?, preferences?, notes? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.SALES_FLOOR) && !canUser(session.roles, PERMISSIONS.MANAGE_ORDERS)) {
    return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json().catch(() => null)
  const customer = await db.customer.findUnique({ where: { id } })
  if (!customer) return Response.json({ error: 'مشتری یافت نشد' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body?.name !== undefined) data.name = String(body.name).trim()
  if (body?.phone !== undefined) data.phone = body.phone ? String(body.phone) : null
  if (body?.birthday !== undefined) data.birthday = body.birthday ? String(body.birthday) : null
  if (body?.notes !== undefined) data.notes = body.notes ? String(body.notes) : null
  if (body?.preferences !== undefined) {
    if (Array.isArray(body.preferences)) data.preferences = body.preferences.filter(Boolean).join('، ')
    else data.preferences = body.preferences ? String(body.preferences) : null
  }

  const updated = await db.customer.update({ where: { id }, data })
  await logAudit(session.id, session.name, 'CUSTOMER_UPDATE', 'CUSTOMER', id, { fields: Object.keys(data) })
  return Response.json(updated)
}
