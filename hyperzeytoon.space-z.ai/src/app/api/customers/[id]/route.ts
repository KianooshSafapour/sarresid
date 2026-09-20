import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity, notify } from '@/lib/server-utils'

type Ctx = { params: Promise<{ id: string }> }

// sales + cashier + managers can manage customers
function canManage(roleKeys: string[], isManager: boolean) {
  return isManager || roleKeys.some((k) => ['sales', 'cashier'].includes(k))
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params
  const customer = await db.customer.findUnique({ where: { id } })
  if (!customer) return fail('مشتری یافت نشد', 404)
  const orders = await db.customerOrder.findMany({
    where: { customerId: id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  const salesperson = customer.salespersonId
    ? await db.user.findUnique({ where: { id: customer.salespersonId }, select: { name: true, color: true } })
    : null
  return ok({
    customer: {
      ...customer,
      salespersonName: salesperson?.name ?? null,
      salespersonColor: salesperson?.color ?? null,
    },
    orders: orders.map((o) => ({ ...o, items: safeParse(o.items) })),
  })
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canManage(user.roleKeys, user.isManager)) return fail('دسترسی غیرمجاز', 403)
  const { id } = await ctx.params
  const customer = await db.customer.findUnique({ where: { id } })
  if (!customer) return fail('مشتری یافت نشد', 404)

  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    phone?: string
    favoriteProducts?: string
    tasteNotes?: string
    salespersonId?: string | null
    incrementVisit?: boolean
  }

  const data: Record<string, unknown> = {}
  if (body.name?.trim()) data.name = body.name.trim()
  if (body.phone !== undefined) data.phone = body.phone?.trim() || null
  if (body.favoriteProducts !== undefined) data.favoriteProducts = body.favoriteProducts?.trim() || null
  if (body.tasteNotes !== undefined) data.tasteNotes = body.tasteNotes?.trim() || null
  if (body.salespersonId !== undefined) data.salespersonId = body.salespersonId || null
  if (body.incrementVisit) data.visits = { increment: 1 }

  const updated = await db.customer.update({ where: { id: customer.id }, data })

  if (body.incrementVisit) {
    // gentle nudge to the assigned salesperson (never to the visitor themself)
    if (updated.salespersonId && updated.salespersonId !== user.id) {
      await notify(
        updated.salespersonId,
        'بازدید مشتری ثبت شد 🌿',
        `${updated.name} امروز به فروشگاه سر زد`,
        'INFO',
        'customers'
      )
    }
    await logActivity(user.id, user.name, 'ثبت بازدید مشتری', 'Customer', customer.id, updated.name)
  } else {
    await logActivity(user.id, user.name, 'ویرایش مشتری', 'Customer', customer.id, updated.name)
  }
  return ok({ success: true, customer: updated })
}
