import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const p = await db.product.findUnique({ where: { id: 100 }, select: { stock: true } })
  console.log('yogurt stock now (was 30):', p?.stock)
}
main().finally(() => db.$disconnect())
