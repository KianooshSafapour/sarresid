import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

const SOURCES = [
  'https://www.time.ir/',
  'https://api.keybit.ir/holiday/',
]

/**
 * POST /api/settings/fetch-holidays
 * Best-effort scrape of Iranian official holidays from a public source.
 * NEVER throws — on any failure returns { ok:false, message } so the UI
 * can show a graceful fallback ("enter manually").
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ADMIN_SETTINGS) && !canUser(session.roles, PERMISSIONS.ADMIN_USERS)) {
    return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  }

  const tryFetch = async (url: string): Promise<string | null> => {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZeytoonBot/1.0)' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.length > 100 ? text : null
  }

  let html: string | null = null
  for (const url of SOURCES) {
    try {
      html = await tryFetch(url)
      if (html) break
    } catch {
      // network blocked / timeout — try next source
    }
  }

  if (!html) {
    return Response.json({
      ok: false,
      message: 'بروزرسانی خودکار در دسترس نیست — لطفاً دستی وارد کنید',
    })
  }

  try {
    // Parse Jalali dates like 1404/09/12 (or ۱۴۰۴/۰۹/۱۲) followed by nearby event titles
    const fa = (s: string) => s
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    const nowJy = new Date().getFullYear() - 621 - (new Date().getMonth() + 1 < 3 ? 1 : 0)
    const found: { date: string; title: string }[] = []
    const re = /(\d{4})\/(\d{1,2})\/(\d{1,2})[^0-9]{0,120}?([\u0600-\u06FF][\u0600-\u06FF\s]{4,60})/g
    let m: RegExpExecArray | null
    while ((m = re.exec(fa(html))) !== null) {
      const jy = +m[1]
      const jm = +m[2]
      const jd = +m[3]
      const title = m[4].trim().replace(/\s+/g, ' ')
      if (jy >= nowJy && jy <= nowJy + 1 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= 31 && title.length >= 5) {
        const date = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
        if (!found.some((f) => f.date === date)) found.push({ date, title: title.slice(0, 60) })
      }
      if (found.length >= 60) break
    }
    if (!found.length) {
      return Response.json({ ok: false, message: 'تعطیلی قابل استخراجی در منبع پیدا نشد — لطفاً دستی وارد کنید' })
    }
    let added = 0
    for (const h of found) {
      const existing = await db.holiday.findUnique({ where: { date: h.date } })
      if (!existing) {
        await db.holiday.create({ data: h })
        added++
      }
    }
    await logAudit(session.id, session.name, 'FETCH_HOLIDAYS', 'HOLIDAY', undefined, { added, total: found.length })
    return Response.json({ ok: true, added, message: `${added} تعطیلی جدید اضافه شد` })
  } catch {
    return Response.json({ ok: false, message: 'بروزرسانی خودکار در دسترس نیست — لطفاً دستی وارد کنید' })
  }
}
