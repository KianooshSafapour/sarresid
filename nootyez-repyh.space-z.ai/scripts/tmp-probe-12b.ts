import { PrismaClient } from '@prisma/client'
const c = new PrismaClient() as unknown as Record<string, unknown>
console.log('shrinkageLog:', typeof c.shrinkageLog)
console.log('demoCompany:', typeof c.demoCompany)
console.log('sale:', typeof c.sale)
console.log('keys sample:', Object.keys(c).filter(k => k.toLowerCase().includes('shrink') || k.toLowerCase().includes('demo')))
