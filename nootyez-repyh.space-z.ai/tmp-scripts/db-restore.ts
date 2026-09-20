import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  await db.product.update({ where: { id: 97 }, data: { buyPrice: 28000 } })
  await db.product.update({ where: { id: 98 }, data: { supplierId: 16, buyPrice: 21500 } })
  await db.product.update({ where: { id: 101 }, data: { sellPrice: 32500 } })
  await db.product.update({ where: { id: 110 }, data: { supplierId: 19 } })
  const ps = await db.product.findMany({ where: { id: { in: [97, 98, 101, 110] } }, select: { id: true, supplierId: true, buyPrice: true, sellPrice: true } })
  console.log('RESTORED:', JSON.stringify(ps))
}
await main()
await db.$disconnect()
