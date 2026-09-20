import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const p = await db.product.findUnique({ where: { id: 98 }, select: { id: true, buyPrice: true, sellPrice: true } })
console.log('P98:', JSON.stringify(p))
const audit = await db.auditLog.findFirst({ where: { action: 'PRODUCT_PRICE_IMPORT' }, orderBy: { id: 'desc' }, select: { id: true, detail: true } })
console.log('AUDIT:', JSON.stringify(audit))
await db.$disconnect()
