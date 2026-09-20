import { db } from '@/lib/db'

/** Public list of active staff for the login screen (no sensitive data) */
export async function GET() {
  const users = await db.user.findMany({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, roles: true, primaryRole: true, color: true, points: true, active: true },
  })
  return Response.json(users.map((u) => ({ ...u, roles: JSON.parse(u.roles) })))
}
