import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireManager, fail, ok, logActivity } from '@/lib/server-utils'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params
  const sop = await db.sOP.findUnique({ where: { id } })
  if (!sop) return fail('رویه یافت نشد', 404)
  let steps: unknown[] = []
  try {
    steps = JSON.parse(sop.steps)
  } catch {
    steps = []
  }
  return ok({ sop: { ...sop, steps } })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await requireManager(req)
  if (!user) return fail('دسترسی غیرمجاز', 403)
  const { id } = await ctx.params
  const sop = await db.sOP.findUnique({ where: { id } })
  if (!sop) return fail('رویه یافت نشد', 404)
  await db.sOP.delete({ where: { id } })
  await logActivity(user.id, user.name, 'حذف رویه', 'SOP', id, sop.title)
  return ok({ success: true })
}
