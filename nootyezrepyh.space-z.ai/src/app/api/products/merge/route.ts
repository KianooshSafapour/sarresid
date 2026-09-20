import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/products/merge  { sourceId, targetId }
 * Merges a duplicate product into a target:
 * - union of all barcodes moves to the target
 * - target keeps its own stock (no summation)
 * - source is soft-deleted (active:false, mergedInto:targetId)
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_PRODUCTS)) {
    return Response.json({ error: 'اجازه مدیریت محصولات را ندارید' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as { sourceId?: string; targetId?: string } | null
  const sourceId = body?.sourceId
  const targetId = body?.targetId
  if (!sourceId || !targetId) {
    return Response.json({ error: 'شناسه هر دو محصول لازم است' }, { status: 400 })
  }
  if (sourceId === targetId) {
    return Response.json({ error: 'نمی‌توان محصول را با خودش ادغام کرد' }, { status: 400 })
  }

  const [source, target] = await Promise.all([
    db.product.findUnique({ where: { id: sourceId } }),
    db.product.findUnique({ where: { id: targetId } }),
  ])
  if (!source || !target) {
    return Response.json({ error: 'محصول یافت نشد' }, { status: 404 })
  }

  // union barcodes (unique)
  const barcodes: string[] = []
  const push = (b: string | null) => {
    const s = String(b || '').trim()
    if (s && !barcodes.includes(s)) barcodes.push(s)
  }
  push(target.barcode)
  try { (JSON.parse(target.barcodes || '[]') as string[]).forEach(push) } catch { /* ignore */ }
  push(source.barcode)
  try { (JSON.parse(source.barcodes || '[]') as string[]).forEach(push) } catch { /* ignore */ }

  await db.product.update({
    where: { id: targetId },
    data: { barcodes: JSON.stringify(barcodes), barcode: barcodes[0] || target.barcode },
  })

  await db.product.update({
    where: { id: sourceId },
    data: { active: false, mergedInto: targetId },
  })

  await logAudit(session.id, session.name, 'MERGE_PRODUCT', 'PRODUCT', targetId, {
    sourceId,
    sourceName: source.name,
    targetName: target.name,
    barcodes,
  })

  return Response.json({ ok: true, targetId, barcodes })
}
