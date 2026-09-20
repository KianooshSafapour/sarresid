import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireManager, fail, ok, logActivity } from '@/lib/server-utils'
import { hashPin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const [roles, users] = await Promise.all([
    db.role.findMany({ orderBy: { name: 'asc' } }),
    db.user.findMany({
      include: { roles: { include: { role: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    }),
  ])
  return ok({
    roles,
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      title: u.title,
      color: u.color,
      phone: u.phone,
      active: u.active,
      points: u.points,
      isRoot: u.isRoot === true,
      isAdmin: u.roles.some((ur) => ur.role.key === 'it_admin'),
      roles: u.roles.map((ur) => ({ key: ur.role.key, name: ur.role.name, isManager: ur.role.isManager, color: ur.role.color })),
    })),
  })
}

// create user
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.isManager) return fail('دسترسی غیرمجاز', 403)
  const body = (await req.json()) as {
    username: string; name: string; title: string; pin: string; phone?: string;
    color?: string; gender?: string; roleKeys: string[]
  }
  if (!body.username || !body.name || !body.pin) return fail('نام کاربری، نام و رمز الزامی است')
  const exists = await db.user.findUnique({ where: { username: body.username } })
  if (exists) return fail('این نام کاربری قبلاً ثبت شده است')
  const created = await db.user.create({
    data: {
      username: body.username,
      name: body.name,
      title: body.title || 'همکار',
      gender: body.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
      pin: hashPin(body.pin),
      phone: body.phone || null,
      color: body.color || '#3E7C59',
      roles: { create: body.roleKeys.map((rk) => ({ roleId: rk })) },
    },
  })
  await logActivity(user.id, user.name, 'ایجاد کاربر', 'User', created.id, body.name)
  return ok({ success: true, id: created.id })
}

// update user (roles, active, pin, profile, admin grant/revoke)
export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json()) as {
    id: string; name?: string; title?: string; phone?: string; color?: string; gender?: string;
    pin?: string; active?: boolean; roleKeys?: string[];
    action?: 'grant_admin' | 'revoke_admin'
  }
  const isSelf = body.id === user.id
  if (!user.isManager && !isSelf) return fail('دسترسی غیرمجاز', 403)

  // ---- it_admin grant/revoke — ROOT ADMINISTRATOR only ----
  if (body.action === 'grant_admin' || body.action === 'revoke_admin') {
    if (user.isRoot !== true)
      return fail('تنها مدیر ارشد سامانه می‌تواند دسترسی مدیریت سامانه را تغییر دهد', 403)
    const target = await db.user.findUnique({
      where: { id: body.id },
      include: { roles: { include: { role: true } } },
    })
    if (!target) return fail('کاربر یافت نشد', 404)
    const itAdminRole = await db.role.findUnique({ where: { key: 'it_admin' } })
    if (!itAdminRole) return fail('نقش «مدیر سامانه» در سامانه یافت نشد', 400)
    if (body.action === 'grant_admin') {
      const has = target.roles.some((ur) => ur.role.key === 'it_admin')
      if (!has) {
        await db.userRole.create({ data: { userId: target.id, roleId: itAdminRole.id } })
        await logActivity(user.id, user.name, 'اعطای دسترسی مدیریت سامانه', 'User', target.id, target.name)
      }
      return ok({ success: true, isAdmin: true })
    }
    // revoke_admin — hard guards: root accounts and self-revoke are immutable
    if (target.isRoot === true) return fail('حساب مدیر ارشد سامانه قابل سلب نیست', 403)
    if (target.id === user.id) return fail('سلب دسترسی مدیریتی از حساب خودتان امکان‌پذیر نیست', 403)
    await db.userRole.deleteMany({ where: { userId: target.id, roleId: itAdminRole.id } })
    await logActivity(user.id, user.name, 'سلب دسترسی مدیریت سامانه', 'User', target.id, target.name)
    return ok({ success: true, isAdmin: false })
  }

  const data: Record<string, unknown> = {}
  if (body.name) data.name = body.name
  if (body.title && user.isManager) data.title = body.title
  if (body.gender && user.isManager) data.gender = body.gender === 'FEMALE' ? 'FEMALE' : 'MALE'
  if (body.phone !== undefined) data.phone = body.phone || null
  if (body.color && user.isManager) data.color = body.color
  if (body.pin) data.pin = hashPin(body.pin)
  if (body.active !== undefined && user.isManager) data.active = body.active

  await db.user.update({ where: { id: body.id }, data })

  if (body.roleKeys && user.isManager) {
    await db.userRole.deleteMany({ where: { userId: body.id } })
    await db.userRole.createMany({ data: body.roleKeys.map((rk) => ({ userId: body.id, roleId: rk })) })
  }
  await logActivity(user.id, user.name, 'ویرایش کاربر', 'User', body.id)
  return ok({ success: true })
}

// create / update role
export async function PUT(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.isManager) return fail('دسترسی غیرمجاز', 403)
  const body = (await req.json()) as {
    key?: string; id?: string; name: string; description?: string; color?: string; isManager?: boolean
  }
  if (body.id) {
    await db.role.update({
      where: { id: body.id },
      data: { name: body.name, description: body.description ?? null, color: body.color, isManager: body.isManager ?? false },
    })
    await logActivity(user.id, user.name, 'ویرایش نقش', 'Role', body.id, body.name)
  } else {
    if (!body.key || !body.name) return fail('کلید و نام نقش الزامی است')
    const exists = await db.role.findUnique({ where: { key: body.key } })
    if (exists) return fail('این کلید نقش تکراری است')
    await db.role.create({
      data: { key: body.key, name: body.name, description: body.description ?? null, color: body.color ?? '#3E7C59', isManager: body.isManager ?? false },
    })
    await logActivity(user.id, user.name, 'ایجاد نقش', 'Role', body.key, body.name)
  }
  return ok({ success: true })
}
