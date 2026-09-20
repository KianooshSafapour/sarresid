import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

type ImportRow = {
  name?: string
  barcode?: string
  buyPrice?: number
  sellPrice?: number
  stock?: number
  category?: string
  duplicateOfId?: number
  status?: 'new' | 'duplicate' | 'invalid'
  action?: string // e.g. 'merge-stock'
}

// POST /api/products/commit {rows, userId, userName, defaultMinStock?}
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : []
    const userId = Number(body?.userId ?? 0)
    const userName = String(body?.userName ?? 'سیستم')
    const defaultMinStock = Number(body?.defaultMinStock ?? 10)

    let created = 0
    let merged = 0
    let skipped = 0

    for (const row of rows) {
      try {
        if (row.status === 'invalid') {
          skipped++
          continue
        }

        if (row.status === 'new') {
          if (!row.name) {
            skipped++
            continue
          }
          const product = await db.product.create({
            data: {
              name: String(row.name).trim(),
              barcode: row.barcode ? String(row.barcode) : null,
              buyPrice: Number(row.buyPrice ?? 0),
              sellPrice: Number(row.sellPrice ?? 0),
              stock: Number(row.stock ?? 0),
              minStock: defaultMinStock,
              category: row.category ? String(row.category) : null,
            },
          })
          await db.auditLog.create({
            data: {
              userId,
              userName,
              action: 'PRODUCT_IMPORT',
              entity: 'Product',
              entityId: product.id,
              detail: `ایجاد محصول از فایل: ${product.name}`,
            },
          })
          created++
          continue
        }

        if (row.status === 'duplicate' && row.duplicateOfId) {
          const existing = await db.product.findUnique({ where: { id: Number(row.duplicateOfId) } })
          if (!existing) {
            skipped++
            continue
          }
          const data: Record<string, unknown> = {}
          // fill missing fields only
          if (!existing.barcode && row.barcode) data.barcode = String(row.barcode)
          if (!existing.buyPrice && Number(row.buyPrice ?? 0) > 0) data.buyPrice = Number(row.buyPrice)
          if (!existing.sellPrice && Number(row.sellPrice ?? 0) > 0) data.sellPrice = Number(row.sellPrice)
          if (!existing.category && row.category) data.category = String(row.category)

          if (row.action === 'merge-stock') {
            data.stock = (existing.stock ?? 0) + Number(row.stock ?? 0)
          }

          if (Object.keys(data).length === 0) {
            skipped++
            continue
          }
          await db.product.update({ where: { id: existing.id }, data })
          await db.auditLog.create({
            data: {
              userId,
              userName,
              action: 'PRODUCT_IMPORT',
              entity: 'Product',
              entityId: existing.id,
              detail:
                row.action === 'merge-stock'
                  ? `افزودن موجودی ${row.stock} به ${existing.name}`
                  : `تکمیل اطلاعات ${existing.name} از فایل`,
            },
          })
          merged++
          continue
        }

        skipped++
      } catch {
        skipped++
      }
    }

    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'PRODUCT_IMPORT',
        entity: 'Product',
        entityId: null,
        detail: `ورود گروهی از فایل: ${created} جدید، ${merged} ادغام، ${skipped} رد شده`,
      },
    })

    return NextResponse.json({ created, merged, skipped })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
