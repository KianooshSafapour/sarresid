// Shared helpers for product APIs (create core, merge core, normalizers, permissions)
import { db } from '@/lib/db'
import type { SessionUser } from '@/lib/auth'

export type CatalogUser = SessionUser

/** managers + accountant + inventory can create/edit products */
export function canEditCatalog(user: CatalogUser | null): boolean {
  if (!user) return false
  return user.isManager || user.roleKeys.includes('accountant') || user.roleKeys.includes('inventory')
}

/** managers + accountant can run the Holoo import */
export function canImport(user: CatalogUser | null): boolean {
  if (!user) return false
  return user.isManager || user.roleKeys.includes('accountant')
}

/** normalize Persian product name for duplicate detection (ی↔ي ک↔ك, digits, collapse spaces) */
export function normalizeName(s: string): string {
  return (s ?? '')
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ') // ZWNJ → space for robust match
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))) // Persian digits → ASCII
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))) // Arabic digits → ASCII
    .toLowerCase()
}

export function normalizeCode(s: string): string {
  return (s ?? '').toString().trim().replace(/[\s-]/g, '')
}

export interface CreateProductInput {
  name: string
  category?: string
  brand?: string | null
  unit?: string
  sellPrice?: number
  sellPrice2?: number | null
  buyPrice?: number
  taxRate?: number
  stock?: number
  minStock?: number
  capacity?: number
  notes?: string | null
  barcodes?: string[]
}

export interface CreateResult {
  ok: boolean
  id?: string
  error?: string
}

/** create a product with barcodes (first isPrimary). Handles duplicate barcode gracefully. */
export async function createProductCore(
  data: CreateProductInput,
  _actor: { id: string; name: string }
): Promise<CreateResult> {
  const name = (data.name ?? '').trim()
  if (!name) return { ok: false, error: 'نام کالا الزامی است' }

  const codes = Array.from(new Set((data.barcodes ?? []).map(normalizeCode).filter(Boolean)))
  if (codes.length) {
    const clash = await db.barcode.findFirst({ where: { code: { in: codes } }, select: { code: true } })
    if (clash) return { ok: false, error: `بارکد ${clash.code} قبلاً در سیستم ثبت شده است` }
  }

  const created = await db.product.create({
    data: {
      name,
      category: data.category?.trim() || 'عمومی',
      brand: data.brand?.trim() || null,
      unit: data.unit?.trim() || 'عدد',
      sellPrice: Number(data.sellPrice) || 0,
      sellPrice2: data.sellPrice2 != null && Number(data.sellPrice2) > 0 ? Number(data.sellPrice2) : null,
      buyPrice: Number(data.buyPrice) || 0,
      taxRate: Number(data.taxRate ?? 9) || 0,
      stock: Math.max(0, Math.round(Number(data.stock) || 0)),
      minStock: Math.max(0, Math.round(Number(data.minStock ?? 6))),
      capacity: Math.max(0, Math.round(Number(data.capacity ?? 0))),
      notes: data.notes?.trim() || null,
      barcodes: { create: codes.map((c, i) => ({ code: c, isPrimary: i === 0 })) },
    },
  })
  return { ok: true, id: created.id }
}

/** merge duplicate products into a primary one. Returns merged names list. */
export async function mergeProductsCore(
  primaryId: string,
  duplicateIds: string[]
): Promise<{ ok: boolean; error?: string; mergedNames: string[] }> {
  const primary = await db.product.findUnique({ where: { id: primaryId }, include: { barcodes: true } })
  if (!primary) return { ok: false, error: 'کالای اصلی یافت نشد', mergedNames: [] }

  const dupIds = duplicateIds.filter((d) => d && d !== primaryId)
  if (!dupIds.length) return { ok: false, error: 'کالای تکراری انتخاب نشده است', mergedNames: [] }

  const dups = await db.product.findMany({ where: { id: { in: dupIds } }, include: { barcodes: true } })

  const primaryCodes = new Set(primary.barcodes.map((b) => b.code))
  const mergedNames: string[] = []
  let stockSum = primary.stock

  for (const dup of dups) {
    mergedNames.push(dup.name)
    stockSum += dup.stock
    // move barcodes (skip codes that would conflict — i.e. already on primary)
    for (const bc of dup.barcodes) {
      if (primaryCodes.has(bc.code)) continue
      await db.barcode.update({ where: { id: bc.id }, data: { productId: primaryId, isPrimary: false } })
      primaryCodes.add(bc.code)
    }
    // move relations
    await db.orderItem.updateMany({ where: { productId: dup.id }, data: { productId: primaryId } })
    await db.stockRequestOut.updateMany({ where: { productId: dup.id }, data: { productId: primaryId } })
    await db.warehouseRequest.updateMany({ where: { productId: dup.id }, data: { productId: primaryId } })
    await db.shelf.updateMany({ where: { productId: dup.id }, data: { productId: primaryId } })
  }

  const prev = safeJsonArray(primary.importedDuplicates)
  await db.product.update({
    where: { id: primaryId },
    data: {
      stock: stockSum,
      importedDuplicates: JSON.stringify([...prev, ...mergedNames]),
    },
  })
  await db.product.updateMany({ where: { id: { in: dups.map((d) => d.id) } }, data: { status: 'ARCHIVED' } })

  return { ok: true, mergedNames }
}

function safeJsonArray(s: string | null | undefined): string[] {
  try {
    const v = s ? JSON.parse(s) : []
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}
