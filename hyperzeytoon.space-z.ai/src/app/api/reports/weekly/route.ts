import { NextRequest } from 'next/server'
import { requireUser, requireManager, fail, ok, logActivity, getSetting } from '@/lib/server-utils'
import { computeWeeklyDigest, sendWeeklyDigest, WEEKLY_DIGEST_KEY } from '../_weekly'

// ============================================================
// GET  /api/reports/weekly — live weekly digest + last auto-run stamp
// POST /api/reports/weekly — manager forces a send to owner/gm/om
// ============================================================

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const [digest, lastAutoRun] = await Promise.all([
    computeWeeklyDigest(),
    getSetting(WEEKLY_DIGEST_KEY, ''),
  ])
  return ok({ digest, lastAutoRun })
}

export async function POST(req: NextRequest) {
  const user = await requireManager(req)
  if (!user) return fail('دسترسی غیرمجاز — فقط مدیریت', 403)

  const digest = await sendWeeklyDigest()
  await logActivity(user.id, user.name, 'ارسال گزارش هفتگی به تیم مدیریت', 'reports')
  return ok({ sent: true, digest })
}
