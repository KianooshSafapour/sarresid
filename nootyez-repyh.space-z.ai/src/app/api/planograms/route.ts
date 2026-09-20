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

function parseLayout(raw: unknown): string {
  if (raw === undefined || raw === null) return JSON.stringify([])
  if (typeof raw === 'string') {
    try {
      JSON.parse(raw)
      return raw
    } catch {
      return JSON.stringify([])
    }
  }
  return JSON.stringify(raw)
}

// attach assignedTo (merchandiser)
async function withAssignee<T extends { assignedToId: number | null }>(planograms: T[]) {
  const ids = [...new Set(planograms.map((p) => p.assignedToId).filter((x): x is number => !!x))]
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, color: true } })
  const umap = new Map(users.map((u) => [u.id, u]))
  return planograms.map((p) => ({ ...p, assignedTo: p.assignedToId ? umap.get(p.assignedToId) ?? null : null }))
}

// GET /api/planograms → sorted updatedAt desc
export async function GET() {
  try {
    const planograms = await db.planogram.findMany({ orderBy: { updatedAt: 'desc' } })
    return NextResponse.json({
      planograms: (await withAssignee(planograms)).map((p) => ({ ...p, layout: JSON.parse(p.layout || '[]') })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/planograms {name, layout(object), createdById, assignedToId?}
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const name = String(b?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'نام پلانوگرام الزامی است' }, { status: 400 })
    const createdById = Number(b?.createdById ?? 0)

    const planogram = await db.planogram.create({
      data: {
        name,
        layout: parseLayout(b?.layout),
        createdById,
        assignedToId: b?.assignedToId ? Number(b.assignedToId) : null,
      },
    })
    await audit(createdById, 'PLANOGRAM_CREATE', 'Planogram', planogram.id, name)
    const [withA] = await withAssignee([planogram])
    return NextResponse.json({ planogram: { ...withA, layout: JSON.parse(withA.layout || '[]') } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/planograms {id, action:'update'|'publish'|'archive', layout?, assignedToId?, name?, userId}
export async function PATCH(request: Request) {
  try {
    const b = await request.json()
    const id = Number(b?.id)
    if (!id) return NextResponse.json({ error: 'شناسه پلانوگرام الزامی است' }, { status: 400 })
    const userId = b?.userId ? Number(b.userId) : null
    const planogram = await db.planogram.findUnique({ where: { id } })
    if (!planogram) return NextResponse.json({ error: 'پلانوگرام یافت نشد' }, { status: 400 })

    const action = String(b?.action ?? 'update')
    const now = new Date()
    let data: Record<string, unknown> = {}
    let auditAction = 'PLANOGRAM_UPDATE'
    let detail = ''

    switch (action) {
      case 'update': {
        if (planogram.status === 'ARCHIVED')
          return NextResponse.json({ error: 'پلانوگرام آرشیو شده و قابل ویرایش نیست' }, { status: 400 })
        data = {}
        if (b?.name !== undefined) data.name = String(b.name).trim() || planogram.name
        if (b?.layout !== undefined) data.layout = parseLayout(b.layout)
        if (b?.assignedToId !== undefined) data.assignedToId = b.assignedToId ? Number(b.assignedToId) : null
        auditAction = 'PLANOGRAM_UPDATE'
        detail = `ویرایش پلانوگرام: ${String(data.name ?? planogram.name)}`
        break
      }
      case 'publish': {
        data = { status: 'PUBLISHED', publishedAt: now }
        if (b?.assignedToId !== undefined) data.assignedToId = b.assignedToId ? Number(b.assignedToId) : null
        auditAction = 'PLANOGRAM_PUBLISH'
        detail = `انتشار پلانوگرام: ${planogram.name}`
        break
      }
      case 'archive': {
        data = { status: 'ARCHIVED' }
        auditAction = 'PLANOGRAM_ARCHIVE'
        detail = `آرشیو پلانوگرام: ${planogram.name}`
        break
      }
      default:
        return NextResponse.json({ error: 'اکشن نامعتبر است' }, { status: 400 })
    }

    const updated = await db.planogram.update({ where: { id }, data })

    // notify merchandiser on publish
    if (action === 'publish' && updated.assignedToId) {
      await db.notification.create({
        data: {
          userId: updated.assignedToId,
          title: 'پلانوگرام جدید',
          body: `${updated.name} برای چیدمان به شما واگذار شد`,
          type: 'INFO',
        },
      })
    }
    await audit(userId, auditAction, 'Planogram', id, detail)
    const [withA] = await withAssignee([updated])
    return NextResponse.json({ planogram: { ...withA, layout: JSON.parse(withA.layout || '[]') } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
