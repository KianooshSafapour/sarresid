import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/auth/login {userId, pin} → user object without pin
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const userId = Number(body?.userId)
    const pin = body?.pin != null ? String(body.pin).trim() : ''
    if (!userId || !pin) {
      return NextResponse.json({ error: 'کد ورود اشتباه است' }, { status: 401 })
    }
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user || !user.active || user.pin !== pin) {
      return NextResponse.json({ error: 'کد ورود اشتباه است' }, { status: 401 })
    }
    await db.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        detail: 'ورود به سیستم',
      },
    })
    const { pin: _pin, ...safeUser } = user
    return NextResponse.json(safeUser)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'خطای ورود' }, { status: 500 })
  }
}
