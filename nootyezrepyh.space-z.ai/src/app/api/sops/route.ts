import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

/** GET /api/sops — all SOPs (active flag respected client-side for staff) */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const sops = await db.sOP.findMany({ orderBy: { createdAt: 'asc' } })
  const users = await db.user.findMany({ select: { id: true, name: true } })
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name

  return Response.json(sops.map((s) => ({
    ...s,
    createdByName: nameOf(s.createdById) || s.createdById,
  })))
}

/** POST /api/sops — create (manager with MANAGE_SOPS) */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_SOPS)) {
    return Response.json({ error: 'فقط مدیران می‌توانند دستورالعمل ثبت کنند' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    title?: string
    content?: string
    category?: string
    steps?: string[]
  } | null

  if (!body?.title?.trim() || !body.category?.trim()) {
    return Response.json({ error: 'عنوان و دسته‌بندی الزامی است' }, { status: 400 })
  }

  const sop = await db.sOP.create({
    data: {
      title: body.title.trim(),
      category: body.category.trim(),
      content: body.content?.trim() || '',
      steps: Array.isArray(body.steps) && body.steps.length > 0 ? JSON.stringify(body.steps.map((s) => String(s).trim()).filter(Boolean)) : null,
      createdById: session.id,
    },
  })

  await logAudit(session.id, session.name, 'SOP_CREATE', 'SOP', sop.id, { title: sop.title })
  return Response.json({ sop }, { status: 201 })
}
