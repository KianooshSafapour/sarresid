import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity, notify } from '@/lib/server-utils'
import { formatJalali, toFaDigits } from '@/lib/jalali'

// ============================================================
// تصمیم‌گیری روی درخواست مرخصی — تأیید / رد (مدیران) و لغو (متقاضی)
// اطلاع‌رسانی رسمی با خطاب محترمانه: «سرکار خانم» / «جناب آقای» + نام خانوادگی
// ============================================================

type Ctx = { params: Promise<{ id: string }> }

/** خطاب رسمی فارسی بر اساس جنسیت — «سرکار خانم لطفی» / «جناب آقای محمدی» */
function formalAddress(gender: string, fullName: string): string {
  const family = fullName.trim().split(/\s+/).pop() || fullName
  return gender === 'FEMALE' ? `سرکار خانم ${family}` : `جناب آقای ${family}`
}

function kindLabel(kind: string, hours: number | null): string {
  return kind === 'HOURLY' ? `مرخصی ساعتی (${toFaDigits(hours ?? 0)} ساعت)` : 'مرخصی روزانه'
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params

  const leave = await db.leaveRequest.findUnique({ where: { id } })
  if (!leave) return fail('درخواست مرخصی یافت نشد', 404)
  const requester = await db.user.findUnique({
    where: { id: leave.userId },
    select: { id: true, name: true, gender: true },
  })
  if (!requester) return fail('متقاضی یافت نشد', 404)

  const body = (await req.json().catch(() => ({}))) as { action?: string; decisionNote?: string }
  const action = body.action
  const decisionNote = body.decisionNote?.trim() || null
  const when = `${formatJalali(leave.fromDate)}${leave.kind === 'DAILY' ? ` تا ${formatJalali(leave.toDate)}` : ''}`
  const address = formalAddress(requester.gender, requester.name)

  // ---- تأیید / رد — فقط مدیران ----
  if (action === 'approve' || action === 'reject') {
    if (!user.isManager) return fail('دسترسی غیرمجاز — تصمیم‌گیری تنها با مدیران است', 403)
    if (leave.status !== 'PENDING') return fail('این درخواست قبلاً تصمیم‌گیری شده است')
    const status = action === 'approve' ? 'APPROVED' : 'REJECTED'
    const updated = await db.leaveRequest.update({
      where: { id },
      data: { status, approverId: user.id, decidedAt: new Date(), decisionNote },
    })
    const title = action === 'approve' ? 'درخواست مرخصی شما تأیید شد ✅' : 'درخواست مرخصی شما بررسی شد'
    const bodyText =
      action === 'approve'
        ? `${address}، درخواست ${kindLabel(leave.kind, leave.hours)} شما برای ${when} تأیید شد. برنامه تیم به‌روزرسانی گردید.`
        : `${address}، درخواست ${kindLabel(leave.kind, leave.hours)} شما برای ${when} تأیید نشد.${decisionNote ? ` توضیح مدیر: ${decisionNote}` : ''}`
    await notify(leave.userId, title, bodyText, action === 'approve' ? 'SUCCESS' : 'WARNING', 'leaves')
    await logActivity(
      user.id,
      user.name,
      action === 'approve' ? 'تأیید مرخصی' : 'عدم تأیید مرخصی',
      'LeaveRequest',
      id,
      `${requester.name} — ${when}`,
    )
    return ok({ success: true, leave: updated })
  }

  // ---- لغو — فقط متقاضی و تنها در وضعیت در انتظار ----
  if (action === 'cancel') {
    if (leave.userId !== user.id) return fail('تنها متقاضی می‌تواند درخواست را لغو کند', 403)
    if (leave.status !== 'PENDING') return fail('تنها درخواست‌های «در انتظار تأیید» قابل لغو هستند')
    const updated = await db.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED', decidedAt: new Date(), decisionNote },
    })
    await logActivity(user.id, user.name, 'لغو درخواست مرخصی', 'LeaveRequest', id, when)
    return ok({ success: true, leave: updated })
  }

  return fail('اقدام نامعتبر است')
}
