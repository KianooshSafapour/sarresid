import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const products = await db.product.findMany({ select: { id: true, name: true, stock: true, minStock: true, sellPrice: true, buyPrice: true, active: true, mergedInto: true, supplierId: true, unit: true }, orderBy: { id: 'asc' } })
  for (const p of products) console.log(JSON.stringify(p))
  const sales = await db.sale.findMany({ select: { createdAt: true, total: true, qty: true, productId: true, name: true }, orderBy: { createdAt: 'asc' } })
  const now = Date.now()
  const d30 = sales.filter(s => now - new Date(s.createdAt).getTime() < 30*86400000)
  const d60 = sales.filter(s => now - new Date(s.createdAt).getTime() < 60*86400000)
  console.log('sales last 30d:', d30.length, 'sum', d30.reduce((a,s)=>a+s.total,0))
  console.log('sales last 60d:', d60.length, 'sum', d60.reduce((a,s)=>a+s.total,0))
  console.log('oldest sale:', sales[0]?.createdAt, 'newest:', sales[sales.length-1]?.createdAt)
  const orders = await db.order.findMany({ where: { status: { in: ['DONE','CONFIRMED'] } }, select: { id: true, status: true, createdAt: true, items: { select: { productId: true, qty: true, sellPrice: true, unitCost: true, name: true } } } })
  for (const o of orders) console.log('order', o.id, o.status, o.createdAt, 'items:', JSON.stringify(o.items))
}
main().finally(() => db.$disconnect())
