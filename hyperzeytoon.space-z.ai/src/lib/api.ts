'use client'

import { getSessionToken } from './session'
import { isSandboxEnabled, recordJournal } from '@/store/sandbox'

function authHeaders(): Record<string, string> {
  const token = getSessionToken()
  return token ? { 'x-session-token': token } : {}
}

// ============ PLATFORM ANALYTICS (root-admin only) ============
// Every successful non-GET request through api() is buffered client-side and
// flushed to /api/platform-events via sendBeacon. Best-effort only: failures
// are silently ignored so analytics can never break the platform.

interface AnalyticsEvent {
  section: string
  action: string
  url: string
  detail?: string
}

const analyticsBuffer: AnalyticsEvent[] = []
let analyticsTimer: ReturnType<typeof setInterval> | null = null

function analyticsSection(url: string): string {
  const m = url.split('?')[0].match(/\/api\/([^/]+)/)
  return m ? m[1] : 'unknown'
}

function flushAnalytics(): void {
  if (!analyticsBuffer.length) return
  const events = analyticsBuffer.splice(0, analyticsBuffer.length)
  try {
    const blob = new Blob([JSON.stringify({ events })], { type: 'application/json' })
    navigator.sendBeacon('/api/platform-events', blob)
  } catch {
    /* best-effort — never break UX */
  }
}

function queueAnalytics(action: string, url: string, detail?: string): void {
  if (typeof window === 'undefined') return
  const section = analyticsSection(url)
  if (!section || section === 'platform-events' || section === 'unknown') return // avoid feedback loop
  analyticsBuffer.push({ section, action, url: url.split('?')[0], detail })
  if (analyticsBuffer.length >= 8) {
    flushAnalytics()
    return
  }
  if (!analyticsTimer) {
    analyticsTimer = setInterval(flushAnalytics, 20000)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushAnalytics()
      })
    }
  }
}

/** Queue a manual analytics event (used for section_view tracking). */
export function trackEvent(action: string, section: string, detail?: string): void {
  queueAnalytics(action, `/api/${section}`, detail)
}

// Small typed fetch helper for the client — always relative URLs.
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const method = (options.method ?? (options.body ? 'POST' : 'GET')).toUpperCase()

  // ---- SANDBOX MODE (حالت تمرین): intercept every non-GET locally ----
  // No network call is made; a synthetic success mimicking the platform's
  // unwrapped-JSON contract is returned so calling code behaves normally.
  if (isSandboxEnabled() && method !== 'GET') {
    recordJournal({ ts: Date.now(), method, url: path, body: options.body ?? null })
    return {
      success: true,
      ok: true,
      sandbox: true,
      id: `sandbox-${Date.now()}`,
    } as T
  }

  const res = await fetch(path, {
    method,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const msg =
      (data as { error?: string })?.error ||
      `خطای سرور (${res.status})`
    throw new Error(msg)
  }
  // analytics: successful mutating requests only (GET pass-through stays silent)
  if (method !== 'GET') queueAnalytics(method, path)
  return data as T
}

export async function uploadFile<T = unknown>(path: string, file: File): Promise<T> {
  // sandbox: file uploads are writes — intercept them locally as well
  if (isSandboxEnabled()) {
    recordJournal({ ts: Date.now(), method: 'POST', url: path, body: { fileName: file.name, size: file.size } })
    return {
      success: true,
      ok: true,
      sandbox: true,
      id: `sandbox-${Date.now()}`,
    } as T
  }
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(path, {
    method: 'POST',
    headers: authHeaders(),
    body: fd,
    credentials: 'same-origin',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || 'خطا در بارگذاری فایل')
  }
  queueAnalytics('POST', path, file.name)
  return (await res.json()) as T
}

/** Blob download helper (xlsx exports) with session-token fallback header. */
export async function downloadBlob(path: string, filename: string): Promise<void> {
  const res = await fetch(path, { headers: authHeaders(), credentials: 'same-origin' })
  if (!res.ok) {
    let msg = `خطای سرور (${res.status})`
    try {
      const data = await res.json()
      if (data?.error) msg = data.error
    } catch {
      /* not json */
    }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
