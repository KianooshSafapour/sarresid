/**
 * Hyper Zeytoon Platform — one-off Sales seed (SPHL demo data)
 * Run: bun scripts/seed-sales.ts   (or bun run scripts/seed-sales.ts)
 *
 * Idempotent: skips when Sale count > 50.
 * Salespeople are resolved BY ROLE (SALESPERSON / CASHIER) — never hardcoded ids.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Sales & shiftHours for Hyper Zeytoon...')

  const existing = await db.sale.count()
  if (existing > 50) {
    console.log(`⏭️  Sale table already has ${existing} rows — skipping (idempotent guard).`)
    return
  }

  // sellers = active users holding SALESPERSON or CASHIER role
  const users = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, roles: true },
  })
  const sellers = users.filter((u) =>
    u.roles.split(',').map((s) => s.trim()).some((r) => r === 'SALESPERSON' || r === 'CASHIER')
  )

  // first 20 active products with a positive sell price
  const products = await db.product.findMany({
    where: { active: true, sellPrice: { gt: 0 } },
    orderBy: { id: 'asc' },
    take: 20,
    select: { id: true, name: true, sellPrice: true },
  })

  if (sellers.length === 0 || products.length === 0) {
    console.log(`⚠️  Nothing to seed — sellers: ${sellers.length}, products: ${products.length}`)
    return
  }

  const guestNames = ['خانم رضایی', 'آقای کریمی', 'خانم احمدی', 'آقای مرادی', 'خانم نوری', 'آقای قاسمی']
  const now = Date.now()
  const rows: {
    productId: number
    name: string
    qty: number
    unitPrice: number
    total: number
    customerName: string | null
    channel: string
    salespersonId: number
    createdAt: Date
  }[] = []

  for (let i = 0; i < 180; i++) {
    const daysAgo = Math.floor(Math.random() * 30) // 0..29
    const hour = 9 + Math.floor(Math.random() * 12) // 9..20
    const createdAt = new Date(now - daysAgo * 86400000)
    createdAt.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0)
    // never seed a "future" sale for today
    if (createdAt.getTime() > now) {
      createdAt.setTime(now - Math.floor(Math.random() * 4 * 3600000) - 60000)
    }

    const p = products[Math.floor(Math.random() * products.length)]
    const s = sellers[Math.floor(Math.random() * sellers.length)]
    const qty = 1 + Math.floor(Math.random() * 4) // 1..4
    const withCustomer = Math.random() < 0.15

    rows.push({
      productId: p.id,
      name: p.name,
      qty,
      unitPrice: p.sellPrice,
      total: qty * p.sellPrice,
      customerName: withCustomer ? guestNames[Math.floor(Math.random() * guestNames.length)] : null,
      channel: 'WALKIN',
      salespersonId: s.id,
      createdAt,
    })
  }

  await db.sale.createMany({ data: rows })
  await db.setting.upsert({
    where: { key: 'shiftHours' },
    update: { value: '8' },
    create: { key: 'shiftHours', value: '8' },
  })

  console.log(`✅ Seeded ${rows.length} sales across ${sellers.length} sellers (${products.length} products) + Setting shiftHours=8`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
