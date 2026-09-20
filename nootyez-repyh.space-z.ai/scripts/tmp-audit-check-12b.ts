import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const rows = await db.auditLog.findMany({ where: { action: { in: ['SHRINKAGE_REPORT', 'INSIGHTS_VIEWED'] } }, orderBy: { id: 'asc' } })
  for (const r of rows) console.log(r.id, r.action, '| user', r.userId, r.userName, '|', r.entity, r.entityId, '|', r.detail)
  const stocks = await db.product.findMany({ where: { id: { in: [98, 99, 101] } }, select: { id: true, stock: true } })
  console.log('stocks after shrink:', JSON.stringify(stocks))
}
main().finally(() => db.$disconnect())
