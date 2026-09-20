import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const task = await db.task.findUnique({ where: { id: 6 } })
  console.log('TASK 6:', JSON.stringify(task, null, 1))
  const audits = await db.auditLog.findMany({ where: { action: 'NUDGE_ESCALATED' }, orderBy: { id: 'asc' } })
  console.log('NUDGE_ESCALATED audits:', JSON.stringify(audits))
  const nudgeAuditCount = await db.auditLog.count({ where: { action: 'PRICE_NUDGE_SENT' } })
  console.log('PRICE_NUDGE_SENT audit count (expect 1 — unchanged):', nudgeAuditCount)
  const tasksByTitle = await db.task.findMany({ where: { title: { startsWith: 'تماس با' } }, select: { id: true, title: true, status: true } })
  console.log('«تماس با» tasks (expect exactly 1):', JSON.stringify(tasksByTitle))
}
main().finally(() => db.$disconnect())
