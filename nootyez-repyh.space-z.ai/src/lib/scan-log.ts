/**
 * Scan-log contracts + client fire-and-forget helper for the delivery
 * ScanBar (see src/components/platform/DeliveriesSection.tsx).
 *
 * Every scan submit — hit or miss — is logged server-side as one SCAN_IN
 * audit row via POST /api/scan-log (the miss count is the adoption signal).
 * Managers read aggregates from GET /api/scan-log/stats?days=7.
 *
 * This module is framework-neutral (no 'use client' / no window access at
 * module scope) so the API route can share the union types too.
 */

export type ScanSource = 'manual' | 'camera'
export type ScanLogOutcome = 'hit' | 'closed' | 'warn' | 'miss' | 'error'

export interface ScanStats {
  total: number
  hits: number
  closed: number
  issues: number
  bySource: { manual: number; camera: number }
  /** ascending, exactly `days` entries (zero days included) */
  byDay: { dayISO: string; count: number }[]
  /** per-user leaderboard — SCAN_IN audits grouped by userName;
   * `hits` = successful scans (hit|closed, same «موفق» definition as the chip);
   * sorted total desc, top 8 */
  perUser: { userName: string; total: number; hits: number }[]
}

/**
 * Fire-and-forget scan-log POST — never throws, response ignored, failures
 * silent. Analytics must never break (or even delay) a scan. `keepalive`
 * lets an in-flight log survive an immediate tab/detail navigation.
 */
export function logScanEvent(
  userId: number,
  code: string,
  source: ScanSource,
  outcome: ScanLogOutcome,
): void {
  try {
    void fetch('/api/scan-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, code, source, outcome }),
      cache: 'no-store',
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    /* best-effort — a failed log must never surface to the operator */
  }
}
