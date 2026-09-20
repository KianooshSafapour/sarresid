import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const users = await db.user.findMany({ select: { id: true, name: true, roles: true, active: true } })
  console.log(JSON.stringify(users, null, 0))
  const saleAgg = await db.sale.aggregate({ _count: true, _sum: { total: true } })
  console.log('sales', JSON.stringify(saleAgg))
  const orderAgg = await db.order.aggregate({ _count: true })
  console.log('orders', JSON.stringify(orderAgg))
  const products = await db.product.count()
  console.log('products', products)
  const shrink = await db.shrinkageLog.findMany()
  console.log('shrinkage', JSON.stringify(shrink))
  const oStatuses = await db.order.groupBy({ by: ['status'], _count: true })
  console.log('orderStatuses', JSON.stringify(oStatuses))
}
main().finally(() => db.$disconnect())
