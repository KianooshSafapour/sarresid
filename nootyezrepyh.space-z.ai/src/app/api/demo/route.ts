import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit } from '@/lib/audit'
import { DEMO_PERSONAS, generateDemo, clearDemo, getDemoStatus, DemoPersona } from '@/lib/demo-factory'

export const dynamic = 'force-dynamic'

/**
 * آزمایشگاه دمو — ساخت/مشاهده/پاک‌سازی داده‌های شرکت مجازی
 * GET    → وضعیت دمو + فهرست پرسوناها
 * POST   { personaId, replace? } → تولید داده (ADMIN_SETTINGS)
 * DELETE → پاک‌سازی داده‌های دمو (ADMIN_SETTINGS)
 */

// ============ GET: وضعیت + پرسوناها ============

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const status = await getDemoStatus()
  return Response.json({ ...status, personas: DEMO_PERSONAS })
}

// ============ POST: تولید داده دمو ============

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ADMIN_SETTINGS)) {
    return Response.json({ error: 'فقط مدیر سامانه اجازه کار با آزمایشگاه دمو را دارد' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as { personaId?: string; replace?: boolean } | null
  const personaId = body?.personaId as DemoPersona['id'] | undefined
  if (!personaId || !DEMO_PERSONAS.some((p) => p.id === personaId)) {
    return Response.json({ error: 'شخصیت دمو انتخاب‌شده نامعتبر است' }, { status: 400 })
  }

  const current = await getDemoStatus()
  if (current.active) {
    if (!body?.replace) {
      return Response.json({ error: 'اول داده‌های دمو فعلی را پاک کنید.' }, { status: 400 })
    }
    await clearDemo()
  }

  try {
    const { counts, persona } = await generateDemo(personaId, { id: session.id, name: session.name })
    return Response.json({ ok: true, counts, persona: { id: persona.id, name: persona.name } })
  } catch (e) {
    console.error('demo generation failed', e)
    await logAudit(session.id, session.name, 'خطا در تولید داده دمو', 'DEMO', personaId, { message: e instanceof Error ? e.message : String(e) })
    return Response.json({ error: 'ساخت داده دمو ناموفق بود — لطفاً دوباره تلاش کنید.' }, { status: 500 })
  }
}

// ============ DELETE: پاک‌سازی ============

export async function DELETE(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ADMIN_SETTINGS)) {
    return Response.json({ error: 'فقط مدیر سامانه اجازه کار با آزمایشگاه دمو را دارد' }, { status: 403 })
  }

  const { ok, counts } = await clearDemo()
  if (ok) {
    await logAudit(session.id, session.name, 'پاک‌سازی داده دمو', 'DEMO', undefined, { counts })
  }
  return Response.json({ ok: true, counts })
}
