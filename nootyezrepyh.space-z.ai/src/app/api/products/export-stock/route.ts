import { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit } from '@/lib/audit'
import { logExport } from '@/lib/exports'
import { formatJalaliDateTime } from '@/lib/jalali'

/** GET /api/products/export-stock — full stock list Excel (RTL) with stock-value summary */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ACCOUNTING) && !canUser(session.roles, PERMISSIONS.VIEW_REPORTS)) {
    return Response.json({ error: 'دریافت فایل موجودی فقط برای حسابدار و مدیر مجاز است' }, { status: 403 })
  }

  try {
    const products = await db.product.findMany({
      where: { active: true, mergedInto: null },
      include: { company: { select: { name: true } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    })

    const statusFa = (p: { stock: number; minStock: number }): string => {
      if (p.stock <= p.minStock * 0.5) return 'کمبود جدی'
      if (p.stock <= p.minStock) return 'در حال اتمام'
      return 'نرمال'
    }

    const header = ['بارکد', 'نام کالا', 'نام در هلو', 'دسته', 'شرکت', 'موجودی', 'حداقل موجودی', 'واحد', 'قیمت خرید', 'قیمت فروش', 'ارزش موجودی (خرید)', 'وضعیت']
    const rows: (string | number)[][] = [header]
    let totalValue = 0
    let criticalCount = 0
    let lowCount = 0

    for (const p of products) {
      const st = statusFa(p)
      if (st === 'کمبود جدی') criticalCount++
      else if (st === 'در حال اتمام') lowCount++
      const stockValue = Math.round(p.cost * p.stock)
      totalValue += stockValue
      rows.push([
        p.barcode || '',
        p.name,
        p.holooName || '',
        p.category || '',
        p.company?.name || '',
        p.stock,
        p.minStock,
        p.unit,
        Math.round(p.cost),
        Math.round(p.price),
        stockValue,
        st,
      ])
    }
    rows.push([
      '',
      `جمع کل — ${products.length} کالا`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      totalValue,
      `${criticalCount} جدی / ${lowCount} کم`,
    ])

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 26 }, { wch: 12 }, { wch: 16 }, { wch: 9 }, { wch: 11 }, { wch: 8 }, { wch: 13 }, { wch: 13 }, { wch: 16 }, { wch: 11 }]
    ;(ws as Record<string, unknown>)['!views'] = [{ RTL: true }]
    // money + numeric formats
    const range = XLSX.utils.decode_range(ws['!ref'] as string)
    for (let R = 1; R <= range.e.r; R++) {
      for (const C of [5, 6, 8, 9, 10]) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C })
        const cell = ws[addr]
        if (cell && typeof cell.v === 'number') cell.z = '#,##0'
      }
    }

    const wb = XLSX.utils.book_new()
    wb.Workbook = { Views: [{ RTL: true }] }
    XLSX.utils.book_append_sheet(wb, ws, 'Stock')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    await Promise.all([
      logAudit(session.id, session.name, 'EXPORT_STOCK_XLSX', 'PRODUCT', 'stock-list', { count: products.length, totalValue }),
      logExport({
        kind: 'STOCK_XLSX',
        label: `لیست موجودی انبار — ${products.length} کالا`,
        rows: products.length,
        userId: session.id,
        userName: session.name,
        at: new Date().toISOString(),
        atJalali: formatJalaliDateTime(new Date()),
      }),
    ])

    const fileName = `zeytoon-stock-${new Date().toISOString().slice(0, 10)}.xlsx`
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('export-stock error', e)
    return Response.json({ error: 'خطا در تولید فایل موجودی' }, { status: 500 })
  }
}
