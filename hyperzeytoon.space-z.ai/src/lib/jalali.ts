// ============================================================
// Jalali (Persian Solar Hijri) calendar utilities
// Based on the well-known jalaali-js algorithm (Behrang Norouzinia)
// ============================================================

export interface JalaaliDate {
  jy: number
  jm: number
  jd: number
}

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

export const JALALI_WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']
export const JALALI_WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

function div(a: number, b: number) {
  return ~~(a / b)
}

function jalCal(jy: number) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
  let jump = 0
  let leapJ = -14
  let jp = breaks[0]
  for (let i = 1; i < breaks.length; i += 1) {
    const jm = breaks[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(jump % 33, 4)
    jp = jm
  }
  let n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div((n % 33) + 3, 4)
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1
  const leapG = div(jy + 621, 4) - div(jy + 621, 100) + div(jy + 621, 400) - 150
  const march = 20 + leapJ - leapG
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = (((n + 1) % 33) - 1) % 4
  if (leap === -1) leap = 4
  return { leap, gy: jy + 621, march }
}

function g2d(gy: number, gm: number, gd: number) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * ((gm + 9) % 12) + 2, 5) + gd - 34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div((j % 1461) / 4, 1) * 5 + 308
  const gd = div((i % 153) / 5, 1) + 1
  const gm = (div(i, 153) % 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy)
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
}

function d2j(jdn: number): JalaaliDate {
  const gy = d2g(jdn).gy
  let jy = gy - 621
  const r = jalCal(jy)
  const jdn1f = g2d(gy, 3, r.march)
  let jd: number
  let jm: number
  let k = jdn - jdn1f
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31)
      jd = (k % 31) + 1
      return { jy, jm, jd }
    }
    k -= 186
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }
  jm = 7 + div(k, 30)
  jd = (k % 30) + 1
  return { jy, jm, jd }
}

export function toJalali(date: Date): JalaaliDate {
  return d2j(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate()))
}

export function toGregorian(jy: number, jm: number, jd: number): Date {
  const g = d2g(j2d(jy, jm, jd))
  return new Date(g.gy, g.gm - 1, g.gd)
}

export function isJalaliLeap(jy: number): boolean {
  return jalCal(jy).leap === 0
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return isJalaliLeap(jy) ? 30 : 29
}

// ---------- formatting ----------

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

export function toFaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)])
}

export function toEnDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Format a Date as "شنبه ۱۲ آبان ۱۴۰۳" */
export function formatJalaliFull(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const j = toJalali(d)
  const weekday = JALALI_WEEKDAYS[(d.getDay() + 1) % 7]
  return `${weekday} ${toFaDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${toFaDigits(j.jy)}`
}

/** Format as "۱۴۰۳/۰۸/۱۲" */
export function formatJalali(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  const j = toJalali(d)
  return `${toFaDigits(j.jy)}/${toFaDigits(pad2(j.jm))}/${toFaDigits(pad2(j.jd))}`
}

/** Format as "۱۴۰۳/۰۸/۱۲ - ۱۴:۳۰" */
export function formatJalaliDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  return `${formatJalali(d)} - ${toFaDigits(pad2(d.getHours()))}:${toFaDigits(pad2(d.getMinutes()))}`
}

export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  return `${toFaDigits(pad2(d.getHours()))}:${toFaDigits(pad2(d.getMinutes()))}`
}

/** ISO date string yyyy-mm-dd (gregorian) used as canonical storage key */
export function isoDay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function jalaliKey(date: Date | string): string {
  const j = toJalali(typeof date === 'string' ? new Date(date) : date)
  return `${j.jy}-${pad2(j.jm)}-${pad2(j.jd)}`
}

/** relative time like "۳ ساعت پیش" */
export function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'همین حالا'
  if (mins < 60) return `${toFaDigits(mins)} دقیقه پیش`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${toFaDigits(hours)} ساعت پیش`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${toFaDigits(days)} روز پیش`
  return formatJalali(d)
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Jalali date picker day cell model */
export interface CalendarCell {
  jd: number
  jm: number
  jy: number
  gDate: Date
  isToday: boolean
  isFriday: boolean
}

export function jalaliMonthGrid(jy: number, jm: number): CalendarCell[] {
  const cells: CalendarCell[] = []
  const len = jalaliMonthLength(jy, jm)
  const today = new Date()
  // first gregorian day of this jalali month
  const firstG = toGregorian(jy, jm, 1)
  // Persian weekday: Saturday=0 ... Friday=6 ; JS getDay(): Sunday=0..Saturday=6
  const shift = (firstG.getDay() + 1) % 7
  for (let i = 0; i < shift; i++) cells.push(null as unknown as CalendarCell)
  for (let jd = 1; jd <= len; jd++) {
    const gDate = toGregorian(jy, jm, jd)
    cells.push({
      jd, jm, jy, gDate,
      isToday: isoDay(gDate) === isoDay(today),
      isFriday: gDate.getDay() === 5,
    })
  }
  return cells
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return toFaDigits(Math.round(n).toLocaleString('en-US').replace(/,/g, '٬'))
}

export function moneyEn(n: number | null | undefined): string {
  if (n === null || n === undefined) return '0'
  return Math.round(n).toLocaleString('en-US')
}

/**
 * Compact money for dense KPI cards: ≥۱ میلیارد → «۲٫۳ میلیارد»،
 * ≥۱ میلیون → «۱۰۵٫۹ میلیون»، otherwise full grouped digits.
 */
export function moneyCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const v = Math.round(n)
  const abs = Math.abs(v)
  const trim = (x: number) => toFaDigits(x.toFixed(1).replace(/\.0$/, '').replace('.', '٫'))
  if (abs >= 1e9) return `${trim(v / 1e9)} میلیارد`
  if (abs >= 1e6) return `${trim(v / 1e6)} میلیون`
  return money(v)
}

/** add N days to a jalali {jy,jm,jd} */
export function addJalaliDays(j: JalaaliDate, days: number): JalaaliDate {
  const g = toGregorian(j.jy, j.jm, j.jd)
  return toJalali(addDays(g, days))
}

// ============================================================
// Flexibility-scope keys (برنامه‌ریز چک — cheque due-date planner)
// Key formats used by the `cheque_flexibility` setting:
//   YEAR   = '1404'                    → کل سال جلالی
//   SEASON = '1404-BAHAR'              → فصل (بهار/تابستان/پاییز/زمستان)
//   MONTH  = '1404-03'                 → ماه جلالی
//   WEEK   = '1404-03-W2'              → هفتهٔ «ماه‌محور» (مستند در کد):
//            W1 = روزهای ۱ تا ۷ ماه، W2 = ۸ تا ۱۴، W3 = ۱۵ تا ۲۱،
//            W4 = ۲۲ تا ۲۸، W5 = روز ۲۹ تا پایان ماه.
//            (ساده و قابل پیش‌بینی؛ مستقل از شروع هفته)
//   DAY    = '1404-03-15'              → روز مشخص جلالی
// ============================================================

export type JalaliSeason = 'BAHAR' | 'TABESTAN' | 'PAEEZ' | 'ZEMESTAN'

/** Jalali month (1..12) → season key */
export function jalaliSeasonOf(jm: number): JalaliSeason {
  if (jm <= 3) return 'BAHAR'
  if (jm <= 6) return 'TABESTAN'
  if (jm <= 9) return 'PAEEZ'
  return 'ZEMESTAN'
}

/** month-week index (1..5) of a day inside its Jalali month — ۷روزه از اول ماه */
export function jalaliMonthWeekOf(jd: number): number {
  return Math.min(5, Math.floor((jd - 1) / 7) + 1)
}

/** Persian weekday name of a gregorian Date (شنبه … جمعه) */
export function weekdayFa(date: Date): string {
  return JALALI_WEEKDAYS[(date.getDay() + 1) % 7]
}
