import { NextRequest, NextResponse } from 'next/server'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { formatJalaliFull, jalaliKey } from '@/lib/jalali'
import * as XLSX from 'xlsx'
import { buildProviderStatement } from '../../statement-core'

// ------------------------------------------------------------------
// Provider account statement (صورت‌حساب تأمین‌کننده) — JSON or xlsx
// Ledger logic shared with the bulk workbook via statement-core.
// ------------------------------------------------------------------

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!user.isManager && !user.roleKeys.includes('accountant'))
    return fail('دسترسی به صورت‌حساب فقط برای مدیریت و حسابداری مجاز است', 403)

  const { id } = await ctx.params
  const statement = await buildProviderStatement(id)
  if (!statement) return fail('تأمین‌کننده پیدا نشد', 404)

  const payload = {
    ...statement,
    generatedAt: new Date().toISOString(),
    generatedByName: user.name,
  }

  // ---------------- xlsx export ----------------
  if (new URL(req.url).searchParams.get('format') === 'xlsx') {
    const { provider, rows, summary: s } = statement
    const meta: (string | number)[][] = [
      ['صورت‌حساب تأمین‌کننده', provider.name],
      ['تلفن', provider.phone ?? '—'],
      ['تاریخ تهیه', formatJalaliFull(new Date())],
      ['تهیه‌کننده', user.name],
      [],
      ['جمع خریدهای تسویه‌شده (تومان)', s.purchases],
      ['جمع پرداخت‌های نقدی/کارت‌به‌کارت (تومان)', s.paidOther],
      ['جمع چک‌های تحویل‌شده (تومان)', s.settledCheques],
      ['مانده بدهی (تومان)', s.balance],
      ['چک‌های در جریان', `${s.openChequeCount} فقره — ${s.openChequeAmount.toLocaleString('fa-IR')} تومان`],
      [],
      ['تاریخ', 'شرح', 'سند', 'بدهکار (خرید)', 'بستانکار (پرداخت)', 'مانده'],
    ]
    for (const r of rows) {
      meta.push([formatJalaliFull(new Date(r.date)), r.label, r.ref, r.debit, r.credit, r.balance])
    }
    const wb = XLSX.utils.book_new()
    wb.Workbook = { Views: [{ RTL: true }] }
    const ws = XLSX.utils.aoa_to_sheet(meta)
    ws['!cols'] = [{ wch: 20 }, { wch: 42 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, ws, 'صورت‌حساب')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    await logActivity(user.id, user.name, `خروجی اکسل صورت‌حساب ${provider.name}`, 'Provider', id)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="statement-${jalaliKey(new Date())}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  await logActivity(user.id, user.name, `مشاهده صورت‌حساب ${payload.provider.name}`, 'Provider', id)
  return ok(payload)
}
