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

async function notifyRoles(roles: string[], title: string, body?: string, type = 'INFO', excludeUserId?: number) {
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, roles: true } })
  const targets = users.filter(
    (u) => u.id !== excludeUserId && roles.some((r) => u.roles.split(',').map((s) => s.trim()).includes(r))
  )
  if (targets.length)
    await db.notification.createMany({
      data: targets.map((u) => ({ userId: u.id, title, body: body ?? null, type })),
    })
}

async function awardPoints(userId: number, points: number, reason: string, awardedById?: number | null) {
  await db.pointsLog.create({ data: { userId, points, reason, awardedById: awardedById ?? null } })
  await db.user.update({ where: { id: userId }, data: { points: { increment: points } } })
}

// normalize Persian product names for duplicate detection
function norm(s: string) {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .toLowerCase()
}

// GET /api/customer-requests → count desc, updatedAt desc
export async function GET() {
  try {
    const requests = await db.customerRequest.findMany({
      orderBy: [{ count: 'desc' }, { updatedAt: 'desc' }],
    })
    const users = await db.user.findMany({
      where: { id: { in: [...new Set(requests.map((r) => r.requestedById))] } },
      select: { id: true, name: true },
    })
    const umap = new Map(users.map((u) => [u.id, u]))
    return NextResponse.json({
      requests: requests.map((r) => ({ ...r, requestedBy: umap.get(r.requestedById) ?? null })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/customer-requests {name, barcode?, requestedById, note?}
// duplicate (same normalized name) → count+1, notify managers at 3 & 5 milestones;
// new → create + 1 point to requester
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const name = String(b?.name ?? '').trim()
    const requestedById = Number(b?.requestedById ?? 0)
    if (!name) return NextResponse.json({ error: 'نام کالا الزامی است' }, { status: 400 })

    const all = await db.customerRequest.findMany()
    const existing = all.find((r) => norm(r.name) === norm(name))

    if (existing) {
      const updated = await db.customerRequest.update({
        where: { id: existing.id },
        data: { count: { increment: 1 } },
      })
      if (updated.count === 3 || updated.count === 5) {
        await notifyRoles(
          ['PRODUCT_MANAGER', 'GENERAL_MANAGER'],
          'تکرار درخواست مشتری',
          `کالای «${existing.name}» تاکنون ${updated.count} بار توسط مشتریان درخواست شده است`,
          'WARNING'
        )
      }
      await audit(requestedById, 'CUSTOMER_REQUEST_DUPLICATE', 'CustomerRequest', existing.id, `${existing.name} — شمارش: ${updated.count}`)
      return NextResponse.json({ request: updated, duplicate: true })
    }

    const cr = await db.customerRequest.create({
      data: {
        name,
        barcode: b?.barcode ? String(b.barcode) : null,
        note: b?.note ? String(b.note) : null,
        requestedById,
      },
    })
    if (requestedById) await awardPoints(requestedById, 1, 'ثبت درخواست مشتری')
    await audit(requestedById, 'CUSTOMER_REQUEST_CREATE', 'CustomerRequest', cr.id, name)
    return NextResponse.json({ request: cr, duplicate: false })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/customer-requests {id, note}
export async function PATCH(request: Request) {
  try {
    const b = await request.json()
    const id = Number(b?.id)
    if (!id) return NextResponse.json({ error: 'شناسه درخواست الزامی است' }, { status: 400 })
    const userId = b?.userId ? Number(b.userId) : null
    const data: Record<string, unknown> = {}
    if (b?.note !== undefined) data.note = b.note ? String(b.note) : null
    const cr = await db.customerRequest.update({ where: { id }, data })
    await audit(userId, 'CUSTOMER_REQUEST_UPDATE', 'CustomerRequest', id, `یادداشت: ${cr.name}`)
    return NextResponse.json({ request: cr })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
