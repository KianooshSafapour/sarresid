import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok } from '@/lib/server-utils'
import { canImport, normalizeName, normalizeCode } from '../shared'
import * as XLSX from 'xlsx'

// ---------- column synonym detection ----------
const SYNONYMS: { key: ColKey; terms: string[] }[] = [
  { key: 'buyPrice', terms: ['قیمت خرید', 'buy price', 'buyprice', 'قیمت خریداری', 'خرید'] },
  { key: 'barcode', terms: ['بارکد', 'باركد', 'barcode', 'kala code', 'کد کالا', 'كد كالا'] },
  { key: 'name', terms: ['نام', 'شرح', 'name', 'description', 'کالا'] },
  { key: 'qty', terms: ['تعداد', 'موجودی', 'stock', 'qty', 'count'] },
  { key: 'price', terms: ['قیمت فروش', 'قیمت', 'price', 'فروش', 'sell'] },
]
type ColKey = 'name' | 'barcode' | 'qty' | 'price' | 'buyPrice'

const cellText = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).trim().toLowerCase()

function matchCell(text: string): ColKey | null {
  if (!text) return null
  for (const group of SYNONYMS) {
    for (const term of group.terms) {
      if (text.includes(term) || term.includes(text)) return group.key
    }
  }
  return null
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const cleaned = String(v)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[٫,٬\s]/g, '')
    .replace(/[^\d.\-]/g, '')
  const n = Number(cleaned)
  return isFinite(n) ? n : 0
}

// barcodes often arrive as numbers — normalize without scientific notation
function toCode(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number') return normalizeCode(String(Math.round(v)))
  const s = String(v).trim()
  if (/^\d+(\.\d+)?$/.test(s)) return normalizeCode(String(Math.round(Number(s))))
  return normalizeCode(s)
}

export interface ImportRow {
  key: string
  name: string
  barcode: string
  qty: number
  price: number
  buyPrice: number
  isNew: boolean
  duplicateOf?: { id: string; productName: string }
  reason?: string
}

// POST /api/products/import — multipart preview (nothing saved)
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!canImport(user)) return fail('دسترسی غیرمجاز', 403)

  let file: File | null = null
  try {
    const form = await req.formData()
    file = form.get('file') as File | null
  } catch {
    return fail('فایل ارسال‌شده معتبر نیست')
  }
  if (!file) return fail('فایلی ارسال نشده است')
  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (!['xlsx', 'xls', 'csv'].includes(ext)) return fail('فقط فایل اکسل (xlsx/xls) یا csv پذیرفته می‌شود')

  let rows: unknown[][]
  try {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) return fail('فایل خالی است')
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' }) as unknown[][]
  } catch {
    return fail('خواندن فایل ممکن نشد — فرمت اکسل معتبر نیست')
  }
  if (!rows.length) return fail('فایل خالی است')

  // ---------- detect header row (first row with >=2 matching columns, must include name) ----------
  let headerIdx = -1
  let cols: Partial<Record<ColKey, number>> = {}
  const scanLimit = Math.min(rows.length, 30)
  for (let i = 0; i < scanLimit; i++) {
    const found: Partial<Record<ColKey, number>> = {}
    const cells = rows[i] as unknown[]
    for (let c = 0; c < cells.length; c++) {
      const key = matchCell(cellText(cells[c]))
      if (key && found[key] === undefined) found[key] = c
    }
    if (found.name !== undefined && Object.keys(found).length >= 2) {
      headerIdx = i
      cols = found
      break
    }
  }
  if (headerIdx === -1) {
    // fallback: treat first non-empty column as name, data starts at first row
    for (let i = 0; i < rows.length; i++) {
      if (cellText((rows[i] as unknown[])[0])) {
        headerIdx = Math.max(0, i - 1)
        cols = { name: 0 }
        break
      }
    }
    if (headerIdx === -1) return fail('ستون «نام کالا» در فایل پیدا نشد')
  }

  const get = (row: unknown[], key: ColKey): unknown => {
    const idx = cols[key]
    return idx === undefined ? '' : row[idx]
  }

  // ---------- DB lookup maps ----------
  const dbProducts = await db.product.findMany({
    where: { status: { not: 'ARCHIVED' } },
    select: { id: true, name: true, altName: true, barcodes: { select: { code: true } } },
  })
  const dbByCode = new Map<string, { id: string; productName: string }>()
  const dbByName = new Map<string, { id: string; productName: string }>()
  for (const p of dbProducts) {
    for (const b of p.barcodes) dbByCode.set(b.code, { id: p.id, productName: p.name })
    dbByName.set(normalizeName(p.name), { id: p.id, productName: p.name })
    if (p.altName) dbByName.set(normalizeName(p.altName), { id: p.id, productName: p.name })
  }

  // ---------- parse data rows + duplicate detection ----------
  const preview: ImportRow[] = []
  const seenName = new Map<string, number>() // normalized name → index in preview
  const seenCode = new Map<string, number>()
  let emptyRows = 0

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || !row.length) continue
    const name = String(get(row, 'name') ?? '').trim()
    if (!name) {
      emptyRows++
      continue
    }
    const barcode = toCode(get(row, 'barcode'))
    const qty = Math.max(0, Math.round(toNumber(get(row, 'qty'))))
    const price = Math.max(0, Math.round(toNumber(get(row, 'price'))))
    const buyPrice = Math.max(0, Math.round(toNumber(get(row, 'buyPrice'))))

    const nm = normalizeName(name)
    let duplicateOf: ImportRow['duplicateOf'] | undefined
    let reason: string | undefined

    if (barcode && dbByCode.has(barcode)) {
      duplicateOf = dbByCode.get(barcode)
      reason = 'بارکد در سیستم موجود است'
    } else if (dbByName.has(nm)) {
      duplicateOf = dbByName.get(nm)
      reason = 'کالایی با همین نام در سیستم وجود دارد'
    } else if (barcode && seenCode.has(barcode)) {
      const first = preview[seenCode.get(barcode)!]
      duplicateOf = first.duplicateOf ?? undefined
      reason = 'بارکد تکراری در فایل'
    } else if (seenName.has(nm)) {
      const first = preview[seenName.get(nm)!]
      duplicateOf = first.duplicateOf ?? undefined
      reason = 'نام تکراری در فایل'
    }

    const entry: ImportRow = {
      key: `r${i}`,
      name,
      barcode,
      qty,
      price,
      buyPrice,
      isNew: !duplicateOf,
      duplicateOf,
      reason,
    }
    seenName.set(nm, preview.length)
    if (barcode) seenCode.set(barcode, preview.length)
    preview.push(entry)
  }

  const newCount = preview.filter((r) => r.isNew).length
  return ok({
    preview,
    stats: {
      totalRows: preview.length,
      newCount,
      duplicateCount: preview.length - newCount,
      emptyRows,
      sheetName: file.name,
      detectedCols: cols,
    },
  })
}
