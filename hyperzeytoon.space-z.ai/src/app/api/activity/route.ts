import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok } from '@/lib/server-utils'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  // Analytics is admin-only: it_admin role or the root administrator — managers included are NOT allowed.
  if (!(user.isRoot === true || user.roleKeys.includes('it_admin')))
    return fail('گزارش فعالیت تنها برای مدیر سامانه فعال است', 403)
  const url = new URL(req.url)
  const take = Math.min(200, Number(url.searchParams.get('take') ?? 100))
  const search = url.searchParams.get('q')
  const logs = await db.activityLog.findMany({
    where: search
      ? {
          OR: [
            { userName: { contains: search } },
            { action: { contains: search } },
            { detail: { contains: search } },
            { entity: { contains: search } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take,
  })
  return ok(logs)
}
