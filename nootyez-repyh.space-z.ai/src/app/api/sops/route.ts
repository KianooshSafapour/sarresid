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

function parseSteps(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((s) => String(s)).filter((s) => s.trim().length > 0)
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()]
  return []
}

// GET /api/sops → sorted department then title
export async function GET() {
  try {
    const sops = await db.sOP.findMany({ orderBy: [{ department: 'asc' }, { title: 'asc' }] })
    return NextResponse.json({
      sops: sops.map((s) => ({ ...s, steps: JSON.parse(s.steps || '[]') })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/sops {title,department,steps:[string],createdById}
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const title = String(b?.title ?? '').trim()
    if (!title) return NextResponse.json({ error: 'عنوان SOP الزامی است' }, { status: 400 })
    const createdById = Number(b?.createdById ?? 0)
    const steps = parseSteps(b?.steps)
    const creator = await db.user.findUnique({ where: { id: createdById }, select: { name: true } })

    const sop = await db.sOP.create({
      data: {
        title,
        department: b?.department ? String(b.department) : 'GENERAL',
        steps: JSON.stringify(steps),
        createdById,
      },
    })
    await audit(createdById, 'SOP_CREATE', 'SOP', sop.id, `${title} (${sop.department}) — ${steps.length} مرحله`)
    return NextResponse.json({ sop: { ...sop, steps } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/sops {id, title?, department?, steps?: string[]}
export async function PATCH(request: Request) {
  try {
    const b = await request.json()
    const id = Number(b?.id)
    if (!id) return NextResponse.json({ error: 'شناسه SOP الزامی است' }, { status: 400 })
    const userId = b?.userId ? Number(b.userId) : null
    const data: Record<string, unknown> = {}
    if (b?.title !== undefined) data.title = String(b.title).trim()
    if (b?.department !== undefined) data.department = String(b.department) || 'GENERAL'
    if (b?.steps !== undefined) data.steps = JSON.stringify(parseSteps(b.steps))
    const sop = await db.sOP.update({ where: { id }, data })
    await audit(userId, 'SOP_UPDATE', 'SOP', id, `ویرایش SOP: ${sop.title}`)
    return NextResponse.json({ sop: { ...sop, steps: JSON.parse(sop.steps || '[]') } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// DELETE /api/sops?id=
export async function DELETE(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const id = Number(sp.get('id'))
    if (!id) return NextResponse.json({ error: 'پارامتر id الزامی است' }, { status: 400 })
    const userId = sp.get('userId') ? Number(sp.get('userId')) : null
    const sop = await db.sOP.delete({ where: { id } })
    await audit(userId, 'SOP_DELETE', 'SOP', id, `حذف SOP: ${sop.title}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
