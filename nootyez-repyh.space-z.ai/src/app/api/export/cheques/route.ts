import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { isoToJalali } from '@/lib/jalali'
import { CHEQUE_STATUS_LABELS, CHEQUE_STATUSES } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

function statusFa(status: string): string {
  const label = CHEQUE_STATUS_LABELS[status] ?? status
  return label.split('|')[0].trim()
}

// GET /api/export/cheques?userId=&from=&to=&status=PENDING_APPROVAL,APPROVED → XLS cheque register
// `status` (optional): comma-separated cheque statuses; unknown values are ignored,
// if none is valid the export falls back to all statuses (backward compatible).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = Number(searchParams.get('userId') ?? 0)
    const from = searchParams.get('from')?.trim()
    const to = searchParams.get('to')?.trim()

    const statusParam = searchParams.get('status')?.trim() ?? ''
    const validStatuses = statusParam
      ? [...new Set(statusParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))]
        .filter((s) => (CHEQUE_STATUSES as readonly string[]).includes(s))
      : []

    const actor = userId ? await db.user.findUnique({ where: { id: userId } }) : null
    const allowed = hasRole(actor, 'ACCOUNTANT') || hasRole(actor, 'GENERAL_MANAGER') ||
      hasRole(actor, 'OWNER') || hasRole(actor, 'IT_ADMIN')
    if (!allowed) {
      return NextResponse.json({ error: 'خروجی دفتر چک فقط برای حسابدار/مدیران فعال است' }, { status: 403 })
    }

    const where: Record<string, unknown> = {}
    if (from || to) {
      where.dueDate = {
        ...(from ? { gte: new Date(from + 'T00:00:00.000Z') } : {}),
        ...(to ? { lte: new Date(to + 'T23:59:59.999Z') } : {}),
      }
    }
    if (validStatuses.length > 0) where.status = { in: validStatuses }
    const cheques = await db.cheque.findMany({
      where,
      include: { order: { select: { code: true } } },
      orderBy: { dueDate: 'asc' },
    })

    const aoa: Array<Array<string | number>> = [
      ['هایپر زیتون — دفتر چک | Hyper Zeytoon Cheque Register'],
      [`از ${from ? faDate(from) : '—'} تا ${to ? faDate(to) : '—'}`],
      ...(validStatuses.length > 0
        ? [[`فیلتر وضعیت: ${validStatuses.map(statusFa).join('، ')}`]]
        : []),
      [],
      ['ردیف', 'شماره', 'وضعیت', 'سررسید', 'مبلغ (تومان)', 'در وجه', 'گیرنده', 'تلفن', 'سفارش', 'بابت / یادداشت', 'ثبت توسط', 'تاریخ ثبت'],
    ]

    let total = 0
    cheques.forEach((c, i) => {
      total += c.amount
      aoa.push([
        i + 1,
        c.id,
        statusFa(c.status),
        faDate(c.dueDate),
        c.amount,
        c.payee ?? '',
        c.recipientName ?? '',
        c.recipientPhone ?? '',
        c.order?.code ?? '',
        c.note ?? (c.purpose === 'ORDER' ? 'پرداخت سفارش' : 'متفرقه'),
        '',
        faDate(c.createdAt),
      ])
    })

    aoa.push([])
    aoa.push(['جمع', '', '', '', total, `${cheques.length} فقره`])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [
      { wch: 6 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 15 }, { wch: 24 },
      { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 12 },
    ]

    const wb = XLSX.utils.book_new()
    wb.Workbook = { Views: [{ RTL: true }] }
    XLSX.utils.book_append_sheet(wb, ws, 'Cheques')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer

    await db.auditLog.create({
      data: {
        userId,
        userName: actor?.name ?? 'سیستم',
        action: 'CHEQUES_EXPORT',
        entity: 'Cheque',
        entityId: null,
        detail: `خروجی دفتر چک — ${cheques.length} فقره، جمع ${total.toLocaleString('fa-IR')} تومان${from ? ` (از ${faDate(from)})` : ''}${validStatuses.length ? ` — فیلتر وضعیت: ${validStatuses.join(', ')}` : ''}`,
      },
    })

    const stamp = new Date().toISOString().slice(0, 10)
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.ms-excel',
        'Content-Disposition': `attachment; filename=cheque-register-${stamp}.xls`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
