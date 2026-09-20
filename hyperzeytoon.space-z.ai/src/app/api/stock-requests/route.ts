import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireManager, fail, ok, logActivity, notify } from '@/lib/server-utils'

async function grantAward(userId: string, points: number, reason: string) {
  await db.award.create({ data: { userId, points, reason } })
  await db.user.update({ where: { id: userId }, data: { points: { increment: points } } })
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const items = await db.stockRequestOut.findMany({
    orderBy: [{ count: 'desc' }, { updatedAt: 'desc' }],
    take: 100,
  })
  return ok({ items })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as { productName?: string; productId?: string; note?: string }
  if (!body.productName?.trim()) return fail('نام کالا الزامی است')
  const name = body.productName.trim()

  const existing = await db.stockRequestOut.findFirst({ where: { productName: name } })
  if (existing) {
    await db.stockRequestOut.update({
      where: { id: existing.id },
      data: { count: { increment: 1 }, lastById: user.id, productId: body.productId ?? existing.productId },
    })
    await grantAward(user.id, 1, 'ثبت کالای درخواستی مشتری')
    await notify(user.id, 'آفرین! +۱ امتیاز ⭐', `${name} در فهرست تقاضای مشتریان ثبت شد`, 'SUCCESS', 'floor')
    await logActivity(user.id, user.name, 'افزایش تقاضای کالا', 'StockRequestOut', existing.id, name)
    return ok({ success: true, id: existing.id, incremented: true })
  }

  const created = await db.stockRequestOut.create({
    data: { productName: name, productId: body.productId || null, lastById: user.id, note: body.note?.trim() || null },
  })
  await grantAward(user.id, 1, 'ثبت کالای درخواستی مشتری')
  await notify(user.id, 'آفرین! +۱ امتیاز ⭐', `${name} در فهرست تقاضای مشتریان ثبت شد`, 'SUCCESS', 'floor')
  await logActivity(user.id, user.name, 'ثبت کالای درخواستی مشتری', 'StockRequestOut', created.id, name)
  return ok({ success: true, id: created.id })
}

export async function DELETE(req: NextRequest) {
  const user = await requireManager(req)
  if (!user) return fail('دسترسی غیرمجاز', 403)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('شناسه الزامی است')
  const item = await db.stockRequestOut.findUnique({ where: { id } })
  if (!item) return fail('یافت نشد', 404)
  await db.stockRequestOut.delete({ where: { id } })
  await logActivity(user.id, user.name, 'حذف کالای درخواستی', 'StockRequestOut', id, item.productName)
  return ok({ success: true })
}
