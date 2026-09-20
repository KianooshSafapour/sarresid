import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireManager, fail, ok, logActivity } from '@/lib/server-utils'

interface SopStep {
  title: string
  detail: string
  warning?: string
}

function parseSteps(raw: string): SopStep[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const url = new URL(req.url)
  const roleKey = url.searchParams.get('roleKey')

  const sops = await db.sOP.findMany({ orderBy: [{ category: 'asc' }, { updatedAt: 'desc' }] })
  const filtered = roleKey
    ? sops.filter((s) => !s.roleKeys || s.roleKeys.trim() === '' || s.roleKeys.split(',').map((r) => r.trim()).includes(roleKey))
    : sops

  return ok({
    sops: filtered.map((s) => ({ ...s, steps: parseSteps(s.steps) })),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireManager(req)
  if (!user) return fail('دسترسی غیرمجاز', 403)
  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    title?: string
    category?: string
    summary?: string
    steps?: SopStep[]
    roleKeys?: string
  }
  if (!body.title?.trim()) return fail('عنوان الزامی است')
  const steps = (body.steps ?? []).filter((s) => s.title?.trim())
  const roleKeys = body.roleKeys?.trim() ?? ''

  if (body.id) {
    const prev = await db.sOP.findUnique({ where: { id: body.id } })
    if (!prev) return fail('رویه یافت نشد', 404)
    await db.sOP.update({
      where: { id: body.id },
      data: {
        title: body.title.trim(),
        category: body.category?.trim() || prev.category,
        summary: body.summary?.trim() || null,
        steps: JSON.stringify(steps),
        roleKeys,
        version: { increment: 1 },
        createdBy: user.id,
      },
    })
    await logActivity(user.id, user.name, 'ویرایش رویه', 'SOP', body.id, `${body.title} (نسخه ${(prev.version ?? 1) + 1})`)
    return ok({ success: true, id: body.id })
  }

  const created = await db.sOP.create({
    data: {
      title: body.title.trim(),
      category: body.category?.trim() || 'عمومی',
      summary: body.summary?.trim() || null,
      steps: JSON.stringify(steps),
      roleKeys,
      createdBy: user.id,
    },
  })
  await logActivity(user.id, user.name, 'ایجاد رویه', 'SOP', created.id, created.title)
  return ok({ success: true, id: created.id })
}
