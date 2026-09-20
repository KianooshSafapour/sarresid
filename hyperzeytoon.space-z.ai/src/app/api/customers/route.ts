import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'

// sales + cashier + managers can manage customers
function canManage(roleKeys: string[], isManager: boolean) {
  return isManager || roleKeys.some((k) => ['sales', 'cashier'].includes(k))
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const q = new URL(req.url).searchParams.get('q')?.trim()
  const customers = await db.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
  // enrich with salesperson info
  const salespersonIds = customers.map((c) => c.salespersonId).filter(Boolean) as string[]
  const salespeople = salespersonIds.length
    ? await db.user.findMany({ where: { id: { in: salespersonIds } }, select: { id: true, name: true, color: true } })
    : []
  return ok({
    customers: customers.map((c) => ({
      ...c,
      salespersonName: salespeople.find((s) => s.id === c.salespersonId)?.name ?? null,
      salespersonColor: salespeople.find((s) => s.id === c.salespersonId)?.color ?? null,
    })),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canManage(user.roleKeys, user.isManager)) return fail('دسترسی غیرمجاز', 403)
  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    phone?: string
    favoriteProducts?: string
    tasteNotes?: string
  }
  if (!body.name?.trim()) return fail('نام مشتری الزامی است')
  if (body.phone) {
    const dupe = await db.customer.findFirst({ where: { phone: body.phone.trim() } })
    if (dupe) return fail('مشتری با این شماره قبلاً ثبت شده است')
  }
  const created = await db.customer.create({
    data: {
      name: body.name.trim(),
      phone: body.phone?.trim() || null,
      favoriteProducts: body.favoriteProducts?.trim() || null,
      tasteNotes: body.tasteNotes?.trim() || null,
      salespersonId: user.roleKeys.includes('sales') ? user.id : null,
    },
  })
  await logActivity(user.id, user.name, 'ثبت مشتری', 'Customer', created.id, created.name)
  return ok({ success: true, id: created.id })
}
