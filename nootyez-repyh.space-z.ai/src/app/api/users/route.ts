import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/users → {users} (pin omitted), ordered by id
export async function GET() {
  try {
    const users = await db.user.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, roles: true, color: true, active: true, points: true, createdAt: true },
    })
    return NextResponse.json({ users })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/users {name,pin,roles,color}
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = String(body?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'نام الزامی است' }, { status: 400 })
    const user = await db.user.create({
      data: {
        name,
        pin: body?.pin != null && String(body.pin) !== '' ? String(body.pin) : '1234',
        roles: String(body?.roles ?? 'STAFF'),
        color: String(body?.color ?? '#5F7A4E'),
        active: body?.active === undefined ? true : Boolean(body.active),
      },
    })
    await db.auditLog.create({
      data: {
        userId: Number(body?.userId ?? user.id),
        userName: String(body?.userName ?? user.name),
        action: 'USER_CREATE',
        entity: 'User',
        entityId: user.id,
        detail: `کاربر جدید: ${user.name}`,
      },
    })
    const { pin: _pin, ...safe } = user
    return NextResponse.json(safe)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/users {id, ...fields} — pin '' means don't change pin
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const id = Number(body?.id)
    if (!id) return NextResponse.json({ error: 'شناسه کاربر الزامی است' }, { status: 400 })
    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 })
    const data: Record<string, unknown> = {}
    if (body?.name !== undefined) data.name = String(body.name).trim()
    if (body?.roles !== undefined) data.roles = String(body.roles)
    if (body?.color !== undefined) data.color = String(body.color)
    if (body?.active !== undefined) data.active = Boolean(body.active)
    if (body?.points !== undefined) data.points = Number(body.points)
    if (body?.pin !== undefined && String(body.pin) !== '') data.pin = String(body.pin)
    const user = await db.user.update({ where: { id }, data })
    await db.auditLog.create({
      data: {
        userId: Number(body?.userId ?? id),
        userName: String(body?.userName ?? existing.name),
        action: 'USER_UPDATE',
        entity: 'User',
        entityId: id,
        detail: `ویرایش کاربر ${existing.name} → ${user.name}`,
      },
    })
    const { pin: _pin, ...safe } = user
    return NextResponse.json(safe)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
