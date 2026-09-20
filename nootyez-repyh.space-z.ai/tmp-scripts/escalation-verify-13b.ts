/**
 * Task 13-b — verify nudge ESCALATION in POST /api/suppliers/nudges:
 *  1. snapshot pre-test state (stale list, nudge notifications, «تماس با» tasks, audits)
 *  2. create ONE synthetic 2nd WARNING nudge for supplier «Snacks & Sweets Co.»
 *     (exact marker the code matches: title startsWith «یادآوری فهرست قیمت — <name>», type WARNING, <14d)
 *  3. POST {userId:50} → expect escalated=[{supplierId,name,taskId}] + Task «تماس با …»
 *     (HIGH, OPEN, assignedToId = first active GENERAL_MANAGER = 50) + NUDGE_ESCALATED audit
 *  4. POST again → escalated=[] (idempotent, no duplicate task)
 *  5. CLEANUP: delete the synthetic notification, the auto-created task, NUDGE_ESCALATED audits
 *     (round-11 real data: notifications 39-41 + PRICE_NUDGE_SENT audit #115 stay untouched)
 *
 * Run: bun tmp-scripts/escalation-verify-13b.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const SUP = { id: 20, name: 'Snacks & Sweets Co.' }
const PREFIX = 'یادآوری فهرست قیمت — '

async function snapshot(label: string) {
  const [notifs, tasks, escAudits] = await Promise.all([
    db.notification.findMany({
      where: { title: { startsWith: PREFIX }, type: 'WARNING', createdAt: { gte: new Date(Date.now() - 14 * 86400000) } },
      select: { id: true, userId: true, title: true },
      orderBy: { id: 'asc' },
    }),
    db.task.findMany({ where: { title: { startsWith: 'تماس با' } }, select: { id: true, title: true, priority: true, status: true, assignedToId: true, createdById: true } }),
    db.auditLog.findMany({ where: { action: 'NUDGE_ESCALATED' }, select: { id: true, entityId: true, detail: true } }),
  ])
  console.log(`--- ${label} ---`)
  console.log('nudge notifs(14d):', notifs.map((n) => `${n.id}(u${n.userId})`).join(',') || 'none')
  console.log('«تماس با» tasks:', JSON.stringify(tasks))
  console.log('NUDGE_ESCALATED audits:', escAudits.map((a) => a.id).join(',') || 'none')
  return { notifs, tasks, escAudits }
}

async function post() {
  const res = await fetch('http://localhost:3000/api/suppliers/nudges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 50 }),
  })
  return { status: res.status, body: await res.json() as Record<string, unknown> }
}

async function main() {
  const before = await snapshot('PRE-TEST')

  // 1. synthetic 2nd nudge for the target supplier (recipient u53 like the real ones)
  const synthetic = await db.notification.create({
    data: {
      userId: 53,
      title: PREFIX + SUP.name,
      body: 'SYNTHETIC 13-b test marker — safe to delete',
      type: 'WARNING',
    },
  })
  console.log('\nsynthetic notification id:', synthetic.id, '→', synthetic.title)

  // 2. first POST → escalation expected for supplier 20
  const r1 = await post()
  console.log('\nPOST#1 status:', r1.status)
  console.log('POST#1 body:', JSON.stringify(r1.body))
  const esc1 = (r1.body.escalated as { supplierId: number; name: string; taskId: number }[]) ?? []
  if (r1.status !== 200) throw new Error('POST#1 failed')
  if (esc1.length !== 1 || esc1[0].supplierId !== SUP.id || esc1[0].name !== SUP.name)
    throw new Error('escalated[] shape wrong: ' + JSON.stringify(esc1))
  const taskId = esc1[0].taskId
  const task = await db.task.findUnique({ where: { id: taskId }, select: { title: true, priority: true, status: true, assignedToId: true, createdById: true } })
  console.log('created task:', JSON.stringify(task))
  const okTask =
    task?.title === `تماس با ${SUP.name}` &&
    task.priority === 'HIGH' && task.status === 'OPEN' &&
    task.assignedToId === 50 // first active GENERAL_MANAGER (Mrs. Lotfi)
  console.log(okTask ? '✓ task title/HIGH/OPEN/assignee=GM(50) all correct' : '✗ TASK FIELD MISMATCH')

  const after1 = await snapshot('AFTER POST#1')

  // 3. second POST → idempotent: no new task
  const r2 = await post()
  const esc2 = (r2.body.escalated as unknown[]) ?? []
  console.log('\nPOST#2 status:', r2.status, '| escalated:', JSON.stringify(esc2))
  const after2 = await snapshot('AFTER POST#2')
  const dup = after2.tasks.length !== after1.tasks.length
  console.log(dup ? '✗ DUPLICATE TASK CREATED' : '✓ idempotent — no duplicate task on re-POST')
  if (esc2.length !== 0) throw new Error('POST#2 should escalate nothing')

  // 4. CLEANUP — restore pre-test state
  await db.notification.delete({ where: { id: synthetic.id } })
  await db.task.delete({ where: { id: taskId } })
  const delAudits = await db.auditLog.deleteMany({ where: { action: 'NUDGE_ESCALATED', entityId: SUP.id } })
  console.log('\ncleanup: synthetic notif deleted, task', taskId, 'deleted, NUDGE_ESCALATED audits removed:', delAudits.count)

  const final = await snapshot('FINAL (must equal pre-test)')
  const same =
    final.notifs.length === before.notifs.length &&
    final.tasks.length === before.tasks.length &&
    final.escAudits.length === before.escAudits.length
  console.log(same ? '✓ state restored to pre-test (round-11 real data intact)' : '✗ STATE MISMATCH — investigate')
  await db.$disconnect()
  if (!same) process.exit(1)
}

void main()
