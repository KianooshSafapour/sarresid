/**
 * Hyper Zeytoon Platform — Database Seed
 * Run: bunx tsx prisma/seed.ts  (or bun prisma/seed.ts)
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Hyper Zeytoon platform...')

  // wipe (idempotent seed)
  const tables = [
    'pointsLog', 'auditLog', 'notification', 'message', 'conversation',
    'preOrder', 'customer', 'customerRequest', 'warehouseRequest', 'planogram',
    'setting', 'idea', 'feedback', 'personalNote', 'wallPost', 'sOP', 'task',
    'holiday', 'cheque', 'orderEvent', 'orderItem', 'order',
    'product', 'supplierCompany', 'supplier', 'company', 'user',
  ]
  for (const t of tables) await (db as any)[t].deleteMany()

  // ---------- STAFF ----------
  const users = await Promise.all([
    db.user.create({ data: { name: 'Javad Norouzi (مالک)', pin: '1111', roles: 'OWNER', color: '#B8860B', points: 0 } }),
    db.user.create({ data: { name: 'Mrs. Lotfi (مدیر عامل)', pin: '2222', roles: 'GENERAL_MANAGER', color: '#5F7A4E', points: 120 } }),
    db.user.create({ data: { name: 'Kianoosh Safapour (مدیر عملیات)', pin: '1010', roles: 'OPERATION_MANAGER,IT_ADMIN', color: '#2F6B4F', points: 200 } }),
    db.user.create({ data: { name: 'Sara Norouzi (مدیر محصول)', pin: '3333', roles: 'PRODUCT_MANAGER', color: '#8B5CF6', points: 80 } }),
    db.user.create({ data: { name: 'Mrs. Darvishi (مدیر حسابداری)', pin: '4444', roles: 'ACCOUNTANT', color: '#B45309', points: 95 } }),
    db.user.create({ data: { name: 'Mr. Mohammadi (انباردار)', pin: '5555', roles: 'INVENTORY_SUPERVISOR,DELIVERY_RECEIVER', color: '#0F766E', points: 70 } }),
    db.user.create({ data: { name: 'Ms. Irannejhad (تحویل/فروش)', pin: '6666', roles: 'DELIVERY_RECEIVER,SALESPERSON,MERCHANDISER', color: '#BE185D', points: 110 } }),
    db.user.create({ data: { name: 'Mrs. Mohammadi (سرصندوق‌دار)', pin: '7777', roles: 'CASHIER', color: '#7C3AED', points: 60 } }),
    db.user.create({ data: { name: 'Mrs. Sharifi (صندوق‌دار ارشد)', pin: '8888', roles: 'CASHIER', color: '#A16207', points: 55 } }),
    db.user.create({ data: { name: 'Ms. Arabnejhad (صندوق‌دار)', pin: '9999', roles: 'CASHIER', color: '#4D7C0F', points: 40 } }),
    db.user.create({ data: { name: 'Ms. Yadegari (فروشنده)', pin: '1212', roles: 'SALESPERSON', color: '#C2410C', points: 65 } }),
    db.user.create({ data: { name: 'Ms. Saadi (چیدمان/فروش)', pin: '1313', roles: 'MERCHANDISER,SALESPERSON', color: '#0369A1', points: 50 } }),
    db.user.create({ data: { name: 'Ms. Gholamhoseini (چیدمان)', pin: '1414', roles: 'MERCHANDISER', color: '#6D28D9', points: 45 } }),
    db.user.create({ data: { name: 'Mrs. Mirzaiee (چیدمان)', pin: '1515', roles: 'MERCHANDISER', color: '#0E7490', points: 42 } }),
    db.user.create({ data: { name: 'Ms. Taghizadeh (چیدمان)', pin: '1616', roles: 'MERCHANDISER', color: '#A21CAF', points: 38 } }),
    db.user.create({ data: { name: 'Mr. Alikhani (چیدمان)', pin: '1717', roles: 'MERCHANDISER', color: '#15803D', points: 35 } }),
  ])
  const [owner, gm, om, pm, acc, inv, irannejhad, headCashier] = users

  // ---------- COMPANIES (brands / manufacturers) ----------
  const companyNames = ['Kalleh', 'Pegah Kerman', 'Mihan', 'Domino', 'Tak', 'Golha', 'Sadaf', 'Danone', 'Chin Chin', 'Mahram', 'Osta', 'Sunich']
  const companies: { id: number; name: string }[] = []
  for (const n of companyNames) companies.push(await db.company.create({ data: { name: n } }))

  // ---------- SUPPLIERS ----------
  async function mkSupplier(name: string, kind: string, terms: string, days: number, companyIdx: number[], phone?: string) {
    const s = await db.supplier.create({ data: { name, kind, paymentTerms: terms, chequeDays: days, phone } })
    for (const ci of companyIdx) await db.supplierCompany.create({ data: { supplierId: s.id, companyId: companies[ci].id } })
    return s
  }
  const supKalleh = await mkSupplier('Kalleh Distribution Center', 'DISTRIBUTOR', 'CHEQUE', 45, [0], '034-32110001')
  const supPegah = await mkSupplier('Pegah Kerman Direct', 'MANUFACTURER', 'CASH', 0, [1], '034-32110002')
  const supMihan = await mkSupplier('Mihan Dairy Rep — Mr. Rezaei', 'DISTRIBUTOR', 'CHEQUE', 30, [2, 9], '034-32110003')
  const supGrocery = await mkSupplier('Zeytoon Grocery Wholesale', 'BOTH', 'MIXED', 60, [4, 5, 6, 10, 11], '034-32110004')
  const supSnacks = await mkSupplier('Snacks & Sweets Co.', 'DISTRIBUTOR', 'CHEQUE', 30, [3, 8, 7], '034-32110005')
  const suppliers = [supKalleh, supPegah, supMihan, supGrocery, supSnacks]

  // ---------- PRODUCTS ----------
  type P = { name: string; fa: string; bar: string; buy: number; sell: number; stock: number; min: number; cat: string; comp: number; sup: number }
  const plist: P[] = [
    { name: 'Kalleh Milk 1L Full Fat', fa: 'شیر پرچرب کاله ۱ لیتری', bar: '6260110000018', buy: 28000, sell: 34000, stock: 48, min: 24, cat: 'Dairy', comp: 0, sup: 0 },
    { name: 'Kalleh Milk 500ml Low Fat', fa: 'شیر کم‌چرب کاله ۵۰۰', bar: '6260110000025', buy: 16000, sell: 20000, stock: 12, min: 30, cat: 'Dairy', comp: 0, sup: 0 },
    { name: 'Kalleh Chocolate Milk 250ml', fa: 'شیر شکلات کاله ۲۵۰', bar: '6260110000032', buy: 12000, sell: 16000, stock: 60, min: 24, cat: 'Dairy', comp: 0, sup: 0 },
    { name: 'Pegah Kerman Yogurt 900g', fa: 'ماست پگاه کرمان ۹۰۰', bar: '6260120000014', buy: 35000, sell: 43000, stock: 30, min: 15, cat: 'Dairy', comp: 1, sup: 1 },
    { name: 'Mihan Doogh 1.5L', fa: 'دوغ میهن ۱.۵ لیتری', bar: '6260130000011', buy: 25000, sell: 32000, stock: 6, min: 18, cat: 'Dairy', comp: 2, sup: 2 },
    { name: 'Kalleh Butter 100g', fa: 'کره کاله ۱۰۰ گرمی', bar: '6260110000049', buy: 38000, sell: 46000, stock: 20, min: 10, cat: 'Dairy', comp: 0, sup: 0 },
    { name: 'Kalleh Cheese Lighvan 400g', fa: 'پنیر لیقوان کاله ۴۰۰', bar: '6260110000056', buy: 95000, sell: 115000, stock: 8, min: 12, cat: 'Dairy', comp: 0, sup: 0 },
    { name: 'Mihan Cream 200ml', fa: 'خامه میهن ۲۰۰', bar: '6260130000028', buy: 30000, sell: 38000, stock: 14, min: 10, cat: 'Dairy', comp: 2, sup: 2 },
    { name: 'Tak Rice 5kg (Domestic)', fa: 'برنج تک ۵ کیلویی', bar: '6260140000019', buy: 680000, sell: 790000, stock: 10, min: 6, cat: 'Grocery', comp: 4, sup: 3 },
    { name: 'Sadaf Rice 10kg Indian', fa: 'برنج صدف هندی ۱۰ کیلویی', bar: '6260160000017', buy: 1250000, sell: 1450000, stock: 4, min: 5, cat: 'Grocery', comp: 6, sup: 3 },
    { name: 'Golha Tomato Paste 800g', fa: 'رب گوجه گلها ۸۰۰ گرمی', bar: '6260150000013', buy: 145000, sell: 175000, stock: 22, min: 10, cat: 'Grocery', comp: 5, sup: 3 },
    { name: 'Golha Tuna 180g', fa: 'تن ماهی گلها ۱۸۰ گرمی', bar: '6260150000020', buy: 135000, sell: 168000, stock: 35, min: 15, cat: 'Grocery', comp: 5, sup: 3 },
    { name: 'Osta Sunflower Oil 1.8L', fa: 'روغن آفتابگردان اُستا ۱.۸', bar: '6260170000016', buy: 195000, sell: 235000, stock: 18, min: 12, cat: 'Grocery', comp: 10, sup: 3 },
    { name: 'Sugar 900g', fa: 'شکر ۹۰۰ گرمی', bar: '6260180000012', buy: 38000, sell: 45000, stock: 40, min: 20, cat: 'Grocery', comp: 4, sup: 3 },
    { name: 'Mahram Vinegar 1L', fa: 'سرکه مهرام ۱ لیتری', bar: '6260190000019', buy: 42000, sell: 52000, stock: 9, min: 8, cat: 'Grocery', comp: 9, sup: 3 },
    { name: 'Domino Biscuit Tea', fa: 'بیسکویت متز دامینو', bar: '6260100000014', buy: 18000, sell: 24000, stock: 55, min: 24, cat: 'Snacks', comp: 3, sup: 4 },
    { name: 'Chin Chin Wafers 24g', fa: 'ویفر چین چین', bar: '6260100000021', buy: 9000, sell: 13000, stock: 90, min: 30, cat: 'Snacks', comp: 8, sup: 4 },
    { name: 'Danone Danette 110g', fa: 'دانه دانه / دانت ۱۱۰', bar: '6260200000013', buy: 22000, sell: 29000, stock: 26, min: 20, cat: 'Snacks', comp: 7, sup: 4 },
    { name: 'Tak Chocolate Coin 300g', fa: 'سکه شکلات تک ۳۰۰', bar: '6260140000026', buy: 145000, sell: 175000, stock: 11, min: 8, cat: 'Snacks', comp: 4, sup: 4 },
    { name: 'Sunich Apple Juice 1L', fa: 'آب سیب سونیچ ۱ لیتری', bar: '6260210000012', buy: 62000, sell: 78000, stock: 16, min: 12, cat: 'Beverages', comp: 11, sup: 3 },
    { name: 'Pegah Kerman Ice Cream 500ml', fa: 'بستنی پگاه کرمان ۵۰۰', bar: '6260120000021', buy: 85000, sell: 105000, stock: 7, min: 10, cat: 'Frozen', comp: 1, sup: 1 },
    { name: 'Kalleh Salami 500g', fa: 'سالامی کاله ۵۰۰ گرمی', bar: '6260110000063', buy: 210000, sell: 252000, stock: 9, min: 10, cat: 'Protein', comp: 0, sup: 0 },
    { name: 'Kalleh Sausage Cocktail 250g', fa: 'سوسیس ککتلی کاله ۲۵۰', bar: '6260110000070', buy: 125000, sell: 152000, stock: 13, min: 10, cat: 'Protein', comp: 0, sup: 0 },
    { name: 'Chicken Breast (Fresh, kg)', fa: 'سینه مرغ تازه', bar: '2000000000017', buy: 320000, sell: 365000, stock: 15, min: 10, cat: 'Protein', comp: 10, sup: 3 },
    { name: 'Eggs (Tray of 20)', fa: 'تخم مرغ شانه ۲۰ عددی', bar: '2000000000024', buy: 240000, sell: 280000, stock: 12, min: 8, cat: 'Protein', comp: 4, sup: 3 },
    { name: 'Local Dish Sponge 3pcs', fa: 'اسکاج ظرفشویی محلی', bar: '2000000000031', buy: 25000, sell: 40000, stock: 30, min: 10, cat: 'Home', comp: 10, sup: 3 },
    { name: 'Pistachio Kerman 500g', fa: 'پسته کرمان ۵۰۰ گرمی', bar: '2000000000048', buy: 950000, sell: 1150000, stock: 6, min: 5, cat: 'Nuts', comp: 10, sup: 3 },
    { name: 'Cucumber (kg)', fa: 'خیار (کیلوگرم)', bar: '2000000000055', buy: 30000, sell: 45000, stock: 25, min: 15, cat: 'Produce', comp: 10, sup: 3 },
    { name: 'Tomato (kg)', fa: 'گوجه (کیلوگرم)', bar: '2000000000062', buy: 25000, sell: 40000, stock: 3, min: 15, cat: 'Produce', comp: 10, sup: 3 },
    { name: 'Laundry Powder 3.5kg', fa: 'پودر لباسشویی ۳.۵ کیلویی', bar: '6260220000011', buy: 320000, sell: 385000, stock: 8, min: 6, cat: 'Home', comp: 10, sup: 3 },
    { name: 'Shampoo 400ml', fa: 'شامپو ۴۰۰ میلی', bar: '6260230000010', buy: 145000, sell: 178000, stock: 10, min: 8, cat: 'Home', comp: 10, sup: 3 },
    { name: 'Orange (kg)', fa: 'پرتقال (کیلوگرم)', bar: '2000000000079', buy: 55000, sell: 75000, stock: 0, min: 12, cat: 'Produce', comp: 10, sup: 3 },
  ]
  for (const p of plist) {
    await db.product.create({
      data: {
        name: p.name, nameFa: p.fa, barcode: p.bar, buyPrice: p.buy, sellPrice: p.sell,
        stock: p.stock, minStock: p.min, category: p.cat,
        companyId: companies[p.comp].id, supplierId: suppliers[p.sup].id,
      },
    })
  }

  // ---------- HOLIDAYS (Iran 1404–1405, fixed solar + key lunar) ----------
  const holidays: [string, string][] = [
    ['2025-03-21', 'نوروز - ۱ فروردین'], ['2025-03-22', 'نوروز - ۲ فروردین'], ['2025-03-23', 'نوروز - ۳ فروردین'], ['2025-03-24', 'نوروز - ۴ فروردین'],
    ['2025-04-01', 'روز جمهوری اسلامی - ۱۲ فروردین'], ['2025-04-02', 'روز طبیعت - ۱۳ فروردین'],
    ['2025-06-04', 'رحلت امام خمینی - ۱۴ خرداد'], ['2025-06-05', 'قیام ۱۵ خرداد'],
    ['2025-09-22', 'ولادت امام علی (ع)'], ['2025-09-30', 'اربعین حسینی'], ['2025-10-08', 'رحلت رسول اکرم (ص)'],
    ['2026-01-17', 'شب یلدا (پیشنهاد تعطیلی عصر)'], ['2026-02-10', 'پیروزی انقلاب - ۲۲ بهمن'], ['2026-02-24', 'روز ملی انرژی اتمی (جشنانه)'],
    ['2026-03-11', 'روز جهانی نوروز حذف شد - عید نوروز ۱۴۰۵ پیش'], ['2026-03-20', 'روز طبیعت'],
    ['2026-03-21', 'نوروز - ۱ فروردین ۱۴۰۵'], ['2026-03-22', 'نوروز - ۲ فروردین ۱۴۰۵'], ['2026-03-23', 'نوروز - ۳ فروردین ۱۴۰۵'], ['2026-03-24', 'نوروز - ۴ فروردین ۱۴۰۵'],
    ['2025-06-15', 'عید قربان'], ['2025-06-23', 'عید غدیر خم'], ['2025-09-04', 'تاسوعای حسینی'], ['2025-09-05', 'عاشورای حسینی'],
    ['2025-11-05', 'ولادت رسول اکرم (ص)'], ['2026-01-03', 'شهادت حضرت فاطمه (س)'],
  ]
  for (const [date, title] of holidays) await db.holiday.create({ data: { date, title } }).catch(() => {})

  // ---------- SETTINGS ----------
  const settings: [string, string][] = [
    ['storeName', 'Hyper Zeytoon | هایپر زیتون'],
    ['storeNameFa', 'هایپر زیتون'],
    ['lowStockDefault', '10'],
    ['taxPercent', '9'],
    ['vatPercent', '9'],
    ['profitMinRed', '10'],
    ['profitMinYellow', '25'],
    ['holidayCheckEnabled', 'true'],
    ['minMarginPercent', '12'],
  ]
  for (const [key, value] of settings) await db.setting.create({ data: { key, value } })

  // ---------- SAMPLE ORDERS (various statuses for dashboard) ----------
  const products = await db.product.findMany()
  const byName = (n: string) => products.find((p) => p.name.startsWith(n))!
  const mkOrder = async (
    code: string, supplierId: number, status: string, daysAgo: number, items: { p: string; q: number }[], extra?: Partial<{ note: string; correction: string }>
  ) => {
    const its = items.map((i) => {
      const prod = byName(i.p)
      return { productId: prod.id, name: prod.name, barcode: prod.barcode, qty: i.q, unitCost: prod.buyPrice, sellPrice: prod.sellPrice, status: status === 'RECEIVED' || status === 'CONFIRMED' || status === 'DONE' ? 'OK' : 'PENDING', deliveredQty: ['RECEIVED', 'CONFIRMED', 'DONE'].includes(status) ? i.q : null }
    })
    const subtotal = its.reduce((s, i) => s + i.qty * i.unitCost, 0)
    const vat = Math.round(subtotal * 0.09)
    const created = new Date(Date.now() - daysAgo * 86400000)
    const o = await db.order.create({
      data: {
        code, supplierId, createdById: gm.id, status, paymentType: 'CHEQUE',
        receivingDate: new Date(created.getTime() + 86400000), subtotal, vat, total: subtotal + vat,
        createdAt: created, approvedAt: ['APPROVED', 'RECEIVED', 'CONFIRMED', 'DONE'].includes(status) ? created : null,
        receivedAt: ['RECEIVED', 'CONFIRMED', 'DONE'].includes(status) ? new Date(created.getTime() + 3600000) : null,
        confirmedAt: ['CONFIRMED', 'DONE'].includes(status) ? new Date(created.getTime() + 7200000) : null,
        doneAt: status === 'DONE' ? new Date(created.getTime() + 10800000) : null,
        note: extra?.note, correction: extra?.correction,
        items: { create: its },
        events: { create: [{ userName: 'Mrs. Lotfi (مدیر عامل)', action: 'CREATED', detail: 'سفارش ایجاد شد', createdAt: created }] },
      },
    })
    return o
  }
  await mkOrder('HZ-1001', supKalleh.id, 'DONE', 12, [{ p: 'Kalleh Milk 1L', q: 24 }, { p: 'Kalleh Chocolate', q: 36 }, { p: 'Kalleh Butter', q: 12 }])
  await mkOrder('HZ-1002', supPegah.id, 'DONE', 9, [{ p: 'Pegah Kerman Yogurt', q: 24 }, { p: 'Pegah Kerman Ice', q: 10 }])
  await mkOrder('HZ-1003', supMihan.id, 'CONFIRMED', 3, [{ p: 'Mihan Doogh', q: 24 }, { p: 'Mihan Cream', q: 12 }])
  await mkOrder('HZ-1004', supGrocery.id, 'RECEIVED', 1, [{ p: 'Tak Rice', q: 6 }, { p: 'Golha Tomato', q: 12 }, { p: 'Golha Tuna', q: 24 }], { note: 'تحویل صبح امروز' })
  await mkOrder('HZ-1005', supSnacks.id, 'APPROVED', 0, [{ p: 'Domino Biscuit', q: 48 }, { p: 'Chin Chin', q: 72 }, { p: 'Danone Danette', q: 24 }])
  await mkOrder('HZ-1006', supKalleh.id, 'SUBMITTED', 0, [{ p: 'Kalleh Cheese', q: 12 }, { p: 'Kalleh Salami', q: 10 }, { p: 'Kalleh Sausage', q: 12 }])
  await mkOrder('HZ-1007', supGrocery.id, 'DRAFT', 0, [{ p: 'Sadaf Rice', q: 5 }, { p: 'Osta Sunflower', q: 12 }, { p: 'Sugar', q: 24 }], { note: 'پیش‌نویس سفارش هفتگی' })

  // ---------- CHEQUES ----------
  const doneOrders = await db.order.findMany({ where: { status: 'DONE' }, take: 2 })
  if (doneOrders[0]) await db.cheque.create({
    data: { orderId: doneOrders[0].id, purpose: 'ORDER', amount: doneOrders[0].total, dueDate: new Date(Date.now() + 20 * 86400000), status: 'SIGNED', recipientName: 'Mr. Hosseini (Kalleh Rep)', recipientPhone: '0913-111-0001', createdById: gm.id, writtenAt: new Date(), signedAt: new Date() },
  })
  if (doneOrders[1]) await db.cheque.create({
    data: { orderId: doneOrders[1].id, purpose: 'ORDER', amount: doneOrders[1].total, dueDate: new Date(Date.now() + 45 * 86400000), status: 'PENDING_APPROVAL', createdById: gm.id },
  })
  await db.cheque.create({ data: { purpose: 'OTHER', amount: 15000000, dueDate: new Date(Date.now() + 10 * 86400000), status: 'APPROVED', note: 'Rent — Building A', createdById: gm.id } })

  // ---------- TASKS ----------
  await db.task.createMany({
    data: [
      { title: 'شمارش انبار لبنیات (Dairy count)', description: 'Full count of dairy walk-in before Thursday delivery', priority: 'HIGH', status: 'OPEN', assignedToId: inv.id, createdById: gm.id, dueDate: new Date(Date.now() + 86400000) },
      { title: 'چیدمان قفسه تن‌ماهی (Tuna shelf reset)', description: 'New planogram v2 — golha tuna front facing', priority: 'MEDIUM', status: 'IN_PROGRESS', assignedToId: users[12].id, createdById: om.id },
      { title: 'بازبینی تاریخ انقضا یخچال ۳ (Expiry audit fridge 3)', priority: 'URGENT', status: 'OPEN', assignedToId: users[6].id, createdById: gm.id, dueDate: new Date() },
      { title: 'آموزش صندوق جدید (Train new cashier)', description: 'SOP-03 walkthrough + refund policy', priority: 'MEDIUM', status: 'PAUSED', pauseReason: 'بیمار بودم — I was sick', assignedToId: users[8].id, createdById: owner.id },
      { title: 'گزارش فروش هفتگی (Weekly sales report)', priority: 'LOW', status: 'OPEN', assignedToId: acc.id, createdById: owner.id, dueDate: new Date(Date.now() + 3 * 86400000) },
    ],
  })

  // ---------- SOPs ----------
  await db.sOP.createMany({
    data: [
      {
        title: 'پذیرش تحویل کالا (Receiving a Delivery)', department: 'WAREHOUSE',
        steps: JSON.stringify([
          'فاکتور سفارش قبلی را از سیستم چاپ/باز کنید — Open today\'s expected orders in the platform (Deliveries section).',
          'کالاها را از ماشین تخلیه کنید و با فهرست مطابقت دهید — Unload and match against the order list.',
          'برای هر قلم: تعداد تحویلی را وارد کنید — For each item, enter the delivered quantity.',
          'بارکد را اسکن کنید تا تایید شود — Scan the barcode to confirm the item.',
          'قیمت چاپ‌شده روی کالا را با قیمت سیستم مقایسه کنید — Compare printed price with system price; correct if different.',
          'اقلام ناقص/مردود را علامت بزنید (MISSING / REJECTED) — Mark missing or rejected items with reason.',
          'جمع فاکتور را بازبینی و تحویل را ثبت کنید — Review recalculated totals and submit; system notifies supervisor + accountant.',
        ]),
        createdById: om.id,
      },
      {
        title: 'باز کردن صندوق (Opening the Register)', department: 'CASHIER',
        steps: JSON.stringify([
          'فلوتی اولیه را بشمارید و در سیستم ثبت کنید — Count and record opening float.',
          'دستگاه POS را روشن و تست کنید — Turn on POS terminal and test with a small charge/refund.',
          'موجودی برگه‌های رسید را چک کنید — Check receipt paper roll.',
          'گزارش روز قبل را مرور کنید — Review yesterday\'s closing summary.',
        ]),
        createdById: headCashier.id,
      },
      {
        title: 'چیدمان قفسه بر اساس پلانوگرام (Shelf stocking per planogram)', department: 'MERCHANDISING',
        steps: JSON.stringify([
          'پلانوگرام امروز را در بخش Planogram باز کنید — Open today\'s published planogram.',
          'درخواست برداشت از انبار را ثبت کنید — Submit warehouse request for needed quantities.',
          'کالاها را با اولویت FEFO (زودتر انقضا، جلوتر) بچینید — Stock FEFO: earliest expiry at front.',
          'قفسه خالی را با کالای جایگزین هم‌گروه پر کنید — Fill gaps with substitute items from same category.',
          'قفسه را تمیز و برچسب‌ها را مرتب کنید — Clean shelf and align price tags.',
          'عکس نهایی را در بخش تسک بارگذاری/تایید کنید — Mark task done with final photo.',
        ]),
        createdById: pm.id,
      },
      {
        title: 'پذیرش و راهنمایی مشتری (Customer greeting & guidance)', department: 'SALES',
        steps: JSON.stringify([
          'سلام گرم و لبخند — Warm greeting with smile.',
          'نیاز مشتری را بپرسید، راهنمایی کنید — Ask need, guide to the aisle.',
          'اگر کالا موجود نبود: در «درخواست مشتری» ثبت کنید — If out of stock: log it in Customer Requests (counts toward ordering).',
          'برای مشتریان وفادار: پیشنهاد مکمل بدهید — Suggest complementary products for loyal customers.',
        ]),
        createdById: gm.id,
      },
    ],
  })

  // ---------- WALL / IDEAS / FEEDBACK / NOTES ----------
  await db.wallPost.createMany({
    data: [
      { userId: om.id, content: 'امروز مرج تحویل کاله ساعت ۷:۳۰ رسید — از تیم صبح ممنون که سریع تخلیه کردند 👏', pinned: true },
      { userId: users[6].id, content: 'یادآوری: یخچال شماره ۲ سرویس شد، لبنیات موقتاً از یخچال ۴ بردارید.', },
      { userId: users[10].id, content: 'مشتری‌ها دنبال شیر بادام‌زمینی بودند؛ در بخش درخواست مشتری ثبت کردم.' },
      { userId: acc.id, content: 'فاکتورهای این هفته تا ساعت ۱۴ ثبت شد. عالی بود!' },
    ],
  })
  await db.idea.createMany({
    data: [
      { userId: users[10].id, title: 'پیشنهاد بسته‌بندی ترکیبی (Combo pack)', content: 'پسته کرمان + چای کیسه‌ای به عنوان هدیه — فروش بالاتر می‌رود', status: 'REVIEWING' },
      { userId: users[6].id, title: 'چیدمان صبحگاهی لبنیات', content: 'قبل از ساعت ۸ صبح لبنیات چیده شود که فوری در دسترس باشد', status: 'ACCEPTED', decision: 'Great idea — scheduling morning shift earlier', decidedAt: new Date() },
    ],
  })
  await db.feedback.createMany({
    data: [
      { content: 'پلتفرم خیلی کمک کرد ولی اگه روی گوشی سریع‌تر باز بشه عالیه', rating: 4 },
      { content: 'لطفا بخش تسک‌ها رنگ‌بندی واضح‌تری داشته باشد', rating: 4 },
      { content: 'عالی که ثبت فعالیت‌ها امتیاز دارد، حس خوبی میدهد', rating: 5 },
    ],
  })
  await db.personalNote.createMany({
    data: [
      { userId: users[6].id, title: 'یادآوری فردا', content: 'قبل از تحویل پگاه، دماسنج یخچال را چک کن — ۴ درجه' },
      { userId: inv.id, title: 'List for Thursday', content: 'Count sausages first, they arrive 7:15' },
    ],
  })

  // ---------- POINTS ----------
  await db.pointsLog.createMany({
    data: [
      { userId: users[6].id, points: 15, reason: 'تحویل کامل و بدون خطا — Flawless morning deliveries', awardedById: gm.id },
      { userId: inv.id, points: 10, reason: 'تشخیص قیمت مغایر در فاکتور گلها', awardedById: om.id },
      { userId: users[10].id, points: 8, reason: 'ثبت ۶ درخواست مشتری برای محصولات جدید' },
      { userId: users[12].id, points: 6, reason: 'چیدمان کامل قفسه نوشیدنی' },
    ],
  })

  // ---------- WAREHOUSE / CUSTOMER REQUESTS ----------
  await db.warehouseRequest.createMany({
    data: [
      { productId: byName('Mihan Doogh').id, qty: 12, requestedById: users[12].id, status: 'OPEN' },
      { productId: byName('Kalleh Milk 500ml').id, qty: 24, requestedById: users[13].id, status: 'PREPARED', preparedAt: new Date() },
    ],
  })
  await db.customerRequest.createMany({
    data: [
      { name: 'Peanut Milk 250ml (شیر بادام‌زمینی)', count: 4, requestedById: users[10].id },
      { name: 'Gluten-free bread (نان بدون گلوتن)', count: 2, requestedById: users[6].id },
    ],
  })

  // ---------- CUSTOMERS + PREORDERS ----------
  const cust = await db.customer.create({ data: { name: 'Mrs. Ahmadi', phone: '0913-222-3344', preference: 'لبنیات کم‌چرب، پسته درجه یک', createdById: users[10].id } })
  await db.preOrder.create({
    data: { customerId: cust.id, customerName: cust.name, salespersonId: users[10].id, status: 'PENDING', total: byName('Kalleh Milk 1L').sellPrice * 2 + byName('Pistachio Kerman 500g').sellPrice, items: JSON.stringify([
      { productId: byName('Kalleh Milk 1L').id, name: byName('Kalleh Milk 1L').name, qty: 2, sellPrice: byName('Kalleh Milk 1L').sellPrice },
      { productId: byName('Pistachio Kerman 500g').id, name: byName('Pistachio Kerman 500g').name, qty: 1, sellPrice: byName('Pistachio Kerman 500g').sellPrice },
    ]), note: 'آماده‌سازی قبل از ساعت ۱۸ — مشتری وفادار' },
  })

  // ---------- PLANOGRAM ----------
  const drinkIds = [byName('Sunich Apple Juice').id, byName('Mihan Doogh').id, byName('Mahram Vinegar').id]
  const dairyIds = [byName('Kalleh Milk 1L').id, byName('Kalleh Chocolate Milk 250ml').id, byName('Mihan Cream').id]
  await db.planogram.createMany({
    data: [
      { name: 'Refrigerated Dairy — Fridge 2', status: 'PUBLISHED', assignedToId: users[6].id, createdById: pm.id, publishedAt: new Date(), layout: JSON.stringify({ shelves: [{ label: 'Shelf 1 (Eye level)', slots: dairyIds.map((id) => ({ productId: id, facing: 6 })) }, { label: 'Shelf 2', slots: dairyIds.slice(0, 2).map((id) => ({ productId: id, facing: 4 })) }] }) },
      { name: 'Beverages Aisle — Shelf A', status: 'DRAFT', createdById: pm.id, layout: JSON.stringify({ shelves: [{ label: 'Row 1', slots: drinkIds.map((id) => ({ productId: id, facing: 5 })) }] }) },
    ],
  })

  // ---------- NOTIFICATIONS ----------
  await db.notification.createMany({
    data: [
      { userId: acc.id, title: 'سفارش جدید تایید شد', body: 'Order HZ-1005 approved — waiting for delivery', type: 'INFO' },
      { userId: inv.id, title: 'تحویل امروز', body: 'HZ-1004 از Zeytoon Grocery Wholesale امروز صبح تحویل داده می‌شود', type: 'INFO' },
      { userId: owner.id, title: 'چک در انتظار امضا', body: 'یک چک جدید برای تأیید و امضا آماده است (Pegah Kerman)', type: 'WARNING' },
      { userId: gm.id, title: 'موجودی بحرانی', body: 'Pegah Kerman Ice Cream 500ml زیر حد مجاز است', type: 'WARNING' },
    ],
  })

  console.log('✅ Seed complete:', {
    users: users.length, companies: companies.length, suppliers: suppliers.length,
    products: plist.length, holidays: holidays.length,
  })
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
