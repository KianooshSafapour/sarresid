import { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit } from '@/lib/audit'
import { normalizeProductName } from '../route'

// ============ row shape ============

interface ParsedRow {
  name: string
  holooName?: string
  barcode?: string
  price?: number
  stock?: number
  unit?: string
  category?: string
  classification: 'NEW' | 'DUPLICATE' | 'INVALID'
  matchedId?: string
  matchedName?: string
  matchedField?: string
  action: 'CREATE' | 'UPDATE' | 'MERGE' | 'SKIP'
}

// ============ column detection ============

function toEn(s: string): string {
  return String(s || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

const HEADER_MATCHERS: [field: string, re: RegExp][] = [
  ['holooName', /هلو|holoo/i],
  ['barcode', /بارکد|باركد|بار کد|barcode|ean/i],
  ['name', /نام|کالا|عنوان|product|name|title|شرح/i],
  ['price', /قیمت|فروش|price|بها/i],
  ['stock', /موجودی|موجود|stock|تعداد|qty|quantity|count/i],
  ['unit', /واحد|unit/i],
  ['category', /گروه|دسته|طبقه‌بندی|category|class/i],
]

function detectColumns(row: Record<string, unknown>): Record<string, string> {
  const map: Record<string, string> = {} // field -> column key
  for (const key of Object.keys(row)) {
    const header = toEn(String(key)).trim()
    if (!header) continue
    for (const [field, re] of HEADER_MATCHERS) {
      if (map[field]) continue
      if (re.test(header)) { map[field] = key; break }
    }
  }
  return map
}

function num(v: unknown): number | undefined {
  const s = toEn(String(v ?? '')).replace(/[,\s٬]/g, '')
  const m = s.match(/-?\d+(\.\d+)?/)
  if (!m) return undefined
  const n = parseFloat(m[0])
  return isNaN(n) ? undefined : n
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

// ============ classification ============

async function classifyRows(rawRows: Record<string, unknown>[]): Promise<ParsedRow[]> {
  const cols = rawRows.length ? detectColumns(rawRows[0]) : {}

  const products = await db.product.findMany({
    where: { mergedInto: null },
    select: { id: true, name: true, barcode: true, barcodes: true, active: true },
  })

  const byBarcode = new Map<string, (typeof products)[number]>()
  const byName = new Map<string, (typeof products)[number]>()
  for (const p of products) {
    const bcs: string[] = []
    if (p.barcode) bcs.push(p.barcode)
    try { bcs.push(...(JSON.parse(p.barcodes || '[]') as string[])) } catch { /* ignore */ }
    for (const b of bcs) {
      const key = toEn(b).trim()
      if (key && !byBarcode.has(key)) byBarcode.set(key, p)
    }
    const nk = normalizeProductName(p.name)
    if (nk && !byName.has(nk)) byName.set(nk, p)
  }

  const out: ParsedRow[] = []
  for (const raw of rawRows) {
    const name = str(cols.name ? raw[cols.name] : '')
    if (!name) {
      // try to keep any text for display but mark invalid
      const anyVal = Object.values(raw).find((v) => str(v)) 
      out.push({
        name: str(anyVal).slice(0, 60),
        classification: 'INVALID',
        action: 'SKIP',
      })
      continue
    }

    const barcodeVal = cols.barcode ? toEn(str(raw[cols.barcode])) : ''
    const priceVal = cols.price ? num(raw[cols.price]) : undefined
    const stockVal = cols.stock ? num(raw[cols.stock]) : undefined
    const unitVal = cols.unit ? str(raw[cols.unit]) : undefined
    const holooVal = cols.holooName ? str(raw[cols.holooName]) : undefined
    const catVal = cols.category ? str(raw[cols.category]) : undefined

    // duplicate detection: barcode first, then normalized name
    let matched: (typeof products)[number] | undefined
    let matchedField = ''
    if (barcodeVal && byBarcode.has(barcodeVal)) {
      matched = byBarcode.get(barcodeVal)
      matchedField = 'بارکد'
    } else {
      const nk = normalizeProductName(name)
      if (nk && byName.has(nk)) {
        matched = byName.get(nk)
        matchedField = 'نام'
      }
    }

    if (matched) {
      out.push({
        name,
        holooName: holooVal,
        barcode: barcodeVal || undefined,
        price: priceVal,
        stock: stockVal,
        unit: unitVal,
        category: catVal,
        classification: 'DUPLICATE',
        matchedId: matched.id,
        matchedName: matched.name,
        matchedField,
        action: 'UPDATE',
      })
    } else {
      out.push({
        name,
        holooName: holooVal || name,
        barcode: barcodeVal || undefined,
        price: priceVal,
        stock: stockVal,
        unit: unitVal,
        category: catVal,
        classification: 'NEW',
        action: 'CREATE',
      })
    }
  }
  return out
}

// ============ GET: dedupe scan ============

interface DedupeGroupOut {
  key: string
  type: 'NAME' | 'BARCODE'
  products: { id: string; name: string; barcode: string | null; stock: number; minStock: number; unit: string; price: number; image: string | null }[]
}

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_PRODUCTS)) {
    return Response.json({ error: 'اجازه مدیریت محصولات را ندارید' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  if (searchParams.get('dedupeScan') !== '1') {
    return Response.json({ error: 'پارامتر نامعتبر' }, { status: 400 })
  }

  const products = await db.product.findMany({
    where: { active: true, mergedInto: null },
    orderBy: { name: 'asc' },
  })

  // union-find to merge overlapping groups (same name OR shared barcode)
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = parent.get(x) || x
    while (r !== (parent.get(r) || r)) r = parent.get(r) || r
    return r
  }
  const union = (a: string, b: string) => {
    const ra = find(a); const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  for (const p of products) parent.set(p.id, p.id)

  const nameGroups = new Map<string, string[]>()
  const barcodeGroups = new Map<string, string[]>()
  for (const p of products) {
    const nk = normalizeProductName(p.name)
    if (nk) {
      if (!nameGroups.has(nk)) nameGroups.set(nk, [])
      nameGroups.get(nk)!.push(p.id)
    }
    const bcs: string[] = []
    if (p.barcode) bcs.push(p.barcode)
    try { bcs.push(...(JSON.parse(p.barcodes || '[]') as string[])) } catch { /* ignore */ }
    for (const b of new Set(bcs.map((x) => toEn(x).trim()).filter(Boolean))) {
      if (!barcodeGroups.has(b)) barcodeGroups.set(b, [])
      barcodeGroups.get(b)!.push(p.id)
    }
  }
  for (const ids of nameGroups.values()) for (let i = 1; i < ids.length; i++) union(ids[0], ids[i])
  for (const ids of barcodeGroups.values()) for (let i = 1; i < ids.length; i++) union(ids[0], ids[i])

  const byRoot = new Map<string, Set<string>>()
  for (const p of products) {
    const root = find(p.id)
    if (!byRoot.has(root)) byRoot.set(root, new Set())
    byRoot.get(root)!.add(p.id)
  }

  const groups: DedupeGroupOut[] = []
  for (const ids of byRoot.values()) {
    if (ids.size < 2) continue
    const members = products.filter((p) => ids.has(p.id))
    const sharedBarcode = members.find((p) => {
      const bcs = new Set([p.barcode || '', ...(JSON.parse(p.barcodes || '[]') as string[])].map((x) => toEn(x).trim()).filter(Boolean))
      return Array.from(bcs).some((b) => (barcodeGroups.get(b) || []).every((id) => ids.has(id)) && ids.size > 1)
    })
    groups.push({
      key: sharedBarcode ? sharedBarcode.barcode || sharedBarcode.name : members[0].name,
      type: sharedBarcode ? 'BARCODE' : 'NAME',
      products: members.map((p) => ({
        id: p.id, name: p.name, barcode: p.barcode, stock: p.stock, minStock: p.minStock, unit: p.unit, price: p.price, image: p.image,
      })),
    })
  }

  groups.sort((a, b) => b.products.length - a.products.length)
  return Response.json({ groups })
}

// ============ POST: multipart parse OR json apply ============

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_PRODUCTS)) {
    return Response.json({ error: 'اجازه مدیریت محصولات را ندارید' }, { status: 403 })
  }

  const contentType = req.headers.get('content-type') || ''

  // ---- mode: parse (multipart xlsx upload) ----
  if (contentType.includes('multipart/form-data')) {
    try {
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        return Response.json({ error: 'فایلی ارسال نشده است' }, { status: 400 })
      }
      if (!/\.(xlsx|xls)$/i.test(file.name)) {
        return Response.json({ error: 'فقط فایل اکسل (xlsx/xls) مجاز است' }, { status: 400 })
      }
      const buf = Buffer.from(await file.arrayBuffer())
      const wb = XLSX.read(buf, { type: 'buffer' })
      const sheetName = wb.SheetNames[0]
      if (!sheetName) return Response.json({ error: 'فایل اکسل خالی است' }, { status: 400 })
      const sheet = wb.Sheets[sheetName]
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      const rows = await classifyRows(rawRows)
      const counts = {
        new: rows.filter((r) => r.classification === 'NEW').length,
        duplicate: rows.filter((r) => r.classification === 'DUPLICATE').length,
        invalid: rows.filter((r) => r.classification === 'INVALID').length,
      }
      await logAudit(session.id, session.name, 'IMPORT_HOLOO_PARSE', 'PRODUCT', undefined, { file: file.name, rows: rows.length, ...counts })
      return Response.json({ rows, counts, sheet: sheetName })
    } catch (e) {
      console.error('import-holoo parse failed:', e)
      return Response.json({ error: 'خواندن فایل اکسل ناموفق بود — فرمت فایل را بررسی کنید' }, { status: 400 })
    }
  }

  // ---- mode: apply ----
  const body = (await req.json().catch(() => null)) as { mode?: string; rows?: ParsedRow[] } | null
  if (!body || body.mode !== 'apply' || !Array.isArray(body.rows)) {
    return Response.json({ error: 'درخواست نامعتبر است' }, { status: 400 })
  }

  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0
  const errorMessages: string[] = []

  for (const row of body.rows) {
    try {
      const name = String(row.name || '').trim()
      if (!name) { skipped++; continue }

      if (row.classification === 'INVALID' || row.action === 'SKIP') { skipped++; continue }

      if (row.action === 'CREATE' || !row.matchedId) {
        await db.product.create({
          data: {
            name,
            holooName: row.holooName || name,
            barcode: row.barcode || null,
            barcodes: JSON.stringify(row.barcode ? [row.barcode] : []),
            price: row.price ?? 0,
            stock: row.stock ?? 0,
            unit: row.unit || 'عدد',
            category: row.category || null,
            minStock: 10,
          },
        })
        created++
        continue
      }

      // UPDATE / MERGE — update price/stock/barcode/unit/category on existing product
      const existing = await db.product.findUnique({ where: { id: row.matchedId } })
      if (!existing) { errors++; errorMessages.push(`${name}: محصول قبلی یافت نشد`); continue }

      const data: Record<string, unknown> = {}
      if (row.price !== undefined && row.price !== null) data.price = row.price
      if (row.stock !== undefined && row.stock !== null) data.stock = row.stock
      if (row.unit) data.unit = row.unit
      if (row.category) data.category = row.category
      if (row.holooName && !existing.holooName) data.holooName = row.holooName
      if (row.barcode) {
        let barcodes: string[] = []
        try { barcodes = JSON.parse(existing.barcodes || '[]') } catch { barcodes = [] }
        const bc = toEn(String(row.barcode)).trim()
        const primary = existing.barcode ? toEn(existing.barcode).trim() : ''
        const all = new Set([primary, ...barcodes.map(toEn)].filter(Boolean))
        if (bc && !all.has(bc)) {
          data.barcode = bc
          data.barcodes = JSON.stringify([...barcodes, bc])
        }
      }
      if (Object.keys(data).length > 0) {
        await db.product.update({ where: { id: existing.id }, data: data as never })
      }
      updated++
    } catch (e) {
      errors++
      errorMessages.push(`${row.name}: ${(e as Error).message}`)
    }
  }

  await logAudit(session.id, session.name, 'IMPORT_HOLOO_APPLY', 'PRODUCT', undefined, { created, updated, skipped, errors })
  return Response.json({ created, updated, skipped, errors, errorMessages: errorMessages.slice(0, 5) })
}
