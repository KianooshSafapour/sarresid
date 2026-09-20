import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// GET /api/export/order/[id] → .xls invoice (SheetJS, RTL)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const orderId = Number(id)
    const { searchParams } = new URL(request.url)
    const userId = Number(searchParams.get('userId') ?? 0)

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        supplier: true,
        items: { include: { product: { select: { nameFa: true } } }, orderBy: { id: 'asc' } },
      },
    })
    if (!order) return NextResponse.json({ error: 'سفارش یافت نشد' }, { status: 404 })

    const setting = await db.setting.findUnique({ where: { key: 'vatPercent' } })
    const vatP = setting ? parseFloat(setting.value) : NaN
    const vatPercent = isFinite(vatP) ? vatP : 9

    const round2 = (n: number) => Math.round(n * 100) / 100

    const aoa: Array<Array<string | number>> = [
      ['هایپر زیتون — Hyper Zeytoon'],
      ['Order', order.code],
      ['Supplier', order.supplier?.name ?? ''],
      ['Date', order.receivingDate.toISOString().slice(0, 10)],
      [],
      ['Barcode', 'Name', 'Persian Name', 'Qty', 'Unit Cost', 'Printed Price', 'Discount', 'Tax', 'VAT', 'Line Total'],
    ]

    let totalLines = 0
    let totalVat = 0
    for (const it of order.items) {
      const qty = it.confirmedQty ?? it.deliveredQty ?? it.qty
      const cost = it.finalCost ?? it.unitCost
      const lineTotal = round2(cost * qty - 0)
      const vatShare = round2((lineTotal * vatPercent) / 100)
      totalLines += lineTotal
      totalVat += vatShare
      aoa.push([
        it.barcode ?? '',
        it.name ?? '',
        it.product?.nameFa ?? '',
        qty,
        cost,
        it.printedPrice ?? '',
        0,
        0,
        vatShare,
        lineTotal,
      ])
    }

    totalLines = round2(totalLines)
    totalVat = round2(totalVat)
    const grandTotal = round2(totalLines + totalVat - order.discount)
    aoa.push([])
    aoa.push(['Total', '', '', '', '', '', order.discount, 0, totalVat, grandTotal])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 24 }, { wch: 8 }, { wch: 12 }, { wch: 13 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 13 }]

    const wb = XLSX.utils.book_new()
    wb.Workbook = { Views: [{ RTL: true }] }
    XLSX.utils.book_append_sheet(wb, ws, 'Invoice')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer

    const actor = userId ? await db.user.findUnique({ where: { id: userId } }) : null
    await db.auditLog.create({
      data: {
        userId: userId,
        userName: actor?.name ?? 'سیستم',
        action: 'ORDER_EXPORT',
        entity: 'Order',
        entityId: order.id,
        detail: `خروجی اکسل سفارش ${order.code}`,
      },
    })

    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.ms-excel',
        'Content-Disposition': `attachment; filename=order-${order.code}.xls`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
