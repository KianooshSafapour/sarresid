import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { jalaliToISO } from '@/lib/jalali'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------- text normalization (mirrors products/parse + customer-requests conventions) ----------
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

function normalizeDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
}

/** normalize Arabic ya/kaf too — Holoo exports often use ك/ي */
function fixArabic(s: string): string {
  return s.replace(/ك/g, 'ک').replace(/ي/g, 'ی')
}

function normHeader(s: unknown): string {
  return fixArabic(normalizeDigits(String(s ?? '')))
    .toLowerCase()
    .replace(/[\s\u200c_\-–—.()()/]/g, '')
}

function normBarcode(v: unknown): string {
  if (v == null) return ''
  let s = String(v).trim()
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '') // Excel numeric barcode strip .0
  s = fixArabic(normalizeDigits(s)).replace(/\s+/g, '')
  if (s === '0') return ''
  return s
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const s = fixArabic(normalizeDigits(String(v))).replace(/[,٬\s]/g, '')
  const n = parseFloat(s)
  return isFinite(n) ? n : 0
}

function normNameKey(v: unknown): string {
  return fixArabic(normalizeDigits(String(v ?? '')))
    .toLowerCase()
    .replace(/[\s\u200c\-–_]/g, '')
}

/** server-local calendar day key YYYY-MM-DD */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---------- date parsing (Jalali or Gregorian, or Excel serial) ----------
function parseDateCell(v: unknown): Date | null {
  if (v == null || v === '') return null
  // Excel serial number (1900 system) → 20000..60000 covers 1954..2064
  if (typeof v === 'number' || /^\d{4,6}(\.0+)?$/.test(String(v).trim())) {
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (Number.isFinite(n) && n > 20000 && n < 60000) {
      const iso = new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10)
      return new Date(iso + 'T00:00:00')
    }
  }
  const s = fixArabic(normalizeDigits(String(v).trim()))
  const m = s.match(/(\d{3,4})\D{1,2}(\d{1,2})\D{1,2}(\d{1,2})/)
  if (!m) {
    const d = new Date(String(v))
    return isNaN(d.getTime()) ? null : d
  }
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null
  if (y >= 1900) {
    return new Date(`${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}T00:00:00`)
  }
  if (y >= 1300 && y <= 1600) {
    // Jalali (e.g. 1405/06/19) → Gregorian via jalaali-js
    try {
      return new Date(jalaliToISO(y, mo, da) + 'T00:00:00')
    } catch {
      return null
    }
  }
  return null
}

// ---------- header matching ----------
type Field = 'name' | 'barcode' | 'qty' | 'unitPrice' | 'total' | 'date' | 'seller'

function matchHeader(h: string): Field | null {
  const n = normHeader(h)
  if (!n) return null
  // seller first — «نام فروشنده» would otherwise hit name/فروش patterns
  if (n.includes('فروشنده') || n.includes('ویزیتور') || n.includes('پرسنل') || n.includes('seller')) return 'seller'
  if (n.includes('بارکد') || n.includes('باركد') || n.includes('barcode') || n.includes('ean')) return 'barcode'
  if (n.includes('تاریخ') || n === 'date' || n.includes('date')) return 'date'
  if (
    n.includes('قیمتفروش') || n.includes('فیفروش') || n.includes('قیمتواحد') || n.includes('بهاواحد') ||
    n.includes('unitprice') || n.includes('sellprice') || (n.includes('قیمت') && !n.includes('خرید')) || n === 'فی'
  ) return 'unitPrice'
  if (n.includes('مبلغکل') || n.includes('جمعکل') || n.includes('مبلغ') || n.includes('فیکل') || n.includes('total') || n === 'جمع') return 'total'
  if (n.includes('تعداد') || n.includes('مقدار') || n.includes('چند') || n === 'qty' || n.includes('quantity')) return 'qty'
  if (n.includes('نام') || n.includes('کالا') || n.includes('شرح') || n.includes('name') || n.includes('caption') || n.includes('desc')) return 'name'
  return null
}

function cellOf(row: unknown[], col: number | undefined): unknown {
  return col != null ? row[col] : undefined
}

// ---------- sellers (SALESPERSON / CASHIER) ----------
function roleList(roles: string): string[] {
  return roles.split(',').map((r) => r.trim())
}

async function loadSellers() {
  const users = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, roles: true },
  })
  return users.filter((u) => roleList(u.roles).some((r) => r === 'SALESPERSON' || r === 'CASHIER'))
}

/** fuzzy normalized-contains match of a Holoo seller name against staff names */
function matchSeller(sellerName: string, sellers: { id: number; name: string }[]): number | undefined {
  const raw = sellerName.trim()
  if (!raw) return undefined
  const cleaned = fixArabic(normalizeDigits(raw.toLowerCase()))
    .replace(/\b(mr|ms|mrs|dr)\b/g, '')
    .replace(/خانم|آقای|اقای|جناب|سرکار/g, '')
    .replace(/[\s\u200c\-–_.]/g, '')
  if (!cleaned) return undefined
  for (const s of sellers) {
    const variants = [s.name, s.name.replace(/\(.*\)/, '')]
    for (const v of variants) {
      const k = normNameKey(v)
      if (!k) continue
      if (k.includes(cleaned) || cleaned.includes(k)) return s.id
    }
  }
  return undefined
}

// ---------- dedup key helpers ----------
type SaleLite = { id: number; name: string; productId: number | null; qty: number; total: number; createdAt: Date }

function rowKey(namePart: string, qty: number, total: number, d: Date): string {
  return `${namePart}|${qty}|${Math.round(total)}|${dayKey(d)}`
}

function saleKey(s: SaleLite, productNames: Map<number, string>): string {
  const namePart = s.productId ? normNameKey(productNames.get(s.productId) ?? s.name) : normNameKey(s.name)
  return rowKey(namePart, s.qty, s.total, new Date(s.createdAt))
}

async function existingSaleKeys(productNames: Map<number, string>) {
  const since = new Date(Date.now() - 90 * 86400000)
  const sales = await db.sale.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, name: true, productId: true, qty: true, total: true, createdAt: true },
  })
  const set = new Set<string>()
  const byId = new Map<string, number>()
  for (const s of sales) {
    const k = saleKey(s, productNames)
    set.add(k)
    byId.set(k, s.id)
  }
  return { set, byId }
}

// ============================ POST /api/sales/import ============================

export async function POST(request: Request) {
  const ct = request.headers.get('content-type') ?? ''
  if (ct.includes('multipart/form-data')) return parsePreview(request)
  return commit(request)
}

/* ------------------------------------------------------------------ */
/* PARSE-ONLY PREVIEW (multipart, field 'file' + userId) — no DB writes */
/* ------------------------------------------------------------------ */
async function parsePreview(request: Request) {
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
    if (headerRowIdx < 0 || bestScore < 2) {
      return NextResponse.json(
        { error: 'ستون‌های فایل شناسایی نشدند — فایل باید حداقل نام کالا/بارکد و تعداد داشته باشد' },
        { status: 400 }
      )
    }

    // reference data
    const [products, sellers] = await Promise.all([
      db.product.findMany({ select: { id: true, name: true, nameFa: true, barcode: true } }),
      loadSellers(),
    ])
    const byBarcode = new Map<string, number>()
    const byName = new Map<string, number>()
    for (const p of products) {
      if (p.barcode) byBarcode.set(normBarcode(p.barcode), p.id)
      // Holoo exports Persian descriptions — index both English name and nameFa
      const nk = normNameKey(p.name)
      if (nk && !byName.has(nk)) byName.set(nk, p.id)
      const fk = normNameKey(p.nameFa ?? '')
      if (fk && !byName.has(fk)) byName.set(fk, p.id)
    }

    const { set: dupSet, byId: dupById } = await existingSaleKeys(
      new Map(products.map((p) => [p.id, p.name]))
    )

    type ImportRow = {
      name: string
      barcode: string
      qty: number
      unitPrice: number
      total: number
      isoDate: string
      sellerName?: string
      sellerId?: number
      sellerMatched: boolean
      productId?: number
      matchedName?: string
      matched?: boolean
      duplicateOfId?: number
      status: 'ok' | 'duplicate' | 'invalid'
      reason?: string
    }
    const rows: ImportRow[] = []

    for (let r = headerRowIdx + 1; r < grid.length; r++) {
      const row = grid[r] ?? []
      const rawName = fixArabic(String(cellOf(row, colMap.name) ?? '').trim())
      const barcode = normBarcode(cellOf(row, colMap.barcode))
      const qty = toNum(cellOf(row, colMap.qty))
      let unitPrice = toNum(cellOf(row, colMap.unitPrice))
      let total = toNum(cellOf(row, colMap.total))
      const dateCell = cellOf(row, colMap.date)
      const parsedDate = colMap.date !== undefined ? parseDateCell(dateCell) : null
      const date = parsedDate ?? new Date()
      const sellerName = fixArabic(String(cellOf(row, colMap.seller) ?? '').trim())

      if (!rawName && !barcode) continue // fully empty row

      // validity: name OR barcode present AND qty > 0
      if ((!rawName && !barcode) || qty <= 0) {
        rows.push({
          name: rawName || barcode,
          barcode,
          qty,
          unitPrice,
          total,
          isoDate: date.toISOString(),
          sellerMatched: false,
          ...(sellerName ? { sellerName } : {}),
          status: 'invalid',
          reason: !qty || qty <= 0 ? 'تعداد نامعتبر است' : 'نام یا بارکد کالا مشخص نیست',
        })
        continue
      }

      // derive missing money fields
      if (!total && qty > 0 && unitPrice > 0) total = qty * unitPrice
      if (!unitPrice && total > 0 && qty > 0) unitPrice = Math.round(total / qty)

      // product match: barcode exact, else normalized name key
      let productId: number | undefined
      if (barcode) {
        const hit = byBarcode.get(barcode)
        if (hit) productId = hit
      }
      if (!productId && rawName) {
        const hit = byName.get(normNameKey(rawName))
        if (hit) productId = hit
      }
      const matchedName = productId ? products.find((p) => p.id === productId)?.name : undefined

      // seller match
      const sellerId = sellerName ? matchSeller(sellerName, sellers) : undefined

      // dedup vs last-90-days sales (name part prefers the matched product name so
      // Persian/English variants of the same product still collide)
      const namePart = productId ? normNameKey(matchedName ?? rawName) : normNameKey(rawName) || barcode
      const key = rowKey(namePart, qty, total, date)
      const duplicateOf = dupSet.has(key) ? dupById.get(key) : undefined

      let status: 'ok' | 'duplicate' | 'invalid' = 'ok'
      let reason: string | undefined
      if (duplicateOf) {
        status = 'duplicate'
        reason = 'همین فروش قبلاً ثبت شده است'
      }

      rows.push({
        name: rawName || matchedName || barcode,
        barcode,
        qty,
        unitPrice,
        total: Math.round(total),
        isoDate: date.toISOString(),
        sellerMatched: !!sellerId,
        ...(sellerName ? { sellerName } : {}),
        ...(sellerId ? { sellerId } : {}),
        ...(productId ? { productId, matchedName } : {}),
        matched: !!productId,
        ...(duplicateOf ? { duplicateOfId: duplicateOf } : {}),
        status,
        ...(reason ? { reason } : {}),
      })
    }

    const ok = rows.filter((x) => x.status === 'ok').length
    const duplicates = rows.filter((x) => x.status === 'duplicate').length
    const invalid = rows.filter((x) => x.status === 'invalid').length

    return NextResponse.json({
      rows,
      total: rows.length,
      ok,
      duplicates,
      invalid,
      sellers: sellers.map((s) => ({ id: s.id, name: s.name })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'خطای پردازش فایل' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/* COMMIT (JSON) — creates Sale rows, single audit, no points          */
/* ------------------------------------------------------------------ */

const IMPORT_ROLES = ['OWNER', 'GENERAL_MANAGER', 'OPERATION_MANAGER', 'IT_ADMIN', 'ACCOUNTANT']
const MAX_ROWS = 1000

async function commit(request: Request) {
  try {
    const b = await request.json()
    const userId = Number(b?.userId)
    if (!userId) return NextResponse.json({ error: 'شناسه کاربر الزامی است' }, { status: 400 })

    const actor = await db.user.findUnique({ where: { id: userId } })
    if (!actor || !actor.active) {
      return NextResponse.json({ error: 'کاربر نامعتبر یا غیرفعال است' }, { status: 403 })
    }
    if (!roleList(actor.roles).some((r) => IMPORT_ROLES.includes(r))) {
      return NextResponse.json(
        { error: 'شما اجازه ورود فروش از هولو را ندارید — این عملیات مخصوص مدیریت و حسابداری است' },
        { status: 403 }
      )
    }

    const inRows: Array<Record<string, unknown>> = Array.isArray(b?.rows) ? b.rows : []
    if (inRows.length === 0) return NextResponse.json({ error: 'ردیفی برای ثبت ارسال نشده است' }, { status: 400 })
    if (inRows.length > MAX_ROWS) {
      return NextResponse.json({ error: `حداکثر ${MAX_ROWS} ردیف در هر بار ثبت مجاز است` }, { status: 400 })
    }
    const force = b?.force === true

    // reference data
    const products = await db.product.findMany({ select: { id: true, name: true } })
    const productNames = new Map(products.map((p) => [p.id, p.name]))
    const { set: dupSet } = await existingSaleKeys(productNames)

    // validate defaultSeller once (if provided)
    let defaultSellerId: number | null = null
    if (b?.defaultSellerId) {
      const ds = await db.user.findFirst({ where: { id: Number(b.defaultSellerId), active: true }, select: { id: true } })
      if (ds) defaultSellerId = ds.id
    }

    type NewSale = {
      productId: number | null
      name: string
      qty: number
      unitPrice: number
      total: number
      channel: string
      salespersonId: number
      cashierId: null
      note: string
      createdAt: Date
    }
    const toCreate: NewSale[] = []
    let invalid = 0
    let skippedDuplicates = 0

    for (const raw of inRows) {
      const name = String(raw?.name ?? '').trim() || String(raw?.barcode ?? '').trim()
      const qty = Number(raw?.qty)
      if (!name || !Number.isFinite(qty) || qty <= 0) {
        invalid++
        continue
      }
      let unitPrice = Number(raw?.unitPrice)
      const totalIn = Number(raw?.total)
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        unitPrice = Number.isFinite(totalIn) && totalIn > 0 ? Math.round(totalIn / qty) : 0
      }
      const total = Math.round(Number.isFinite(totalIn) && totalIn > 0 ? totalIn : qty * unitPrice)

      // seller: row.sellerId ?? defaultSellerId ?? actor — all validated
      let sellerId: number | null = null
      if (raw?.sellerId) {
        const s = await db.user.findFirst({ where: { id: Number(raw.sellerId), active: true }, select: { id: true } })
        if (s) sellerId = s.id
      }
      if (!sellerId) sellerId = defaultSellerId ?? userId

      const productId = Number(raw?.productId) > 0 ? Number(raw.productId) : null
      const d = raw?.isoDate ? new Date(String(raw.isoDate)) : new Date()
      const createdAt = isNaN(d.getTime()) ? new Date() : d

      // dedup safety (re-check like preview) — unless force
      const namePart = productId ? normNameKey(productNames.get(productId) ?? name) : normNameKey(name)
      const key = rowKey(namePart, qty, total, createdAt)
      if (!force && dupSet.has(key)) {
        skippedDuplicates++
        continue
      }
      dupSet.add(key) // also catch in-file duplicates

      toCreate.push({
        productId,
        name,
        qty,
        unitPrice,
        total,
        channel: 'WALKIN',
        salespersonId: sellerId,
        cashierId: null,
        note: 'ورود از هولو | Holoo import',
        createdAt,
      })
    }

    if (toCreate.length > 0) {
      await db.sale.createMany({ data: toCreate })
    }

    const sumTotal = toCreate.reduce((s, r) => s + r.total, 0)
    await db.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        action: 'SALES_IMPORT',
        entity: 'Sale',
        entityId: null,
        detail: `ورود ${toCreate.length.toLocaleString('fa-IR')} قلم فروش از فایل هولو — مجموع ${sumTotal.toLocaleString('fa-IR')} تومان`,
      },
    })

    return NextResponse.json({ created: toCreate.length, skippedDuplicates, invalid })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'خطا در ثبت فروش' }, { status: 400 })
  }
}
