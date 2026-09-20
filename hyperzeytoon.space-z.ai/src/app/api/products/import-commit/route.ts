import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { canImport, createProductCore, normalizeCode } from '../shared'

interface CommitRow {
  action: 'create' | 'merge' | 'skip'
  name?: string
  barcode?: string
  qty?: number
  price?: number
  buyPrice?: number
  targetId?: string // product to merge into
}

// POST /api/products/import-commit — apply Holoo import decisions
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user || !canImport(user)) return fail('دسترسی غیرمجاز', 403)

  const body = (await req.json()) as { rows?: CommitRow[] }
  const rows = body.rows ?? []
  if (!rows.length) return fail('هیچ ردیفی برای ثبت وجود ندارد')

  let created = 0
  let merged = 0
  let skipped = 0
  const errors: { name: string; error: string }[] = []

  for (const row of rows) {
    try {
      if (row.action === 'skip') {
        skipped++
        continue
      }

      if (row.action === 'create') {
        const name = (row.name ?? '').trim()
        if (!name) {
          skipped++
          errors.push({ name: row.name || '(بدون نام)', error: 'نام خالی' })
          continue
        }
        const res = await createProductCore(
          {
            name,
            category: 'عمومی',
            unit: 'عدد',
            sellPrice: row.price,
            buyPrice: row.buyPrice,
            stock: row.qty,
            minStock: 6,
            barcodes: row.barcode ? [normalizeCode(row.barcode)] : [],
          },
          { id: user.id, name: user.name }
        )
        if (res.ok) {
          created++
        } else {
          skipped++
          errors.push({ name, error: res.error || 'خطای ناشناخته' })
        }
        continue
      }

      if (row.action === 'merge') {
        if (!row.targetId) {
          skipped++
          errors.push({ name: row.name || '(بدون نام)', error: 'کالای هدف انتخاب نشده' })
          continue
        }
        const target = await db.product.findUnique({ where: { id: row.targetId }, include: { barcodes: true } })
        if (!target) {
          skipped++
          errors.push({ name: row.name || '(بدون نام)', error: 'کالای هدف یافت نشد' })
          continue
        }
        // attach barcode if provided, free, and not already on target
        const code = normalizeCode(row.barcode ?? '')
        if (code && !target.barcodes.some((b) => b.code === code)) {
          const clash = await db.barcode.findUnique({ where: { code } })
          if (!clash) {
            await db.barcode.create({ data: { code, productId: target.id, isPrimary: target.barcodes.length === 0 } })
          }
        }
        // Holoo is the source of truth for counted stock
        if (row.qty !== undefined && row.qty !== null && Number(row.qty) >= 0) {
          await db.product.update({ where: { id: target.id }, data: { stock: Math.round(Number(row.qty)) } })
        }
        merged++
      }
    } catch {
      skipped++
      errors.push({ name: row.name || '(بدون نام)', error: 'خطای ثبت' })
    }
  }

  await logActivity(
    user.id,
    user.name,
    'ورود گروهی محصولات از هولو',
    'Product',
    undefined,
    `${created} جدید، ${merged} ادغام، ${skipped} رد`
  )

  return ok({ created, merged, skipped, errors: errors.slice(0, 20) })
}
