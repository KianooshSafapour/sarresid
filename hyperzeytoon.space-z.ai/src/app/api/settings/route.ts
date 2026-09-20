import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireManager, fail, ok, getSetting, setSetting, logActivity } from '@/lib/server-utils'
import { validateFlexibilityInput } from '@/lib/cheque-flex'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const settings = await db.settings.findMany()
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value
  return ok(map)
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.isManager) return fail('دسترسی غیرمجاز', 403)
  const body = (await req.json()) as Record<string, unknown>
  for (const [key, value] of Object.entries(body)) {
    // cheque_flexibility is a structured JSON setting — validate strictly before storing
    if (key === 'cheque_flexibility') {
      const parsed = validateFlexibilityInput(value)
      if (!parsed.ok) return fail(parsed.error)
      await setSetting(key, JSON.stringify(parsed.config))
    } else {
      await setSetting(key, String(value))
    }
  }
  await logActivity(user.id, user.name, 'بروزرسانی تنظیمات', 'Settings', undefined, Object.keys(body).join(','))
  return ok({ success: true })
}
