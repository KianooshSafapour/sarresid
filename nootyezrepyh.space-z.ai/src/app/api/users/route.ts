import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { ROLE_PERMISSIONS } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const users = await db.user.findMany({ orderBy: { name: 'asc' } })
  return Response.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      roles: JSON.parse(u.roles),
      primaryRole: u.primaryRole,
      color: u.color,
      active: u.active,
      points: u.points,
      phone: u.phone,
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!session.roles.includes('IT_ADMIN') && !session.roles.includes('OPERATION_MANAGER') && !session.roles.includes('GENERAL_MANAGER')) {
    return Response.json({ error: 'فقط مدیر سیستم مجاز است' }, { status: 403 })
  }
  const body = await req.json()
  const { name, pin, roles, primaryRole, color, phone } = body
  if (!name || !pin || !roles?.length) return Response.json({ error: 'نام، رمز و نقش الزامی است' }, { status: 400 })
  const user = await db.user.create({
    data: {
      name,
      pinHash: await bcrypt.hash(String(pin), 10),
      roles: JSON.stringify(roles),
      primaryRole: primaryRole || roles[0],
      color: color || '#5a7d4f',
      phone: phone || null,
    },
  })
  await logAudit(session.id, session.name, 'CREATE_USER', 'USER', user.id, { name })
  return Response.json({ id: user.id })
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const body = await req.json()
  const { id, name, pin, roles, primaryRole, color, phone, active } = body
  if (!id) return Response.json({ error: 'شناسه کاربر الزامی است' }, { status: 400 })
  const isSelf = session.id === id
  const isAdmin = session.roles.includes('IT_ADMIN') || session.roles.includes('OPERATION_MANAGER') || session.roles.includes('GENERAL_MANAGER')
  if (!isSelf && !isAdmin) return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = name
  if (color !== undefined) data.color = color
  if (phone !== undefined) data.phone = phone
  if (pin) data.pinHash = await bcrypt.hash(String(pin), 10)
  if (isAdmin && roles !== undefined) {
    data.roles = JSON.stringify(roles)
    data.primaryRole = primaryRole || roles[0]
  }
  if (isAdmin && active !== undefined) data.active = active

  await db.user.update({ where: { id }, data })
  await logAudit(session.id, session.name, 'UPDATE_USER', 'USER', id, { fields: Object.keys(data) })
  return Response.json({ ok: true })
}
