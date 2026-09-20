import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { isoToJalali } from '@/lib/jalali'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* Per-supplier price-list XLS export (round-trip with POST /api/products/prices):
 *  GET /api/export/price-list?supplierId=&userId= → single-supplier .xls
 *  GET /api/export/price-list?all=1&userId=      → ONE workbook, ONE SHEET PER SUPPLIER
 *                                                  (accountant month-end pack; suppliers
 *                                                  with ≥1 active product, name asc)
 *  Columns are EXACTLY the import headers («بارکد | نام کالا | قیمت خرید | قیمت فروش | تأمین‌کننده»)
 *  so the file can be edited in Excel and re-imported without any renaming.
 *  Role-gated like the cheque export (plus PRODUCT_MANAGER).
 */

function hasRole(u: { roles: string } | null | undefined, role: string) {
  return !!u && u.roles.split(',').map((s) => s.trim()).includes(role)
}

function faDate(iso: string | Date): string {
  try {
    const j = isoToJalali(iso)
    return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`
  } catch {
    return String(iso).slice(0, 10)
  }
}

/** Latin slug for the filename — falls back to supplier id when the name has no Latin chars */
function slugify(name: string, id: number): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return s || `supplier-${id}`
}

/** Excel sheet name: only a-z0-9- by construction (never []:*?/\), capped at 31 chars;
 *  collisions resolved by the unique `supplier-<id>` fallback. */
function sheetName(name: string, id: number, used: Set<string>): string {
  const base = slugify(name, id).slice(0, 31).replace(/-+$/g, '') || `supplier-${id}`
  const candidate = used.has(base.toLowerCase()) ? `supplier-${id}` : base
  used.add(candidate.toLowerCase())
  return candidate
}

type PriceProduct = { barcode: string | null; name: string; nameFa: string | null; buyPrice: number; sellPrice: number }

/** identical layout for single + multi-sheet exports: title row, count line, blank row,
 *  then the EXACT import headers so export → edit → import round-trips */
function buildPriceListAoa(supplierName: string, products: PriceProduct[], today: string): Array<Array<string | number>> {
  const aoa: Array<Array<string | number>> = [
    [`فهرست قیمت — ${supplierName} — ${today} — هایپر زیتون`],
    [`تعداد اقلام: ${products.length.toLocaleString('fa-IR')}`],
    [],
    // EXACTLY the import headers so export → edit → import round-trips
    ['بارکد', 'نام کالا', 'قیمت خرید', 'قیمت فروش', 'تأمین‌کننده'],
  ]
  for (const p of products) {
    aoa.push([
      p.barcode ?? '',
      p.nameFa || p.name,
      p.buyPrice,
      p.sellPrice,
      supplierName,
    ])
  }
  return aoa
}

const PRICE_LIST_COLS = [{ wch: 16 }, { wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 28 }]

// GET /api/export/price-list?supplierId=&userId=  (or all=1) → XLS price list(s)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const supplierId = Number(searchParams.get('supplierId') ?? 0)
    const all = searchParams.get('all') === '1'
    const userId = Number(searchParams.get('userId') ?? 0)

    const actor = userId ? await db.user.findUnique({ where: { id: userId } }) : null
    const allowed = hasRole(actor, 'ACCOUNTANT') || hasRole(actor, 'GENERAL_MANAGER') ||
      hasRole(actor, 'OWNER') || hasRole(actor, 'IT_ADMIN') || hasRole(actor, 'PRODUCT_MANAGER')
    if (!allowed) {
      return NextResponse.json({ error: 'خروجی فهرست قیمت فقط برای حسابدار/مدیران فعال است' }, { status: 403 })
    }

    if (!all && !supplierId) {
      return NextResponse.json({ error: 'شناسه تأمین‌کننده الزامی است' }, { status: 400 })
    }

    const j = isoToJalali(new Date())
    const today = faDate(new Date())

    /* ---------- multi-sheet workbook: one sheet per supplier (month-end pack) ---------- */
    if (all) {
      // suppliers having at least one active, non-merged product — ordered by name
      const suppliers = await db.supplier.findMany({
        where: { products: { some: { active: true, mergedInto: null } } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
      if (suppliers.length === 0) {
        return NextResponse.json({ error: 'هیچ تأمین‌کننده‌ای با کالای فعال یافت نشد' }, { status: 400 })
      }
      const allProducts = await db.product.findMany({
        where: { supplierId: { in: suppliers.map((s) => s.id) }, active: true, mergedInto: null },
        select: { supplierId: true, barcode: true, name: true, nameFa: true, buyPrice: true, sellPrice: true },
        orderBy: { name: 'asc' },
      })
      const bySupplier = new Map<number, PriceProduct[]>()
      for (const p of allProducts) {
        if (p.supplierId == null) continue
        const list = bySupplier.get(p.supplierId) ?? []
        list.push(p)
        bySupplier.set(p.supplierId, list)
      }

      const wb = XLSX.utils.book_new()
      wb.Workbook = { Views: [{ RTL: true }] }
      const used = new Set<string>()
      for (const s of suppliers) {
        const products = bySupplier.get(s.id) ?? []
        if (products.length === 0) continue
        const ws = XLSX.utils.aoa_to_sheet(buildPriceListAoa(s.name, products, today))
        ws['!cols'] = PRICE_LIST_COLS
        XLSX.utils.book_append_sheet(wb, ws, sheetName(s.name, s.id, used))
      }
      const totalRows = allProducts.length

      await db.auditLog.create({
        data: {
          userId,
          userName: actor?.name ?? 'سیستم',
          action: 'PRICE_LIST_EXPORT',
          entity: 'Supplier',
          entityId: null,
          detail: `خروجی همه فهرست‌های قیمت — ${suppliers.length.toLocaleString('fa-IR')} تأمین‌کننده — ${totalRows.toLocaleString('fa-IR')} قلم`,
        },
      })

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer
      const filename = `price-lists-all-${j.jy}-${j.jm}.xls`
      return new Response(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/vnd.ms-excel',
          'Content-Disposition': `attachment; filename=${filename}`,
          'Cache-Control': 'no-store',
        },
      })
    }

    /* ---------- single-supplier path (unchanged) ---------- */
    const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
    if (!supplier) {
      return NextResponse.json({ error: 'تأمین‌کننده یافت نشد' }, { status: 400 })
    }

    // same filters as the products listing: active + not merged away
    const products = await db.product.findMany({
      where: { supplierId, active: true, mergedInto: null },
      select: { barcode: true, name: true, nameFa: true, buyPrice: true, sellPrice: true },
      orderBy: { name: 'asc' },
    })

    const aoa = buildPriceListAoa(supplier.name, products, today)

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = PRICE_LIST_COLS

    const wb = XLSX.utils.book_new()
    wb.Workbook = { Views: [{ RTL: true }] }
    XLSX.utils.book_append_sheet(wb, ws, 'PriceList')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer

    await db.auditLog.create({
      data: {
        userId,
        userName: actor?.name ?? 'سیستم',
        action: 'PRICE_LIST_EXPORT',
        entity: 'Supplier',
        entityId: supplierId,
        detail: `خروجی فهرست قیمت ${supplier.name} — ${products.length.toLocaleString('fa-IR')} قلم`,
      },
    })

    const filename = `price-list-${slugify(supplier.name, supplierId)}-${j.jy}-${j.jm}.xls`
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.ms-excel',
        'Content-Disposition': `attachment; filename=${filename}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
