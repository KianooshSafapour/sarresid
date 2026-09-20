import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { mergeProductsCore } from '../shared'

// POST /api/products/merge — merge duplicate products into a primary (managers only)
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.isManager) return fail('دسترسی غیرمجاز', 403)

  const body = (await req.json()) as { primaryId?: string; duplicateIds?: string[] }
  if (!body.primaryId) return fail('کالای اصلی انتخاب نشده است')
  if (!body.duplicateIds?.length) return fail('هیچ کالای تکراری انتخاب نشده است')

  const primary = await db.product.findUnique({ where: { id: body.primaryId } })
  if (!primary) return fail('کالای اصلی یافت نشد', 404)

  const result = await mergeProductsCore(body.primaryId, body.duplicateIds)
  if (!result.ok) return fail(result.error || 'خطا در ادغام')

  await logActivity(
    user.id,
    user.name,
    'ادغام کالاهای تکراری',
    'Product',
    body.primaryId,
    `${primary.name} ← ${result.mergedNames.join('، ')}`
  )

  const updated = await db.product.findUnique({
    where: { id: body.primaryId },
    include: { barcodes: { orderBy: { isPrimary: 'desc' } } },
  })
  return ok({ success: true, primary: updated, mergedNames: result.mergedNames })
}
