import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/settings → {settings: Record<string,string>}
export async function GET() {
  try {
    const rows = await db.setting.findMany()
    const settings: Record<string, string> = {}
    for (const r of rows) settings[r.key] = r.value
    return NextResponse.json({ settings })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// PATCH /api/settings {key, value, userId?} → upsert
export async function PATCH(request: Request) {
  try {
    const b = await request.json()
    const key = String(b?.key ?? '').trim()
    if (!key) return NextResponse.json({ error: 'کلید تنظیم الزامی است' }, { status: 400 })
    const value = b?.value === undefined || b?.value === null ? '' : String(b.value)
    const userId = b?.userId ? Number(b.userId) : null

    const setting = await db.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })
    let userName = 'سیستم'
    if (userId) {
      const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
      if (u) userName = u.name
    }
    await db.auditLog.create({
      data: { userId: userId ?? 0, userName, action: 'SETTING', entity: 'Setting', entityId: null, detail: `${key} = ${value}` },
    })
    return NextResponse.json({ setting })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
