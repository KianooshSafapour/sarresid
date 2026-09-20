import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, logActivity } from '@/lib/server-utils'
import { formatJalaliFull, formatJalali, jalaliKey } from '@/lib/jalali'
import * as XLSX from 'xlsx'
import { buildProviderStatement, type ProviderStatement } from '../statement-core'

// ------------------------------------------------------------------
// «صورت‌حساب همه تأمین‌کنندگان» — month-end workbook for accounting:
// Sheet 1 «خلاصه»: one row per provider (purchases/paid/settled cheques/
//                  balance/open cheques/last activity) + grand totals.
// Sheet 2..n:      per-provider ledger (only providers with any settled
//                  purchase get their own sheet; empty ones only in summary).
// ------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!user.isManager && !user.roleKeys.includes('accountant'))
    return fail('دسترسی به صورت‌حساب فقط برای مدیریت و حسابداری مجاز است', 403)

  const providers = await db.provider.findMany({ orderBy: { name: 'asc' }, select: { id: true } })
  const statements: ProviderStatement[] = []
  for (const p of providers) {
    const st = await buildProviderStatement(p.id)
    if (st) statements.push(st)
  }

  const wb = XLSX.utils.book_new()
  wb.Workbook = { Views: [{ RTL: true }] }

  // ---- summary sheet ----
  const header: (string | number)[][] = [
    ['صورت‌حساب جمعی تأمین‌کنندگان — هایپر زیتون'],
    ['تاریخ تهیه', formatJalaliFull(new Date()), 'تهیه‌کننده', user.name],
    [],
    ['تأمین‌کننده', 'نوع', 'شرکت‌ها', 'سفارش‌های تسویه‌شده', 'جمع خریدها (تومان)', 'پرداخت نقدی/کارت (تومان)', 'چک‌های تحویل‌شده (تومان)', 'مانده بدهی (تومان)', 'چک‌های در جریان (فقره)', 'مبلغ چک‌های در جریان (تومان)', 'آخرین گردش'],
  ]
  let tPurch = 0, tPaid = 0, tCheq = 0, tBal = 0, tOpen = 0, tOpenAmt = 0
  for (const st of statements) {
    const s = st.summary
    tPurch += s.purchases; tPaid += s.paidOther; tCheq += s.settledCheques
    tBal += s.balance; tOpen += s.openChequeCount; tOpenAmt += s.openChequeAmount
    header.push([
      st.provider.name,
      st.provider.kind === 'DIRECT' ? 'مستقیم' : 'واسطه',
      st.provider.companies.join('، ') || '—',
      s.ordersCount,
      s.purchases,
      s.paidOther,
      s.settledCheques,
      s.balance,
      s.openChequeCount,
      s.openChequeAmount,
      s.lastActivityAt ? formatJalali(new Date(s.lastActivityAt)) : '—',
    ])
  }
  header.push([])
  header.push(['جمع کل', '', '', '', tPurch, tPaid, tCheq, tBal, tOpen, tOpenAmt, ''])
  const wsSum = XLSX.utils.aoa_to_sheet(header)
  wsSum['!cols'] = [{ wch: 26 }, { wch: 9 }, { wch: 24 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 11 }, { wch: 16 }, { wch: 13 }]
  XLSX.utils.book_append_sheet(wb, wsSum, 'خلاصه')

  // ---- per-provider ledger sheets (with activity only) ----
  const active = statements.filter((st) => st.summary.ordersCount > 0)
  active.forEach((st, i) => {
    const rows: (string | number)[][] = [
      [`صورت‌حساب ${st.provider.name}`, st.provider.phone ?? '—'],
      ['خریدها', st.summary.purchases, 'پرداخت نقدی/کارت', st.summary.paidOther, 'چک‌های تحویل‌شده', st.summary.settledCheques],
      ['مانده بدهی', st.summary.balance, 'چک در جریان', `${st.summary.openChequeCount} فقره — ${st.summary.openChequeAmount.toLocaleString('fa-IR')}`],
      [],
      ['تاریخ', 'شرح', 'سند', 'بدهکار', 'بستانکار', 'مانده'],
    ]
    for (const r of st.rows) {
      rows.push([formatJalaliFull(new Date(r.date)), r.label, r.ref, r.debit, r.credit, r.balance])
    }
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 20 }, { wch: 40 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }]
    const sheetName = `${i + 1}- ${st.provider.name}`.slice(0, 30).replace(/[:\\/?*[\]]/g, ' ')
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  })

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  await logActivity(user.id, user.name, 'خروجی اکسل صورت‌حساب همه تأمین‌کنندگان', 'Provider', undefined, `${statements.length} تأمین‌کننده`)
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="statements-all-${jalaliKey(new Date())}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
