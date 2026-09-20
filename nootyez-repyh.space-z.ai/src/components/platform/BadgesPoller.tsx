'use client'

/**
 * BadgesPoller — invisible singleton that keeps nav badge counts fresh.
 * Fetches GET /api/badges?userId= once on mount/login, then every 25s and on window focus.
 * Silent-fails on errors; clears badges back to zero on logout.
 *
 * Also hosts the daily-digest scheduler (two complementary triggers, both hitting the
 * idempotent POST /api/notifications/digest {userId}):
 *  1. On-first-load trigger (existing): after the FIRST successful badges fetch of a
 *     session — covers users logging in after 8am Tehran.
 *  2. 08:00 Tehran trigger (new): every poll tick checks the current Tehran-local time
 *     (Intl, timeZone 'Asia/Tehran'); at/after 08:00, if today's digest hasn't been
 *     triggered yet, it fires. This closes the "tab left open across midnight" gap —
 *     a tab open at 8am Tehran (even one opened yesterday) generates that day's digest
 *     without a reload.
 * The last triggered Tehran date is persisted in localStorage (`hz_digest_last`) so
 * reloads don't refire; the server is additionally idempotent per day per user, so a
 * stray double-fire is harmless. All failures are silent and fail-safe.
 */
import * as React from 'react'
import { useApp, ZERO_BADGES } from '@/lib/store'

const DIGEST_LAST_KEY = 'hz_digest_last'

/** Current Tehran-local date ('YYYY-MM-DD') + hour/minute — null if Intl/timezone fails. */
function tehranNow(): { date: string; hour: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date())
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    const hour = Number(get('hour'))
    const minute = Number(get('minute'))
    const date = `${get('year')}-${get('month')}-${get('day')}`
    if (!date.includes('-') || Number.isNaN(hour) || Number.isNaN(minute)) return null
    return { date, hour: hour === 24 ? 0 : hour, minute } // some ICU engines render midnight as '24'
  } catch {
    return null
  }
}

function readDigestLast(): string | null {
  try {
    return window.localStorage.getItem(DIGEST_LAST_KEY)
  } catch {
    return null
  }
}

function writeDigestLast(date: string) {
  try {
    window.localStorage.setItem(DIGEST_LAST_KEY, date)
  } catch {
    /* private mode etc. — in-memory ref still guards within the session */
  }
}

export function BadgesPoller() {
  const user = useApp((s) => s.user)
  const setBadges = useApp((s) => s.setBadges)

  // digest guards — one first-load attempt per mount per user + last handled Tehran date
  const digestUidRef = React.useRef<number | null>(null)
  const digestDoneRef = React.useRef(false)
  const digestDayRef = React.useRef<string | null>(null)
  const digestInFlightRef = React.useRef(false)

  React.useEffect(() => {
    if (!user) {
      // logout cleanup → zero everything
      setBadges(ZERO_BADGES, null)
      return
    }
    const uid = user.id
    // new session user → allow their once-per-day digest again (reset lastDigestTriggerDate too)
    if (digestUidRef.current !== uid) {
      digestUidRef.current = uid
      digestDoneRef.current = false
      digestDayRef.current = null
    }
    let alive = true

    const postDigest = async () => {
      if (digestInFlightRef.current) return
      digestInFlightRef.current = true
      try {
        const res = await fetch('/api/notifications/digest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid }),
        })
        if (!res.ok) return
        const data = (await res.json().catch(() => null)) as { created?: boolean; reason?: string } | null
        // record the Tehran day on ANY successful created:true OR already response so the
        // 8am check doesn't double-fire (server idempotency is the ultimate guard anyway)
        if (data && (data.created === true || data.reason === 'already')) {
          const d = tehranNow()?.date ?? null
          if (d) {
            digestDayRef.current = d
            writeDigestLast(d)
          }
        }
        // digest created → refresh badges so the bell count includes it
        if (data?.created && alive && useApp.getState().user?.id === uid) void load()
      } catch {
        /* silent — digest is best-effort */
      } finally {
        digestInFlightRef.current = false
      }
    }

    // trigger 1 — on-first-load-of-day (kept as-is): once per mount per user
    const requestDigest = () => {
      if (digestDoneRef.current) return
      digestDoneRef.current = true
      void postDigest()
    }

    // trigger 2 — 08:00 Tehran while the tab stays open (checked every poll tick).
    // The persisted localStorage date is the source of truth (live read each tick, so
    // reloads/edits behave predictably); the in-memory ref mirrors it and doubles as
    // the guard for storage-less contexts. Not yet recorded today → fire.
    const maybeDigestAt8 = () => {
      const info = tehranNow()
      if (!info || info.hour < 8) return
      const stored = readDigestLast()
      if (stored) digestDayRef.current = stored
      if (digestDayRef.current === info.date) return
      void postDigest()
    }

    const load = async () => {
      try {
        const res = await fetch(`/api/badges?userId=${uid}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as Record<string, number>
        // ignore stale responses if the session user changed mid-flight
        if (!alive || useApp.getState().user?.id !== uid) return
        setBadges(data, uid)
        // digest scheduling (both triggers; in-flight guard dedupes the same tick)
        requestDigest()
        maybeDigestAt8()
      } catch {
        /* silent — badges are non-critical */
      }
    }

    void load()
    const t = setInterval(() => void load(), 25_000)
    window.addEventListener('focus', load)
    return () => {
      alive = false
      clearInterval(t)
      window.removeEventListener('focus', load)
      // The poller unmounts together with the logged-in branch, so by cleanup time
      // the session user is already null on logout → zero badges for a clean slate.
      const s = useApp.getState()
      if (s.user === null || s.user.id === uid) setBadges(ZERO_BADGES, null)
    }
  }, [user, setBadges])

  return null
}
