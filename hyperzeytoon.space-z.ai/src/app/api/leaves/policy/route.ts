import { NextRequest } from 'next/server'
import { requireUser, requireManager, fail, ok, logActivity, setSetting } from '@/lib/server-utils'
import { readLeavePolicy } from '@/lib/leave'

// ============================================================
// سیاست مرخصی — سهمیه ماهانه، ظرفیت روزانه تیم، سقف مرخصی ساعتی
// خواندن برای همه همکاران (شفافیت)، تغییر تنها با مدیران
// ============================================================

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const policy = await readLeavePolicy()
  return ok({ policy })
}

export async function PATCH(req: NextRequest) {
  const user = await requireManager(req)
  if (!user) return fail('دسترسی غیرمجاز', 403)

  const body = (await req.json().catch(() => ({}))) as {
    monthlyDays?: number
    maxSameDay?: number
    hourlyMaxHours?: number
  }

  const current = await readLeavePolicy()
  const num = (v: unknown, fb: number, min: number, max: number) => {
    const n = Math.round(Number(v))
    if (!Number.isFinite(n) || n < min || n > max) return fb
    return n
  }
  const policy = {
    monthlyDays: num(body.monthlyDays, current.monthlyDays, 1, 31),
    maxSameDay: num(body.maxSameDay, current.maxSameDay, 1, 10),
    hourlyMaxHours: num(body.hourlyMaxHours, current.hourlyMaxHours, 1, 12),
  }

  await setSetting('leave_policy', JSON.stringify(policy))
  await logActivity(user.id, user.name, 'بروزرسانی سیاست مرخصی', 'Settings', 'leave_policy', JSON.stringify(policy))
  return ok({ success: true, policy })
}
