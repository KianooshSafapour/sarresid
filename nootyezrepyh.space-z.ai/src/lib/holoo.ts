import { db } from '@/lib/db'

export const HOLOO_CONFIG_KEY = 'holoo_config'

export interface HolooConfig {
  mode: 'SIMULATED' | 'LIVE'
  endpoint?: string
  apiKey?: string // stored server-side, never sent raw to clients
  updatedBy?: string
  updatedAt?: string
}

/** Read the Holoo bridge configuration (mode SIMULATED|LIVE, endpoint, apiKey). */
export async function readHolooConfig(): Promise<HolooConfig> {
  const row = await db.setting.findUnique({ where: { key: HOLOO_CONFIG_KEY } })
  const parsed: Partial<HolooConfig> = row ? JSON.parse(row.value) : {}
  return {
    mode: parsed.mode === 'LIVE' ? 'LIVE' : 'SIMULATED',
    endpoint: parsed.endpoint,
    apiKey: parsed.apiKey,
    updatedBy: parsed.updatedBy,
    updatedAt: parsed.updatedAt,
  }
}
