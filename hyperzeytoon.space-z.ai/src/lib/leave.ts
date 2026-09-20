import { getSetting } from './server-utils'

// ============================================================
// منطق مشترک مرخصی — سیاست، تاریخ، ظرفیت
// ============================================================

export interface LeavePolicy {
  monthlyDays: number
  maxSameDay: number
  hourlyMaxHours: number
}

export const DEFAULT_POLICY: LeavePolicy = { monthlyDays: 4, maxSameDay: 2, hourlyMaxHours: 4 }

export async function readLeavePolicy(): Promise<LeavePolicy> {
  try {
    const raw = await getSetting('leave_policy')
    if (!raw) return { ...DEFAULT_POLICY }
    const p = JSON.parse(raw) as Partial<LeavePolicy>
    return {
      monthlyDays: Number(p.monthlyDays) > 0 ? Number(p.monthlyDays) : DEFAULT_POLICY.monthlyDays,
      maxSameDay: Number(p.maxSameDay) > 0 ? Number(p.maxSameDay) : DEFAULT_POLICY.maxSameDay,
      hourlyMaxHours: Number(p.hourlyMaxHours) > 0 ? Number(p.hourlyMaxHours) : DEFAULT_POLICY.hourlyMaxHours,
    }
  } catch {
    return { ...DEFAULT_POLICY }
  }
}

/** parse "yyyy-mm-dd" as a LOCAL date (avoids UTC off-by-one) */
export function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0) // noon keeps the day stable in any TZ
  if (isNaN(dt.getTime())) return null
  return dt
}

export const DAY_MS = 24 * 60 * 60 * 1000
