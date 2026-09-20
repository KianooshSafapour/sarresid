import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireManager, fail, ok, logActivity, notifyRoles, notify } from '@/lib/server-utils'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const suggestions = await db.productSuggestion.findMany({
    where: user.isManager ? undefined : { submittedById: user.id },
    orderBy: { createdAt: 'desc' },
    take: 80,
  })
  return ok({ suggestions })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as { name?: string; barcode?: string; note?: string }
  if (!body.name?.trim()) return fail('نام کالا الزامی است')
  const created = await db.productSuggestion.create({
    data: {
      name: body.name.trim(),
      barcode: body.barcode?.trim() || null,
      note: body.note?.trim() || null,
      submittedById: user.id,
    },
  })
  await notifyRoles(['gm', 'pm'], 'پیشنهاد کالای جدید 🌱', `${body.name.trim()} — پیشنهاد از ${user.name}`, 'INFO', 'floor')
  await logActivity(user.id, user.name, 'ثبت پیشنهاد کالا', 'ProductSuggestion', created.id, created.name)
  return ok({ success: true, id: created.id })
}

export async function PATCH(req: NextRequest) {
  const user = await requireManager(req)
  if (!user) return fail('دسترسی غیرمجاز', 403)
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string; managementNote?: string }
  if (!body.id) return fail('شناسه الزامی است')
  const suggestion = await db.productSuggestion.findUnique({ where: { id: body.id } })
  if (!suggestion) return fail('پیشنهاد یافت نشد', 404)

  const data: Record<string, unknown> = {}
  if (body.status && ['NEW', 'REVIEWING', 'APPROVED', 'REJECTED'].includes(body.status)) data.status = body.status
  if (body.managementNote !== undefined) data.managementNote = body.managementNote?.trim() || null
  const updated = await db.productSuggestion.update({ where: { id: suggestion.id }, data })

  if (suggestion.submittedById !== user.id) {
    await notify(
      suggestion.submittedById,
      'پیشنهادت بررسی شد 🌿',
      `${suggestion.name}${updated.managementNote ? ` — ${updated.managementNote}` : ''}`,
      updated.status === 'APPROVED' ? 'SUCCESS' : 'INFO',
      'floor'
    )
  }
  await logActivity(user.id, user.name, 'بررسی پیشنهاد کالا', 'ProductSuggestion', suggestion.id, `${suggestion.name} → ${updated.status}`)
  return ok({ success: true })
}
