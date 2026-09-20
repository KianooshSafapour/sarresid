import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signToken } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  try {
    const { userId, pin } = await req.json()
    if (!userId || !pin) return Response.json({ error: 'اطلاعات ناقص است' }, { status: 400 })

    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user || !user.active) {
      return Response.json({ error: 'کاربر یافت نشد یا غیرفعال است' }, { status: 401 })
    }
    const ok = await bcrypt.compare(String(pin), user.pinHash)
    if (!ok) return Response.json({ error: 'رمز ورود نادرست است' }, { status: 401 })

    await logAudit(user.id, user.name, 'LOGIN', 'USER', user.id)

    return Response.json({
      token: signToken(user.id),
      user: {
        id: user.id,
        name: user.name,
        roles: JSON.parse(user.roles),
        primaryRole: user.primaryRole,
        color: user.color,
        points: user.points,
      },
    })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'خطای سرور' }, { status: 500 })
  }
}
