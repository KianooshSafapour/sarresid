import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

// GET /api/settings → { key: value, ... }
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const rows = await db.setting.findMany()
  const settings: Record<string, string> = {}
  for (const r of rows) settings[r.key] = r.value
  return Response.json(settings)
}

// PATCH /api/settings  { settings: { store_name: '...', low_stock_alerts: 'true', ... } }
// or a flat { key: value } object — only users with ADMIN_SETTINGS permission
export async function PATCH(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ADMIN_SETTINGS)) {
    return Response.json({ error: 'فقط مدیر سامانه می‌تواند تنظیمات را تغییر دهد' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  const patch: Record<string, unknown> = body?.settings && typeof body.settings === 'object' ? body.settings : body
  if (!patch || typeof patch !== 'object' || !Object.keys(patch).length) {
    return Response.json({ error: 'تغییری ارسال نشده است' }, { status: 400 })
  }
  for (const [key, value] of Object.entries(patch)) {
    await db.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    })
  }
  await logAudit(session.id, session.name, 'SETTINGS_UPDATE', 'SETTING', undefined, { keys: Object.keys(patch) })
  const rows = await db.setting.findMany()
  const settings: Record<string, string> = {}
  for (const r of rows) settings[r.key] = r.value
  return Response.json({ ok: true, settings })
}
