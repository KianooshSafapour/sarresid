import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPin, signSession } from '@/lib/auth'
import { logActivity } from '@/lib/server-utils'

export async function POST(req: NextRequest) {
  try {
    const { username, pin } = (await req.json()) as { username?: string; pin?: string }
    if (!username || !pin) {
      return NextResponse.json({ error: 'نام کاربری و رمز را وارد کنید' }, { status: 400 })
    }
    const user = await db.user.findUnique({
      where: { username },
      include: { roles: { include: { role: true } } },
    })
    if (!user || user.pin !== hashPin(pin)) {
      return NextResponse.json({ error: 'نام کاربری یا رمز اشتباه است' }, { status: 401 })
    }
    if (!user.active) {
      return NextResponse.json({ error: 'حساب شما غیرفعال است. با مدیر سیستم تماس بگیرید.' }, { status: 403 })
    }
    await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
    await logActivity(user.id, user.name, 'ورود به سامانه')
    const roles = user.roles.map((ur) => ({
      key: ur.role.key,
      name: ur.role.name,
      isManager: ur.role.isManager,
      color: ur.role.color,
    }))
    const sessionToken = signSession(user.id)
    const demoSetting = await db.settings.findUnique({ where: { key: 'demo_mode' } })
    const demoNameSetting = await db.settings.findUnique({ where: { key: 'demo_name' } })
    const demo = demoSetting?.value ? { active: true, name: demoNameSetting?.value ?? null, scenario: demoSetting.value } : { active: false, name: null, scenario: null }
    const res = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        title: user.title,
        gender: user.gender,
        color: user.color,
        points: user.points,
        roles,
        isManager: roles.some((r) => r.isManager),
        roleKeys: roles.map((r) => r.key),
        isRoot: user.isRoot === true,
        prefs: user.prefs ?? null,
        locale: user.locale ?? 'fa',
      },
      // Fallback token for cookie-hostile contexts (iframe / in-app webview)
      token: sessionToken,
      demo,
    })
    res.cookies.set('hz_session', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return res
  } catch {
    return NextResponse.json({ error: 'خطای غیرمنتظره در ورود' }, { status: 500 })
  }
}
