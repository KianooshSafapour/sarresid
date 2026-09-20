import { NextResponse } from 'next/server'
import { ensurePrismaModel } from '@/lib/db'
import { toFaDigits } from '@/lib/jalali'
import { PILOT_MODULE_KEYS, pilotModuleFa } from '@/lib/pilot-modules'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Field Pilot Program (Task 13-a) — PUBLIC feedback intake.
 *
 * Field testers are external companies without platform accounts: they receive
 * an invite code (HZP-XXXX) from a manager and submit structured feedback here.
 * NO manager gate — this endpoint is intentionally public.
 *
 * POST /api/pilot/feedback { inviteCode, moduleKey, rating, timeSavedMin?, comment? }
 *  → 404 «کد دعوت یافت نشد» | 403 if tester COMPLETED/DECLINED
 *  → 400 Persian for bad moduleKey / rating (1..5) / timeSavedMin
 *  → first submission flips tester INVITED → ACTIVE (audit PILOT_TESTER_ACTIVATED)
 *  → always audits PILOT_FEEDBACK_RECEIVED (Persian detail)
 */

const MAX_TIME_SAVED = 100000 // minutes/week sanity cap
const MAX_COMMENT = 1000

export async function POST(request: Request) {
  try {
    const conn = ensurePrismaModel('pilotFeedback')
    const body = await request.json().catch(() => null)

    const inviteCode = String(body?.inviteCode ?? '').trim().toUpperCase()
    if (!inviteCode) {
      return NextResponse.json({ error: 'کد دعوت الزامی است | inviteCode is required' }, { status: 400 })
    }

    const tester = await conn.pilotTester.findUnique({ where: { inviteCode } })
    if (!tester) {
      return NextResponse.json({ error: 'کد دعوت یافت نشد | Invite code not found' }, { status: 404 })
    }

    if (tester.status === 'COMPLETED' || tester.status === 'DECLINED') {
      return NextResponse.json(
        { error: 'ثبت بازخورد برای این آزمونگر فعال نیست — برنامه این شرکت به پایان رسیده است | Feedback intake closed for this tester' },
        { status: 403 },
      )
    }

    const moduleKey = String(body?.moduleKey ?? '').trim()
    if (!PILOT_MODULE_KEYS.includes(moduleKey)) {
      return NextResponse.json(
        { error: 'ماژول معتبر نیست — یکی از ماژول‌های پلتفرم را انتخاب کنید | Invalid moduleKey' },
        { status: 400 },
      )
    }

    const rating = Number(body?.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'امتیاز باید عددی بین ۱ تا ۵ باشد | Rating must be an integer between 1 and 5' },
        { status: 400 },
      )
    }

    let timeSavedMin: number | null = null
    if (body?.timeSavedMin !== undefined && body?.timeSavedMin !== null && String(body.timeSavedMin).trim() !== '') {
      const n = Number(body.timeSavedMin)
      if (!Number.isFinite(n) || n < 0 || n > MAX_TIME_SAVED) {
        return NextResponse.json(
          { error: 'دقیقه صرفه‌جویی معتبر نیست | timeSavedMin must be a non-negative number' },
          { status: 400 },
        )
      }
      timeSavedMin = Math.round(n)
    }

    const comment = String(body?.comment ?? '').trim().slice(0, MAX_COMMENT) || null

    const feedback = await conn.pilotFeedback.create({
      data: { testerId: tester.id, moduleKey, rating, timeSavedMin, comment },
    })

    // first real usage = tester goes live
    if (tester.status === 'INVITED') {
      await conn.pilotTester.update({ where: { id: tester.id }, data: { status: 'ACTIVE' } })
      await conn.auditLog.create({
        data: {
          userId: 0,
          userName: `آزمونگر میدانی — ${tester.companyName}`,
          action: 'PILOT_TESTER_ACTIVATED',
          entity: 'PilotTester',
          entityId: tester.id,
          detail: `فعال‌سازی آزمونگر ${tester.companyName} — اولین بازخورد ثبت شد (کد ${tester.inviteCode})`,
        },
      })
    }

    await conn.auditLog.create({
      data: {
        userId: 0,
        userName: `آزمونگر میدانی — ${tester.companyName}`,
        action: 'PILOT_FEEDBACK_RECEIVED',
        entity: 'PilotFeedback',
        entityId: feedback.id,
        detail: `بازخورد آزمونگر ${tester.companyName} — ${pilotModuleFa(moduleKey)} — ${toFaDigits(rating)} ستاره`,
      },
    })

    return NextResponse.json({
      ok: true,
      message: 'بازخورد شما ثبت شد — سپاسگزاریم! | Feedback received — thank you!',
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'خطا در ثبت بازخورد' },
      { status: 500 },
    )
  }
}
