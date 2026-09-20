import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, getSetting, logActivity } from '@/lib/server-utils'
import { formatJalaliFull, jalaliKey, isoDay, addDays } from '@/lib/jalali'
import * as XLSX from 'xlsx'

// Manager analytics workbook — 5 sheets: KPIs, 30d sales trend, top products w/ margin, category mix, low stock
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.isManager) return fail('دسترسی غیرمجاز', 403)

  const now = new Date()
  const daysReq = Number(req.nextUrl.searchParams.get('days') ?? '30')
  const days = [7, 30, 90].includes(daysReq) ? daysReq : 30
  const since = addDays(now, -days)

  const [sales, products, cheques, activeStaff, laborHoursStr] = await Promise.all([
    db.productSale.findMany({
      where: { date: { gte: since } },
      include: { product: { select: { name: true, category: true, buyPrice: true, sellPrice: true } } },
    }),
    db.product.findMany({ where: { status: 'ACTIVE' }, select: { stock: true, buyPrice: true, minStock: true, category: true, name: true } }),
    db.cheque.aggregate({
      where: { status: { in: ['PENDING_OWNER', 'SIGNED', 'DELIVERED'] } },
      _sum: { amount: true }, _count: true,
    }),
    db.user.count({ where: { active: true } }),
    getSetting('labor_hours_per_day', '8'),
  ])

  const sales30 = Math.round(sales.reduce((s, x) => s + x.amount, 0))
  const margin30 = Math.round(sales.reduce((s, x) => s + x.qty * ((x.product?.sellPrice ?? 0) - (x.product?.buyPrice ?? 0)), 0))
  const stockValue = Math.round(products.reduce((s, p) => s + p.stock * p.buyPrice, 0))
  const outOfStock = products.filter((p) => p.stock <= 0).length
  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= p.minStock).length
  const periodLabel = `${days === 7 ? '۷' : days === 90 ? '۹۰' : '۳۰'} روز`
  const laborHours = Math.max(1, Number(laborHoursStr) || 8)
  const sales7 = Math.round(sales.filter((s) => s.date >= addDays(now, -7)).reduce((s, x) => s + x.amount, 0))
  const sphl = Math.round(sales7 / Math.max(1, activeStaff * 7 * laborHours))

  // daily series
  const daily = new Map<string, number>()
  for (const s of sales) {
    const k = isoDay(s.date)
    daily.set(k, (daily.get(k) ?? 0) + s.amount)
  }
  const trendRows: (string | number)[][] = [['تاریخ (جلالی)', `فروش ${days}روزه (تومان)`]]
  let trendSum = 0
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(now, -i)
    const amt = Math.round(daily.get(isoDay(d)) ?? 0)
    trendSum += amt
    trendRows.push([formatJalaliFull(d), amt])
  }
  trendRows.push([`جمع ${days} روز`, trendSum])

  // top products + margin (Ms. Darvishi's Excel color logic as text band)
  const prodMap = new Map<string, { name: string; category: string; qty: number; amount: number; margin: number }>()
  const catMap = new Map<string, number>()
  for (const s of sales) {
    const cat = s.product?.category ?? 'سایر'
    catMap.set(cat, (catMap.get(cat) ?? 0) + s.amount)
    const cur = prodMap.get(s.productId) ?? { name: s.product?.name ?? '—', category: cat, qty: 0, amount: 0, margin: 0 }
    cur.qty += s.qty
    cur.amount += s.amount
    cur.margin += s.qty * ((s.product?.sellPrice ?? 0) - (s.product?.buyPrice ?? 0))
    prodMap.set(s.productId, cur)
  }
  const topRows: (string | number)[][] = [
    ['محصول', 'دسته', 'تعداد فروش', 'مبلغ فروش (تومان)', 'سود تخمینی (تومان)', 'حاشیه ٪', 'وضعیت رنگ'],
  ]
  for (const p of [...prodMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 30)) {
    const rate = p.amount > 0 ? Math.round((p.margin / p.amount) * 100) : 0
    const band = rate >= 25 ? 'سبز (بالای ۲۵٪)' : rate >= 10 ? 'زرد (۱۰ تا ۲۵٪)' : 'قرمز (زیر ۱۰٪)'
    topRows.push([p.name, p.category, p.qty, Math.round(p.amount), Math.round(p.margin), rate, band])
  }

  // category mix
  const catRows: (string | number)[][] = [['دسته', `فروش ${periodLabel} (تومان)`, 'سهم ٪']]
  const catTotal = [...catMap.values()].reduce((a, b) => a + b, 0) || 1
  for (const [name, value] of [...catMap.entries()].sort((a, b) => b[1] - a[1])) {
    catRows.push([name, Math.round(value), Math.round((value / catTotal) * 100)])
  }

  // low stock — actionable reorder list
  const lowRows: (string | number)[][] = [['محصول', 'دسته', 'موجودی', 'حد سفارش', 'وضعیت']]
  for (const p of products.filter((p) => p.stock <= p.minStock).sort((a, b) => a.stock - b.stock).slice(0, 60)) {
    lowRows.push([p.name, p.category, p.stock, p.minStock, p.stock <= 0 ? 'تمام شده' : 'کمبود'])
  }

  const kpiRows: (string | number)[][] = [
    ['هایپر زیتون — گزارش تحلیلی'],
    ['تاریخ گزارش', formatJalaliFull(now)],
    ['تهیه‌کننده', user.name],
    [],
    ['شاخص', 'مقدار'],
    [`فروش ${periodLabel} (تومان)`, sales30],
    ['سود ناخالص تخمینی (تومان)', margin30],
    ['نرخ حاشیه ٪', sales30 > 0 ? Math.round((margin30 / sales30) * 100) : 0],
    ['فروش ۷ روز (تومان)', sales7],
    ['SPHL — فروش به ازای هر ساعت کار (تومان)', sphl],
    ['تعداد نیروی فعال', activeStaff],
    ['ساعات کاری روز (تنظیمات)', laborHours],
    ['ارزش موجودی انبار (تومان)', stockValue],
    ['اقلام تمام‌شده', outOfStock],
    ['اقلام کم‌موجود', lowStock],
    ['چک‌های باز', cheques._count ?? 0],
    ['مبلغ چک‌های باز (تومان)', cheques._sum.amount ?? 0],
  ]

  const wb = XLSX.utils.book_new()
  wb.Workbook = { Views: [{ RTL: true }] }

  const kpiWs = XLSX.utils.aoa_to_sheet(kpiRows)
  kpiWs['!cols'] = [{ wch: 38 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, kpiWs, 'شاخص‌ها')

  const trendWs = XLSX.utils.aoa_to_sheet(trendRows)
  trendWs['!cols'] = [{ wch: 24 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, trendWs, `روند فروش ${periodLabel}`)

  const topWs = XLSX.utils.aoa_to_sheet(topRows)
  topWs['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 11 }, { wch: 18 }, { wch: 18 }, { wch: 9 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, topWs, 'پرفروش‌ها و حاشیه')

  const catWs = XLSX.utils.aoa_to_sheet(catRows)
  catWs['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, catWs, 'ترکیب دسته‌ها')

  const lowWs = XLSX.utils.aoa_to_sheet(lowRows)
  lowWs['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, lowWs, 'کمبود موجودی')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  await logActivity(user.id, user.name, 'خروجی اکسل گزارش تحلیلی', 'reports')

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="hyperzeytoon-reports-${jalaliKey(now)}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
