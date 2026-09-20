import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail } from '@/lib/server-utils'
import { formatJalaliFull } from '@/lib/jalali'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

/** xlsx export of a count session — either the blank count sheet (for paper counting) or the result with diffs */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!(user.isManager || user.roleKeys.includes('inventory')))
    return fail('دسترسی به تیم انبار و مدیریت محدود است', 403)

  const { id } = await params
  const session = await db.stockCount.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          product: {
            select: {
              name: true, unit: true, category: true, buyPrice: true,
              barcodes: { select: { code: true }, take: 1, orderBy: { createdAt: 'asc' } },
            },
          },
        },
      },
    },
  })
  if (!session) return fail('جلسه جرد یافت نشد', 404)

  const meta: (string | number)[][] = [
    [`برگه جرد انبار — هایپر زیتون  (${session.status === 'IN_PROGRESS' ? 'در جریان' : session.status === 'COMMITTED' ? 'بسته‌شده' : 'لغوشده'})`],
    ['کد جرد', session.code],
    ['محدوده', session.scope === 'CATEGORY' ? `دسته ${session.category}` : 'همه محصولات'],
    ['جلسه‌گشا', session.createdByName],
    ['تاریخ شروع', formatJalaliFull(session.createdAt)],
    ...(session.committedAt ? [['تاریخ بستن', formatJalaliFull(session.committedAt)]] : []),
    [],
  ]

  const withResult = session.status !== 'IN_PROGRESS'
  const header = withResult
    ? ['بارکد', 'نام کالا', 'واحد', 'موجودی سیستم', 'شمرده‌شده', 'مغایرت', 'قیمت خرید', 'اثر ارزشی (تومان)', 'ثبت‌کننده']
    : ['بارکد', 'نام کالا', 'واحد', 'موجودی سیستم', 'شمارش انبار', 'توضیح']

  const rows: (string | number)[][] = []
  let totalDiffValue = 0
  for (const it of session.items) {
    const barcode = it.product.barcodes[0]?.code ?? ''
    if (withResult) {
      if (it.countedQty !== null) {
        const diff = it.countedQty - it.systemStock
        const value = diff * it.product.buyPrice
        totalDiffValue += value
        rows.push([
          barcode, it.product.name, it.product.unit, it.systemStock,
          it.countedQty, diff, it.product.buyPrice, value, it.countedByName ?? '',
        ])
      } else {
        rows.push([barcode, it.product.name, it.product.unit, it.systemStock, '', '', '', '', ''])
      }
    } else {
      rows.push([barcode, it.product.name, it.product.unit, it.systemStock, '', ''])
    }
  }

  const tail: (string | number)[][] = withResult
    ? [[], ['', 'اثر ارزشی خالص مغایرت‌ها', '', '', '', '', '', totalDiffValue, '']]
    : []

  const aoa = [...meta, header, ...rows, ...tail]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // RTL-friendly column widths
  ws['!cols'] = [
    { wch: 15 }, { wch: 34 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
    ...(withResult ? [{ wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 }] : [{ wch: 18 }, { wch: 20 }]),
  ]
  ws['!views'] = [{ rightToLeft: true }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'جرد انبار')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const filename = `stock-count-${session.code}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(`جرد-${session.code}.xlsx`)}`,
      'Cache-Control': 'no-store',
    },
  })
}
