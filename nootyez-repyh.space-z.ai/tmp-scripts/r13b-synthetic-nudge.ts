/**
 * Task 13-b Feature-2 QA setup/teardown.
 *   bun tmp-scripts/r13b-synthetic-nudge.ts seed    → add ONE synthetic WARNING nudge notification
 *                                                     for supplier 18 (2nd nudge within 14d)
 *   bun tmp-scripts/r13b-synthetic-nudge.ts cleanup → delete synthetic notification + test task
 *                                                     + its NUDGE_ESCALATED audit row
 */
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const SUPPLIER_ID = 18
const SUPPLIER_NAME = 'Mihan Dairy Rep — Mr. Rezaei'
const TITLE = `یادآوری فهرست قیمت — ${SUPPLIER_NAME}`
const TASK_TITLE = `تماس با ${SUPPLIER_NAME}`

async function main() {
  const mode = process.argv[2] ?? ''
  if (mode === 'seed') {
    const n = await db.notification.create({
      data: { userId: 53, title: TITLE, body: 'SYNTHETIC TEST NOTIFICATION (task 13-b QA) — will be deleted', type: 'WARNING' },
    })
    console.log('seeded synthetic notification id', n.id)
  } else if (mode === 'cleanup') {
    const delN = await db.notification.deleteMany({ where: { title: TITLE, body: { contains: 'SYNTHETIC TEST NOTIFICATION' } } })
    const tasks = await db.task.findMany({ where: { title: TASK_TITLE }, select: { id: true, status: true, priority: true, assignedToId: true, createdById: true } })
    console.log('test tasks found:', JSON.stringify(tasks))
    const delT = await db.task.deleteMany({ where: { title: TASK_TITLE, priority: 'HIGH', createdById: 49 } })
    const delA = await db.auditLog.deleteMany({ where: { action: 'NUDGE_ESCALATED', entity: 'Supplier', entityId: SUPPLIER_ID } })
    const remain = await db.notification.findMany({ where: { title: { startsWith: 'یادآوری فهرست قیمت — ' } }, select: { id: true } })
    const tasksLeft = await db.task.findMany({ where: { title: { startsWith: 'تماس با ' } }, select: { id: true } })
    console.log(`cleanup: notifications deleted=${delN.count}, tasks deleted=${delT.count}, NUDGE_ESCALATED audits deleted=${delA.count}`)
    console.log(`remaining nudge notifications=${remain.length} (expect 3), remaining «تماس با» tasks=${tasksLeft.length} (expect 0)`)
  } else {
    console.log('usage: seed | cleanup')
  }
}
main().finally(() => db.$disconnect())
