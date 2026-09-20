import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity, notifyRoles } from '@/lib/server-utils'
import { isoDay, pad2, toJalali, formatJalali } from '@/lib/jalali'
import { isFriday, loadHolidaySet, prevOpenDay, holidayMessage } from '../_holiday'

// ---------- POST: split a cheque into 2+ parts ----------
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['gm', 'om', 'owner', 'accountant'].some((k) => user.roleKeys.includes(k)) && !user.isManager)
    return fail('اجازه تقسیم چک را ندارید', 403)

  const body = (await req.json()) as {
    id?: string
    parts?: { amount?: number; dueDate?: string; number?: string }[]
  }
  if (!body.id) return fail('شناسه چک لازم است')

  const original = await db.cheque.findUnique({ where: { id: body.id } })
  if (!original) return fail('چک یافت نشد', 404)
  if (!['PENDING_OWNER', 'SIGNED'].includes(original.status))
    return fail('فقط چکِ در انتظار امضا یا امضاشده قابل تقسیم است')

  const parts = (body.parts ?? []).filter((p) => Number(p.amount) > 0 && p.dueDate)
  if (parts.length < 2) return fail('حداقل دو بخش لازم است')

  const sum = parts.reduce((s, p) => s + Number(p.amount), 0)
  if (Math.abs(sum - original.amount) > 1) {
    return fail(`جمع بخش‌ها (${Math.round(sum).toLocaleString('fa-IR')}) باید برابر مبلغ چک (${Math.round(original.amount).toLocaleString('fa-IR')}) باشد`)
  }

  // holiday validation on all part dates (earliest date anchors the holiday window)
  const dates = parts.map((p) => {
    const d = new Date(p.dueDate as string)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  })
  const anchor = dates.reduce((a, b) => (b < a ? b : a))
  const holidays = await loadHolidaySet(anchor)
  for (const d of dates) {
    if (isFriday(d) || holidays.has(isoDay(d))) {
      return fail(holidayMessage(prevOpenDay(d, holidays)))
    }
  }

  const j = toJalali(new Date())
  const dayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
  const count = await db.cheque.count({ where: { createdAt: { gte: dayStart } } })
  let seq = count + 1

  await db.$transaction(async (tx) => {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      const due = dates[i]
      const number = p.number?.trim() || `CH-${j.jy}${pad2(j.jm)}${pad2(j.jd)}-${String(seq).padStart(3, '0')}`
      seq++
      await tx.cheque.create({
        data: {
          number,
          amount: Number(p.amount),
          dueDate: due,
          payeeName: original.payeeName,
          payeePhone: original.payeePhone,
          orderId: original.orderId,
          isForOrder: original.isForOrder,
          status: 'PENDING_OWNER',
          note: `تقسیم چک ${original.number} — بخش ${i + 1}`,
          createdById: user.id,
        },
      })
    }
    await tx.cheque.update({
      where: { id: original.id },
      data: {
        status: 'REJECTED',
        note: `تقسیم شد به ${parts.length} چک — ${parts.map((p, i) => `${Math.round(Number(p.amount)).toLocaleString('fa-IR')} تومان (${formatJalali(dates[i])})`).join(' + ')}`,
      },
    })
  })

  await logActivity(user.id, user.name, 'تقسیم چک', 'Cheque', original.id, `${original.number} → ${parts.length} چک`)
  await notifyRoles(['owner', 'gm'], 'چک تقسیم شد', `چک ${original.number} به ${parts.length} چک کوچک‌تر تقسیم شد و نیاز به امضای مجدد دارد.`, 'INFO', 'payments', user.id)

  return ok({ success: true, parts: parts.length })
}
