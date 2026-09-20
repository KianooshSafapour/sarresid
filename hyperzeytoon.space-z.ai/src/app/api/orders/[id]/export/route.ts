import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail } from '@/lib/server-utils'
import { formatJalaliFull } from '@/lib/jalali'
import * as XLSX from 'xlsx'

const COUNTED = ['OK', 'CORRECTED']

// ---------- GET: Holoo-ready xlsx export ----------
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await params

  const order = await db.order.findUnique({ where: { id }, include: { items: true } })
  if (!order) return fail('سفارش یافت نشد', 404)

  const creator = order.createdById
    ? await db.user.findUnique({ where: { id: order.createdById }, select: { name: true } })
    : null

  // meta header block (Jalali dates only)
  const meta: (string | number)[][] = [
    ['گزارش سفارش خرید — هایپر زیتون'],
    ['کد سفارش', order.code],
    ['تأمین‌کننده', order.providerName],
    ['تاریخ تحویل', formatJalaliFull(order.receivingDate)],
    ['ثبت‌کننده', creator?.name ?? '—'],
    ['نوع پرداخت', order.paymentType === 'CASH' ? 'نقدی هنگام تحویل' : 'چک'],
    ['تاریخ صدور', formatJalaliFull(order.createdAt)],
    [],
  ]

  const header = ['بارکد', 'نام کالا', 'تعداد', 'قیمت واحد', 'تخفیف', 'مالیات', 'ارزش افزوده', 'جمع کل']
  const rows: (string | number)[][] = []
  let sumQty = 0
  let sumDiscount = 0
  let sumTax = 0
  let sumVat = 0
  let sumTotal = 0

  for (const it of order.items) {
    const counted = COUNTED.includes(it.itemStatus)
    const qty = counted ? (it.deliveredQty ?? it.qty) : 0
    const price = it.correctedPrice ?? it.unitPrice
    const base = Math.max(0, Math.round(qty * price) - it.discount)
    const vat = counted ? Math.round(base * 0.09) : 0
    const total = counted ? base + vat : 0
    sumQty += qty
    sumDiscount += it.discount
    sumTax += it.tax
    sumVat += vat
    sumTotal += total
    rows.push([it.barcode ?? '', it.name, qty, price, it.discount, it.tax, vat, total])
  }

  const totalsRow = ['جمع کل', `${order.items.length} قلم`, sumQty, '', sumDiscount, sumTax, sumVat, sumTotal]
  const finalRow = ['', 'مبلغ نهایی سفارش', '', '', '', '', '', Math.round(order.finalAmount)]

  const aoa = [...meta, header, ...rows, totalsRow, finalRow]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 16 }, { wch: 34 }, { wch: 8 }, { wch: 13 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'سفارش')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(order.code)}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
