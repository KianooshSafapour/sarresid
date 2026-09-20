import { db } from '@/lib/db'

export interface ExportLogEntry {
  id: string
  kind: string
  label: string
  rows: number
  userId: string
  userName: string
  at: string // ISO
  atJalali: string // "1405/06/20 — ۱۴:۳۲"
}

export const EXPORT_LOG_KEY = 'export_log'
export const EXPORT_LOG_CAP = 60

export const EXPORT_KINDS: Record<string, { label: string; icon: string }> = {
  ORDER_XLSX: { label: 'اکسل هلو (سفارش)', icon: '📊' },
  STOCK_XLSX: { label: 'اکسل موجودی انبار', icon: '📦' },
  STRESS_CSV: { label: 'CSV روند آزمون فشار', icon: '🧪' },
  // extensible: future kinds (PDF reports, …)
}

/** Append an entry to the shared export archive (Setting JSON, capped). Never throws. */
export async function logExport(entry: Omit<ExportLogEntry, 'id'>): Promise<void> {
  try {
    const cur = await db.setting.findUnique({ where: { key: EXPORT_LOG_KEY } })
    const list: ExportLogEntry[] = cur ? JSON.parse(cur.value) : []
    list.unshift({ ...entry, id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` })
    const capped = list.slice(0, EXPORT_LOG_CAP)
    await db.setting.upsert({
      where: { key: EXPORT_LOG_KEY },
      update: { value: JSON.stringify(capped) },
      create: { key: EXPORT_LOG_KEY, value: JSON.stringify(capped) },
    })
  } catch {
    // archive is best-effort — never block the actual download
  }
}
