import { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit } from '@/lib/audit'
import { logExport } from '@/lib/exports'
import { formatJalaliDateTime } from '@/lib/jalali'

/** GET /api/orders/[id]/export-xlsx — build the Holoo-ready Excel sheet (RTL) */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ACCOUNTING)) {
    return Response.json({ error: 'فقط حسابدار اجازهٔ دریافت فایل هلو را دارد' }, { status: 403 })
  }

  const { id } = await params
  try {
    const order = await db.order.findUnique({ where: { id }, include: { items: true, supplier: true } })
    if (!order) return Response.json({ error: 'سفارش یافت نشد' }, { status: 404 })
    if (!['INSPECTED', 'TO_HOLOO', 'DONE'].includes(order.status)) {
      return Response.json({ error: 'فایل اکسل فقط بعد از کنترل انبار قابل دریافت است' }, { status: 400 })
    }

    // net line totals used as the proportional base for order-level tax/vat
    const subtotal = order.items.reduce((s, i) => s + i.lineTotal, 0) || 0

    const header = ['بارکد', 'نام در هلو', 'تعداد', 'قیمت واحد', 'تخفیف', 'مالیات', 'ارزش افزوده', 'جمع کل']
    const rows: (string | number)[][] = [header]
    for (const it of order.items) {
      const qty = it.receivedQty ?? it.quantity
      const unitPrice = it.printedPrice && it.printedPrice > 0 ? it.printedPrice : it.unitPrice
      const share = subtotal > 0 ? it.lineTotal / subtotal : 0
      const taxShare = Math.round((order.tax || 0) * share)
      const vatShare = Math.round((order.vat || 0) * share)
      const rowTotal = it.lineTotal + taxShare + vatShare
      rows.push([
        it.barcode || '',
        it.holooName || it.productName,
        qty,
        unitPrice,
        it.discount || 0,
        taxShare,
        vatShare,
        rowTotal,
      ])
    }
    rows.push(['', 'جمع کل', '', '', order.discount || 0, order.tax || 0, order.vat || 0, order.finalAmount || 0])

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 18 }, { wch: 34 }, { wch: 9 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }]
    // right-to-left sheet
    ;(ws as Record<string, unknown>)['!views'] = [{ RTL: true }]
    // money number formats
    const range = XLSX.utils.decode_range(ws['!ref'] as string)
    for (let R = 1; R <= range.e.r; R++) {
      for (const C of [3, 4, 5, 6, 7]) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C })
        const cell = ws[addr]
        if (cell && typeof cell.v === 'number') cell.z = '#,##0'
      }
    }

    const wb = XLSX.utils.book_new()
    wb.Workbook = { Views: [{ RTL: true }] }
    XLSX.utils.book_append_sheet(wb, ws, `Order-${order.number}`)
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    await db.order.update({ where: { id: order.id }, data: { exportedAt: new Date() } })
    await Promise.all([
      logAudit(session.id, session.name, 'EXPORT_XLSX', 'ORDER', order.id, { number: order.number }),
      logExport({
        kind: 'ORDER_XLSX',
        label: `سفارش #${order.number} — ${order.supplier.name}`,
        rows: order.items.length,
        userId: session.id,
        userName: session.name,
        at: new Date().toISOString(),
        atJalali: formatJalaliDateTime(new Date()),
      }),
    ])

    const fileName = `order-${order.number}.xlsx`
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('export-xlsx error', e)
    return Response.json({ error: 'خطا در تولید فایل اکسل' }, { status: 500 })
  }
}
