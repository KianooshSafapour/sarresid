import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const users = await db.user.findMany({ where: { OR: [{ id: { in: [50, 63] } }, { roles: { contains: 'SALESPERSON' } }] }, select: { id: true, name: true, roles: true } })
console.log('USERS:', JSON.stringify(users))
const sups = await db.supplier.findMany({ select: { id: true, name: true, _count: { select: { products: { where: { active: true, mergedInto: null } } } } }, orderBy: { name: 'asc' } })
console.log('SUPPLIERS:', JSON.stringify(sups))
const prods = await db.product.findMany({ where: { OR: [{ barcode: { in: ['6260110000025', '6260110000018'] } }, { name: { contains: 'Doogh' } }, { name: { contains: 'Sugar' } }] }, select: { id: true, name: true, nameFa: true, barcode: true, buyPrice: true, sellPrice: true, supplierId: true, active: true } })
console.log('PRODS:', JSON.stringify(prods))
await db.$disconnect()
