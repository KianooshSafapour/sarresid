import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const before = { testers: await db.pilotTester.count(), feedback: await db.pilotFeedback.count() }
await db.pilotFeedback.deleteMany({})
await db.pilotTester.deleteMany({})
const after = { testers: await db.pilotTester.count(), feedback: await db.pilotFeedback.count() }
const audits = await db.auditLog.findMany({ where: { action: { in: ['PILOT_TESTER_ADDED', 'PILOT_FEEDBACK_RECEIVED', 'PILOT_TESTER_ACTIVATED', 'PILOT_TESTER_UPDATED', 'PILOT_FEEDBACK_EXPORT'] } }, orderBy: { id: 'asc' }, select: { id: true, action: true, detail: true } })
console.log('before:', JSON.stringify(before), '→ after:', JSON.stringify(after))
console.log('audits kept (' + audits.length + '):')
for (const a of audits) console.log(`  #${a.id} ${a.action} — ${a.detail}`)
await db.$disconnect()
