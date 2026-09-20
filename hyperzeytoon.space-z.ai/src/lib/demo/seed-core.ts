/**
 * Hyper Zeytoon — seed script
 * Run: bun run scripts/seed.ts
 * Idempotent: wipes tables then re-seeds a rich realistic dataset.
 */
import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'
import { addDays } from '../jalali'



function hashPin(pin: string) {
  return createHash('sha256').update(`hz:${pin}`).digest('hex')
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export async function seedRealData(db: PrismaClient) {
  console.log('🌱 Seeding real Hyper Zeytoon data...')

  // wipe (order matters for FKs)
  await db.$transaction([
    db.message.deleteMany(), db.conversationParticipant.deleteMany(), db.conversation.deleteMany(),
    db.notification.deleteMany(), db.activityLog.deleteMany(), db.settings.deleteMany(),
    db.holiday.deleteMany(), db.award.deleteMany(),
    db.customerOrder.deleteMany(), db.customer.deleteMany(),
    db.checklistRun.deleteMany(), db.checklist.deleteMany(), db.sOP.deleteMany(),
    db.taskUpdate.deleteMany(), db.task.deleteMany(),
    db.feedbackPost.deleteMany(), db.ideaPost.deleteMany(), db.personalNote.deleteMany(), db.wallPost.deleteMany(),
    db.stockCountItem.deleteMany(), db.stockCount.deleteMany(),
    db.productSale.deleteMany(), db.stockRequestOut.deleteMany(), db.warehouseRequest.deleteMany(),
    db.productSuggestion.deleteMany(), db.shelf.deleteMany(),
    db.cheque.deleteMany(), db.payment.deleteMany(),
    db.orderHistory.deleteMany(), db.orderItem.deleteMany(), db.order.deleteMany(),
    db.providerCompany.deleteMany(), db.provider.deleteMany(), db.company.deleteMany(),
    db.barcode.deleteMany(), db.product.deleteMany(),
    db.userRole.deleteMany(), db.role.deleteMany(), db.user.deleteMany(),
  ])

  // ---------- Roles ----------
  const roleDefs = [
    { key: 'owner', name: 'مالک', color: '#7D5BA6', isManager: true, description: 'آقای جواد نوروزی' },
    { key: 'gm', name: 'مدیر کل', color: '#3E7C59', isManager: true, description: 'مدیریت کل فروشگاه' },
    { key: 'om', name: 'مدیر عملیات', color: '#2E6E8E', isManager: true, description: 'مدیریت عملیات و فرایندها' },
    { key: 'pm', name: 'مدیر محصول', color: '#B07D2B', isManager: true, description: 'مدیریت انبار و چیدمان' },
    { key: 'accountant', name: 'حسابدار ارشد', color: '#8A3B5C', isManager: true, description: 'حسابداری و هولو' },
    { key: 'inventory', name: 'سرپرست انبار', color: '#5E8C61', isManager: true, description: 'انباردار' },
    { key: 'delivery', name: 'تحویل‌گیرنده', color: '#6B8E23', isManager: false, description: 'دریافت توزیع‌ها' },
    { key: 'cashier', name: 'صندوق‌دار', color: '#C9A227', isManager: false, description: 'صندوق' },
    { key: 'sales', name: 'فروشنده', color: '#C96F27', isManager: false, description: 'فروش و مشاوره' },
    { key: 'merchandiser', name: 'چیدمان‌کار (مرچندایزر)', color: '#4C7A34', isManager: false, description: 'چیدمان قفسه‌ها' },
    { key: 'marketing', name: 'مدیر بازاریابی', color: '#A34A7D', isManager: true, description: 'بازاریابی، تبلیغات و روابط عمومی' },
    { key: 'it_admin', name: 'مدیر فناوری اطلاعات', color: '#444A54', isManager: true, description: 'مدیریت پلتفرم' },
  ]
  const roles: Record<string, string> = {}
  for (const r of roleDefs) {
    const created = await db.role.create({ data: r })
    roles[r.key] = created.id
  }

  // ---------- Users ----------
  const userDefs: { username: string; name: string; title: string; color: string; roles: string[]; gender: 'MALE' | 'FEMALE'; isRoot?: boolean }[] = [
    { username: 'j.norouzi', name: 'جواد نوروزی', title: 'مالک', color: '#7D5BA6', roles: ['owner'], gender: 'MALE' },
    { username: 'z.lotfi', name: 'زهرا لطفی', title: 'مدیر کل', color: '#3E7C59', roles: ['gm'], gender: 'FEMALE' },
    { username: 'k.safapour', name: 'کیانوش صفاپور', title: 'مدیر عملیات / مدیر فناوری اطلاعات', color: '#2E6E8E', roles: ['om', 'it_admin'], gender: 'MALE', isRoot: true },
    { username: 'root.backup', name: 'حساب پشتیبان مدیریتی', title: 'مدیر ارشد سامانه (پشتیبان)', color: '#37474F', roles: ['it_admin'], gender: 'MALE', isRoot: true },
    { username: 's.norouzi', name: 'سارا نوروزی', title: 'مدیر محصول', color: '#B07D2B', roles: ['pm'], gender: 'FEMALE' },
    { username: 'm.darvishi', name: 'مریم درویشی', title: 'حسابدار ارشد', color: '#8A3B5C', roles: ['accountant'], gender: 'FEMALE' },
    { username: 'a.mohammadi', name: 'علیرضا محمدی', title: 'سرپرست انبار', color: '#5E8C61', roles: ['inventory'], gender: 'MALE' },
    { username: 'm.irannejhad', name: 'مینا ایران‌نژاد', title: 'مرچندایزر ارشد / تحویل‌گیرنده', color: '#6B8E23', roles: ['delivery', 'merchandiser', 'sales'], gender: 'FEMALE' },
    { username: 'f.mohammadi', name: 'فاطمه محمدی', title: 'سرصندوق‌دار', color: '#C9A227', roles: ['cashier'], gender: 'FEMALE' },
    { username: 'h.sharifi', name: 'حسینیه شریفی', title: 'صندوق‌دار ارشد', color: '#C9A227', roles: ['cashier'], gender: 'FEMALE' },
    { username: 'n.arabnejhad', name: 'نرگس عرب‌نژاد', title: 'صندوق‌دار', color: '#C9A227', roles: ['cashier'], gender: 'FEMALE' },
    { username: 's.yadegari', name: 'سمیرا یادگاری', title: 'فروشنده', color: '#C96F27', roles: ['sales'], gender: 'FEMALE' },
    { username: 'e.saadi', name: 'الهام سعدی', title: 'مرچندایزر / فروشنده', color: '#4C7A34', roles: ['merchandiser', 'sales'], gender: 'FEMALE' },
    { username: 'z.gholamhoseini', name: 'زهرا غلامحسینی', title: 'مرچندایزر', color: '#4C7A34', roles: ['merchandiser'], gender: 'FEMALE' },
    { username: 'm.mirzaiee', name: 'مریه میرزایی', title: 'مرچندایزر', color: '#4C7A34', roles: ['merchandiser'], gender: 'FEMALE' },
    { username: 'm.taghizadeh', name: 'مهناز تقی‌زاده', title: 'مرچندایزر', color: '#4C7A34', roles: ['merchandiser'], gender: 'FEMALE' },
    { username: 'h.alikhani', name: 'حسین علیخانی', title: 'مرچندایزر', color: '#4C7A34', roles: ['merchandiser'], gender: 'MALE' },
  ]
  const users: Record<string, string> = {}
  for (const u of userDefs) {
    const created = await db.user.create({
      data: {
        username: u.username,
        pin: hashPin('1234'),
        name: u.name,
        title: u.title,
        gender: u.gender,
        color: u.color,
        active: true,
        isRoot: u.isRoot === true,
        points: Math.floor(Math.random() * 40) + 60,
        roles: { create: u.roles.map((rk) => ({ roleId: roles[rk] })) },
      },
    })
    users[u.username] = created.id
  }
  const U = users

  // ---------- Companies & Providers ----------
  const companyDefs = [
    { name: 'صنایع شیر ایران (پگاه)', kind: 'MANUFACTURER' },
    { name: 'کاله', kind: 'MANUFACTURER' },
    { name: 'میهن لبنیات', kind: 'MANUFACTURER' },
    { name: 'گلها', kind: 'MANUFACTURER' },
    { name: 'زر ماکارون', kind: 'MANUFACTURER' },
    { name: 'مهرام', kind: 'MANUFACTURER' },
    { name: 'چین‌چین', kind: 'MANUFACTURER' },
    { name: 'نوش بی‌نظیر (زمزم)', kind: 'MANUFACTURER' },
    { name: 'مرکز توزیع جنوبشرق', kind: 'DISTRIBUTION_CENTER' },
    { name: 'بازرگانی البرز', kind: 'DISTRIBUTION_CENTER' },
    { name: 'دامداران و کشت و صنعت', kind: 'MANUFACTURER' },
    { name: 'گلرنگ', kind: 'MANUFACTURER' },
  ]
  const companies: Record<string, string> = {}
  for (const c of companyDefs) {
    const created = await db.company.create({ data: c })
    companies[c.name] = created.id
  }

  const providerDefs: { name: string; phone: string; kind: string; companies: string[]; paymentTermsDays?: number; city?: string; province?: string }[] = [
    { name: 'پخش پگاه کرمان', phone: '۰۹۱۳۳۴۱۲۲۳۳', paymentTermsDays: 30, city: 'کرمان', province: 'کرمان', kind: 'DISTRIBUTOR', companies: ['صنایع شیر ایران (پگاه)'] },
    { name: 'پخش کاله جنوبشرق', phone: '۰۹۱۳۳۴۵۶۷۸۹', paymentTermsDays: 45, city: 'کرمان', province: 'کرمان', kind: 'DISTRIBUTOR', companies: ['کاله'] },
    { name: 'پخش میهن کرمان', phone: '۰۹۱۲۵۶۷۸۹۰۱', paymentTermsDays: 30, city: 'کرمان', province: 'کرمان', kind: 'DISTRIBUTOR', companies: ['میهن لبنیات'] },
    { name: 'بازرگانی رضایی (گلها)', phone: '۰۹۱۳۱۱۲۲۳۳۴', paymentTermsDays: 20, city: 'کرمان', province: 'کرمان', kind: 'DIRECT', companies: ['گلها'] },
    { name: 'پخش زر کرمان', phone: '۰۹۱۳۴۵۶۷۸۹۰', paymentTermsDays: 45, city: 'کرمان', province: 'کرمان', kind: 'DISTRIBUTOR', companies: ['زر ماکارون'] },
    { name: 'پخش مهرام جنوب', phone: '۰۹۱۵۱۲۳۴۵۶۷', paymentTermsDays: 30, city: 'زاهدان', province: 'سیستان و بلوچستان', kind: 'DISTRIBUTOR', companies: ['مهرام'] },
    { name: 'عوامل چین‌چین کرمان', phone: '۰۹۱۳۲۲۳۳۴۴۵', paymentTermsDays: 25, city: 'کرمان', province: 'کرمان', kind: 'DISTRIBUTOR', companies: ['چین‌چین'] },
    { name: 'توزیع زمزم کرمان', phone: '۰۹۱۳۸۸۷۷۶۶۵', paymentTermsDays: 30, city: 'کرمان', province: 'کرمان', kind: 'DISTRIBUTOR', companies: ['نوش بی‌نظیر (زمزم)'] },
    { name: 'مرکز توزیع جنوبشرق', phone: '۰۳۴۳۲۴۵۶۷۸۹', paymentTermsDays: 60, city: 'کرمان', province: 'کرمان', kind: 'DISTRIBUTOR', companies: ['دامداران و کشت و صنعت', 'گلرنگ', 'زر ماکارون'] },
    { name: 'بازرگانی البرز (چند برند)', phone: '۰۲۱۵۵۴۴۳۳۲۲', paymentTermsDays: 45, city: 'تهران', province: 'تهران', kind: 'DISTRIBUTOR', companies: ['گلها', 'مهرام', 'گلرنگ', 'چین‌چین'] },
  ]
  const providers: Record<string, string> = {}
  for (const p of providerDefs) {
    const created = await db.provider.create({
      data: { name: p.name, phone: p.phone, kind: p.kind, paymentTermsDays: p.paymentTermsDays ?? null, city: p.city ?? null, province: p.province ?? null },
    })
    providers[p.name] = created.id
    await db.providerCompany.createMany({
      data: p.companies.map((cn) => ({
        providerId: created.id,
        companyId: companies[cn],
        isDirect: p.kind === 'DIRECT',
      })),
    })
  }

  // ---------- Products ----------
  type P = { name: string; cat: string; brand: string; unit: string; sell: number; buy: number; stock: number; min: number; bc: string }
  const productDefs: P[] = [
    { name: 'شیر پرچرب پگاه ۱ لیتری', cat: 'لبنیات', brand: 'پگاه', unit: 'عدد', sell: 38000, buy: 32000, stock: 48, min: 24, bc: '6260111234501' },
    { name: 'شیر کم‌چرب پگاه ۵۰۰ میلی', cat: 'لبنیات', brand: 'پگاه', unit: 'عدد', sell: 21000, buy: 17500, stock: 12, min: 20, bc: '6260111234502' },
    { name: 'شیر شکلات ۲/۵٪ پگاه ۲/۵ لیتری', cat: 'لبنیات', brand: 'پگاه', unit: 'عدد', sell: 92000, buy: 78000, stock: 9, min: 8, bc: '6260111234503' },
    { name: 'ماست کم‌چرب کاله ۹۰۰ گرمی', cat: 'لبنیات', brand: 'کاله', unit: 'عدد', sell: 65000, buy: 54000, stock: 30, min: 12, bc: '6260222345601' },
    { name: 'ماست موسیر کاله ۴۰۰ گرمی', cat: 'لبنیات', brand: 'کاله', unit: 'عدد', sell: 42000, buy: 34000, stock: 5, min: 10, bc: '6260222345602' },
    { name: 'پنیر لیقوان کاله ۴۰۰ گرمی', cat: 'لبنیات', brand: 'کاله', unit: 'عدد', sell: 89000, buy: 74000, stock: 22, min: 10, bc: '6260222345603' },
    { name: 'دوغ کاله ۱.۵ لیتری', cat: 'لبنیات', brand: 'کاله', unit: 'عدد', sell: 33000, buy: 27000, stock: 0, min: 12, bc: '6260222345604' },
    { name: 'کره حیوانی میهن ۱۰۰ گرمی', cat: 'لبنیات', brand: 'میهن', unit: 'عدد', sell: 48000, buy: 39000, stock: 26, min: 12, bc: '6260333456701' },
    { name: 'پنیر خامه‌ای میهن ۲۰۰ گرمی', cat: 'لبنیات', brand: 'میهن', unit: 'عدد', sell: 54000, buy: 44000, stock: 18, min: 10, bc: '6260333456702' },
    { name: 'سوسیس کوکتل مهرام ۵۰۰ گرمی', cat: 'گوشت و سوسیس', brand: 'مهرام', unit: 'بسته', sell: 145000, buy: 122000, stock: 15, min: 8, bc: '6260444567801' },
    { name: 'سوسیس فرانکفورتر مهرام ۷۰۰ گرمی', cat: 'گوشت و سوسیس', brand: 'مهرام', unit: 'بسته', sell: 210000, buy: 178000, stock: 7, min: 6, bc: '6260444567802' },
    { name: 'کالباس آلمانی مهرام ۵۰۰ گرمی', cat: 'گوشت و سوسیس', brand: 'مهرام', unit: 'عدد', sell: 185000, buy: 155000, stock: 4, min: 8, bc: '6260444567803' },
    { name: 'ناگت مرغ مهرام ۹۰۰ گرمی', cat: 'گوشت و سوسیس', brand: 'مهرام', unit: 'بسته', sell: 235000, buy: 198000, stock: 11, min: 6, bc: '6260444567804' },
    { name: 'برنج طارم اعلا زر ۱۰ کیلویی', cat: 'برنج و حبوبات', brand: 'زر', unit: 'کیلو', sell: 1250000, buy: 1080000, stock: 14, min: 6, bc: '6260555678901' },
    { name: 'برنج هاشمی درجه یک ۵ کیلویی', cat: 'برنج و حبوبات', brand: 'زر', unit: 'کیلو', sell: 980000, buy: 840000, stock: 8, min: 5, bc: '6260555678902' },
    { name: 'ماکارونی فرمی زر ۵۰۰ گرمی', cat: 'برنج و حبوبات', brand: 'زر', unit: 'بسته', sell: 38000, buy: 30000, stock: 60, min: 24, bc: '6260555678903' },
    { name: 'روغن سرخ‌کردنی گلرنگ ۱.۸ لیتری', cat: 'خواربار', brand: 'گلرنگ', unit: 'عدد', sell: 285000, buy: 242000, stock: 20, min: 10, bc: '6260666789001' },
    { name: 'روغن مایع گلرنگ ۸۰۰ میلی', cat: 'خواربار', brand: 'گلرنگ', unit: 'عدد', sell: 132000, buy: 112000, stock: 3, min: 12, bc: '6260666789002' },
    { name: 'رب گوجه‌فرنگی چین‌چین ۸۰۰ گرمی', cat: 'خواربار', brand: 'چین‌چین', unit: 'قوطی', sell: 98000, buy: 82000, stock: 25, min: 10, bc: '6260777890101' },
    { name: 'کنسرو لوبیا چیتو چین‌چین', cat: 'خواربار', brand: 'چین‌چین', unit: 'قوطی', sell: 68000, buy: 55000, stock: 32, min: 12, bc: '6260777890102' },
    { name: 'تن ماهی تنِ چین‌چین ۱۸۰ گرمی', cat: 'خواربار', brand: 'چین‌چین', unit: 'قوطی', sell: 155000, buy: 130000, stock: 2, min: 15, bc: '6260777890103' },
    { name: 'نوشابه زمزم ۱.۵ لیتری', cat: 'نوشیدنی', brand: 'زمزم', unit: 'بطری', sell: 42000, buy: 34000, stock: 72, min: 24, bc: '6260888901201' },
    { name: 'دلستر پرتقال زمزم ۱.۵ لیتری', cat: 'نوشیدنی', brand: 'زمزم', unit: 'بطری', sell: 55000, buy: 45000, stock: 18, min: 12, bc: '6260888901202' },
    { name: 'آب معدنی زمزم ۱.۵ لیتری', cat: 'نوشیدنی', brand: 'زمزم', unit: 'بطری', sell: 16000, buy: 11000, stock: 120, min: 48, bc: '6260888901203' },
    { name: 'آبمیوه مخصوص گلها ۱ لیتری', cat: 'نوشیدنی', brand: 'گلها', unit: 'عدد', sell: 118000, buy: 98000, stock: 16, min: 8, bc: '6260999012301' },
    { name: 'شربت آلبالو گلها ۱.۵ لیتری', cat: 'نوشیدنی', brand: 'گلها', unit: 'عدد', sell: 96000, buy: 79000, stock: 10, min: 6, bc: '6260999012302' },
    { name: 'بیسکویت ساقه طلایی', cat: 'تنقلات', brand: 'گلها', unit: 'بسته', sell: 22000, buy: 17000, stock: 90, min: 36, bc: '6261000123401' },
    { name: 'ویفر شکلاتی مخصوص', cat: 'تنقلات', brand: 'گلها', unit: 'بسته', sell: 35000, buy: 28000, stock: 40, min: 20, bc: '6261000123402' },
    { name: 'چیپس نمکی چی‌توز', cat: 'تنقلات', brand: 'چین‌چین', unit: 'بسته', sell: 30000, buy: 24000, stock: 55, min: 24, bc: '6261101234501' },
    { name: 'پفک نمکی مینو', cat: 'تنقلات', brand: 'چین‌چین', unit: 'بسته', sell: 18000, buy: 14000, stock: 6, min: 24, bc: '6261101234502' },
    { name: 'شکلات شیری ترمه', cat: 'تنقلات', brand: 'گلها', unit: 'عدد', sell: 25000, buy: 19000, stock: 35, min: 15, bc: '6261202345601' },
    { name: 'مایع ظرفشویی گلرنگ ۳.۵ لیتری', cat: 'شوینده', brand: 'گلرنگ', unit: 'عدد', sell: 165000, buy: 138000, stock: 14, min: 8, bc: '6261303456701' },
    { name: 'پودر لباسشویی گلرنگ ۴ کیلویی', cat: 'شوینده', brand: 'گلرنگ', unit: 'عدد', sell: 420000, buy: 360000, stock: 9, min: 5, bc: '6261303456702' },
    { name: 'جاسمین دستمال کاغذی ۳۰۰ برگ', cat: 'شوینده', brand: 'گلرنگ', unit: 'بسته', sell: 85000, buy: 68000, stock: 28, min: 12, bc: '6261303456703' },
    { name: 'اسپری خوشبوکننده هوا', cat: 'شوینده', brand: 'گلرنگ', unit: 'عدد', sell: 96000, buy: 78000, stock: 1, min: 6, bc: '6261303456704' },
    { name: 'تخم مرغ بسته ۹ عددی', cat: 'پروتئین', brand: 'دامداران', unit: 'شانه', sell: 195000, buy: 168000, stock: 20, min: 10, bc: '6261404567801' },
    { name: 'تخم مرغ بسته ۳۰ عددی', cat: 'پروتئین', brand: 'دامداران', unit: 'شانه', sell: 590000, buy: 510000, stock: 6, min: 6, bc: '6261404567802' },
    { name: 'عسل طبیعی زعفرانی کرمان ۹۰۰ گرمی', cat: 'محصولات کرمان', brand: 'محلی', unit: 'شیشه', sell: 890000, buy: 720000, stock: 12, min: 4, bc: '6261505678901' },
    { name: 'پسته خندق اکبری ۵۰۰ گرمی', cat: 'محصولات کرمان', brand: 'محلی', unit: 'بسته', sell: 1450000, buy: 1250000, stock: 8, min: 3, bc: '6261505678902' },
    { name: 'خرمای موجت کرمان ۷۰۰ گرمی', cat: 'محصولات کرمان', brand: 'محلی', unit: 'بسته', sell: 320000, buy: 260000, stock: 18, min: 6, bc: '6261505678903' },
    { name: 'زعفران سرگل قائنات ۴.۶ گرمی', cat: 'محصولات کرمان', brand: 'محلی', unit: 'بسته', sell: 680000, buy: 560000, stock: 15, min: 5, bc: '6261505678904' },
    { name: 'شامپو بدن سبزه', cat: 'بهداشت شخصی', brand: 'گلرنگ', unit: 'عدد', sell: 128000, buy: 104000, stock: 22, min: 8, bc: '6261606789001' },
    { name: 'خمیردندان سینرساید', cat: 'بهداشت شخصی', brand: 'گلرنگ', unit: 'عدد', sell: 98000, buy: 79000, stock: 30, min: 12, bc: '6261606789002' },
    { name: 'آبلیموی طبیعی گلها', cat: 'خواربار', brand: 'گلها', unit: 'بطری', sell: 78000, buy: 63000, stock: 13, min: 6, bc: '6261707890101' },
  ]
  const products: Record<string, string> = {}
  for (const p of productDefs) {
    const created = await db.product.create({
      data: {
        name: p.name, category: p.cat, brand: p.brand, unit: p.unit,
        sellPrice: p.sell, buyPrice: p.buy, stock: p.stock, minStock: p.min,
        capacity: Math.max(12, p.min * 3),
        barcodes: { create: { code: p.bc, isPrimary: true } },
      },
    })
    products[p.name] = created.id
  }

  // 45 days of sales history
  for (const p of productDefs) {
    for (let d = 1; d <= 45; d++) {
      if (Math.random() < 0.55) continue
      const qty = Math.floor(Math.random() * 8) + 1
      await db.productSale.create({
        data: {
          productId: products[p.name],
          qty,
          amount: qty * p.sell,
          date: addDays(new Date(), -d),
        },
      })
    }
  }

  // ---------- Holidays ----------
  const fixed1404 = [
    ['2026-03-21', 'نوروز'], ['2026-03-22', 'عید نوروز'], ['2026-03-23', 'عید نوروز'], ['2026-03-24', 'عید نوروز'],
    ['2026-04-01', 'روز جمهوری اسلامی'], ['2026-04-02', 'سیزده بدر'],
    ['2026-06-04', 'رحلت امام خمینی'], ['2026-06-05', 'قیام ۱۵ خرداد'],
    ['2027-02-11', 'پیروزی انقلاب اسلامی'], ['2026-03-19', 'ملی شدن صنعت نفت'],
  ] as const
  const lunar = [
    ['2025-06-15', 'عید قربان'], ['2025-06-23', 'عید غدیر خم'], ['2025-07-13', 'تاسوعای حسینی'],
    ['2025-07-14', 'عاشورای حسینی'], ['2025-08-23', 'اربعین حسینی'], ['2025-09-01', 'رحلت رسول اکرم'],
    ['2025-09-09', 'شهادت امام رضا'], ['2025-09-26', 'ولادت رسول اکرم'], ['2025-11-04', 'شهادت حضرت فاطمه'],
    ['2026-01-13', 'نیمه شعبان'], ['2026-02-19', 'شهادت امام علی'], ['2026-03-01', 'عید فطر'], ['2026-03-02', 'تعطیل عید فطر'],
  ] as const
  for (const [date, name] of [...fixed1404, ...lunar]) {
    await db.holiday.create({ data: { date, name, source: 'SEED' } })
  }

  // ---------- Orders ----------
  const tomorrow = addDays(new Date(), 1)
  const nextWeek = addDays(new Date(), 6)
  const threeDaysAgo = addDays(new Date(), -3)
  const yesterday = addDays(new Date(), -1)

  async function makeOrder(opts: {
    code: string; provider: string; company?: string; status: string; paymentType?: string
    receiving: Date; createdById: string; items: { name: string; qty: number; price?: number }[]
    locked?: boolean; history?: { action: string; detail: string; userName: string; userId: string }[]
  }) {
    const prov = providerDefs.find((p) => p.name === opts.provider)!
    const itemsTotal = opts.items.reduce((s, i) => s + i.qty * (i.price ?? 30000), 0)
    const vat = Math.round(itemsTotal * 0.09)
    const order = await db.order.create({
      data: {
        code: opts.code,
        providerId: providers[opts.provider],
        companyId: opts.company ? companies[opts.company] : null,
        providerName: opts.provider,
        companyName: opts.company ?? null,
        createdById: opts.createdById,
        status: opts.status,
        paymentType: opts.paymentType ?? 'CHEQUE',
        receivingDate: opts.receiving,
        totalAmount: itemsTotal,
        vat,
        finalAmount: itemsTotal + vat,
        lockedAt: opts.locked ? new Date() : null,
        items: {
          create: opts.items.map((i) => {
            const total = i.qty * (i.price ?? 30000)
            return {
              name: i.name, qty: i.qty, unitPrice: i.price ?? 30000, total,
              productId: products[i.name] ?? null,
              unit: 'عدد',
              vat: Math.round(total * 0.09),
              deliveredQty: opts.status === 'RECEIVED_BY_DELIVERY' || opts.status.startsWith('CONFIRMED') || opts.status === 'DONE' || opts.status === 'ACCOUNTING_DONE' ? i.qty : null,
              itemStatus: opts.status === 'RECEIVED_BY_DELIVERY' || opts.status.startsWith('CONFIRMED') || opts.status === 'DONE' || opts.status === 'ACCOUNTING_DONE' ? 'OK' : 'PENDING',
            }
          }),
        },
        history: {
          create: (opts.history ?? [{ action: 'ایجاد سفارش', detail: `${opts.items.length} ردیف کالا`, userName: 'سامانه', userId: opts.createdById }])
            .map((h) => ({ action: h.action, detail: h.detail, userName: h.userName, userId: h.userId })),
        },
      },
    })
    // keep providerName snapshot correct
    return order
  }

  const o1 = await makeOrder({
    code: 'ORD-14040712-001', provider: 'پخش پگاه کرمان', company: 'صنایع شیر ایران (پگاه)',
    status: 'APPROVED', receiving: tomorrow, createdById: U['s.norouzi'],
    items: [
      { name: 'شیر پرچرب پگاه ۱ لیتری', qty: 24, price: 32000 },
      { name: 'شیر کم‌چرب پگاه ۵۰۰ میلی', qty: 36, price: 17500 },
      { name: 'شیر شکلات ۲/۵٪ پگاه ۲/۵ لیتری', qty: 6, price: 78000 },
    ],
    history: [
      { action: 'ایجاد سفارش', detail: '۳ ردیف کالا', userName: 'سارا نوروزی', userId: U['s.norouzi'] },
      { action: 'تأیید سفارش', detail: 'موجودی لبنیات رو به اتمام بود', userName: 'زهرا لطفی', userId: U['z.lotfi'] },
    ],
  })
  await db.order.update({ where: { id: o1.id }, data: { approvedById: U['z.lotfi'] } })

  await makeOrder({
    code: 'ORD-14040712-002', provider: 'پخش کاله جنوبشرق', company: 'کاله',
    status: 'PENDING_APPROVAL', receiving: nextWeek, createdById: U['s.norouzi'],
    items: [
      { name: 'ماست کم‌چرب کاله ۹۰۰ گرمی', qty: 20, price: 54000 },
      { name: 'دوغ کاله ۱.۵ لیتری', qty: 30, price: 27000 },
      { name: 'پنیر لیقوان کاله ۴۰۰ گرمی', qty: 12, price: 74000 },
    ],
  })

  await makeOrder({
    code: 'ORD-14040708-003', provider: 'پخش مهرام جنوب', company: 'مهرام',
    status: 'RECEIVED_BY_DELIVERY', receiving: threeDaysAgo, createdById: U['z.lotfi'],
    items: [
      { name: 'سوسیس کوکتل مهرام ۵۰۰ گرمی', qty: 15, price: 122000 },
      { name: 'کالباس آلمانی مهرام ۵۰۰ گرمی', qty: 10, price: 155000 },
      { name: 'ناگت مرغ مهرام ۹۰۰ گرمی', qty: 8, price: 198000 },
    ],
    locked: true,
  })

  await makeOrder({
    code: 'ORD-14040705-004', provider: 'مرکز توزیع جنوبشرق',
    status: 'CONFIRMED_BY_INVENTORY', receiving: addDays(new Date(), -7), createdById: U['s.norouzi'],
    items: [
      { name: 'برنج طارم اعلا زر ۱۰ کیلویی', qty: 8, price: 1080000 },
      { name: 'روغن سرخ‌کردنی گلرنگ ۱.۸ لیتری', qty: 12, price: 242000 },
      { name: 'روغن مایع گلرنگ ۸۰۰ میلی', qty: 18, price: 112000 },
    ],
    locked: true,
  })

  const o5 = await makeOrder({
    code: 'ORD-14040701-005', provider: 'توزیع زمزم کرمان', company: 'نوش بی‌نظیر (زمزم)',
    status: 'DONE', paymentType: 'CASH', receiving: addDays(new Date(), -12), createdById: U['z.lotfi'],
    items: [
      { name: 'نوشابه زمزم ۱.۵ لیتری', qty: 60, price: 34000 },
      { name: 'آب معدنی زمزم ۱.۵ لیتری', qty: 120, price: 11000 },
      { name: 'دلستر پرتقال زمزم ۱.۵ لیتری', qty: 24, price: 45000 },
    ],
    locked: true,
  })
  await db.order.update({
    where: { id: o5.id },
    data: { accountingDoneAt: addDays(new Date(), -12), deliveredAt: addDays(new Date(), -12), confirmedAt: addDays(new Date(), -12) },
  })

  // ---------- Cheques ----------
  const fridayDue = new Date()
  // find next Friday
  while (fridayDue.getDay() !== 5) fridayDue.setDate(fridayDue.getDate() + 1)
  await db.cheque.createMany({
    data: [
      {
        number: 'CH-778812', amount: 45600000, dueDate: addDays(new Date(), 20),
        payeeName: 'آقای رضایی (گلها)', payeePhone: '۰۹۱۳۱۱۲۲۳۳۴', isForOrder: true,
        orderId: null, status: 'PENDING_OWNER', createdById: U['z.lotfi'],
        issueDate: addDays(new Date(), -2),
      },
      {
        number: 'CH-778813', amount: 28400000, dueDate: fridayDue,
        payeeName: 'پخش مهرام جنوب', payeePhone: '۰۹۱۵۱۲۳۴۵۶۷', isForOrder: true,
        status: 'SIGNED', createdById: U['z.lotfi'], signedById: U['j.norouzi'],
        writtenAt: addDays(new Date(), -1), issueDate: addDays(new Date(), -5),
        note: 'تاریخ سررسید با جمعه تداخل داشت و ۲ روز جلوتر کشیده شد',
      },
      {
        number: 'CH-778810', amount: 15600000, dueDate: addDays(new Date(), -3),
        payeeName: 'مرکز توزیع جنوبشرق', payeePhone: '۰۳۴۳۲۴۵۶۷۸۹', isForOrder: true,
        status: 'CLEARED', createdById: U['z.lotfi'], signedById: U['j.norouzi'],
        writtenAt: addDays(new Date(), -40), collectedAt: addDays(new Date(), -3), issueDate: addDays(new Date(), -45),
      },
      {
        number: 'CH-778815', amount: 9200000, dueDate: addDays(new Date(), 9),
        payeeName: 'نگهبانی ساختمان (اجاره)', payeePhone: '', isForOrder: false,
        status: 'PENDING_OWNER', createdById: U['m.darvishi'], issueDate: addDays(new Date(), -1),
      },
    ],
  })

  // ---------- Payments ----------
  await db.payment.create({
    data: { orderId: o5.id, amount: 8910000, type: 'CASH_ON_DELIVERY', receiptNo: 'R-2231', posReceiptNo: 'POS-88112', userId: U['m.darvishi'] },
  })

  // ---------- Tasks ----------
  const taskDefs = [
    { title: 'پیگیری سفارش لبنیات پگاه', description: 'سفارش ORD-14040712-001 دو روز دیرتر از موعد تحویل است؛ لطفاً با آقای کریمی هماهنگ کنید.', category: 'سفارش', priority: 'HIGH', status: 'IN_PROGRESS', fromOwner: false, assignedTo: 'z.lotfi', due: addDays(new Date(), 1) },
    { title: 'چک‌لیست سلامت یخچال‌های گوشت', description: 'دمای همه یخچال‌ها کنترل و ثبت شود (باید بین ۰ تا ۴ درجه باشد).', category: 'بازرسی', priority: 'URGENT', status: 'TODO', fromOwner: false, assignedTo: 'm.irannejhad', due: new Date() },
    { title: 'جلسه هفتگی سرپرستان — جمعه ساعت ۱۰', description: 'گزارش عملکرد هفته و برنامه هفته بعد.', category: 'جلسه', priority: 'MEDIUM', status: 'TODO', fromOwner: true, assignedTo: 'k.safapour', due: addDays(new Date(), 3) },
    { title: 'انقضای مجوز پردازشگر POS را بررسی کن', description: 'تاریخ انقضا قرارداد کارتخوان‌ها نزدیک است.', category: 'مالی', priority: 'MEDIUM', status: 'FOLLOW_UP', fromOwner: false, assignedTo: 'm.darvishi', due: addDays(new Date(), 10) },
    { title: 'آموزش پلتفرم جدید به صندوق‌داران', description: 'همه صندوق‌داران ورود و چک‌لیست صندوق را تست کنند.', category: 'آموزش', priority: 'HIGH', status: 'TODO', fromOwner: true, assignedTo: 'f.mohammadi', due: addDays(new Date(), 4) },
    { title: 'برچسب‌گذاری قفسه ادویه طبق پلانوگرام جدید', description: 'طبق پلانوگرام مصوب بخش خواربار.', category: 'چیدمان', priority: 'LOW', status: 'DONE', fromOwner: false, assignedTo: 'z.gholamhoseini', due: yesterday },
  ]
  for (const t of taskDefs) {
    const created = await db.task.create({
      data: {
        title: t.title, description: t.description, category: t.category, priority: t.priority,
        status: t.status, fromOwner: t.fromOwner, createdById: t.fromOwner ? U['j.norouzi'] : U['k.safapour'],
        assignedToId: U[t.assignedTo], dueDate: t.due,
      },
    })
    if (t.status === 'DONE') {
      await db.taskUpdate.create({ data: { taskId: created.id, userId: U[t.assignedTo], userName: userDefs.find((u) => u.username === t.assignedTo)!.name, content: 'کار انجام شد ✅' } })
    }
  }

  // ---------- SOPs ----------
  const sops = [
    {
      title: 'دریافت توزیع صبحگاهی (تحویل‌گیرنده)', category: 'دریافت کالا',
      summary: 'مراحل استاندارد دریافت توزیع از نماینده شرکت پخش در شیفت صبح.',
      roleKeys: 'delivery,inventory',
      steps: [
        { title: '۱. بررسی مدارک', detail: 'فاکتور همراه راننده را با سفارش ثبت‌شده در پلتفرم مقایسه کنید. شماره فاکتور و نام شرکت پخش باید یکی باشد.', warning: 'اگر فاکتور همراه ندارند، تحویل را نپذیرید و به مدیر کل اطلاع دهید.' },
        { title: '۲. شمارش اقلام', detail: 'برای هر قلم، تعداد تحویلی را با تعداد سفارش مقایسه کنید و در بخش «تحویل‌ها» ثبت کنید.' },
        { title: '۳. کنترل تاریخ انقضا', detail: 'کالاهای فاسدشدنی باید حداقل ⅔ عمر مفید باقی‌مانده داشته باشند. کالای کم‌ماندگار را «رد» بزنید.' },
        { title: '۴. کنترل قیمت روی کالا', detail: 'برچسب قیمت روی کالا را با قیمت فاکتور بخوانید. مغایرت را در ستون «قیمت اصلاحی» ثبت کنید.' },
        { title: '۵. ثبت مغایرت‌ها', detail: 'قلمِ گم‌شده «ناقص»، کالای معیوب «رد شده» ثبت می‌شود. برای هر مغایرت دلیل بنویسید.' },
        { title: '۶. تأیید نهایی', detail: 'پس از اتمام، دکمه «ثبت دریافت» را بزنید. سفارش به تأیید انبار و بعد حسابداری می‌رود.' },
      ],
    },
    {
      title: 'تأیید انبار و تحویل به حسابداری', category: 'انبار',
      summary: 'کنترل ثانویه اقلام دریافتی توسط سرپرست انبار.',
      roleKeys: 'inventory',
      steps: [
        { title: '۱. بازبینی اقلام وزنی', detail: 'کالاهای وزنی (گوشت، سوسیس، برنج) را توزین و قیمت واحد را کنترل کنید.' },
        { title: '۲. کنترل مغایرت‌ها', detail: 'اقلامی که تحویل‌گیرنده علامت زده را بازبینی و در صورت لزوم اصلاح کنید.' },
        { title: '۳. ارسال به حسابداری', detail: 'با دکمه «تأیید و ارسال به حسابداری»، سفارش برای ثبت در هولو آماده می‌شود.' },
      ],
    },
    {
      title: 'ثبت فاکتور در نرم‌افزار هولو (حسابدار)', category: 'حسابداری',
      summary: 'خروجی اکسل از پلتفرم، ورود به هولو و بستن سفارش.',
      roleKeys: 'accountant',
      steps: [
        { title: '۱. دریافت خروجی اکسل', detail: 'از بخش حسابداری، روی سفارشِ تأییدشده دکمه «خروجی اکسل (هولو)» را بزنید.' },
        { title: '۲. ورود به هولو', detail: 'در تب خرید صفحه فاکتور، ردیف‌ها را مطابق فایل اکسل وارد کنید. بارکد هر کالا را اسکن کنید.' },
        { title: '۳. کنترل جمع کل', detail: 'جمع کل هولو را با «مبلغ نهایی» فایل مقایسه کنید. اختلاف زیر ۱٬۰۰۰ تومان قابل چشم‌پوشی است.' },
        { title: '۴. ثبت پرداخت', detail: 'اگر نقدی است رسید POS را ثبت کنید؛ اگر چکی است شماره چک را در پلتفرم ثبت کنید.' },
        { title: '۵. بستن سفارش', detail: 'دکمه «ثبت شد در هولو» را بزنید تا همه مدیران مطلع شوند.' },
      ],
    },
    {
      title: 'چیدمان طبق پلانوگرام (مرچندایزر)', category: 'چیدمان',
      summary: 'استاندارد چیدمان قفسه‌ها و درخواست جنس از انبار.',
      roleKeys: 'merchandiser',
      steps: [
        { title: '۱. مشاهده پلانوگرام', detail: 'در بخش «چیدمان قفسه»، نقشه بخش خودتان را باز کنید. رنگ هر خانه وضعیت موجودی است.' },
        { title: '۲. درخواست از انبار', detail: 'برای هر قلم کم‌موجود، دکمه «درخواست از انبار» را بزنید. انباردار جنس را آماده و با آسانسور ارسال می‌کند.' },
        { title: '۳. چیدمان FIFO', detail: 'کالای قدیمی‌تر (تاریخ تولید جلوتر) جلوی قفسه قرار می‌گیرد. (اولین ورود، اولین خروج)' },
        { title: '۴. ثبت کالای درخواستی مشتری', detail: 'اگر مشتری کالایی خواست که نداریم، از بخش «عملیات فروشگاه» ثبت کنید تا برای خرید بررسی شود.' },
      ],
    },
    {
      title: 'ثبت سفارش مشتری و ارسال به صندوق (فروشنده)', category: 'فروش',
      summary: 'پیش‌ثبت سبد خرید مشتری برای تسریع پرداخت در صندوق.',
      roleKeys: 'sales',
      steps: [
        { title: '۱. شناسایی مشتری', detail: 'اگر مشتری عضو است، با شماره موبایل جستجو کنید. اگر نیست، ثبت‌نام سریع انجام دهید (فقط نام و موبایل).' },
        { title: '۲. افزودن اقلام', detail: 'کالاها را با اسکن بارکد یا جستجو به سبد اضافه کنید. برای هر کالا پیشنهاد مکمل بدهید (مثلاً نان با پنیر).' },
        { title: '۳. ارسال به صندوق', detail: 'سبد را «ارسال به صندوق» کنید. صندوق‌دار فقط جمع‌بندی و پرداخت را انجام می‌دهد.' },
        { title: '۴. چیدن کالاها', detail: 'در حین پرداخت، کالاها را بسته‌بندی کنید تا مشتری منتظر نماند.' },
      ],
    },
    {
      title: 'ایمنی و بهداشت شیفت', category: 'ایمنی',
      summary: 'نکات کلیدی ایمنی برای همه همکاران فروشگاه.',
      roleKeys: 'merchandiser,cashier,sales,delivery,inventory',
      steps: [
        { title: '۱. مسیر خروجی', detail: 'هرگز جعبه و کالا جلوی در خروجی و راهروی اصلی نگذارید.' },
        { title: '۲. لکه و زمین خیس', detail: 'بلافاصله علائم هشدار بگذارید و تمیز کنید. مسئولیت سقوط مشتری جدی است.' },
        { title: '۳. حمل جعبه سنگین', detail: 'از گاری استفاده کنید؛ بالای سر مشتری جعبه حمل نکنید.' },
      ],
    },
  ]
  for (const s of sops) {
    await db.sOP.create({
      data: { title: s.title, category: s.category, summary: s.summary, roleKeys: s.roleKeys, steps: JSON.stringify(s.steps), createdBy: 'کیانوش صفاپور' },
    })
  }

  const checklists = [
    { title: 'چک‌لیست بازگشایی صندوق', roleKey: 'cashier', items: ['بسته پول شروع شیفت را بشمارید و ثبت کنید', 'موجودی اسکناس ۵۰ و ۱۰۰ تومانی را آماده کنید', 'کارکرد پرینتر POS را تست کنید', 'سلفون و نایلکس فروخته‌شدنی را کنار صندوق بگذارید'] },
    { title: 'چک‌لیست یخچال‌ها (صبح و عصر)', roleKey: 'merchandiser', items: ['دمای یخچال لبنیات ۰ تا ۴ درجه', 'دمای یخچال گوشت نزدیک صفر', 'بررسی تاریخ انقضای اقلام ردیف اول', 'پاک کردن لکه‌ها و اثر انگشت از درب‌ها', 'چیدمان FIFO رعایت شده باشد'] },
    { title: 'چک‌لیست پایان شیفت فروشگاه', roleKey: 'merchandiser', items: ['قفسه‌های اصلی پر شوند (کمبودها از انبار)', 'راهروها از جعبه خالی شود', 'سطل‌های زباله خالی شود', 'برچسب قیمت‌های ناهماهنگ اصلاح شود'] },
  ]
  for (const c of checklists) {
    await db.checklist.create({ data: { title: c.title, roleKey: c.roleKey, items: JSON.stringify(c.items.map((text) => ({ text, done: false }))) } })
  }

  // ---------- Wall / Notes / Feedback / Ideas ----------
  await db.wallPost.createMany({
    data: [
      { userId: U['k.safapour'], content: 'دوستان عزیز، پلتفرم داخلی هایپر زیتون راه‌اندازی شد 🎉 هر مشکلی دیدید به من پیام بدید. هدف این است که کار دستی کمتر و خطا کمتر بشود — این سامانه دستیار شماست نه نظارت‌گر!', category: 'INFO', pinned: true, likes: 12 },
      { userId: U['m.irannejhad'], content: 'یادآوری: توزیع پگاه فردا ساعت ۷:۳۰ می‌رسد. لطفاً راهرو انبار خلوت باشد.', category: 'EVENT', likes: 4 },
      { userId: U['z.gholamhoseini'], content: 'نکته چیدمان: ماست کاله ۹۰۰ در یخچال شماره ۳ ردیف دوم، سری تولید ۱۴۰۴/۰۷ جلوتر بگذارید.', category: 'TIP', likes: 7 },
      { userId: U['f.mohammadi'], content: 'کارت‌خوان دوم سیم کارت‌اش دیتا نداشت؛ با پشتیبانی تماس گرفتم، تا عصر درست می‌شود.', category: 'WARNING', likes: 3 },
    ],
  })

  await db.personalNote.createMany({
    data: [
      { userId: U['m.irannejhad'], title: 'رمز درب انبار', content: 'رمز درب انبار بعد از تعویض: ۳۱۴۱ — فقط شخصی.', color: '#B33A3A', pinned: true },
      { userId: U['z.lotfi'], title: 'پیگیری‌های هفته', content: '۱- تماس با پخش کاله برای دوغ\n۲- قیمت جدید برنج را از ویزیتور بگیر\n۳- مرخصی مینو پنجشنبه', color: '#C9A227', pinned: true },
    ],
  })

  await db.feedbackPost.createMany({
    data: [
      { content: 'اگر بخش تحویل‌ها روی موبایل هم فونت درشت‌تر داشت عالی می‌شود چون دستمان موقع شمارش کالا گِل است.', rating: 4, anonymous: true, status: 'NEW' },
      { content: 'دیوار همکاری فوق‌العاده است؛ دیگر نیازی نیست پیام‌ها را تو گروه گوشی گم کنیم.', rating: 5, anonymous: false, userId: U['s.yadegari'], status: 'REVIEWED', adminReply: 'ممنون از بازخوردتان؛ نسخه بعدی نوتیفیکیشن لحظه‌ای هم می‌گیرد.' },
    ],
  })

  await db.ideaPost.createMany({
    data: [
      { userId: U['s.yadegari'], title: 'پیشنهاد بسته ترکیبی صبحانه', content: 'بسته تخفیف‌دار نان + پنیر + عسل برای مشتریانی که سه‌قلو می‌خرند. چند نمونه ساختیم و استقبال خوب بود.', status: 'UNDER_REVIEW', rewardPoints: 0 },
      { userId: U['h.alikhani'], title: 'قفسه پرفروش در انتهای سالن', content: 'قفسه تخفیف‌ها را جلوی ورودی بگذاریم؛ در فروشگاه‌های دیگر جابه‌جایی ۱۵٪ فروش بیشتر داشت.', status: 'SUBMITTED' },
    ],
  })

  // ---------- Chat ----------
  const conv1 = await db.conversation.create({ data: { isGroup: false } })
  await db.conversationParticipant.createMany({ data: [ { conversationId: conv1.id, userId: U['k.safapour'] }, { conversationId: conv1.id, userId: U['z.lotfi'] } ] })
  await db.message.createMany({
    data: [
      { conversationId: conv1.id, userId: U['k.safapour'], content: 'سلام خانم لطفی، سفارش پگاه را دیدم؟ تعداد شیر کم‌چرب کافی است؟', createdAt: new Date(Date.now() - 3600_000) },
      { conversationId: conv1.id, userId: U['z.lotfi'], content: 'سلام، بله دیدم. به نظرم ۱۲ عدد دیگر هم اضافه شود، آخر هفته مشتری زیاد است.', createdAt: new Date(Date.now() - 3300_000) },
      { conversationId: conv1.id, userId: U['k.safapour'], content: 'چشم، به سارا اطلاع می‌دهم ویرایش کند.', createdAt: new Date(Date.now() - 3000_000) },
    ],
  })
  const conv2 = await db.conversation.create({ data: { isGroup: true, title: 'گروه هماهنگی تحویل‌ها' } })
  const teamIds = ['k.safapour', 'm.irannejhad', 'a.mohammadi', 'm.darvishi', 'z.lotfi']
  await db.conversationParticipant.createMany({ data: teamIds.map((u) => ({ conversationId: conv2.id, userId: U[u] })) })
  await db.message.createMany({
    data: [
      { conversationId: conv2.id, userId: U['m.irannejhad'], content: 'توزیع مهرام رسید، ۳ قلم بود، همه سالم ✅', createdAt: new Date(Date.now() - 7200_000) },
      { conversationId: conv2.id, userId: U['a.mohammadi'], content: 'دریافت شد، الان کنترل وزنی می‌کنم.', createdAt: new Date(Date.now() - 7000_000) },
      { conversationId: conv2.id, userId: U['m.darvishi'], content: 'خروجی اکسل را آماده کردم، بعد از کنترل شما وارد هولو می‌کنم.', createdAt: new Date(Date.now() - 6400_000) },
    ],
  })

  // ---------- Customers ----------
  const cust1 = await db.customer.create({ data: { name: 'خانم احمدی', phone: '۰۹۱۳۴۵۶۷۸۹۰', favoriteProducts: 'پنیر لیقوان، مرغ محلی', tasteNotes: 'تازه‌گرا؛ تاریخ انقضا برایش مهم است', salespersonId: U['s.yadegari'], visits: 14, points: 120 } })
  await db.customer.create({ data: { name: 'آقای موسوی', phone: '۰۹۱۲۳۳۳۴۴۵۵', favoriteProducts: 'برنج طارم، زعفران', tasteNotes: 'عمده‌خر؛ تخفیف حجمی دوست دارد', salespersonId: U['s.yadegari'], visits: 8, points: 60 } })
  await db.customer.create({ data: { name: 'خانم کریمی', phone: '۰۹۱۳۸۸۸۹۹۰۰', favoriteProducts: 'لبنیات کاله', tasteNotes: 'صبح‌ها زود می‌آید', salespersonId: U['e.saadi'], visits: 22, points: 210 } })

  await db.customerOrder.create({
    data: {
      customerId: cust1.id, customerName: 'خانم احمدی', salespersonId: U['s.yadegari'], status: 'SENT_TO_CASHIER', sentAt: new Date(),
      items: JSON.stringify([
        { productId: products['پنیر لیقوان کاله ۴۰۰ گرمی'], name: 'پنیر لیقوان کاله ۴۰۰ گرمی', qty: 2, price: 89000 },
        { productId: products['نان بربری'] ?? null, name: 'نان بربری تازه', qty: 4, price: 15000 },
      ]),
      total: 238000, note: 'بدون سلفون',
    },
  })

  // ---------- Shelves / Warehouse / StockOut / Suggestions ----------
  const shelfDefs = [
    { name: 'یخچال لبنیات — ردیف ۱', section: 'لبنیات', row: 1, col: 1, product: 'شیر پرچرب پگاه ۱ لیتری', cap: 24 },
    { name: 'یخچال لبنیات — ردیف ۱', section: 'لبنیات', row: 1, col: 2, product: 'شیر کم‌چرب پگاه ۵۰۰ میلی', cap: 30 },
    { name: 'یخچال لبنیات — ردیف ۲', section: 'لبنیات', row: 2, col: 1, product: 'ماست کم‌چرب کاله ۹۰۰ گرمی', cap: 20 },
    { name: 'یخچال لبنیات — ردیف ۲', section: 'لبنیات', row: 2, col: 2, product: 'پنیر لیقوان کاله ۴۰۰ گرمی', cap: 15 },
    { name: 'یخچال گوشت — ردیف ۱', section: 'گوشت و سوسیس', row: 1, col: 1, product: 'سوسیس کوکتل مهرام ۵۰۰ گرمی', cap: 12 },
    { name: 'یخچال گوشت — ردیف ۱', section: 'گوشت و سوسیس', row: 1, col: 2, product: 'کالباس آلمانی مهرام ۵۰۰ گرمی', cap: 12 },
    { name: 'قفسه خواربار A', section: 'خواربار', row: 1, col: 1, product: 'روغن مایع گلرنگ ۸۰۰ میلی', cap: 24 },
    { name: 'قفسه خواربار A', section: 'خواربار', row: 1, col: 2, product: 'ماکارونی فرمی زر ۵۰۰ گرمی', cap: 48 },
    { name: 'قفسه خواربار B', section: 'خواربار', row: 2, col: 1, product: 'رب گوجه‌فرنگی چین‌چین ۸۰۰ گرمی', cap: 20 },
    { name: 'قفسه تنقلات', section: 'تنقلات', row: 1, col: 1, product: 'چیپس نمکی چی‌توز', cap: 40 },
    { name: 'قفسه تنقلات', section: 'تنقلات', row: 1, col: 2, product: 'پفک نمکی مینو', cap: 30 },
    { name: 'غرفه کرمان', section: 'محصولات کرمان', row: 1, col: 1, product: 'پسته خندق اکبری ۵۰۰ گرمی', cap: 8 },
    { name: 'غرفه کرمان', section: 'محصولات کرمان', row: 1, col: 2, product: 'زعفران سرگل قائنات ۴.۶ گرمی', cap: 12 },
  ]
  for (const s of shelfDefs) {
    await db.shelf.create({ data: { name: s.name, section: s.section, row: s.row, col: s.col, productId: products[s.product] ?? null, capacity: s.cap } })
  }

  await db.warehouseRequest.createMany({
    data: [
      { productId: products['پفک نمکی مینو'], qty: 20, requestedById: U['z.gholamhoseini'], status: 'PENDING' },
      { productId: products['تن ماهی تنِ چین‌چین ۱۸۰ گرمی'], qty: 10, requestedById: U['h.alikhani'], status: 'PREPARING', handledById: U['a.mohammadi'] },
    ],
  })

  await db.stockRequestOut.createMany({
    data: [
      { productName: 'دوغ آبعلی ۱.۵ لیتری', productId: null, count: 4, lastById: U['m.irannejhad'] },
      { productName: 'بستنی قیفی آمت', productId: null, count: 2, lastById: U['s.yadegari'] },
    ],
  })

  await db.productSuggestion.createMany({
    data: [
      { name: 'شیر سویا کاله ۱ لیتری', barcode: '6260222345699', note: 'چند مشتری درباره شیر گیاهی پرسیدند', submittedById: U['e.saadi'], status: 'NEW' },
      { name: 'چای کیسه‌ای گلستان ۱۰۰ عددی', note: 'پرفروش در فروشگاه‌های رقیب', submittedById: U['s.yadegari'], status: 'REVIEWING' },
    ],
  })

  // ---------- Awards / Notifications / Activity ----------
  await db.award.createMany({
    data: [
      { userId: U['m.irannejhad'], points: 15, reason: 'دریافت بدون خطای ۶ توزیع متوالی', grantedById: U['z.lotfi'] },
      { userId: U['z.gholamhoseini'], points: 10, reason: 'چیدمان بی‌نقص بخش تنقلات طبق پلانوگرام', grantedById: U['s.norouzi'] },
      { userId: U['f.mohammadi'], points: 8, reason: 'تشخیص به‌موقع مغایرت قیمتی در صندوق', grantedById: U['k.safapour'] },
      { userId: U['s.yadegari'], points: 12, reason: 'ثبت‌نام ۹ مشتری جدید در هفته گذشته', grantedById: U['z.lotfi'] },
    ],
  })

  await db.notification.createMany({
    data: [
      { userId: U['z.lotfi'], title: 'سفارش جدید در انتظار تأیید', body: 'سفارش ORD-14040712-002 از پخش کاله awaiting شماست.', type: 'INFO', link: 'orders' },
      { userId: U['m.darvishi'], title: 'سفارش آماده ثبت در هولو', body: 'ORD-14040705-004 تأیید انبار را گرفت.', type: 'SUCCESS', link: 'accounting' },
      { userId: U['j.norouzi'], title: '۲ چک در انتظار امضای شما', body: 'جمعاً ۵۴٬۸۰۰٬۰۰۰ تومان', type: 'WARNING', link: 'payments' },
      { userId: U['m.irannejhad'], title: '۱۵ امتیاز دریافت کردید 🎉', body: 'دریافت بدون خطای ۶ توزیع متوالی', type: 'SUCCESS', link: 'team' },
    ],
  })

  await db.activityLog.createMany({
    data: [
      { userId: U['s.norouzi'], userName: 'سارا نوروزی', action: 'ایجاد سفارش', entity: 'Order', entityId: 'ORD-14040712-001', detail: '۳ ردیف — پخش پگاه کرمان' },
      { userId: U['z.lotfi'], userName: 'زهرا لطفی', action: 'تأیید سفارش', entity: 'Order', entityId: 'ORD-14040712-001' },
      { userId: U['m.irannejhad'], userName: 'مینا ایران‌نژاد', action: 'ثبت دریافت توزیع', entity: 'Order', entityId: 'ORD-14040708-003' },
      { userId: U['a.mohammadi'], userName: 'علیرضا محمدی', action: 'تأیید انبار', entity: 'Order', entityId: 'ORD-14040705-004' },
      { userId: U['m.darvishi'], userName: 'مریم درویشی', action: 'ثبت در هولو', entity: 'Order', entityId: 'ORD-14040701-005', detail: 'شماره فاکتور هولو: 10482' },
      { userId: U['j.norouzi'], userName: 'جواد نوروزی', action: 'امضای چک', entity: 'Cheque', entityId: 'CH-778813' },
    ],
  })

  // ---------- Archive binders (hybrid physical+digital archive) ----------
  const binderDefs: { title: string; category: string; color: string; location: string }[] = [
    { title: 'لبنیات — پگاه، کاله، میهن، دامداران', category: 'لبنیات و پروتئین', color: '#3E7C59', location: 'کابینت A / طبقه اول' },
    { title: 'لبنیات — رامک، روزانه، پنال', category: 'لبنیات و پروتئین', color: '#5E8C61', location: 'کابینت A / طبقه اول' },
    { title: 'شیرینی و شکلات — ترمه، مینو، نیک‌بید', category: 'شیرینی و شکلات', color: '#B07D2B', location: 'کابینت A / طبقه دوم' },
    { title: 'کلوچه و بیسکویت — گلها، مینو', category: 'شیرینی و شکلات', color: '#C9A227', location: 'کابینت A / طبقه دوم' },
    { title: 'کالاهای وارداتی — نستله، مars، کادبری', category: 'وارداتی', color: '#8A3B5C', location: 'کابینت B / طبقه اول' },
    { title: 'شکلات و ویفر وارداتی — کیت‌کت، اورو', category: 'وارداتی', color: '#A34A7D', location: 'کابینت B / طبقه اول' },
    { title: 'اسباب‌بازی و سرگرمی', category: 'اسباب‌بازی و لوازم‌تحریر', color: '#2E6E8E', location: 'کابینت B / طبقه دوم' },
    { title: 'لوازم‌تحریر و مدرسه', category: 'اسباب‌بازی و لوازم‌تحریر', color: '#7D5BA6', location: 'کابینت B / طبقه دوم' },
    { title: 'شوینده و بهداشتی — گلرنگ، پاکشوما', category: 'شوینده و بهداشتی', color: '#4C7A34', location: 'کابینت C / طبقه اول' },
    { title: 'نوشیدنی — زمزم، گلها، چین‌چین', category: 'نوشیدنی', color: '#B33A3A', location: 'کابینت C / طبقه اول' },
    { title: 'خواربار — زر، گلرنگ، چین‌چین', category: 'خواربار', color: '#8A6F3C', location: 'کابینت C / طبقه دوم' },
    { title: 'محصولات محلی — زعفران، پسته، عسل', category: 'محصولات کرمان', color: '#C96F27', location: 'گاوصندوق دفتر' },
    { title: 'قراردادها و اسناد حقوقی', category: 'اسناد مدیریتی', color: '#444A54', location: 'گاوصندوق دفتر' },
    { title: 'اسناد بیمه و عوامل رسمی', category: 'اسناد مدیریتی', color: '#37474F', location: 'گاوصندوق دفتر' },
  ]
  const binderCode = (i: number) => `AB-${String(i + 1).padStart(2, '0')}`
  const binderIds: Record<number, string> = {}
  for (let i = 0; i < binderDefs.length; i++) {
    const b = binderDefs[i]
    const created = await db.archiveBinder.create({
      data: { code: binderCode(i), title: b.title, category: b.category, color: b.color, location: b.location, capacity: 200, active: true },
    })
    binderIds[i] = created.id
  }
  // sample archive documents inside first binders
  const now = new Date()
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000)
  await db.archiveDocument.createMany({
    data: [
      { binderId: binderIds[0], pocket: 1, docType: 'INVOICE', title: 'فاکتور شیر پگاه — هفته اول', docDate: daysAgo(12), amount: 18450000, note: 'تسویه نقدی هنگام تحویل' },
      { binderId: binderIds[0], pocket: 2, docType: 'INVOICE', title: 'فاکتور ماست و پنیر کاله', docDate: daysAgo(9), amount: 23100000 },
      { binderId: binderIds[1], pocket: 1, docType: 'STATEMENT', title: 'صورت‌حساب ماهانه رامک', docDate: daysAgo(20), amount: 45200000 },
      { binderId: binderIds[2], pocket: 1, docType: 'INVOICE', title: 'فاکتور شکلات ترمه — سفارش نوروزی', docDate: daysAgo(30), amount: 68000000 },
      { binderId: binderIds[4], pocket: 1, docType: 'INVOICE', title: 'فاکتور وارداتی نستله — لیدر کالا', docDate: daysAgo(15), amount: 92500000, note: 'چک ۴۵ روزه' },
      { binderId: binderIds[8], pocket: 1, docType: 'INVOICE', title: 'فاکتور شوینده گلرنگ', docDate: daysAgo(6), amount: 31000000 },
      { binderId: binderIds[13], pocket: 1, docType: 'CONTRACT', title: 'قرارداد سالانه توزیع زمزم', docDate: daysAgo(60) },
    ],
  })

  // ---------- Settings ----------
  await db.settings.createMany({
    data: [
      { key: 'store_name', value: 'هایپر زیتون' },
      { key: 'store_city', value: 'کرمان' },
      { key: 'low_stock_alerts', value: 'on' },
      { key: 'tax_rate_default', value: '9' },
      { key: 'tolerance_toman', value: '1000' },
      { key: 'cheque_flexibility', value: JSON.stringify({ default: 0, levels: [] }) },
      { key: 'leave_policy', value: JSON.stringify({ monthlyDays: 4, maxSameDay: 2, hourlyMaxHours: 4 }) },
    ],
  })

  const counts = {
    users: await db.user.count(), products: await db.product.count(), orders: await db.order.count(),
    cheques: await db.cheque.count(), sops: await db.sOP.count(), holidays: await db.holiday.count(),
  }
  console.log('✅ Seed complete:', counts)
}
