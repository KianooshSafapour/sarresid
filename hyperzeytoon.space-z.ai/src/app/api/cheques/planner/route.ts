import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, getSetting } from '@/lib/server-utils'
import { isoDay, addDays, formatJalali, weekdayFa, toFaDigits } from '@/lib/jalali'
import { parseFlexibility, resolveFlex, type FlexibilityConfig, type FlexResolution } from '@/lib/cheque-flex'

// ============================================================
// POST /api/cheques/planner — SMART CHEQUE PLANNER (any authenticated user)
//
// Input:  { startISO: 'yyyy-mm-dd', maxDays: 1..365, amount?: number,
//           count?: 1..12 (default 1), note?: string }
//
// SCHEDULING DECISION (documented): cheques are SERIAL — cheque #i base due
// = start + maxDays + i×30. A fixed 30-day spacing mirrors the classic
// monthly-credit cadence of grocery supply chains (سفارش ماهانه با چک
// ماهانه) and keeps due dates predictable for treasury planning.
// (Spread/equal-split across the window was deliberately not chosen.)
//
// FLEX DECISION: candidate = base + effectiveFlex(base date). Flex is NOT
// re-applied when the candidate lands on a closed day — we never auto-move;
// instead we warn and offer alternatives (nearest OPEN days), each carrying
// its own recomputed flex so the UI can show the buffer that would apply.
// ============================================================

interface AltDTO {
  iso: string
  jalali: string
  weekdayFa: string
  isFriday: boolean
  isHoliday: boolean
  holidayName?: string
  flexDays: number
  flexSource: string
  flexSourceFa: string
}

interface ProposalDTO {
  index: number
  baseISO: string
  baseJalali: string
  flexDays: number
  flexSource: string
  flexSourceFa: string
  candidateISO: string
  candidateJalali: string
  weekdayFa: string
  isFriday: boolean
  isHoliday: boolean
  holidayName?: string
  warnings: string[]
  alternatives: AltDTO[]
}

function isClosed(d: Date, holidays: Map<string, string>): boolean {
  return d.getDay() === 5 || holidays.has(isoDay(d))
}

/** nearest OPEN days before (closest first) + after (closest first) a closed candidate */
function openAlternatives(
  candidate: Date,
  holidays: Map<string, string>,
  config: FlexibilityConfig,
  before = 5,
  after = 2
): AltDTO[] {
  const out: AltDTO[] = []
  const describe = (d: Date): AltDTO => {
    const flex: FlexResolution = resolveFlex(config, d)
    const iso = isoDay(d)
    return {
      iso,
      jalali: formatJalali(d),
      weekdayFa: weekdayFa(d),
      isFriday: d.getDay() === 5,
      isHoliday: holidays.has(iso),
      holidayName: holidays.get(iso),
      flexDays: flex.days,
      flexSource: flex.source,
      flexSourceFa: flex.sourceFa,
    }
  }
  // 5 nearest open days BEFORE (walking backwards, closest first)
  let cur = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate())
  let found = 0
  for (let i = 0; i < 90 && found < before; i++) {
    cur = addDays(cur, -1)
    if (!isClosed(cur, holidays)) {
      out.push(describe(cur))
      found++
    }
  }
  // 2 nearest open days AFTER (walking forward, closest first)
  cur = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate())
  found = 0
  for (let i = 0; i < 90 && found < after; i++) {
    cur = addDays(cur, 1)
    if (!isClosed(cur, holidays)) {
      out.push(describe(cur))
      found++
    }
  }
  return out
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  let body: {
    startISO?: string
    maxDays?: number
    amount?: number
    count?: number
    note?: string
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return fail('درخواست نامعتبر است')
  }

  const startISO = String(body.startISO ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startISO)) return fail('تاریخ شروع باید به قالب yyyy-mm-dd میلادی باشد')
  const [sy, sm, sd] = startISO.split('-').map(Number)
  if (sm < 1 || sm > 12 || sd < 1 || sd > 31) return fail('تاریخ شروع نامعتبر است')
  const start = new Date(sy, sm - 1, sd)
  if (isNaN(start.getTime())) return fail('تاریخ شروع نامعتبر است')

  const maxDays = Math.floor(Number(body.maxDays))
  if (!Number.isFinite(maxDays) || maxDays < 1 || maxDays > 365) {
    return fail('بازهٔ سررسید باید عددی بین ۱ تا ۳۶۵ روز باشد')
  }

  let amount: number | undefined
  if (body.amount !== undefined && body.amount !== null && body.amount !== 0) {
    amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount < 0) return fail('مبلغ چک نامعتبر است')
  }

  const count = Math.min(12, Math.max(1, Math.floor(Number(body.count ?? 1) || 1)))
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : undefined

  // flexibility config + holidays around the whole planning horizon
  const config = parseFlexibility(await getSetting('cheque_flexibility', '{"default":0,"levels":[]}'))
  const from = isoDay(addDays(start, -60))
  const to = isoDay(addDays(start, maxDays + count * 30 + 120))
  const holidayRows = await db.holiday.findMany({ where: { date: { gte: from, lte: to } }, select: { date: true, name: true } })
  const holidays = new Map(holidayRows.map((h) => [h.date, h.name]))

  const proposals: ProposalDTO[] = []
  for (let i = 0; i < count; i++) {
    // SERIAL spacing: each subsequent cheque lands +30 days after the previous base
    const base = addDays(start, maxDays + i * 30)
    const flex = resolveFlex(config, base)
    const candidate = addDays(base, flex.days)
    const candidateISO = isoDay(candidate)
    const isFriday = candidate.getDay() === 5
    const isHoliday = holidays.has(candidateISO)
    const holidayName = holidays.get(candidateISO)

    const warnings: string[] = []
    if (isFriday) warnings.push('تاریخ پیشنهادی مصادف با جمعه است — بانک‌ها و دفتر تأمین‌کننده تعطیل است؛ یکی از روزهای باز پیشنهادی را انتخاب کنید.')
    if (isHoliday) warnings.push(`تاریخ پیشنهادی مصادف با تعطیل رسمی «${holidayName}» است؛ یکی از روزهای باز پیشنهادی را انتخاب کنید.`)

    const closed = isFriday || isHoliday
    proposals.push({
      index: i,
      baseISO: isoDay(base),
      baseJalali: formatJalali(base),
      flexDays: flex.days,
      flexSource: flex.source,
      flexSourceFa: flex.sourceFa,
      candidateISO,
      candidateJalali: formatJalali(candidate),
      weekdayFa: weekdayFa(candidate),
      isFriday,
      isHoliday,
      holidayName,
      warnings,
      // alternatives only make sense when the auto-proposal is NOT usable
      alternatives: closed ? openAlternatives(candidate, holidays, config) : [],
    })
  }

  return ok({
    proposals,
    flexibility: config,
    meta: {
      scheduling: 'serial-30d',
      startJalali: formatJalali(start),
      maxDays,
      count: toFaDigits(count),
    },
  })
}
