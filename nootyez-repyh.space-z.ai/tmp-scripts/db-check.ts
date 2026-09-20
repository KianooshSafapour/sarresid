import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const ids = [97, 98, 101, 110].map((id) => Number(process.argv[2] === 'full' ? id : id))
async function main() {
  const ps = await db.product.findMany({ where: { id: { in: [97, 98, 101, 110] } }, select: { id: true, name: true, supplierId: true, buyPrice: true, sellPrice: true } })
  console.log(JSON.stringify(ps))
  const audits = await db.auditLog.findMany({ where: { action: 'PRODUCT_PRICE_IMPORT' }, orderBy: { id: 'desc' }, take: 3, select: { id: true, userName: true, action: true, detail: true } })
  console.log(JSON.stringify(audits))
}
await main()
await db.$disconnect()
