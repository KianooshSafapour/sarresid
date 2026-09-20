/** Task 10-b verification: parse /tmp/all-wb.xls and compare sheet-by-sheet against the DB */
import * as XLSX from 'xlsx'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const wb = XLSX.readFile('/tmp/all-wb.xls')
console.log('SHEET NAMES:', JSON.stringify(wb.SheetNames))

const HEADERS = ['بارکد', 'نام کالا', 'قیمت خرید', 'قیمت فروش', 'تأمین‌کننده']
let fails = 0
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) fails++ }

const suppliers = await db.supplier.findMany({
  where: { products: { some: { active: true, mergedInto: null } } },
  select: { id: true, name: true },
  orderBy: { name: 'asc' },
})
console.log('DB suppliers with active products:', suppliers.length)
assert(wb.SheetNames.length === suppliers.length, `sheet count (${wb.SheetNames.length}) == suppliers with active products (${suppliers.length})`)

// Excel sheet-name rules
for (const n of wb.SheetNames) {
  assert(n.length <= 31 && !/[*?:/\\[\]]/.test(n) && n.length > 0, `sheet name «${n}» valid (${n.length} chars, no forbidden chars)`)
}

// expected name order == sheet order (suppliers ordered by name asc)
const expectedNames = suppliers.map((s) => s.name)
for (let i = 0; i < suppliers.length; i++) {
  const ws = wb.Sheets[wb.SheetNames[i]]
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  const s = suppliers[i]
  const dbCount = await db.product.count({ where: { supplierId: s.id, active: true, mergedInto: null } })
  const dataRows = grid.slice(4).filter((r) => r.some((c) => String(c ?? '') !== ''))
  const title = String(grid[0]?.[0] ?? '')
  assert(title.startsWith(`فهرست قیمت — ${s.name} — `) && title.endsWith(' — هایپر زیتون'),
    `sheet ${i} («${wb.SheetNames[i]}») title row for ${s.name}: ${JSON.stringify(grid[0]?.[0])}`)
  assert(String(grid[1]?.[0]).startsWith('تعداد اقلام:'), `sheet ${i} count line: ${JSON.stringify(grid[1]?.[0])}`)
  assert(grid[3]?.length === 5 && HEADERS.every((h, c) => grid[3]?.[c] === h), `sheet ${i} EXACT import headers`)
  assert(dataRows.length === dbCount, `sheet ${i} rows ${dataRows.length} == DB active products of supplier ${s.id} (${dbCount})`)
  assert(dataRows.every((r) => r[4] === s.name), `sheet ${i} every row carries supplier name`)
  // spot-check: first row prices match DB for that supplier's first product (name asc)
  const first = await db.product.findFirst({ where: { supplierId: s.id, active: true, mergedInto: null }, orderBy: { name: 'asc' }, select: { name: true, nameFa: true, buyPrice: true, sellPrice: true } })
  if (first && dataRows[0]) {
    assert(dataRows[0][1] === (first.nameFa || first.name) && dataRows[0][2] === first.buyPrice && dataRows[0][3] === first.sellPrice,
      `sheet ${i} first data row matches DB (${String(dataRows[0][1]).slice(0, 24)}… buy=${dataRows[0][2]} sell=${dataRows[0][3]})`)
  }
}
console.log(fails === 0 ? 'WORKBOOK VERIFY: ALL PASS' : `WORKBOOK VERIFY: ${fails} FAILURES`)
await db.$disconnect()
process.exit(fails === 0 ? 0 : 1)
