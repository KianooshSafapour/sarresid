import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireManager, fail, ok, logActivity } from '@/lib/server-utils'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const shelves = await db.shelf.findMany({
    include: {
      product: { select: { id: true, name: true, image: true, unit: true, stock: true, minStock: true, capacity: true } },
    },
    orderBy: [{ section: 'asc' }, { row: 'asc' }, { col: 'asc' }],
  })
  return ok({
    shelves: shelves.map((s) => {
      const capacity = s.capacity || s.product?.capacity || 0
      const stock = s.product?.stock ?? 0
      const fill = capacity > 0 ? Math.min(100, Math.round((stock / capacity) * 100)) : 0
      return {
        id: s.id,
        name: s.name,
        section: s.section,
        row: s.row,
        col: s.col,
        capacity,
        note: s.note,
        product: s.product,
        fill,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireManager(req)
  if (!user) return fail('دسترسی غیرمجاز', 403)
  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    section?: string
    row?: number
    col?: number
    productId?: string
    capacity?: number
  }
  if (!body.name?.trim()) return fail('نام قفسه الزامی است')
  const created = await db.shelf.create({
    data: {
      name: body.name.trim(),
      section: body.section?.trim() || 'عمومی',
      row: Math.max(1, Math.round(body.row ?? 1)),
      col: Math.max(1, Math.round(body.col ?? 1)),
      productId: body.productId || null,
      capacity: Math.max(0, Math.round(body.capacity ?? 30)),
    },
  })
  await logActivity(user.id, user.name, 'ایجاد قفسه', 'Shelf', created.id, created.name)
  return ok({ success: true, id: created.id })
}
