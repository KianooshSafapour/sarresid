import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { formatJalaliDateTime } from '@/lib/jalali'
import { readHolooConfig } from '@/lib/holoo'

interface HolooBridge {
  lastPingAt?: string
  latencyMs?: number
  version?: string
  lastSyncAt?: string
  lastSyncRef?: string
}

async function readBridge(): Promise<HolooBridge> {
  const row = await db.setting.findUnique({ where: { key: 'holoo_bridge' } })
  return row ? (JSON.parse(row.value) as HolooBridge) : {}
}

async function writeBridge(b: HolooBridge) {
  await db.setting.upsert({
    where: { key: 'holoo_bridge' },
    update: { value: JSON.stringify(b) },
    create: { key: 'holoo_bridge', value: JSON.stringify(b) },
  })
}

/** GET /api/accounting/holoo-status — simulated Holoo ERP bridge health probe.
 *  Each ping records latency on the bridge setting so the UI can show a live chip.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ACCOUNTING) && !canUser(session.roles, PERMISSIONS.VIEW_REPORTS))
    return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  // simulate a network round-trip to the Holoo server (a bit slower when "live" configured)
  const cfg = await readHolooConfig()
  const live = cfg.mode === 'LIVE'
  const latencyMs = (live ? 42 : 18) + Math.floor(Math.random() * 70)
  await new Promise((r) => setTimeout(r, latencyMs))

  const prev = await readBridge()
  const version = live
    ? `Holoo ERP v5.2 — حالت زنده${cfg.endpoint ? ` (${cfg.endpoint})` : ''}`
    : 'Holoo ERP v5.2 — پل آزمایشی'
  const bridge: HolooBridge = {
    ...prev,
    lastPingAt: new Date().toISOString(),
    latencyMs,
    version, // always reflect the current mode
  }
  await writeBridge(bridge)

  return Response.json({
    ok: true,
    simulated: !live,
    mode: cfg.mode,
    endpoint: cfg.endpoint || null,
    latencyMs,
    version: bridge.version,
    lastPingAt: bridge.lastPingAt,
    lastPingAtJalali: bridge.lastPingAt ? formatJalaliDateTime(new Date(bridge.lastPingAt)) : null,
    lastSyncAtJalali: bridge.lastSyncAt ? formatJalaliDateTime(new Date(bridge.lastSyncAt)) : null,
    lastSyncRef: bridge.lastSyncRef || null,
  })
}
