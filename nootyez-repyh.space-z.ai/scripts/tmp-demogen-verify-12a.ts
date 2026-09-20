/**
 * tmp verification (Task 12-a) — run: bun scripts/tmp-demogen-verify-12a.ts
 * Asserts the Industry Demo Lab generator meets the round-12 spec:
 * determinism, size counts, KPI bands, variance, cheque statuses, total caps, JSON size.
 */
import { generateDemoCompany, DEMO_SIZES, type DemoData } from '../src/app/api/demo/generator'

let failures = 0
function ok(cond: boolean, label: string) {
  if (!cond) {
    failures++
    console.error(`  ✗ ${label}`)
  } else {
    console.log(`  ✓ ${label}`)
  }
}

const EXPECTED = {
  BOUTIQUE: { branches: 1, suppliers: 6, orders: 20, cheques: 8, staff: [6, 8], name: 'بوتیک خوراک لوکس زیتون' },
  MID: { branches: 4, suppliers: 9, orders: 45, cheques: 14, staff: [12, 16], name: 'زنجیره گورمت کاویان' },
  LARGE: { branches: 9, suppliers: 14, orders: 90, cheques: 22, staff: [20, 24], name: 'گروه خرده‌فروشی لوکس کاویان' },
} as const

const CHEQUE_STATUSES = new Set(['PENDING_APPROVAL', 'WRITTEN', 'GIVEN', 'COLLECTED'])
const FINDING_IDS = new Set(['shrinkage', 'manual', 'abc', 'reorder', 'srm', 'fefo'])

for (const size of DEMO_SIZES) {
  console.log(`\n=== ${size} ===`)
  const a: DemoData = generateDemoCompany(size)
  const b: DemoData = generateDemoCompany(size)
  ok(JSON.stringify(a) === JSON.stringify(b), 'deterministic (two runs identical)')

  const e = EXPECTED[size]
  ok(a.profile.name === e.name, `profile.name = ${a.profile.name}`)
  ok(a.profile.hqCity === 'تهران', 'hqCity = تهران')
  ok(a.branches.length === e.branches, `branches = ${a.branches.length}`)
  ok(a.branches.every((x) => x.name.startsWith('شعبه ') && x.managerName.length > 3 && x.staffCount > 0 && x.sqm >= 100), 'branches have name/manager/staff/sqm')
  ok(a.suppliers.length === e.suppliers, `suppliers = ${a.suppliers.length}`)
  ok(a.suppliers.every((s) => s.paymentTerms === 'CASH' || s.paymentTerms === 'CHEQUE'), 'supplier paymentTerms valid')
  ok(a.suppliers.some((s) => s.priceListAgeDays >= 30), `stale price lists present (≥30d): ${a.suppliers.filter((s) => s.priceListAgeDays >= 30).length}`)
  ok(a.pipeline.length === e.orders, `orders = ${a.pipeline.length}`)
  ok(a.staff.length >= e.staff[0] && a.staff.length <= e.staff[1], `staff = ${a.staff.length} (band ${e.staff.join('-')})`)
  ok(a.staff.every((p) => ['مدیر شعبه', 'سرصندوق‌دار', 'انباردار', 'چیدمان', 'فروشنده گورمت'].includes(p.role)), 'staff roles valid')
  ok(a.staff.filter((p) => p.role === 'مدیر شعبه').length === e.branches, 'one مدیر شعبه per branch')
  ok(a.cheques.length === e.cheques, `cheques = ${a.cheques.length}`)

  // orders: codes, statuses, totals, variance
  ok(a.pipeline.every((o) => /^HZ-9\d{3}$/.test(o.code)), 'order codes HZ-9xxx')
  ok(new Set(a.pipeline.map((o) => o.code)).size === a.pipeline.length, 'order codes unique')
  const totals = a.pipeline.map((o) => o.total)
  ok(Math.min(...totals) >= 2_000_000, `min total ≥ 2M (${Math.round(Math.min(...totals) / 1e6)}M)`)
  ok(Math.max(...totals) <= 180_000_000, `max total ≤ 180M (${Math.round(Math.max(...totals) / 1e6)}M)`)
  ok(a.pipeline.every((o) => o.items.length >= 2 && o.items.length <= 5 && o.total === o.items.reduce((s, it) => s + it.qty * it.unitCost, 0)), 'itemCount 2-5 and totals = Σ qty×unitCost')
  const variances = a.pipeline.filter((o) => o.receivingVariancePct !== null).map((o) => o.receivingVariancePct as number)
  ok(variances.every((v) => v === 0 || (Math.abs(v) >= 1 && Math.abs(v) <= 6)), `variance mostly 0, some 1–6 (zeros: ${variances.filter((v) => v === 0).length}/${variances.length})`)
  ok(a.pipeline.filter((o) => o.receivingVariancePct === null).every((o) => !['RECEIVED', 'CONFIRMED', 'DONE'].includes(o.status)), 'variance null only for un-received')
  ok(a.pipeline.every((o) => o.daysAgo >= 0 && o.daysAgo <= 29), 'all orders within last 30 days')

  // cheques
  ok(a.cheques.every((c) => CHEQUE_STATUSES.has(c.status)), 'cheque statuses ⊆ PENDING_APPROVAL|WRITTEN|GIVEN|COLLECTED')
  ok(new Set(a.cheques.map((c) => c.status)).size >= 2, `cheque statuses varied: ${[...new Set(a.cheques.map((c) => c.status))].join(',')}`)
  const dueDays = a.cheques.map((c) => Math.round((new Date(c.dueDate + 'T12:00:00').getTime() - Date.now()) / 86400000))
  ok(Math.min(...dueDays) >= 2 && Math.max(...dueDays) <= 61, `due dates within ~3..60 days (${Math.min(...dueDays)}..${Math.max(...dueDays)})`)
  ok(a.cheques.every((c) => c.amount > 0 && c.payee.length > 2), 'cheques have payee + amount')

  // KPI bands
  const k = a.kpi
  ok(k.inventoryTurnover >= 2.4 && k.inventoryTurnover <= 6.8, `inventoryTurnover ${k.inventoryTurnover} ∈ 2.4–6.8`)
  ok(k.fillRatePct >= 92 && k.fillRatePct <= 98, `fillRatePct ${k.fillRatePct} ∈ 92–98`)
  ok(k.onTimeDeliveryPct >= 88 && k.onTimeDeliveryPct <= 96, `onTimeDeliveryPct ${k.onTimeDeliveryPct} ∈ 88–96`)
  ok(k.shrinkagePct >= 0.8 && k.shrinkagePct <= 2.4, `shrinkagePct ${k.shrinkagePct} ∈ 0.8–2.4`)
  ok(k.stockoutRatePct >= 2 && k.stockoutRatePct <= 6, `stockoutRatePct ${k.stockoutRatePct} ∈ 2–6`)
  ok(k.avgReceivingMinutesManual === 45 && k.avgReceivingMinutesPlatform === 6, 'manual 45 / platform 6')
  const otd = { BOUTIQUE: 26, MID: 14, LARGE: 9 }[size]
  ok(Math.abs(k.orderToDoneHours - otd) <= 3, `orderToDoneHours ${k.orderToDoneHours} ≈ ${otd}`)
  const admin = { BOUTIQUE: 6, MID: 14, LARGE: 31 }[size]
  ok(Math.abs(k.adminHoursSavedPerWeek - admin) <= 2, `adminHoursSavedPerWeek ${k.adminHoursSavedPerWeek} ≈ ${admin}`)

  // benefits
  ok(a.benefits.length === 6, 'exactly 6 benefit rows')
  ok(a.benefits.every((x) => FINDING_IDS.has(x.findingId)), `findingIds valid: ${a.benefits.map((x) => x.findingId).join(',')}`)
  const ratios = a.benefits.map((x) => x.beforeMinutes / x.afterMinutes)
  ok(ratios.every((r) => r >= 3 && r <= 8), `speed-ups 3–8× (${ratios.map((r) => r.toFixed(1)).join(', ')})`)
  ok(a.benefits[0].beforeMinutes === 45 && a.benefits[0].afterMinutes === 6, 'benefit row 1 mirrors KPI 45→6')

  // JSON size
  const bytes = Buffer.byteLength(JSON.stringify(a), 'utf8')
  ok(bytes <= 150 * 1024, `JSON ${(bytes / 1024).toFixed(1)}KB ≤ 150KB`)
}

console.log(failures === 0 ? '\nALL CHECKS PASSED ✅' : `\n${failures} CHECK(S) FAILED ❌`)
process.exit(failures === 0 ? 0 : 1)
