import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ok, fail, logActivity } from '@/lib/server-utils'
import { DEMO_SCENARIOS, generateDemoData, restoreRealData, getDemoStatus } from '@/lib/demo/engine'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req.headers.get('cookie'))
  if (!user) return fail('ابتدا وارد شوید', 401)
  const status = await getDemoStatus(db)
  return ok({ scenarios: DEMO_SCENARIOS, status })
}

/** Generate a full virtual demo company (destroys current data — guarded in UI) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req.headers.get('cookie'))
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!user.isManager) return fail('فقط مدیریت می‌تواند نسخه نمایشی بسازد', 403)
  try {
    const { scenario } = (await req.json()) as { scenario?: string }
    if (!scenario) return fail('سناریو را انتخاب کنید')
    const result = await generateDemoData(db, scenario)
    await logActivity(user.id, user.name, `نسخه نمایشی «${scenario}» راه‌اندازی شد (جایگزینی کامل داده‌ها)`)
    return ok(result)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطا در ساخت نسخه نمایشی', 500)
  }
}

/** Restore the real Hyper Zeytoon dataset */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req.headers.get('cookie'))
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!user.isManager) return fail('فقط مدیریت می‌تواند داده‌های واقعی را بازگرداند', 403)
  try {
    await restoreRealData(db)
    await logActivity(user.id, user.name, 'بازگشت به داده‌های واقعی هایپر زیتون')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطا در بازگردانی داده‌ها', 500)
  }
}
