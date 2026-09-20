// 10-a verification: inspect + clean the curl-created SCAN_IN audit row
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const rows = await db.auditLog.findMany({
  where: { action: 'SCAN_IN' },
  orderBy: { createdAt: 'desc' },
  take: 5,
})
console.log('SCAN_IN rows:', JSON.stringify(rows, null, 2))

// roles sanity for the gate test users
for (const id of [50, 63]) {
  const u = await db.user.findUnique({ where: { id }, select: { id: true, name: true, roles: true, active: true } })
  console.log('user', id, JSON.stringify(u))
}

// delete the curl-created row(s) to keep the DB clean (browser-created rows come later)
const del = await db.auditLog.deleteMany({ where: { action: 'SCAN_IN', userId: 50 } })
console.log('deleted curl-created SCAN_IN rows for user 50:', del.count)
await db.$disconnect()
