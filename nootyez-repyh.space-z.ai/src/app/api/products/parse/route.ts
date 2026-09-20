import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// ---------- helpers ----------
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

function normalizeDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
}

function normHeader(s: unknown): string {
  return normalizeDigits(String(s ?? ''))
    .toLowerCase()
    .replace(/[\s\u200c_\-–—.()()/]/g, '')
}

function normBarcode(v: unknown): string {
  if (v == null) return ''
  let s = String(v).trim()
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '') // Excel numeric barcode strip .0
  s = normalizeDigits(s).replace(/\s+/g, '')
  if (s === '0') return ''
  return s
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const s = normalizeDigits(String(v)).replace(/[,٬\s]/g, '')
  const n = parseFloat(s)
  return isFinite(n) ? n : 0
}

function normNameKey(v: unknown): string {
  return normalizeDigits(String(v ?? ''))
    .toLowerCase()
    .replace(/[\s\u200c\-–_]/g, '')
}

type Field = 'name' | 'barcode' | 'buyPrice' | 'sellPrice' | 'stock' | 'category'

// fuzzy header match — returns matched field or null
function matchHeader(h: string): Field | null {
  const n = normHeader(h)
  if (!n) return null
  if (n.includes('بارکد') || n.includes('باركد') || n.includes('barcode') || n === 'code' || n === 'کد' || n === 'ean') return 'barcode'
  if (n.includes('قیمتخرید') || n.includes('قیمت خرید') || n.includes('buyprice') || n.includes('unitcost') || n.includes('بهاخرید')) return 'buyPrice'
  if (n.includes('قیمتفروش') || n.includes('sellprice') || n.includes('فروش')) return 'sellPrice'
  if (n.includes('buy') || n.includes('cost') || n === 'فی' || n.includes('خرید')) return 'buyPrice'
  if (n.includes('موجودی') || n.includes('stock') || n === 'count' || n.includes('تعداد') || n === 'qty' || n === 'quantity') return 'stock'
  if (n.includes('category') || n.includes('گروه') || n.includes('دسته')) return 'category'
  if (n.includes('name') || n.includes('نام') || n.includes('kala') || n.includes('کالا') || n.includes('caption') || n.includes('desc') || n.includes('شرح') || n.includes('محصول') || n.includes('عنوان')) return 'name'
  return null
}

function cellOf(row: unknown[], col: number | undefined): unknown {
  return col != null ? row[col] : undefined
}

// ---------- POST /api/products/parse (multipart, field 'file') ----------
export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'فایل ارسال نشده است' }, { status: 400 })
    }
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) return NextResponse.json({ error: 'فایل خالی است' }, { status: 400 })

    // raw grid
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' })
    if (!grid.length) return NextResponse.json({ error: 'فایل خالی است' }, { status: 400 })

    // header detection: scan first 10 rows, pick the row matching most known headers
    let headerRowIdx = -1
    let bestScore = 0
    let colMap: Partial<Record<Field, number>> = {}
    const scanLimit = Math.min(10, grid.length)
    for (let r = 0; r < scanLimit; r++) {
      const row = grid[r] ?? []
      const map: Partial<Record<Field, number>> = {}
      let score = 0
      for (let c = 0; c < row.length; c++) {
        const f = matchHeader(String(row[c] ?? ''))
        if (f && map[f] === undefined) {
          map[f] = c
          score++
        }
      }
      if (score > bestScore) {
        bestScore = score
        headerRowIdx = r
        colMap = map
      }
    }
    if (headerRowIdx < 0 || bestScore < 2 || colMap.name === undefined) {
      return NextResponse.json({ error: 'ستون‌های فایل شناسایی نشدند (ستون نام الزامی است)' }, { status: 400 })
    }

    // existing products for duplicate detection
    const existing = await db.product.findMany({
      select: { id: true, name: true, barcode: true },
    })
    const byBarcode = new Map<string, number>()
    const byName = new Map<string, number>()
    for (const p of existing) {
      if (p.barcode) byBarcode.set(normBarcode(p.barcode), p.id)
      byName.set(normNameKey(p.name), p.id)
    }

    const rows: Array<{
      name: string
      barcode: string
      buyPrice: number
      sellPrice: number
      stock: number
      category: string
      duplicateOfId?: number
      status: 'new' | 'duplicate' | 'invalid'
    }> = []

    for (let r = headerRowIdx + 1; r < grid.length; r++) {
      const row = grid[r] ?? []
      const rawName = String(cellOf(row, colMap.name) ?? '').trim()
      const barcode = normBarcode(cellOf(row, colMap.barcode))
      const buyPrice = toNum(cellOf(row, colMap.buyPrice))
      const sellPrice = toNum(cellOf(row, colMap.sellPrice))
      const stock = toNum(cellOf(row, colMap.stock))
      const category = String(cellOf(row, colMap.category) ?? '').trim()
      const hasName = rawName.length > 0
      const hasBarcode = barcode.length > 0
      if (!hasName && !hasBarcode) continue // fully empty row

      // duplicate detection: barcode exact, else normalized name
      let duplicateOfId: number | undefined
      if (hasBarcode) {
        const hit = byBarcode.get(barcode)
        if (hit) duplicateOfId = hit
      }
      if (!duplicateOfId && hasName) {
        const hit = byName.get(normNameKey(rawName))
        if (hit) duplicateOfId = hit
      }

      let status: 'new' | 'duplicate' | 'invalid'
      if (!hasName && !duplicateOfId) status = 'invalid' // barcode-only row, unknown product
      else if (duplicateOfId) status = 'duplicate'
      else status = 'new'

      rows.push({
        name: rawName,
        barcode,
        buyPrice,
        sellPrice,
        stock,
        category,
        ...(duplicateOfId ? { duplicateOfId } : {}),
        status,
      })
    }

    const total = rows.length
    const invalid = rows.filter((x) => x.status === 'invalid').length
    const duplicates = rows.filter((x) => x.status === 'duplicate').length
    const news = rows.filter((x) => x.status === 'new').length

    return NextResponse.json({ rows, total, invalid, duplicates, news })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'خطای پردازش فایل' }, { status: 500 })
  }
}
