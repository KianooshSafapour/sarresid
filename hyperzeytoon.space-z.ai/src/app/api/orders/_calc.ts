// Shared server-side helpers for the commerce order pipeline
import { db } from '@/lib/db'
import { toJalali, pad2 } from '@/lib/jalali'

export const VAT_RATE = 0.09

export interface RawItemInput {
  productId?: string | null
  name: string
  barcode?: string | null
  unit?: string
  qty: number
  unitPrice?: number
  discount?: number
  vat?: number
  tax?: number
}

export interface CalcRow {
  base: number
  vat: number
  total: number
}

/** row = qty×price − discount, vat 9% on top (unless vat explicitly provided) */
export function computeRow(qty: number, unitPrice: number, discount = 0, vatOverride?: number): CalcRow {
  const base = Math.max(0, (Number(qty) || 0) * (Number(unitPrice) || 0) - (Number(discount) || 0))
  const vat = vatOverride !== undefined && vatOverride !== null ? Math.round(Number(vatOverride)) : Math.round(base * VAT_RATE)
  return { base: Math.round(base), vat, total: Math.round(base) + vat }
}

export interface ItemCreateData {
  productId: string | null
  name: string
  barcode: string | null
  unit: string
  qty: number
  unitPrice: number
  discount: number
  tax: number
  vat: number
  total: number
}

/** normalize raw wizard input into prisma item rows (server-authoritative totals) */
export function buildItemRows(rawItems: RawItemInput[], buyPriceOf: (productId: string) => number | null): ItemCreateData[] {
  return rawItems
    .filter((it) => it && it.name && Number(it.qty) > 0)
    .map((it) => {
      const fallback = it.productId ? buyPriceOf(it.productId) : null
      const unitPrice = Number(it.unitPrice ?? fallback ?? 0)
      const qty = Number(it.qty)
      const discount = Number(it.discount ?? 0)
      const c = computeRow(qty, unitPrice, discount, it.vat)
      return {
        productId: it.productId ?? null,
        name: String(it.name),
        barcode: it.barcode ?? null,
        unit: it.unit || 'عدد',
        qty,
        unitPrice,
        discount,
        tax: Number(it.tax ?? 0),
        vat: c.vat,
        total: c.total,
      }
    })
}

export function orderTotals(rows: { qty: number; unitPrice: number; discount: number; tax: number; vat: number; total: number }[]) {
  const totalAmount = rows.reduce((s, r) => s + Math.round(r.qty * r.unitPrice), 0)
  const discount = rows.reduce((s, r) => s + (r.discount || 0), 0)
  const tax = rows.reduce((s, r) => s + (r.tax || 0), 0)
  const vat = rows.reduce((s, r) => s + (r.vat || 0), 0)
  const finalAmount = rows.reduce((s, r) => s + (r.total || 0), 0)
  return { totalAmount, discount, tax, vat, finalAmount }
}

/** ORD-14040712-001 — jalali yyyymmdd + daily sequence */
export async function nextOrderCode(): Promise<string> {
  const now = new Date()
  const j = toJalali(now)
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const count = await db.order.count({ where: { createdAt: { gte: dayStart } } })
  let seq = count + 1
  // safety against collisions
  for (let i = 0; i < 50; i++) {
    const code = `ORD-${j.jy}${pad2(j.jm)}${pad2(j.jd)}-${String(seq).padStart(3, '0')}`
    const exists = await db.order.findUnique({ where: { code } })
    if (!exists) return code
    seq++
  }
  return `ORD-${j.jy}${pad2(j.jm)}${pad2(j.jd)}-${Date.now().toString().slice(-4)}`
}
