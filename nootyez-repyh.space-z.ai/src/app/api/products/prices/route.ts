import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* Supplier price-list bulk import:
 *  POST multipart (field 'file') → parse-preview, no writes
 *  POST JSON {userId, rows:[{productId,newBuy?,newSell?,supplierId?}]} → commit (role-gated)
 *
 *  Optional «تأمین‌کننده/supplier/vendor/سازنده» column (additive, fully backward
 *  compatible): preview resolves each row's supplier by normalized match against
 *  Supplier.name → row.supplier {id,name} + row.supplierStatus 'matched'|'unknown'
 *  + row.supplierChanged (vs product's current supplierId). Commit re-validates
 *  and reassigns product.supplierId when matched AND current is null/different
 *  (never overwrites when the column is absent or the name is unrecognized);
 *  reassignments are counted separately as `supplierChanges` and mentioned in
 *  the PRODUCT_PRICE_IMPORT audit detail.
 */

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
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '')
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

/** percentage cell — same lenient number parsing as the price columns plus an optional
 *  trailing ٪/% (۱۰٪ / 10% / "10" / ۱۰). Empty after stripping → absent (undefined). */
function toPct(v: unknown): number | undefined {
  if (v == null) return undefined
  if (typeof v === 'number') return isFinite(v) ? v : undefined
  let s = String(v).trim()
  if (!s) return undefined
  s = s.replace(/[٪%]+\s*$/, '').trim()
  if (!s) return undefined
  return toNum(s)
}

type Field = 'name' | 'barcode' | 'buyPrice' | 'sellPrice' | 'supplier' | 'pct'

function matchHeader(h: string): Field | null {
  const n = normHeader(h)
  if (!n) return null
  // supplier column — checked FIRST: «نام تأمین‌کننده / Supplier Name» also contains
  // the name tokens, and the supplier meaning must win. Variant list covers Arabic
  // ك/ي + hamza spellings the same way the barcode/باركد pair does (normHeader
  // already strips ZWNJ/spaces and normalizes Persian digits).
  if (
    n.includes('تامینکننده') || n.includes('تأمینکننده') || n.includes('تامينكننده') || n.includes('تأمينكننده') ||
    n.includes('supplier') || n.includes('vendor') || n.includes('سازنده')
  ) return 'supplier'
  // percentage-change column («درصد تغییر») — variants mirror the supplier block:
  // Persian + Arabic ي + the common triple-ی typo (ZWNJ/spaces already stripped by
  // normHeader, so «درصد تغییر» and «درصد تغییرات» both hit 'درصدتغییر' via includes),
  // plus Latin pct/percent/change%. Checked BEFORE the price columns so a
  // «درصد تغییر قیمت خرید»-style header resolves to the percentage, not the price.
  if (
    n.includes('درصد') || n.includes('تغییر') || n.includes('تغیییر') ||
    n.includes('تغيير') || n.includes('تغييير') ||
    n.includes('pct') || n.includes('percent') || n.includes('change%') || n.includes('%change')
  ) return 'pct'
  if (n.includes('بارکد') || n.includes('باركد') || n.includes('barcode') || n === 'ean') return 'barcode'
  if (n.includes('قیمتخرید') || n.includes('buyprice') || n.includes('unitcost') || n.includes('بهاخرید')) return 'buyPrice'
  if (n.includes('قیمتفروش') || n.includes('sellprice')) return 'sellPrice'
  if (n.includes('buy') || n.includes('cost') || n === 'فی' || n.includes('خرید')) return 'buyPrice'
  if (n.includes('فروش') || n === 'price') return 'sellPrice'
  if (n.includes('name') || n.includes('نام') || n.includes('kala') || n.includes('کالا') || n.includes('caption') || n.includes('desc') || n.includes('شرح') || n.includes('محصول') || n.includes('عنوان')) return 'name'
  return null
}

interface PriceRow {
  barcode: string
  name: string
  productId?: number
  matchedName?: string
  oldBuy?: number
  newBuy?: number
  oldSell?: number
  newSell?: number
  status: 'ok' | 'unchanged' | 'notfound' | 'invalid'
  reason?: string
  // supplier column (only present when the column exists and the cell is non-empty)
  supplier?: { id: number; name: string } | null
  supplierStatus?: 'matched' | 'unknown'
  supplierChanged?: boolean
  // percentage-change column (only on matched rows with a valid in-range pct; fills
  // EMPTY price cells only — explicit cells always win)
  pct?: number
}

async function parsePreview(file: File) {
  const buf = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buf, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return { error: 'فایل خالی است' }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' })
  if (!grid.length) return { error: 'فایل خالی است' }

  // header detection over first 10 rows — needs at least one price column
  let headerRowIdx = -1
  let bestScore = 0
  let colMap: Partial<Record<Field, number>> = {}
  for (let r = 0; r < Math.min(10, grid.length); r++) {
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
  if (headerRowIdx < 0 || bestScore < 2 ||
    // pct column counts as a price-ish column (a supplier %-letter with only
    // barcode + «درصد تغییر» is valid — pct fills BOTH price cells)
    (colMap.buyPrice === undefined && colMap.sellPrice === undefined && colMap.pct === undefined)) {
    return { error: 'ستون‌های فایل شناسایی نشدند (حداقل یک ستون قیمت + نام یا بارکد لازم است)' }
  }

  const existing = await db.product.findMany({
    select: { id: true, name: true, nameFa: true, barcode: true, buyPrice: true, sellPrice: true, supplierId: true },
  })
  const byBarcode = new Map<string, typeof existing[number]>()
  const byName = new Map<string, typeof existing[number]>()
  for (const p of existing) {
    if (p.barcode) byBarcode.set(normBarcode(p.barcode), p)
    byName.set(normNameKey(p.name), p)
    if (p.nameFa) byName.set(normNameKey(p.nameFa), p)
  }

  // supplier lookup (normalized, case/space/ZWNJ-insensitive) — Supplier has no
  // nameFa field (schema-checked), so matching is by name only
  const suppliers = colMap.supplier !== undefined
    ? await db.supplier.findMany({ select: { id: true, name: true } })
    : []
  const bySupplierName = new Map<string, { id: number; name: string }>()
  for (const s of suppliers) bySupplierName.set(normNameKey(s.name), { id: s.id, name: s.name })

  const rows: PriceRow[] = []
  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const cell = (f: Field) => (colMap[f] != null ? row[colMap[f]!] : undefined)
    const barcode = normBarcode(cell('barcode'))
    const name = String(cell('name') ?? '').trim()
    const rawBuy = cell('buyPrice')
    const rawSell = cell('sellPrice')
    const newBuy = rawBuy != null && String(rawBuy) !== '' ? toNum(rawBuy) : undefined
    const newSell = rawSell != null && String(rawSell) !== '' ? toNum(rawSell) : undefined
    const pct = colMap.pct !== undefined ? toPct(row[colMap.pct!]) : undefined

    if (!barcode && !name) continue // blank row
    if (newBuy === undefined && newSell === undefined && pct === undefined) {
      rows.push({ barcode, name, status: 'invalid', reason: 'هیچ قیمتی در ردیف نیست' })
      continue
    }
    if ((newBuy !== undefined && newBuy < 0) || (newSell !== undefined && newSell < 0)) {
      rows.push({ barcode, name, status: 'invalid', reason: 'قیمت منفی' })
      continue
    }

    // supplier resolution (any row with a non-empty supplier cell, even notfound ones)
    let supplier: { id: number; name: string } | null = null
    let supplierStatus: 'matched' | 'unknown' | undefined
    if (colMap.supplier !== undefined) {
      const rawSupplier = String(row[colMap.supplier!] ?? '').trim()
      if (rawSupplier) {
        const s = bySupplierName.get(normNameKey(rawSupplier))
        if (s) {
          supplier = s
          supplierStatus = 'matched'
        } else {
          supplierStatus = 'unknown'
        }
      }
    }

    // match: barcode exact → name/nameFa normalized
    const p = (barcode && byBarcode.get(barcode)) || (name && byName.get(normNameKey(name)))
    if (!p) {
      rows.push({
        barcode, name, status: 'notfound', reason: 'کالایی با این بارکد/نام پیدا نشد',
        ...(supplierStatus ? { supplier, supplierStatus } : {}),
      })
      continue
    }

    // percentage column: out-of-range pct poisons the WHOLE matched row — explicit
    // prices don't rescue it (a supplier letter with an absurd percentage is
    // inconsistent and must be fixed at the source). Discount letters are legal:
    // -100 < pct ≤ 1000.
    if (pct !== undefined && (pct <= -100 || pct > 1000)) {
      rows.push({
        barcode, name, productId: p.id, matchedName: p.name,
        oldBuy: p.buyPrice, oldSell: p.sellPrice,
        status: 'invalid', reason: 'درصد تغییر نامعتبر',
        ...(supplierStatus ? { supplier, supplierStatus } : {}),
      })
      continue
    }

    // ONE pct column fills BOTH empty price cells (an explicit cell always wins for
    // its field); pct = 0 computes the current price → flows into 'unchanged' below.
    const effBuy = newBuy !== undefined
      ? newBuy
      : pct !== undefined ? Math.round(p.buyPrice * (1 + pct / 100)) : undefined
    const effSell = newSell !== undefined
      ? newSell
      : pct !== undefined ? Math.round(p.sellPrice * (1 + pct / 100)) : undefined

    const buyChanged = effBuy !== undefined && effBuy !== p.buyPrice
    const sellChanged = effSell !== undefined && effSell !== p.sellPrice
    // supplier reassignment flag — only meaningful once a product matched
    const supplierChanged = supplierStatus === 'matched' && p.supplierId !== supplier!.id
    if (!buyChanged && !sellChanged) {
      rows.push({
        barcode, name, productId: p.id, matchedName: p.name,
        oldBuy: p.buyPrice, newBuy: effBuy, oldSell: p.sellPrice, newSell: effSell,
        status: 'unchanged',
        ...(supplierStatus ? { supplier, supplierStatus, supplierChanged } : {}),
        ...(pct !== undefined ? { pct } : {}),
      })
      continue
    }
    rows.push({
      barcode, name, productId: p.id, matchedName: p.name,
      oldBuy: p.buyPrice, newBuy: buyChanged ? effBuy : undefined,
      oldSell: p.sellPrice, newSell: sellChanged ? effSell : undefined,
      status: 'ok',
      ...(supplierStatus ? { supplier, supplierStatus, supplierChanged } : {}),
      ...(pct !== undefined ? { pct } : {}),
    })
  }

  return {
    rows,
    total: rows.length,
    ok: rows.filter((x) => x.status === 'ok').length,
    unchanged: rows.filter((x) => x.status === 'unchanged').length,
    notfound: rows.filter((x) => x.status === 'notfound').length,
    invalid: rows.filter((x) => x.status === 'invalid').length,
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? ''

    /* ---------- preview (multipart) ---------- */
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'فایل ارسال نشده است' }, { status: 400 })
      }
      const result = await parsePreview(file)
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json(result)
    }

    /* ---------- commit (JSON) ---------- */
    const body = await request.json()
    const userId = Number(body?.userId ?? 0)
    const actor = await db.user.findUnique({ where: { id: userId } })
    const allowed = !!actor && ['OWNER', 'GENERAL_MANAGER', 'OPERATION_MANAGER', 'IT_ADMIN', 'PRODUCT_MANAGER']
      .some((r) => actor.roles.split(',').map((s) => s.trim()).includes(r))
    if (!allowed) {
      return NextResponse.json({ error: 'ثبت قیمت‌ها فقط برای مدیران محصول/عملیات فعال است' }, { status: 403 })
    }

    const rows: Array<{ productId: number; newBuy?: number; newSell?: number; supplierId?: number }> = Array.isArray(body?.rows) ? body.rows : []
    if (rows.length === 0) return NextResponse.json({ error: 'ردیفی برای ثبت نیست' }, { status: 400 })
    if (rows.length > 1000) return NextResponse.json({ error: 'حداکثر ۱۰۰۰ ردیف در هر بار' }, { status: 400 })

    let updated = 0
    let buyChanges = 0
    let sellChanges = 0
    let supplierChanges = 0
    const skipped: string[] = []
    // affected supplier ids (resulting supplierId of each committed row, after
    // possible reassignment) — appended to the audit detail as ` | suppliers=16,20`
    // so /api/suppliers can attribute per-supplier price-import recency.
    const touchedSupplierIds = new Set<number>()
    for (const r of rows) {
      const pid = Number(r?.productId)
      if (!pid) continue
      const p = await db.product.findUnique({ where: { id: pid } })
      if (!p) { skipped.push(`#${pid}`); continue }
      const data: Record<string, number> = {}
      if (r.newBuy !== undefined && Number(r.newBuy) !== p.buyPrice) { data.buyPrice = Number(r.newBuy); buyChanges++ }
      if (r.newSell !== undefined && Number(r.newSell) !== p.sellPrice) { data.sellPrice = Number(r.newSell); sellChanges++ }
      // supplier reassignment — only when the row carries a matched supplierId and
      // it differs from (or fills) the product's current supplier; re-validated here
      if (r.supplierId !== undefined && Number(r.supplierId) !== p.supplierId) {
        const sup = await db.supplier.findUnique({ where: { id: Number(r.supplierId) } })
        if (sup) { data.supplierId = sup.id; supplierChanges++ }
      }
      if (Object.keys(data).length === 0) continue
      await db.product.update({ where: { id: pid }, data })
      const resultingSupplierId = data.supplierId ?? p.supplierId
      if (resultingSupplierId != null) touchedSupplierIds.add(resultingSupplierId)
      updated++
    }

    // machine-readable supplier attribution marker (sorted unique); historical
    // audits simply lack it — parsers must stay tolerant
    const supplierMarker = touchedSupplierIds.size > 0
      ? ` | suppliers=${[...touchedSupplierIds].sort((a, b) => a - b).join(',')}`
      : ''

    await db.auditLog.create({
      data: {
        userId,
        userName: actor.name,
        action: 'PRODUCT_PRICE_IMPORT',
        entity: 'Product',
        entityId: null,
        detail: `ورود گروهی قیمت‌ها — ${updated.toLocaleString('fa-IR')} کالا بروزرسانی شد (خرید: ${buyChanges.toLocaleString('fa-IR')}، فروش: ${sellChanges.toLocaleString('fa-IR')}${supplierChanges > 0 ? ` — تأمین‌کننده: ${supplierChanges.toLocaleString('fa-IR')}` : ''})${supplierMarker}`,
      },
    })

    return NextResponse.json({ updated, buyChanges, sellChanges, supplierChanges, skipped: skipped.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'خطای پردازش' }, { status: 500 })
  }
}
