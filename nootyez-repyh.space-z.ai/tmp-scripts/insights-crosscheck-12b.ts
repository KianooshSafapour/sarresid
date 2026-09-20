/**
 * Task 12-b cross-check: independently recompute the reorder candidates from
 * the DB and compare against GET /api/insights?userId=56.
 *
 * Run: bun tmp-scripts/insights-crosscheck-12b.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const API = 'http://localhost:3000/api/insights?userId=56'

async function main() {
  const now = Date.now()
  const since30 = new Date(now - 30 * 86400000)
  const since60 = new Date(now - 60 * 86400000)

  const products = await db.product.findMany({
    where: { active: true, mergedInto: null },
    select: { id: true, name: true, stock: true, minStock: true },
  })

  // 30d demand per product from Sales
  const sales30 = await db.sale.findMany({
    where: { createdAt: { gte: since30 } },
    select: { productId: true, qty: true },
  })
  const qty30 = new Map<number, number>()
  for (const s of sales30) {
    if (s.productId == null) continue
    qty30.set(s.productId, (qty30.get(s.productId) ?? 0) + s.qty)
  }

  // spec: stock ≤ minStock OR (avgDailyDemand×3 + minStock) ≥ stock
  const expected = products
    .map((p) => {
      const q30 = qty30.get(p.id) ?? 0
      const demand = q30 > 0 ? Math.max(q30 / 30, 0.1) : 0
      return { p, demand, rop: demand * 3 + p.minStock }
    })
    .filter(({ p, rop }) => p.stock <= p.minStock || rop >= p.stock)
    .map(({ p, demand }) => ({
      productId: p.id,
      name: p.name,
      stock: p.stock,
      minStock: p.minStock,
      avgDailyDemand: Math.round(demand * 100) / 100,
      suggestQty: Math.max(Math.round(p.minStock * 1.5 - p.stock), 1),
    }))
    .sort((a, b) => {
      const ra = a.minStock > 0 ? a.stock / a.minStock : Number.MAX_SAFE_INTEGER
      const rb = b.minStock > 0 ? b.stock / b.minStock : Number.MAX_SAFE_INTEGER
      return ra - rb
    })

  const res = await fetch(API)
  const api = (await res.json()) as { reorder: typeof expected; slow: { productId: number; name: string; stock: number; stockValue: number; sellPrice: number }[] }

  console.log(`DB-recomputed reorder candidates: ${expected.length} | API reorder rows: ${api.reorder.length} (top 12 cut)`)
  const apiIds = new Set(api.reorder.map((r) => r.productId))

  // every expected candidate must be in the API list OR be cut by the top-12 window
  let mismatches = 0
  for (const e of expected) {
    const a = api.reorder.find((r) => r.productId === e.productId)
    if (!a) {
      console.log(`  MISSING from API: ${e.name} (stock ${e.stock}/min ${e.minStock})`)
      mismatches++
      continue
    }
    const fieldsOk =
      a.name === e.name && a.stock === e.stock && a.minStock === e.minStock &&
      a.avgDailyDemand === e.avgDailyDemand && a.suggestQty === e.suggestQty
    if (!fieldsOk) {
      console.log(`  FIELD MISMATCH: ${e.name} → API ${JSON.stringify(a)} vs DB ${JSON.stringify(e)}`)
      mismatches++
    }
  }
  console.log(mismatches === 0 ? '✓ all API reorder rows match independent DB recomputation' : `✗ ${mismatches} mismatches`)

  // sample check: one classic low-stock product must be present
  const lowStock = products.filter((p) => p.stock <= p.minStock && p.minStock > 0).sort((a, b) => a.stock / a.minStock - b.stock / b.minStock)
  console.log(`DB low-stock products (stock ≤ minStock): ${lowStock.length} — first 3: ${lowStock.slice(0, 3).map((p) => `${p.name} (${p.stock}/${p.minStock})`).join(', ')}`)
  const firstLow = lowStock[0]
  console.log(firstLow && apiIds.has(firstLow.id)
    ? `✓ low-stock product "${firstLow.name}" (${firstLow.stock}/${firstLow.minStock}) present in API reorder list`
    : `✗ low-stock product "${firstLow?.name}" NOT in API reorder list`)

  // slow-mover spot check: verify top slow row truly has no Sales in 60d
  const top = api.slow[0]
  if (top) {
    const salesCount = await db.sale.count({ where: { productId: top.productId, createdAt: { gte: since60 } } })
    const p = await db.product.findUnique({ where: { id: top.productId }, select: { stock: true, buyPrice: true, sellPrice: true } })
    const valueOk = p ? top.stockValue === Math.round(p.stock * p.buyPrice) : false
    console.log(salesCount === 0 && valueOk
      ? `✓ slow #1 "${top.name}": 0 sales in 60d, stockValue ${top.stockValue} = stock×buyPrice ✓`
      : `✗ slow #1 check failed (sales60=${salesCount}, valueOk=${valueOk})`)
  }

  // ABC shares sum sanity
  const ins = (await (await fetch(API)).json()) as { abc: { A: { revenueShare: number }; B: { revenueShare: number }; C: { revenueShare: number } } }
  const sum = ins.abc.A.revenueShare + ins.abc.B.revenueShare + ins.abc.C.revenueShare
  console.log(`ABC revenue shares A+B+C = ${sum}% (expected ≈100 ±0.2 rounding)`)
  await db.$disconnect()
}

void main()
