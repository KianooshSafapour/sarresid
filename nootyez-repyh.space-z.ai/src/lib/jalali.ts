import { toJalaali, toGregorian, jalaaliMonthLength } from 'jalaali-js'

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]
export const JALALI_MONTHS_EN = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand']
export const WEEKDAYS_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']
// Saturday-first index for a JS Date (0 = شنبه)
export function saturdayIndex(d: Date) {
  return (d.getDay() + 1) % 7
}

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
export function toFaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)])
}

export type JDate = { jy: number; jm: number; jd: number }

export function isoToJalali(iso: string | Date): JDate {
  const d = typeof iso === 'string' ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')) : iso
  return toJalaali(d) as JDate
}

export function jalaliToISO(jy: number, jm: number, jd: number): string {
  const g = toGregorian(jy, jm, jd)
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`
}

export function monthLength(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm)
}

/** "۱۴۰۴/۰۷/۱۶" */
export function fmtJalali(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const { jy, jm, jd } = isoToJalali(iso)
  return toFaDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`)
}

/** "۱۶ مهر ۱۴۰۴" */
export function fmtJalaliLong(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const { jy, jm, jd } = isoToJalali(iso)
  return `${toFaDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toFaDigits(jy)}`
}

/** "۱۶ مهر ۱۴۰۴ - ۰۹:۳۰" */
export function fmtJalaliTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${fmtJalaliLong(d)} - ${toFaDigits(hh)}:${toFaDigits(mm)}`
}

export function jalaliMonthName(jm: number): string {
  return JALALI_MONTHS[jm - 1] ?? ''
}

/** today ISO yyyy-mm-dd */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysBetweenISO(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime()
  const dbb = new Date(b + 'T00:00:00').getTime()
  return Math.round((dbb - da) / 86400000)
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('en-US').format(Math.round(n)) + ' تومان'
}

export function fmtMoneyShort(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B ت'
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M ت'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + 'K ت'
  return String(n)
}
