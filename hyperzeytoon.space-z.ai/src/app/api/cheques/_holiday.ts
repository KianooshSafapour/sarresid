// Holiday helpers shared by cheque endpoints
import { db } from '@/lib/db'
import { isoDay, addDays, formatJalali } from '@/lib/jalali'

export function isFriday(d: Date): boolean {
  return d.getDay() === 5 // JS: 5 = Friday
}

/** previous non-holiday, non-Friday day (for suggestions) */
export function prevOpenDay(d: Date, holidayDates: Set<string>): Date {
  let cur = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  for (let i = 0; i < 30; i++) {
    cur = addDays(cur, -1)
    if (!isFriday(cur) && !holidayDates.has(isoDay(cur))) return cur
  }
  return addDays(d, -1)
}

/** load holiday iso-days in a window around the given date */
export async function loadHolidaySet(center: Date): Promise<Set<string>> {
  const rows = await db.holiday.findMany({
    where: { date: { gte: isoDay(addDays(center, -60)), lte: isoDay(addDays(center, 400)) } },
    select: { date: true },
  })
  return new Set(rows.map((r) => r.date))
}

/** spec wording: due-date falls on Friday/holiday */
export function holidayMessage(suggestion?: Date): string {
  const base = 'سررسید به تعطیلات می‌افتد؛ زودتر انتخاب کنید'
  return suggestion ? `${base} — پیشنهاد: ${formatJalali(suggestion)}` : base
}
