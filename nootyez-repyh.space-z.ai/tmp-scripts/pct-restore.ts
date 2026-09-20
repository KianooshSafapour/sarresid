import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
await db.product.update({ where: { id: 98 }, data: { buyPrice: 21500 } })
const p = await db.product.findUnique({ where: { id: 98 }, select: { id: true, buyPrice: true, sellPrice: true } })
console.log('P98 RESTORED:', JSON.stringify(p))
// full baseline sweep of every product touched by previews/commits this round
const all = await db.product.findMany({ where: { id: { in: [97, 98, 101, 110] } }, select: { id: true, buyPrice: true, sellPrice: true, supplierId: true } })
console.log('BASELINES:', JSON.stringify(all))
await db.$disconnect()
