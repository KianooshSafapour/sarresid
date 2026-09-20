import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const users = await db.user.findMany({ where: { id: { in: [49, 50, 53, 55] } }, select: { id: true, name: true, roles: true, active: true } })
console.log(JSON.stringify(users, null, 1))
console.log('pilotTesters:', await db.pilotTester.count())
console.log('pilotFeedback:', await db.pilotFeedback.count())
await db.$disconnect()
