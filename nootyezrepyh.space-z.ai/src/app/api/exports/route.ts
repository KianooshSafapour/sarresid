import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { EXPORT_LOG_KEY, EXPORT_KINDS, ExportLogEntry } from '@/lib/exports'

export const dynamic = 'force-dynamic'

/** GET /api/exports — shared archive of generated files (xlsx now, more later) */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const allowed =
    canUser(session.roles, PERMISSIONS.ACCOUNTING) ||
    canUser(session.roles, PERMISSIONS.MANAGE_ORDERS) ||
    canUser(session.roles, PERMISSIONS.VIEW_REPORTS)
  if (!allowed) return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  const cur = await db.setting.findUnique({ where: { key: EXPORT_LOG_KEY } })
  let entries: ExportLogEntry[] = []
  try {
    entries = cur ? JSON.parse(cur.value) : []
  } catch {
    entries = []
  }

  const users = await db.user.findMany({ select: { id: true, name: true, color: true } })
  const uMap = new Map(users.map((u) => [u.id, u]))

  const items = entries.map((e) => {
    const u = uMap.get(e.userId)
    return {
      ...e,
      kindLabel: EXPORT_KINDS[e.kind]?.label || e.kind,
      kindIcon: EXPORT_KINDS[e.kind]?.icon || '📄',
      userColor: u?.color || '#88997f',
      userExists: !!u,
    }
  })

  const byKind: Record<string, number> = {}
  for (const e of entries) byKind[e.kind] = (byKind[e.kind] || 0) + 1

  return Response.json({ items, total: entries.length, byKind })
}
