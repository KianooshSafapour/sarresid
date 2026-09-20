import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!session.roles.includes('IT_ADMIN') && !session.roles.includes('OPERATION_MANAGER') && !session.roles.includes('OWNER') && !session.roles.includes('GENERAL_MANAGER') && !session.roles.includes('ACCOUNTANT')) {
    return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  }
  const url = new URL(req.url)
  const limit = Math.min(+(url.searchParams.get('limit') || 100), 500)
  const entityType = url.searchParams.get('entityType')
  const entityId = url.searchParams.get('entityId')
  const where: Record<string, string> = {}
  if (entityType) where.entityType = entityType
  if (entityId) where.entityId = entityId
  const logs = await db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit })
  return Response.json(logs)
}
