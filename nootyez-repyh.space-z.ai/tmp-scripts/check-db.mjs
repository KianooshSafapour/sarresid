import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const suppliers = await db.supplier.findMany({ select: { id: true, name: true, kind: true } })
  console.log('SUPPLIERS:', JSON.stringify(suppliers, null, 0))
  const products = await db.product.findMany({ select: { id: true, name: true, nameFa: true, barcode: true, supplierId: true, buyPrice: true, sellPrice: true } })
  console.log('PRODUCTS:', JSON.stringify(products, null, 0))
  const users = await db.user.findMany({ select: { id: true, name: true, roles: true } })
  console.log('USERS:', JSON.stringify(users, null, 0))
}
await main()
await db.$disconnect()
