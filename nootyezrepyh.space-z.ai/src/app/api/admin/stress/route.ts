import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit } from '@/lib/audit'
import { toJalaali } from '@/lib/jalaali-core'

/**
 * Stress-test & system health console (ADMIN_SETTINGS).
 *
 * GET  → health snapshot: table row counts, db size, memory, uptime, live stress-row census, last run
 * POST { action: 'seed' | 'probe' | 'cleanup', scale: 'SMALL'|'MEDIUM'|'LARGE' }
 *
 * Stress rows are marked so cleanup can remove them safely:
 *   Product.holooCode startsWith 'ZZSTRESS'      • Order.notes startsWith '🧪'
 *   Activity/Task.title startsWith '🧪'          • SaleOrder.customerName startsWith '🧪'
 *   WarehouseRequest.productName startsWith '🧪' • AuditLog.entityType = 'STRESS_TEST'
 */

const STRESS_TAG = '🧪'
const STRESS_SKU = 'ZZSTRESS'
const STRESS_AUDIT = 'STRESS_TEST'

interface ProbeResult {
  key: string
  label: string
  runs: number[]
  avg: number
  p95: number
  max: number
}

async function timedQuery(key: string, label: string, fn: () => Promise<unknown>, runs = 6): Promise<ProbeResult> {
  const times: number[] = []
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    await fn()
    times.push(Math.round((performance.now() - t0) * 10) / 10)
  }
  const sorted = [...times].sort((a, b) => a - b)
  const p95Idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return {
    key, label, runs: times,
    avg: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10,
    p95: sorted[p95Idx],
    max: sorted[sorted.length - 1],
  }
}

async function countAll() {
  const [
    users, products, orders, orderItems, cheques, tasks, activities,
    saleOrders, customers, warehouseRequests, shifts, auditLogs, messages, notes,
  ] = await Promise.all([
    db.user.count(), db.product.count(), db.order.count(), db.orderItem.count(),
    db.cheque.count(), db.task.count(), db.activity.count(),
    db.saleOrder.count(), db.customer.count(), db.warehouseRequest.count(),
    db.shift.count(), db.auditLog.count(), db.message.count(), db.note.count(),
  ])
  return { users, products, orders, orderItems, cheques, tasks, activities, saleOrders, customers, warehouseRequests, shifts, auditLogs, messages, notes }
}

async function stressCensus() {
  const [products, orders, activities, tasks, saleOrders, whReq, audits] = await Promise.all([
    db.product.count({ where: { holooCode: { startsWith: STRESS_SKU } } }),
    db.order.count({ where: { notes: { startsWith: STRESS_TAG } } }),
    db.activity.count({ where: { title: { startsWith: STRESS_TAG } } }),
    db.task.count({ where: { title: { startsWith: STRESS_TAG } } }),
    db.saleOrder.count({ where: { customerName: { startsWith: STRESS_TAG } } }),
    db.warehouseRequest.count({ where: { productName: { startsWith: STRESS_TAG } } }),
    db.auditLog.count({ where: { entityType: STRESS_AUDIT, action: { startsWith: 'STRESS_ROW' } } }),
  ])
  return { products, orders, activities, tasks, saleOrders, warehouseRequests: whReq, audits }
}

/** GET — health snapshot */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ADMIN_SETTINGS)) {
    return Response.json({ error: 'اجازه دسترسی ندارید' }, { status: 403 })
  }

  const [counts, census, lastRun, historyRow, pageCount, pageSize] = await Promise.all([
    countAll(),
    stressCensus(),
    db.setting.findUnique({ where: { key: 'stress_last_run' } }),
    db.setting.findUnique({ where: { key: 'stress_history' } }),
    db.$queryRaw<{ page_count: number }[]>`PRAGMA page_count;`,
    db.$queryRaw<{ page_size: number }[]>`PRAGMA page_size;`,
  ])

  let history: StressHistoryEntry[] = []
  try {
    history = historyRow ? JSON.parse(historyRow.value) : []
  } catch {
    history = []
  }

  const mem = process.memoryUsage()
  return Response.json({
    counts,
    census,
    totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
    dbSizeBytes: Number(pageCount[0]?.page_count || 0) * Number(pageSize[0]?.page_size || 0),
    memory: { rssMB: Math.round(mem.rss / 1048576), heapMB: Math.round(mem.heapUsed / 1048576) },
    uptimeSec: Math.round(process.uptime()),
    node: process.version,
    now: new Date().toISOString(),
    lastRun: lastRun ? JSON.parse(lastRun.value) : null,
    history,
  })
}

interface StressHistoryEntry {
  at: string
  atJalali: string
  scale: string // SMALL | MEDIUM | LARGE | PROBE
  totalRows: number
  probeMs: number
  worstP95: number
  probeCount: number
}

const SCALES: Record<string, { label: string; products: number; orders: number; itemsPerOrder: [number, number]; activities: number; tasks: number; wh: number; sales: number; audits: number }> = {
  SMALL: { label: 'کوچک', products: 120, orders: 50, itemsPerOrder: [3, 5], activities: 150, tasks: 40, wh: 40, sales: 50, audits: 200 },
  MEDIUM: { label: 'متوسط', products: 400, orders: 120, itemsPerOrder: [4, 7], activities: 500, tasks: 100, wh: 100, sales: 150, audits: 600 },
  LARGE: { label: 'بزرگ', products: 900, orders: 250, itemsPerOrder: [5, 8], activities: 1200, tasks: 220, wh: 220, sales: 300, audits: 1200 },
}

const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1))
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

/** POST — seed bulk stress rows / run query probes / cleanup */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ADMIN_SETTINGS)) {
    return Response.json({ error: 'اجازه اجرای آزمون را ندارید' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as { action?: string; scale?: string } | null
  const action = body?.action

  /* ---------------- seed ---------------- */
  if (action === 'seed') {
    const scale = SCALES[body?.scale || 'SMALL'] ? (body?.scale as string) : 'SMALL'
    const s = SCALES[scale]
    const t0 = performance.now()
    const steps: { table: string; label: string; inserted: number; ms: number }[] = []

    // prerequisites: real users for relations
    const [users, companies] = await Promise.all([
      db.user.findMany({ where: { active: true }, select: { id: true } }),
      db.company.findMany({ select: { id: true } }),
    ])
    if (users.length === 0) return Response.json({ error: 'هیچ کاربر فعالی وجود ندارد' }, { status: 400 })
    const creator = users.find((u) => u.id === session.id) || users[0]

    // helper: chunked createMany (SQLite-safe sizes)
    async function bulk<T>(table: string, label: string, rows: T[], insert: (chunk: T[]) => Promise<unknown>, chunkSize = 120) {
      const st = performance.now()
      let n = 0
      for (let i = 0; i < rows.length; i += chunkSize) {
        await insert(rows.slice(i, i + chunkSize))
        n += Math.min(chunkSize, rows.length - i)
      }
      steps.push({ table, label, inserted: n, ms: Math.round(performance.now() - st) })
    }

    // 1) products
    const productRows = Array.from({ length: s.products }, (_, i) => ({
      name: `${STRESS_TAG} کالای آزمایشی ${i + 1}`,
      holooName: `${STRESS_SKU}-P${i + 1}`,
      holooCode: `${STRESS_SKU}-P${i + 1}`,
      barcode: String(1000000000000 + rand(0, 8999999999999)),
      price: rand(20, 900) * 1000,
      cost: rand(12, 500) * 1000,
      stock: rand(0, 60),
      minStock: rand(5, 15),
      category: 'آزمایشی',
      companyId: companies.length ? pick(companies).id : null,
    }))
    await bulk('products', 'کالاها', productRows, (c) => db.product.createMany({ data: c as never }))

    // 2) orders + items
    const createdProducts = await db.product.findMany({
      where: { holooCode: { startsWith: STRESS_SKU } },
      select: { id: true, name: true, holooName: true, barcode: true, price: true, cost: true },
    })
    // supplier for orders — reuse existing; if none, create one stress supplier
    let supplier = await db.supplier.findFirst({ select: { id: true } })
    let stressSupplierId: string | null = null
    if (!supplier) {
      const sup = await db.supplier.create({ data: { name: `${STRESS_TAG} تأمین‌کننده آزمایشی`, type: 'DISTRIBUTOR' } })
      supplier = { id: sup.id }
      stressSupplierId = sup.id
    }
    const startNo = ((await db.order.aggregate({ _max: { number: true } }))._max.number || 0) + 1
    const ordersData = Array.from({ length: s.orders }, (_, i) => ({
      number: startNo + i,
      supplierId: supplier!.id,
      createdById: creator.id,
      status: pick(['APPROVED', 'EXPECTED', 'RECEIVED', 'INSPECTED', 'DONE', 'DONE', 'DONE']),
      deliveryDate: `1405/0${rand(6, 9)}/${String(rand(1, 29)).padStart(2, '0')}`,
      paymentType: pick(['CHEQUE', 'CASH_ON_DELIVERY']),
      totalAmount: 0, finalAmount: 0,
      notes: `${STRESS_TAG} سفارش آزمایشی ${i + 1}`,
    }))
    await bulk('orders', 'سفارشات', ordersData, (c) => db.order.createMany({ data: c as never }))
    const createdOrders = await db.order.findMany({
      where: { notes: { startsWith: STRESS_TAG } },
      select: { id: true },
    })
    const itemRows: {
      orderId: string; productId: string; productName: string; holooName: string | null; barcode: string | null
      quantity: number; unitPrice: number; sellPrice: number; lineTotal: number; receivedQty: number
    }[] = []
    for (const o of createdOrders) {
      const n = rand(s.itemsPerOrder[0], s.itemsPerOrder[1])
      for (let j = 0; j < n; j++) {
        const p = pick(createdProducts)
        const qty = rand(2, 30)
        itemRows.push({
          orderId: o.id, productId: p.id, productName: p.name, holooName: p.holooName, barcode: p.barcode,
          quantity: qty, unitPrice: p.cost, sellPrice: p.price, lineTotal: qty * p.cost, receivedQty: qty,
        })
      }
    }
    await bulk('orderItems', 'اقلام سفارش', itemRows, (c) => db.orderItem.createMany({ data: c as never }), 200)

    // 3) activities
    const actTypes = ['TASK_DONE', 'DELIVERY', 'CLEANING', 'HELP', 'SHELF_STOCK', 'CUSTOMER_SERVICE']
    const actRows = Array.from({ length: s.activities }, () => ({
      userId: pick(users).id,
      type: pick(actTypes),
      title: `${STRESS_TAG} فعالیت آزمایشی`,
      points: rand(5, 20),
      awardedById: creator.id,
    }))
    await bulk('activities', 'فعالیت‌ها', actRows, (c) => db.activity.createMany({ data: c as never }))

    // 4) tasks
    const taskRows = Array.from({ length: s.tasks }, (_, i) => ({
      title: `${STRESS_TAG} وظیفه آزمایشی ${i + 1}`,
      description: 'دادهٔ ساخته‌شده توسط آزمون فشار — با «پاکسازی» حذف می‌شود',
      assignedTo: pick(users).id,
      assigneeType: 'USER',
      createdById: creator.id,
      status: pick(['TODO', 'TODO', 'IN_PROGRESS', 'DONE']),
      priority: pick(['LOW', 'MEDIUM', 'HIGH']),
      dueDate: `1405/0${rand(6, 9)}/${String(rand(1, 29)).padStart(2, '0')}`,
    }))
    await bulk('tasks', 'وظایف', taskRows, (c) => db.task.createMany({ data: c as never }))

    // 5) warehouse requests
    const whRows = Array.from({ length: s.wh }, () => {
      const p = pick(createdProducts)
      return { productId: p.id, productName: `${STRESS_TAG} ${p.name}`, quantity: rand(1, 12), requestedById: pick(users).id, status: pick(['PENDING', 'PENDING', 'PREPARED', 'SENT']) }
    })
    await bulk('warehouseRequests', 'درخواست‌های انبار', whRows, (c) => db.warehouseRequest.createMany({ data: c as never }))

    // 6) sale orders
    const saleRows = Array.from({ length: s.sales }, () => {
      const items = Array.from({ length: rand(1, 5) }, () => {
        const p = pick(createdProducts)
        return { productId: p.id, name: p.name, qty: rand(1, 4), price: p.price }
      })
      const total = items.reduce((a, it) => a + it.qty * it.price, 0)
      return {
        customerName: `${STRESS_TAG} مشتری آزمایشی`,
        salespersonId: pick(users).id,
        items: JSON.stringify(items),
        total,
        status: pick(['PENDING', 'ACCEPTED', 'CASHED']),
      }
    })
    await bulk('saleOrders', 'سفارش‌های فروش', saleRows, (c) => db.saleOrder.createMany({ data: c as never }))

    // 7) audit rows (marked)
    const auditRows = Array.from({ length: s.audits }, (_, i) => ({
      userId: creator.id, userName: 'آزمون فشار',
      action: `STRESS_ROW_${i}`, entityType: STRESS_AUDIT,
      details: JSON.stringify({ i, at: new Date().toISOString() }),
    }))
    await bulk('auditLogs', 'رخدادهای سیستم', auditRows, (c) => db.auditLog.createMany({ data: c as never }), 200)

    const totalMs = Math.round(performance.now() - t0)
    const totalRows = steps.reduce((a, st) => a + st.inserted, 0)

    await Promise.all([
      logAudit(session.id, session.name, 'STRESS_TEST_RUN', STRESS_AUDIT, undefined, { phase: 'seed', scale, totalRows, totalMs }),
      db.setting.upsert({
        where: { key: 'stress_last_run' },
        update: { value: JSON.stringify({ at: new Date().toISOString(), phase: 'seed', scale, totalRows, totalMs }) },
        create: { key: 'stress_last_run', value: JSON.stringify({ at: new Date().toISOString(), phase: 'seed', scale, totalRows, totalMs }) },
      }),
    ])
    return Response.json({ scale, steps, totalMs, totalRows, stressSupplierId })
  }

  /* ---------------- probe ---------------- */
  if (action === 'probe') {
    const t0 = performance.now()
    const d = new Date(Date.now() + 3.5 * 3600000)
    const { jy, jm, jd } = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    const todayStr = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`

    const probes: ProbeResult[] = []
    probes.push(await timedQuery('orders-list', 'فهرست سفارشات با اقلام', () =>
      db.order.findMany({
        take: 40, orderBy: { createdAt: 'desc' },
        include: { items: true, supplier: { select: { id: true, name: true } } },
      })))
    probes.push(await timedQuery('orders-counts', 'شمارنده‌های داشبورد', () =>
      Promise.all([
        db.order.count({ where: { status: 'PENDING_APPROVAL' } }),
        db.order.count({ where: { status: { in: ['APPROVED', 'EXPECTED'] }, deliveryDate: { lt: todayStr } } }),
        db.order.count({ where: { status: 'INSPECTED' } }),
      ])))
    probes.push(await timedQuery('products-search', 'جستجوی کالا', () =>
      db.product.findMany({ where: { active: true, mergedInto: null, OR: [{ name: { contains: 'آزمایشی' } }, { holooName: { contains: 'ZZ' } }] }, take: 30 })))
    probes.push(await timedQuery('stock-scan', 'اسکن موجودی کل', () =>
      db.product.findMany({ where: { active: true, mergedInto: null }, select: { stock: true, minStock: true, name: true } })))
    probes.push(await timedQuery('notifications', 'تجمیع اعلان‌ها (۹ شمارش)', () =>
      Promise.all([
        db.order.count({ where: { status: 'PENDING_APPROVAL' } }),
        db.order.count({ where: { status: 'RECEIVED' } }),
        db.cheque.count({ where: { status: 'PENDING_OWNER' } }),
        db.cheque.count({ where: { status: { in: ['WRITTEN', 'SIGNED', 'READY'] } } }),
        db.task.count({ where: { status: 'FOLLOW_UP' } }),
        db.idea.count({ where: { status: 'SUBMITTED' } }),
        db.warehouseRequest.count({ where: { status: 'PENDING' } }),
        db.saleOrder.count({ where: { status: 'PENDING' } }),
        db.order.count({ where: { status: 'TO_HOLOO' } }),
      ])))
    probes.push(await timedQuery('activities-report', 'گزارش فعالیت تیم', () =>
      db.activity.findMany({ take: 120, orderBy: { createdAt: 'desc' } })))
    probes.push(await timedQuery('audit-page', 'صفحهٔ گزارش رخدادها', () =>
      db.auditLog.findMany({ take: 15, orderBy: { createdAt: 'desc' } })))
    probes.push(await timedQuery('shifts-week', 'برنامه شیفت هفته', () =>
      db.shift.findMany({ where: { weekStart: '1405/06/14' } })))

    const totalMs = Math.round(performance.now() - t0)

    // history bookkeeping — associate with the seed scale when this probe follows a fresh seed
    const worstP95 = probes.length ? Math.max(...probes.map((p) => p.p95)) : 0
    let scale = 'PROBE'
    let totalRows = 0
    try {
      const last = await db.setting.findUnique({ where: { key: 'stress_last_run' } })
      const lastVal = last ? JSON.parse(last.value) : null
      if (lastVal?.phase === 'seed' && lastVal?.scale) {
        scale = lastVal.scale
        totalRows = lastVal.totalRows || 0
      }
    } catch { /* best-effort */ }
    const d2 = new Date(Date.now() + 3.5 * 3600000)
    const { jy: hy, jm: hm, jd: hd } = toJalaali(d2.getFullYear(), d2.getMonth() + 1, d2.getDate())
    const hh = d2.getUTCHours(), mm = d2.getUTCMinutes()
    const atJalali = `${hy}/${String(hm).padStart(2, '0')}/${String(hd).padStart(2, '0')} — ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    try {
      const histRow = await db.setting.findUnique({ where: { key: 'stress_history' } })
      const hist: unknown[] = histRow ? JSON.parse(histRow.value) : []
      hist.unshift({ at: new Date().toISOString(), atJalali, scale, totalRows, probeMs: totalMs, worstP95, probeCount: probes.length })
      await db.setting.upsert({
        where: { key: 'stress_history' },
        update: { value: JSON.stringify(hist.slice(0, 15)) },
        create: { key: 'stress_history', value: JSON.stringify(hist.slice(0, 15)) },
      })
    } catch { /* history is best-effort */ }

    await Promise.all([
      logAudit(session.id, session.name, 'STRESS_TEST_RUN', STRESS_AUDIT, undefined, { phase: 'probe', totalMs }),
      db.setting.upsert({
        where: { key: 'stress_last_run' },
        update: { value: JSON.stringify({ at: new Date().toISOString(), phase: 'probe', totalMs }) },
        create: { key: 'stress_last_run', value: JSON.stringify({ at: new Date().toISOString(), phase: 'probe', totalMs }) },
      }),
    ])
    return Response.json({ probes, totalMs, worstP95 })
  }

  /* ---------------- cleanup ---------------- */
  if (action === 'cleanup') {
    const t0 = performance.now()
    // orders first (items cascade), then the rest — audit rows last so the run stays auditable
    const [orders, saleOrders, tasks, activities, wh, products] = await Promise.all([
      db.order.deleteMany({ where: { notes: { startsWith: STRESS_TAG } } }),
      db.saleOrder.deleteMany({ where: { customerName: { startsWith: STRESS_TAG } } }),
      db.task.deleteMany({ where: { title: { startsWith: STRESS_TAG } } }),
      db.activity.deleteMany({ where: { title: { startsWith: STRESS_TAG } } }),
      db.warehouseRequest.deleteMany({ where: { productName: { startsWith: STRESS_TAG } } }),
      db.product.deleteMany({ where: { holooCode: { startsWith: STRESS_SKU } } }),
    ])
    const audits = await db.auditLog.deleteMany({ where: { entityType: STRESS_AUDIT, action: { startsWith: 'STRESS_ROW' } } })
    // reclaim freed pages so the DB file shrinks back (SQLite keeps free pages otherwise)
    let vacuumMs = 0
    try {
      const v0 = performance.now()
      await db.$executeRawUnsafe('VACUUM;')
      vacuumMs = Math.round(performance.now() - v0)
    } catch {
      /* VACUUM best-effort — locked DB or transaction context */
    }
    const totalMs = Math.round(performance.now() - t0)
    const removed = orders.count + saleOrders.count + tasks.count + activities.count + wh.count + products.count + audits.count
    await logAudit(session.id, session.name, 'STRESS_CLEANUP', STRESS_AUDIT, undefined, { removed, totalMs, vacuumMs })
    return Response.json({
      removed,
      totalMs,
      vacuumMs,
      breakdown: {
        orders: orders.count, saleOrders: saleOrders.count, tasks: tasks.count,
        activities: activities.count, warehouseRequests: wh.count, products: products.count, audits: audits.count,
      },
    })
  }

  return Response.json({ error: 'عملیات نامعتبر است' }, { status: 400 })
}
