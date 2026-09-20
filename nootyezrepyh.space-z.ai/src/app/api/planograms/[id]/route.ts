import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS, ACTIVITY_TYPES } from '@/lib/constants'
import { logAudit } from '@/lib/audit'
import { planogramOut } from '../route'

const SHELF_STOCK_POINTS = ACTIVITY_TYPES.SHELF_STOCK?.defaultPoints ?? 6

async function userMap() {
  const users = await db.user.findMany({ select: { id: true, name: true, color: true } })
  return new Map(users.map((u) => [u.id, u]))
}

function canEditPlanogram(session: { id: string; roles: string[] }, p: { createdById: string; assignedTo: string | null }): boolean {
  return canUser(session.roles, PERMISSIONS.MANAGE_PLANOGRAM) || p.createdById === session.id || p.assignedTo === session.id
}

// ============ GET: detail with products in cells ============

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await ctx.params

  const planogram = await db.planogram.findUnique({ where: { id } })
  if (!planogram) return Response.json({ error: 'پلانوگرام یافت نشد' }, { status: 404 })
  if (!canEditPlanogram(session, planogram)) {
    return Response.json({ error: 'این پلانوگرام به شما اختصاص ندارد' }, { status: 403 })
  }

  let cells: (string | null)[] = []
  try { cells = JSON.parse(planogram.cells || '[]') } catch { cells = [] }
  const productIds = Array.from(new Set(cells.filter(Boolean) as string[]))

  const products = productIds.length
    ? await db.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, stock: true, minStock: true, unit: true, price: true, image: true },
      })
    : []

  const um = await userMap()
  return Response.json({ planogram: planogramOut(planogram, um), products })
}

// ============ PATCH: cells / publish / done / rename ============

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await ctx.params

  const body = (await req.json().catch(() => null)) as
    { cells?: unknown; publish?: boolean; assignedTo?: string; status?: string; name?: string } | null
  if (!body) return Response.json({ error: 'درخواست نامعتبر است' }, { status: 400 })

  const planogram = await db.planogram.findUnique({ where: { id } })
  if (!planogram) return Response.json({ error: 'پلانوگرام یافت نشد' }, { status: 404 })

  const data: Record<string, unknown> = {}

  // --- save cells ---
  if (body.cells !== undefined) {
    if (!canEditPlanogram(session, planogram)) {
      return Response.json({ error: 'اجازه ویرایش این پلانوگرام را ندارید' }, { status: 403 })
    }
    let cells: (string | null)[] = []
    if (Array.isArray(body.cells)) {
      cells = body.cells.map((c) => (typeof c === 'string' && c ? c : null))
    }
    if (cells.length !== planogram.rows * planogram.cols) {
      return Response.json({ error: 'تعداد خانه‌ها با ابعاد پلانوگرام مطابقت ندارد' }, { status: 400 })
    }
    data.cells = JSON.stringify(cells)
  }

  // --- rename ---
  if (body.name !== undefined) {
    if (!canEditPlanogram(session, planogram)) {
      return Response.json({ error: 'اجازه ویرایش این پلانوگرام را ندارید' }, { status: 403 })
    }
    const name = String(body.name).trim()
    if (!name) return Response.json({ error: 'نام نمی‌تواند خالی باشد' }, { status: 400 })
    data.name = name
  }

  // --- publish (manager only) ---
  if (body.publish) {
    if (!canUser(session.roles, PERMISSIONS.MANAGE_PLANOGRAM)) {
      return Response.json({ error: 'اجازه انتشار پلانوگرام را ندارید' }, { status: 403 })
    }
    const assignedTo = String(body.assignedTo || '').trim()
    if (!assignedTo) return Response.json({ error: 'انتخاب چیدمان‌دار الزامی است' }, { status: 400 })
    const assignee = await db.user.findUnique({ where: { id: assignedTo } })
    if (!assignee || !assignee.active) {
      return Response.json({ error: 'چیدمان‌دار انتخاب‌شده معتبر نیست' }, { status: 400 })
    }
    let roles: string[] = []
    try { roles = JSON.parse(assignee.roles || '[]') } catch { roles = [] }
    if (!roles.includes('MERCHANDISER')) {
      return Response.json({ error: 'کاربر انتخاب‌شده چیدمان‌دار نیست' }, { status: 400 })
    }
    data.status = 'PUBLISHED'
    data.assignedTo = assignedTo
  }

  // --- mark done (assigned merchandiser or manager) → SHELF_STOCK activity + points ---
  if (body.status === 'DONE') {
    const allowed = planogram.assignedTo === session.id ||
      canUser(session.roles, PERMISSIONS.MANAGE_PLANOGRAM) ||
      planogram.createdById === session.id
    if (!allowed) {
      return Response.json({ error: 'فقط چیدمان‌دار مسئول می‌تواند پلانوگرام را تمام‌شده علامت بزند' }, { status: 403 })
    }
    if (planogram.status === 'DONE') {
      return Response.json({ error: 'این پلانوگرام قبلاً تکمیل شده است' }, { status: 400 })
    }
    data.status = 'DONE'

    // award points server-side only
    await db.activity.create({
      data: {
        userId: session.id,
        type: 'SHELF_STOCK',
        title: `چیدمان پلانوگرام «${planogram.name}»`,
        points: SHELF_STOCK_POINTS,
        note: 'چیدمان قفسه طبق پلانوگرام انجام شد',
      },
    })
    await db.user.update({ where: { id: session.id }, data: { points: { increment: SHELF_STOCK_POINTS } } })
    await logAudit(session.id, session.name, 'DONE_PLANOGRAM', 'PLANOGRAM', id, {
      name: planogram.name,
      points: SHELF_STOCK_POINTS,
    })
  } else if (body.status !== undefined && body.status !== 'DONE') {
    return Response.json({ error: 'وضعیت نامعتبر است' }, { status: 400 })
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'چیزی برای بروزرسانی ارسال نشده است' }, { status: 400 })
  }

  const updated = await db.planogram.update({ where: { id }, data: data as never })

  if (!body.status) {
    // audit for non-done mutations (done already logged)
    if (body.publish) {
      await logAudit(session.id, session.name, 'PUBLISH_PLANOGRAM', 'PLANOGRAM', id, {
        name: updated.name,
        assignedTo: updated.assignedTo,
      })
    } else {
      await logAudit(session.id, session.name, 'UPDATE_PLANOGRAM', 'PLANOGRAM', id, {
        fields: Object.keys(data),
        name: updated.name,
      })
    }
  }

  const um = await userMap()
  return Response.json({ planogram: planogramOut(updated, um) })
}

// ============ DELETE (manager) ============

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_PLANOGRAM)) {
    return Response.json({ error: 'اجازه مدیریت پلانوگرام را ندارید' }, { status: 403 })
  }
  const { id } = await ctx.params

  const planogram = await db.planogram.findUnique({ where: { id } })
  if (!planogram) return Response.json({ error: 'پلانوگرام یافت نشد' }, { status: 404 })

  await db.planogram.delete({ where: { id } })
  await logAudit(session.id, session.name, 'DELETE_PLANOGRAM', 'PLANOGRAM', id, { name: planogram.name })
  return Response.json({ ok: true })
}
