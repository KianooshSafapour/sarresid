import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit } from '@/lib/audit'
import { formatJalaliDateTime } from '@/lib/jalali'
import { HOLOO_CONFIG_KEY, readHolooConfig, type HolooConfig } from '@/lib/holoo'

/** GET /api/accounting/holoo-config — read bridge config (apiKey masked). */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ACCOUNTING) && !canUser(session.roles, PERMISSIONS.VIEW_REPORTS))
    return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  const cfg = await readHolooConfig()
  return Response.json({
    mode: cfg.mode,
    endpoint: cfg.endpoint || '',
    hasKey: !!cfg.apiKey,
    maskedKey: cfg.apiKey ? `${cfg.apiKey.slice(0, 4)}••••${cfg.apiKey.slice(-2)}` : null,
    updatedBy: cfg.updatedBy || null,
    updatedAtJalali: cfg.updatedAt ? formatJalaliDateTime(new Date(cfg.updatedAt)) : null,
    canEdit: session.roles.includes('GENERAL_MANAGER') || canUser(session.roles, PERMISSIONS.ADMIN_SETTINGS),
  })
}

/** PUT /api/accounting/holoo-config — update bridge mode/endpoint/key.
 *  Gate: GENERAL_MANAGER or ADMIN_SETTINGS holders (IT_ADMIN / OPERATION_MANAGER).
 */
export async function PUT(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const allowed = session.roles.includes('GENERAL_MANAGER') || canUser(session.roles, PERMISSIONS.ADMIN_SETTINGS)
  if (!allowed) return Response.json({ error: 'تنها مدیران سامانه مجاز به تغییر پیکربندی هلو هستند' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { mode?: string; endpoint?: string; apiKey?: string | null } | null
  if (!body) return Response.json({ error: 'داده نامعتبر است' }, { status: 400 })

  const mode = body.mode === 'LIVE' ? 'LIVE' : 'SIMULATED'
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''
  if (mode === 'LIVE' && !/^https?:\/\/.+/i.test(endpoint))
    return Response.json({ error: 'برای حالت زنده، نشانی سرور هلو (http/https) الزامی است' }, { status: 400 })

  const prev = await readHolooConfig()
  const apiKey = body.apiKey === null ? undefined : typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : prev.apiKey

  const cfg: HolooConfig = {
    mode,
    endpoint: mode === 'LIVE' ? endpoint : endpoint || prev.endpoint,
    apiKey,
    updatedBy: session.name,
    updatedAt: new Date().toISOString(),
  }
  await db.setting.upsert({
    where: { key: HOLOO_CONFIG_KEY },
    update: { value: JSON.stringify(cfg) },
    create: { key: HOLOO_CONFIG_KEY, value: JSON.stringify(cfg) },
  })

  await logAudit(session.id, session.name, 'HOLOO_CONFIG', 'SETTING', HOLOO_CONFIG_KEY, {
    mode,
    endpoint: cfg.endpoint || null,
    keyChanged: body.apiKey != null,
  })

  return Response.json({ ok: true, mode: cfg.mode, endpoint: cfg.endpoint || '' })
}
