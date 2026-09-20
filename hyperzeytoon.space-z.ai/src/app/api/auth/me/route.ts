import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req.headers.get('cookie'))
  const demoSetting = await db.settings.findUnique({ where: { key: 'demo_mode' } })
  const demoName = await db.settings.findUnique({ where: { key: 'demo_name' } })
  const demo = demoSetting?.value ? { active: true, name: demoName?.value ?? null, scenario: demoSetting.value } : { active: false, name: null, scenario: null }
  if (!user) return NextResponse.json({ user: null, demo })
  return NextResponse.json({ user, demo })
}
