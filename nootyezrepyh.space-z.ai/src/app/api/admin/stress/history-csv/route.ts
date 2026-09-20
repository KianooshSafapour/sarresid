import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logExport } from '@/lib/exports'
import { formatJalaliDateTime } from '@/lib/jalali'

/**
 * GET /api/admin/stress/history-csv
 * Downloads the stress-test run history (Setting `stress_history`) as UTF-8 CSV
 * (BOM included so Excel opens Persian headers correctly) and registers the
 * download in the shared exports archive.
 * Gate: ADMIN_SETTINGS (same as the stress console).
 */

const SCALE_FA: Record<string, string> = { SMALL: 'کوچک', MEDIUM: 'متوسط', LARGE: 'بزرگ', PROBE: 'فقط سنجش' }

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ADMIN_SETTINGS)) {
    return Response.json({ error: 'اجازه دسترسی ندارید' }, { status: 403 })
  }

  const row = await db.setting.findUnique({ where: { key: 'stress_history' } })
  let history: { at: string; atJalali: string; scale: string; totalRows: number; probeMs: number; worstP95: number; probeCount: number }[] = []
  try {
    history = row ? JSON.parse(row.value) : []
  } catch {
    history = []
  }

  const header = ['ردیف', 'تاریخ (شمسی)', 'تاریخ (میلادی ISO)', 'مقیاس', 'تعداد ردیف ساخته‌شده', 'زمان سنجش کل (ms)', 'بدترین p95 (ms)', 'تعداد سناریو']
  const lines = [header.join(',')]
  history.forEach((h, i) => {
    lines.push([
      i + 1,
      csvCell(h.atJalali || ''),
      h.at || '',
      SCALE_FA[h.scale] || h.scale,
      h.totalRows ?? 0,
      h.probeMs ?? 0,
      h.worstP95 ?? 0,
      h.probeCount ?? 0,
    ].join(','))
  })

  // BOM so Excel renders UTF-8 Persian correctly
  const csv = '\uFEFF' + lines.join('\r\n')

  await Promise.all([
    logExport({
      kind: 'STRESS_CSV',
      label: 'روند آزمون فشار (CSV)',
      rows: history.length,
      userId: session.id,
      userName: session.name,
      at: new Date().toISOString(),
      atJalali: formatJalaliDateTime(new Date()),
    }),
    (async () => {
      const { logAudit } = await import('@/lib/audit')
      await logAudit(session.id, session.name, 'STRESS_HISTORY_EXPORT', 'STRESS_TEST', undefined, { rows: history.length })
    })(),
  ])

  const date = formatJalaliDateTime(new Date()).replace(/[/\s:—]+/g, '-')
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="zeytoon-stress-history-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
