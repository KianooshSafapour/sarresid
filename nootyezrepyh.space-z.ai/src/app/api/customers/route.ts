import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

// GET /api/customers?q=علی&limit=50 — search by name/phone
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()
  const limit = Math.min(+(sp.get('limit') || 60), 200)

  const customers = await db.customer.findMany({
    where: q
      ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }] }
      : {},
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return Response.json(customers)
}

// POST /api/customers { name, phone?, birthday?, preferences?, notes? }
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.SALES_FLOOR) && !canUser(session.roles, PERMISSIONS.MANAGE_ORDERS)) {
    return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  const name = String(body?.name || '').trim()
  if (!name) return Response.json({ error: 'نام مشتری الزامی است' }, { status: 400 })

  // preferences may arrive as array of chips or free text
  let preferences: string | null = null
  if (Array.isArray(body?.preferences)) preferences = body.preferences.filter(Boolean).join('، ')
  else if (body?.preferences) preferences = String(body.preferences)

  const customer = await db.customer.create({
    data: {
      name,
      phone: body?.phone ? String(body.phone) : null,
      birthday: body?.birthday ? String(body.birthday) : null,
      preferences,
      notes: body?.notes ? String(body.notes) : null,
      createdById: session.id,
    },
  })
  await logAudit(session.id, session.name, 'CUSTOMER_CREATE', 'CUSTOMER', customer.id, { name })
  return Response.json(customer)
}
