import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { toGregorian } from 'jalaali-js'

export const dynamic = 'force-dynamic'

// POST /api/holidays/fetch → try to fetch Iranian holidays from public web sources,
// upsert into Holiday (source 'WEB'). ALWAYS returns 200 {added, source, error?} — never throws.

type Obj = Record<string, unknown>

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number(v.trim())
  return null
}

function titleOf(ev: Obj): string | null {
  for (const k of ['title', 'event', 'name', 'description', 'desc', 'text', 'occasion']) {
    const v = ev[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

// extract a Jalali (y/m/d) triple from an event object, defensively
function jalaliOf(ev: Obj): { jy: number; jm: number; jd: number } | null {
  const jy = toNum(ev['jy']) ?? toNum(ev['jalaliYear'])
  const jm = toNum(ev['jm']) ?? toNum(ev['jalaliMonth'])
  const jd = toNum(ev['jd']) ?? toNum(ev['jalaliDay'])
  if (jy !== null && jm !== null && jd !== null && jy >= 1300 && jy <= 1600) return { jy, jm, jd }

  for (const k of ['date', 'jdate', 'jDate', 'jalali', 'jalaliDate']) {
    const d = ev[k]
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      const nested = jalaliOf(d as Obj)
      if (nested) return nested
    }
    if (typeof d === 'string') {
      const m = d.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
      if (m) {
        const y = Number(m[1])
        if (y >= 1300 && y <= 1600) return { jy: y, jm: Number(m[2]), jd: Number(m[3]) }
      }
    }
  }
  return null
}

// skip events explicitly marked as non-holiday
function isExcluded(ev: Obj): boolean {
  for (const k of ['holiday', 'isHoliday', 'is_holiday']) {
    if (k in ev && ev[k] === false) return true
  }
  return false
}

// recursively find all arrays of objects in an arbitrary JSON payload
function collectArrays(node: unknown, out: Obj[][]) {
  if (Array.isArray(node)) {
    if (node.length > 0 && typeof node[0] === 'object' && node[0] !== null && !Array.isArray(node[0]))
      out.push(node as Obj[])
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node as Obj)) collectArrays(v, out)
  }
}

export async function POST(request: Request) {
  let added = 0
  let source = 'none'
  let error: string | undefined
  let userId: number | null = null

  // optional body {userId} for audit
  try {
    const b = await request.json()
    if (b?.userId) userId = Number(b.userId)
  } catch {
    // body is optional
  }

  try {
    // ---- strategy 1: api.keybit.ir (json) ----
    let json: unknown = null
    try {
      const res = await fetch('https://api.keybit.ir/holidays/', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      })
      if (res.ok) {
        const text = await res.text()
        try {
          json = JSON.parse(text)
        } catch {
          json = null
        }
      }
    } catch {
      json = null
    }

    if (json) {
      const arrays: Obj[][] = []
      collectArrays(json, arrays)
      const seen = new Set<string>()
      const events: { date: string; title: string }[] = []
      for (const arr of arrays) {
        for (const ev of arr) {
          if (!ev || typeof ev !== 'object' || Array.isArray(ev)) continue
          if (isExcluded(ev)) continue
          const title = titleOf(ev)
          const j = jalaliOf(ev)
          if (!title || !j) continue
          const g = toGregorian(j.jy, j.jm, j.jd)
          const iso = `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`
          if (seen.has(iso)) continue
          seen.add(iso)
          events.push({ date: iso, title })
        }
      }
      for (const ev of events) {
        await db.holiday.upsert({
          where: { date: ev.date },
          create: { date: ev.date, title: ev.title, source: 'WEB' },
          update: { title: ev.title, source: 'WEB' },
        })
        added++
      }
      if (added > 0) source = 'keybit'
    } else {
      // ---- strategy 2: time.ir (HTML — probing reachability, parsing skipped) ----
      try {
        const res = await fetch('https://time.ir', {
          headers: { Accept: 'text/html' },
          signal: AbortSignal.timeout(5000),
          cache: 'no-store',
        })
        error = res.ok
          ? 'time.ir reachable but HTML parsing not supported'
          : `time.ir responded ${res.status}`
      } catch (e2) {
        error = e2 instanceof Error ? e2.message : 'fetch failed'
      }
    }

    if (added > 0) {
      let userName = 'سیستم'
      if (userId) {
        const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
        if (u) userName = u.name
      }
      await db.auditLog.create({
        data: {
          userId: userId ?? 0,
          userName,
          action: 'HOLIDAY_FETCH',
          entity: 'Holiday',
          entityId: null,
          detail: `دریافت تعطیلات از وب — ${added} ردیف (منبع: ${source})`,
        },
      })
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'error'
  }

  // ALWAYS 200 — frontend just shows a toast
  return NextResponse.json({ added, source, ...(error ? { error } : {}) })
}
