// ============================================================
// Iranian official holidays (curated seed data)
// Fridays are the universal weekly holiday (handled separately).
// The admin can add/edit/remove holidays in Settings.
// A "sync" endpoint attempts to refresh from an internet source.
// Dates are stored as ISO gregorian yyyy-mm-dd.
// ============================================================

// Fixed Jalali holidays that repeat every year (jmonth, jday)
export const FIXED_JALALI_HOLIDAYS: { jm: number; jd: number; name: string }[] = [
  { jm: 1, jd: 1, name: 'نوروز - عید نوروز' },
  { jm: 1, jd: 2, name: 'عید نوروز' },
  { jm: 1, jd: 3, name: 'عید نوروز' },
  { jm: 1, jd: 4, name: 'عید نوروز' },
  { jm: 1, jd: 12, name: 'روز جمهوری اسلامی' },
  { jm: 1, jd: 13, name: 'روز طبیعت (سیزده بدر)' },
  { jm: 3, jd: 14, name: 'رحلت امام خمینی' },
  { jm: 3, jd: 15, name: 'قیام ۱۵ خرداد' },
  { jm: 11, jd: 22, name: 'پیروزی انقلاب اسلامی' },
  { jm: 12, jd: 29, name: 'ملی شدن صنعت نفت' },
]

// Lunar Islamic holidays shift each solar year — curated for 1404 (2025-2026).
// Stored as gregorian ISO days for the seed.
export const LUNAR_HOLIDAYS_1404: { iso: string; name: string }[] = [
  { iso: '2025-06-15', name: 'عید قربان' },
  { iso: '2025-06-23', name: 'عید غدیر خم' },
  { iso: '2025-07-13', name: 'تاسوعای حسینی' },
  { iso: '2025-07-14', name: 'عاشورای حسینی' },
  { iso: '2025-08-23', name: 'اربعین حسینی' },
  { iso: '2025-09-01', name: 'رحلت رسول اکرم و شهادت امام حسن مجتبی' },
  { iso: '2025-09-09', name: 'شهادت امام رضا' },
  { iso: '2025-09-17', name: 'شهادت امام حسن عسکری' },
  { iso: '2025-09-26', name: 'ولادت رسول اکرم و امام جعفر صادق' },
  { iso: '2025-11-04', name: 'شهادت حضرت فاطمه زهرا' },
  { iso: '2026-01-13', name: 'ولادت امام زمان (نیمه شعبان)' },
  { iso: '2026-02-19', name: 'شهادت امام علی' },
  { iso: '2026-03-01', name: 'عید فطر' },
  { iso: '2026-03-02', name: 'تعطیل به مناسبت عید فطر' },
  { iso: '2026-03-20', name: 'شهادت امام جعفر صادق' },
]

// National/governmental extra days for 1404 sample (e.g. elections, air pollution days are added by admin)
export function fixedHolidaysForYear(jy: number): { iso: string; name: string }[] {
  // convert fixed jalali to iso using shared jalali lib (server side import)
  // kept here to avoid circular import; uses same algorithm via lib/jalali
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { toGregorian } = require('./jalali') as typeof import('./jalali')
  return FIXED_JALALI_HOLIDAYS.map((h) => {
    const g = toGregorian(jy, h.jm, h.jd)
    const iso = `${g.getFullYear()}-${String(g.getMonth() + 1).padStart(2, '0')}-${String(g.getDate()).padStart(2, '0')}`
    return { iso, name: h.name }
  })
}

/** Pure helper: is a given ISO day a holiday given the holiday set? Friday counts. */
export function isHolidayDay(iso: string, holidays: Set<string>): { holiday: boolean; friday: boolean } {
  const d = new Date(iso + 'T12:00:00')
  const friday = d.getDay() === 5
  return { holiday: holidays.has(iso), friday }
}
