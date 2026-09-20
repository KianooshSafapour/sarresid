import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function audit(
  userId: number | null | undefined,
  action: string,
  entity: string,
  entityId: number | null,
  detail?: string
) {
  let userName = 'سیستم'
  if (userId) {
    const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
    if (u) userName = u.name
  }
  await db.auditLog.create({
    data: { userId: userId ?? 0, userName, action, entity, entityId, detail: detail ?? null },
  })
}

// GET /api/customers?q= → sorted createdAt desc
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams.get('q')?.trim()
    const customers = await db.customer.findMany({
      where: q
        ? {
            OR: [{ name: { contains: q } }, { phone: { contains: q } }],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ customers })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/customers {name, phone?, preference?, createdById}
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const name = String(b?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'نام مشتری الزامی است' }, { status: 400 })
    const createdById = Number(b?.createdById ?? 0)
    const customer = await db.customer.create({
      data: {
        name,
        phone: b?.phone ? String(b.phone) : null,
        preference: b?.preference ? String(b.preference) : null,
        createdById,
      },
    })
    await audit(createdById, 'CUSTOMER_CREATE', 'Customer', customer.id, name)
    return NextResponse.json({ customer })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/customers {id, name?, phone?, preference?}
export async function PATCH(request: Request) {
  try {
    const b = await request.json()
    const id = Number(b?.id)
    if (!id) return NextResponse.json({ error: 'شناسه مشتری الزامی است' }, { status: 400 })
    const userId = b?.userId ? Number(b.userId) : null
    const data: Record<string, unknown> = {}
    if (b?.name !== undefined) data.name = String(b.name).trim()
    if (b?.phone !== undefined) data.phone = b.phone ? String(b.phone) : null
    if (b?.preference !== undefined) data.preference = b.preference ? String(b.preference) : null
    const customer = await db.customer.update({ where: { id }, data })
    await audit(userId, 'CUSTOMER_UPDATE', 'Customer', id, `ویرایش مشتری: ${customer.name}`)
    return NextResponse.json({ customer })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
