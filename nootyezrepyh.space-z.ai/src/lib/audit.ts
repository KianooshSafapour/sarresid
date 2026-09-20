import { db } from '@/lib/db'

export async function logAudit(
  userId: string,
  userName: string,
  action: string,
  entityType: string,
  entityId?: string,
  details?: unknown
) {
  try {
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action,
        entityType,
        entityId: entityId || null,
        details: details ? JSON.stringify(details) : null,
      },
    })
  } catch (e) {
    console.error('audit log failed', e)
  }
}

/** History entry helper — stores snapshots in AuditLog with entityType = `${entity}_HISTORY` */
export async function logHistory(
  entityType: 'ORDER' | 'CHEQUE' | 'TASK',
  entityId: string,
  userId: string,
  userName: string,
  action: string,
  details?: unknown
) {
  try {
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action,
        entityType: `${entityType}_HISTORY`,
        entityId,
        details: details ? JSON.stringify(details) : null,
      },
    })
  } catch (e) {
    console.error('history log failed', e)
  }
}
