/**
 * آزمایشگاه دمو — داده‌ساز شرکت‌های مجازی برای پلتفرم زیتون
 *
 * یک شرکت واقع‌گرایانه (پرسونا) را با کاتالوگ، تأمین‌کننده، سفارش، چک، فروش،
 * مشتری و فضای تیمی کامل می‌سازد و شناسه‌های ساخته‌شده را در Setting با کلید
 * `demo_registry` ثبت می‌کند تا پاک‌سازی تمیز ممکن باشد. داده‌های واقعی
 * (کارکنان، محصولات فعلی، ...) دست‌نخورده می‌مانند.
 *
 * اعداد از PRNG seed-دار (mulberry32) می‌آیند تا تولید مجددِ همان پرسونا
 * نتایج پایداری بدهد.
 */

import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { todayJalali, addDaysJalali } from '@/lib/jalali'

// ============ پرسوناها ============

export interface DemoPersona {
  id: 'gourmet' | 'neighborhood' | 'chain'
  name: string
  tagline: string
  branches: string[]
  staffCount: string
  monthlyOrders: string
  desc: string
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'gourmet',
    name: 'هایپر گورمت «قوطان‌فر»',
    tagline: 'فروشگاه لوکس و گورمت — کرمان، اصفهان، شیراز',
    branches: ['کرمان — بلوار جمهوری اسلامی', 'اصفهان — خیابان چهارباغ بالا', 'شیراز — بلوار زند'],
    staffCount: '۱۸ نفر',
    monthlyOrders: '۴۵۰+ سفارش فروش در ماه',
    desc: 'زنجیره لوکس gourmet با قهوه تخصصی، خاویار، زعفران ممتاز، پسته اعلاء، پنیرهای خارجی و شکلات بلژیکی؛ مشتریان پول‌ساز، حاشیه سود بالا، انتظار کیفیت بی‌نقص.',
  },
  {
    id: 'neighborhood',
    name: 'سوپرمارکت «محله سپاهان»',
    tagline: 'فروشگاه محله‌ای صمیمی — یک شعبه، یک خانواده',
    branches: ['کرمان — خیابان سپاه'],
    staffCount: '۶ نفر',
    monthlyOrders: '۹۰ سفارش فروش در ماه',
    desc: 'سوپرمارکت محله‌ای با مشتریان ثابت، لبنیات روزانه، نان تازه و تنقلات؛ صف صندوق عصرها و قفسه‌هایی که باید همیشه پر باشد.',
  },
  {
    id: 'chain',
    name: 'زنجیره خرده‌فروشی «زیتون سبز»',
    tagline: 'زنجیره استانی ۸ شعبه‌ای — از کرمان تا زاهدان',
    branches: [
      'کرمان — فلکه گاز (هیجان انگیز پررفت‌وآمد)',
      'کرمان — بلوار امام خمینی',
      'سیرجان — بازار بزرگ',
      'رفسنجان — بلوار شهید رجایی',
      'زاهدان — خیابان فردوسی',
      'بم — خیابان معلم',
      'جیرفت — بلوار دانشجو',
      'کهنوج — بازار روز',
    ],
    staffCount: '۴۲ نفر',
    monthlyOrders: '۱۲۰۰+ سفارش فروش در ماه',
    desc: 'زنجیره استانی پرحجم با انبار مرکزی، پخش‌کنندگان متعدد، چک‌های زنجیره‌ای و رقابت شدید بر سر قیمت؛ مدیریت مرکزی به دید زنده روی همه شعب نیاز دارد.',
  },
]

// ============ مقیاس هر پرسونا ============

interface PersonaScale {
  products: number
  suppliers: number
  orders: number
  saleOrders: number
  customers: number
  tasks: number
  activities: number
  planograms: number
  warehouseRequests: number
  customerRequests: number
  feedbacks: number
  ideas: number
  wallPosts: number
}

const PERSONA_SCALE: Record<DemoPersona['id'], PersonaScale> = {
  gourmet: { products: 90, suppliers: 10, orders: 26, saleOrders: 140, customers: 30, tasks: 18, activities: 60, planograms: 2, warehouseRequests: 5, customerRequests: 4, feedbacks: 5, ideas: 4, wallPosts: 4 },
  neighborhood: { products: 55, suppliers: 4, orders: 10, saleOrders: 60, customers: 18, tasks: 14, activities: 40, planograms: 2, warehouseRequests: 4, customerRequests: 3, feedbacks: 4, ideas: 3, wallPosts: 3 },
  chain: { products: 140, suppliers: 14, orders: 48, saleOrders: 260, customers: 45, tasks: 22, activities: 90, planograms: 3, warehouseRequests: 6, customerRequests: 5, feedbacks: 6, ideas: 5, wallPosts: 5 },
}

// ============ PRNG seed-دار ============

function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rnd = () => number
const ri = (rnd: Rnd, a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))
const pick = <T,>(rnd: Rnd, arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]
const chance = (rnd: Rnd, p: number) => rnd() < p
const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))
const DAY = 86400000

/** ساعت تهران‌محور روی یک Date روز معین — ساعت کاری ۱۰ تا ۲۱ واقعاً در تهران بماند */
function atTehranHour(dayEpoch: number, tehranHour: number, minute: number): Date {
  const d = new Date(dayEpoch)
  d.setUTCHours(0, 0, 0, 0) // نیمه‌شب UTC همان روز
  const totalMin = Math.round(tehranHour * 60 - 3.5 * 60) + minute
  d.setUTCHours(Math.floor(totalMin / 60), ((totalMin % 60) + 60) % 60, 0, 0)
  return d
}

// ============ کاتالوگ کالاها ============

interface ProductSpec {
  item: string
  price: number // تومان — فروش
  unit?: string
  isWeight?: boolean
}
interface CatalogCat {
  category: string
  brandPool: readonly string[]
  minStock?: [number, number]
  items: readonly ProductSpec[]
}

const IRAN_BRANDS = ['کوهسار', 'دشت ناب', 'زرینه', 'بهار نارنج', 'گلستان زیتون', 'شیرین عصر', 'کیمیا دانه', 'هفت‌آسمان', 'سحرخیز', 'گلبرگ کرمان', 'مادران سبز', 'دماوند سبز', 'دریای مهر'] as const
const IMPORT_BRANDS = ['Casa Verde', 'Nordkapp', 'Bel Mor', 'Val Rosso'] as const

const GOURMET_CATALOG: CatalogCat[] = [
  {
    category: 'قهوه و کافئین',
    brandPool: ['کیمیا دانه', 'Casa Verde', 'Nordkapp'],
    minStock: [4, 10],
    items: [
      { item: 'قهوه اسپرسو ۱۰۰٪ عربیکا — ۲۵۰ گرم', price: 420000, unit: 'بسته' },
      { item: 'قهوه ترک آسیاب نرم — ۲۰۰ گرم', price: 185000, unit: 'بسته' },
      { item: 'قهوه تک‌خاستگاه اتیوپی — ۲۵۰ گرم', price: 560000, unit: 'بسته' },
      { item: 'دانه قهوه لایت رست — ۱ کیلوگرم', price: 1450000, unit: 'بسته' },
      { item: 'کپسول قهوه سازگار — بسته ۱۰ عددی', price: 290000, unit: 'بسته' },
      { item: 'قهوه سرد دم‌کرده — ۳۳۰ میلی‌لیتر', price: 145000, unit: 'قوطی' },
    ],
  },
  {
    category: 'خشکبار و زعفران',
    brandPool: ['کوهسار', 'دشت ناب', 'هفت‌آسمان'],
    minStock: [5, 14],
    items: [
      { item: 'پسته اعلاء دمغان — ۵۰۰ گرم', price: 985000, unit: 'بسته' },
      { item: 'بادام درختی مامایی — ۵۰۰ گرم', price: 620000, unit: 'بسته' },
      { item: 'کشمش ملایز تیزابی — ۷۰۰ گرم', price: 185000, unit: 'بسته' },
      { item: 'گردوی تازه دولعه — ۵۰۰ گرم', price: 480000, unit: 'بسته' },
      { item: 'زعفران سرگل قائنات — ۴/۶ گرم', price: 690000, unit: 'بسته' },
      { item: 'خرمای مضافتی ممتاز — ۶۰۰ گرم', price: 135000, unit: 'بسته' },
      { item: 'بریژه خرما و گردو — ۳۰۰ گرم', price: 240000, unit: 'بسته' },
    ],
  },
  {
    category: 'پنیر و لبنیات ممتاز',
    brandPool: ['Nordkapp', 'دشت ناب', 'بهار نارنج'],
    minStock: [6, 16],
    items: [
      { item: 'پنیر بری کمپبر — ۱۲۵ گرم', price: 325000, unit: 'عدد' },
      { item: 'پنیر پارمزان رنده‌شده — ۱۵۰ گرم', price: 445000, unit: 'بسته' },
      { item: 'پنیر آبی دانمارکی — ۱۵۰ گرم', price: 390000, unit: 'عدد' },
      { item: 'ماست یونانی پرپروتئین — ۵۰۰ گرم', price: 135000, unit: 'بسته' },
      { item: 'کره حیوانی اعلاء — ۴۰۰ گرم', price: 245000, unit: 'عدد' },
      { item: 'شیر کیسه‌ای پاستوریزه — ۹۰۰ میلی‌لیتر', price: 48000, unit: 'کیسه' },
    ],
  },
  {
    category: 'شکلات و کاکائو',
    brandPool: ['Bel Mor', 'Val Rosso', 'شیرین عصر'],
    minStock: [5, 12],
    items: [
      { item: 'شکلات تلخ ۷۰٪ بلژیکی — ۱۰۰ گرم', price: 185000, unit: 'عدد' },
      { item: 'شکلات شیری هلندی — ۲۰۰ گرم', price: 240000, unit: 'عدد' },
      { item: 'تروف شکلات دست‌ساز — بسته ۹ عددی', price: 420000, unit: 'جعبه' },
      { item: 'کاکائو پودر تلخ — ۲۵۰ گرم', price: 165000, unit: 'بسته' },
      { item: 'شکلات هات‌چاکلت — بسته ۲ عددی', price: 95000, unit: 'بسته' },
    ],
  },
  {
    category: 'خاویار و دریایی',
    brandPool: ['دریای مهر', 'دماوند سبز'],
    minStock: [3, 8],
    items: [
      { item: 'خاویار پرورشی دریای مهر — ۳۰ گرم', price: 2400000, unit: 'قوطی' },
      { item: 'خاویار ستر اصول — ۵۰ گرم', price: 3900000, unit: 'قوطی' },
      { item: 'ماهی قزل‌آلای دودی — ۲۰۰ گرم', price: 285000, unit: 'بسته' },
      { item: 'میگو پاک‌شده باشگاهی — ۴۵۰ گرم', price: 520000, unit: 'بسته' },
      { item: 'تن ماهی گورمت روغن زیتون — ۱۸۰ گرم', price: 145000, unit: 'قوطی' },
    ],
  },
  {
    category: 'روغن و سرکه‌های خاص',
    brandPool: ['Casa Verde', 'گلستان زیتون'],
    minStock: [4, 10],
    items: [
      { item: 'روغن زیتون فرابکر — ۵۰۰ میلی‌لیتر', price: 690000, unit: 'عدد' },
      { item: 'روغن زیتون سبوس‌دار — ۱ لیتر', price: 780000, unit: 'عدد' },
      { item: 'سرکه بالزامیک مودنا — ۲۵۰ میلی‌لیتر', price: 320000, unit: 'عدد' },
      { item: 'روغن کنجد پرس سرد — ۵۰۰ میلی‌لیتر', price: 285000, unit: 'عدد' },
      { item: 'روغن آووکادو — ۲۵۰ میلی‌لیتر', price: 450000, unit: 'عدد' },
    ],
  },
  {
    category: 'کنسرو گورمت',
    brandPool: ['Casa Verde', 'Val Rosso'],
    minStock: [4, 12],
    items: [
      { item: 'آرتیشوی پرورده — ۳۱۴ میلی‌لیتر', price: 245000, unit: 'قوطی' },
      { item: 'خیارشور گورمت سیر کوهی — ۷۲۰ گرم', price: 135000, unit: 'شیشه' },
      { item: 'سس گوجه ایتالیایی — ۴۰۰ گرم', price: 165000, unit: 'قوطی' },
      { item: 'قارچ درسته در سرکه — ۳۱۴ گرم', price: 185000, unit: 'شیشه' },
      { item: 'حلزون پخته آماده — ۵۰ گرم', price: 390000, unit: 'قوطی' },
    ],
  },
  {
    category: 'دمنوش و گیاهان دارایی',
    brandPool: ['مادران سبز', 'سحرخیز'],
    minStock: [5, 12],
    items: [
      { item: 'دمنوش به‌لیمو و گل گاوزبان — ۲۰ بسته', price: 125000, unit: 'بسته' },
      { item: 'دمنوش چای سبز یاسمین — ۲۰ بسته', price: 145000, unit: 'بسته' },
      { item: 'عسل کنار طبیعی — ۹۰۰ گرم', price: 485000, unit: 'شیشه' },
      { item: 'عسل گون سبلان — ۵۰۰ گرم', price: 390000, unit: 'شیشه' },
      { item: 'رویان خشک ممتاز — ۱۰۰ گرم', price: 220000, unit: 'بسته' },
    ],
  },
  {
    category: 'سس و چاشنی وارداتی',
    brandPool: ['Casa Verde', 'Nordkapp'],
    minStock: [4, 12],
    items: [
      { item: 'سس سویا کم‌نمک — ۲۵۰ میلی‌لیتر', price: 135000, unit: 'عدد' },
      { item: 'سس ووسترشایر — ۱۵۰ میلی‌لیتر', price: 165000, unit: 'عدد' },
      { item: 'خردل دیژون — ۲۱۰ گرم', price: 185000, unit: 'عدد' },
      { item: 'سس تارتار گورمت — ۳۰۰ گرم', price: 125000, unit: 'عدد' },
      { item: 'پاستا ایتالیایی سمولینا — ۵۰۰ گرم', price: 145000, unit: 'بسته' },
    ],
  },
  {
    category: 'نان و کیک تازه',
    brandPool: ['گلبرگ کرمان', 'شیرین عصر'],
    minStock: [4, 10],
    items: [
      { item: 'باقلوای پسته کرمان — جعبه ۵۰۰ گرم', price: 425000, unit: 'جعبه' },
      { item: 'کیک خرمایی دارچینی — ۴۵۰ گرم', price: 185000, unit: 'عدد' },
      { item: 'نان تست سبوس‌دار — ۴۵۰ گرم', price: 68000, unit: 'بسته' },
      { item: 'کلوچه سنتی کرمان — جعبه ۶۰۰ گرم', price: 155000, unit: 'جعبه' },
      { item: 'نان خمیر ترش رومی — ۴۰۰ گرم', price: 125000, unit: 'عدد' },
    ],
  },
]

const NEIGHBORHOOD_CATALOG: CatalogCat[] = [
  {
    category: 'لبنیات',
    brandPool: ['دشت ناب', 'بهار نارنج'],
    minStock: [12, 30],
    items: [
      { item: 'شیر پرچرب — ۱ لیتر', price: 32000, unit: 'عدد' },
      { item: 'ماست ساده — ۹۰۰ گرم', price: 58000, unit: 'عدد' },
      { item: 'پنیر سفید ایرانی — ۴۰۰ گرم', price: 95000, unit: 'عدد' },
      { item: 'دوغ گازدار — ۱/۵ لیتر', price: 42000, unit: 'عدد' },
      { item: 'کشک — ۴۰۰ گرم', price: 55000, unit: 'عدد' },
      { item: 'خامه صبحانه — ۲۰۰ گرم', price: 48000, unit: 'عدد' },
      { item: 'کره گیاهی — ۱۰۰ گرم', price: 42000, unit: 'عدد' },
    ],
  },
  {
    category: 'نان و غلات',
    brandPool: ['سحرخیز', 'زرینه'],
    minStock: [10, 25],
    items: [
      { item: 'نان تست سفید — ۴۰۰ گرم', price: 55000, unit: 'بسته' },
      { item: 'نان سنگک تازه — بسته ۴ عددی', price: 35000, unit: 'بسته' },
      { item: 'برنج ایرانی درجه یک — ۵ کیلوگرم', price: 680000, unit: 'کیسه' },
      { item: 'ماکارونی فرمی — ۵۰۰ گرم', price: 38000, unit: 'بسته' },
      { item: 'نان باگت تازه', price: 18000, unit: 'عدد' },
      { item: 'جو دوسر پرک — ۵۰۰ گرم', price: 72000, unit: 'بسته' },
    ],
  },
  {
    category: 'نوشیدنی',
    brandPool: ['شیرین عصر', 'هفت‌آسمان'],
    minStock: [15, 40],
    items: [
      { item: 'نوشابه خانواده — ۱/۵ لیتر', price: 42000, unit: 'عدد' },
      { item: 'آب معدنی — ۱/۵ لیتر', price: 12000, unit: 'عدد' },
      { item: 'آبمیوه پرتقال — ۱ لیتر', price: 85000, unit: 'عدد' },
      { item: 'دوغ محلی — ۱ لیتر', price: 28000, unit: 'عدد' },
      { item: 'ماءالشعیر لیمویی — ۳۳۰ میلی‌لیتر', price: 25000, unit: 'قوطی' },
      { item: 'چای کیسه‌ای — جعبه ۱۰۰ عددی', price: 95000, unit: 'جعبه' },
    ],
  },
  {
    category: 'تنقلات',
    brandPool: ['شیرین عصر', 'کوهسار'],
    minStock: [12, 30],
    items: [
      { item: 'چیپس نمکی — بسته بزرگ', price: 28000, unit: 'بسته' },
      { item: 'پفک پنیری — بسته ۲ عددی', price: 32000, unit: 'بسته' },
      { item: 'بیسکویت ساقه طلایی — بسته ۱۲ عددی', price: 65000, unit: 'بسته' },
      { item: 'شکلات ساده — بسته ۴ عددی', price: 48000, unit: 'بسته' },
      { item: 'تخمه ژاپنی برشته — ۲۰۰ گرم', price: 45000, unit: 'بسته' },
      { item: 'پاپ کورن آماده — بسته ۳ عددی', price: 38000, unit: 'بسته' },
    ],
  },
  {
    category: 'شوینده و بهداشتی',
    brandPool: ['دماوند سبز', 'زرینه'],
    minStock: [8, 20],
    items: [
      { item: 'مایع ظرفشویی لیمویی — ۳/۵ لیتر', price: 145000, unit: 'عدد' },
      { item: 'پودر ماشین لباسشویی — ۴ کیلوگرم', price: 385000, unit: 'عدد' },
      { item: 'دستمال کاغذی — بسته ۶ رول', price: 65000, unit: 'بسته' },
      { item: 'صابون شست‌وشو — بسته ۴ عددی', price: 72000, unit: 'بسته' },
      { item: 'جرم‌گیر حمام — ۱ لیتر', price: 85000, unit: 'عدد' },
      { item: 'اسپری خوشبوکننده — ۳۰۰ میلی‌لیتر', price: 68000, unit: 'عدد' },
    ],
  },
  {
    category: 'کنسرو و غذای آماده',
    brandPool: ['مادران سبز', 'هفت‌آسمان'],
    minStock: [10, 24],
    items: [
      { item: 'تن ماهی — ۱۸۰ گرم', price: 98000, unit: 'قوطی' },
      { item: 'رب گوجه‌فرنگی — ۸۰۰ گرم', price: 92000, unit: 'عدد' },
      { item: 'خیارشور — ۱/۷ کیلوگرم', price: 78000, unit: 'شیشه' },
      { item: 'عدسی کنسرو — ۴۰۰ گرم', price: 45000, unit: 'قوطی' },
      { item: 'غذای آماده لوبیا پلو — ۴۰۰ گرم', price: 85000, unit: 'قوطی' },
      { item: 'رشته‌آش ترش — بسته ۵۰۰ گرم', price: 32000, unit: 'بسته' },
    ],
  },
  {
    category: 'صبحانه',
    brandPool: ['سحرخیز', 'بهار نارنج'],
    minStock: [8, 20],
    items: [
      { item: 'عسل طبیعی — ۵۰۰ گرم', price: 285000, unit: 'شیشه' },
      { item: 'کرم کاکائو صبحانه — ۳۵۰ گرم', price: 118000, unit: 'عدد' },
      { item: 'مربای آلبالو — ۳۵۰ گرم', price: 62000, unit: 'عدد' },
      { item: 'پنیر خامه‌ای — ۲۰۰ گرم', price: 75000, unit: 'عدد' },
      { item: 'حلیم آماده — ۴۰۰ گرم', price: 58000, unit: 'قوطی' },
      { item: 'کره بادام‌زمینی — ۳۵۰ گرم', price: 145000, unit: 'عدد' },
    ],
  },
  {
    category: 'یخچالی',
    brandPool: ['دشت ناب', 'زرینه'],
    minStock: [10, 24],
    items: [
      { item: 'سوسیس کوکتل — ۵۰۰ گرم', price: 128000, unit: 'بسته' },
      { item: 'کالباس مرغ — ۴۰۰ گرم', price: 98000, unit: 'عدد' },
      { item: 'سالامی گوشت — ۲۰۰ گرم', price: 145000, unit: 'عدد' },
      { item: 'تخم مرغ — شانه ۲۰ عددی', price: 135000, unit: 'شانه' },
      { item: 'پنیر پیتزا رنده‌شده — ۵۰۰ گرم', price: 185000, unit: 'بسته' },
      { item: 'ژامبون بوقلمون — ۲۰۰ گرم', price: 155000, unit: 'عدد' },
    ],
  },
]

const CHAIN_EXTRA_CATALOG: CatalogCat[] = [
  {
    category: 'میوه و سبزی',
    brandPool: ['مادران سبز', 'گلبرگ کرمان'],
    minStock: [15, 40],
    items: [
      { item: 'سیب قرمز دماوند', price: 58000, unit: 'کیلوگرم', isWeight: true },
      { item: 'پرتقال تامسون ساوه', price: 48000, unit: 'کیلوگرم', isWeight: true },
      { item: 'خیار گلخانه‌ای', price: 42000, unit: 'کیلوگرم', isWeight: true },
      { item: 'گوجه‌فرنگی بوته‌ای', price: 35000, unit: 'کیلوگرم', isWeight: true },
      { item: 'موز وارداتی اکوادور', price: 95000, unit: 'کیلوگرم', isWeight: true },
      { item: 'سیب‌زمینی ممتاز', price: 28000, unit: 'کیلوگرم', isWeight: true },
      { item: 'سبزی خوردن آماده — ۳۰۰ گرم', price: 32000, unit: 'بسته' },
      { item: 'لیمو ترش شیراز', price: 65000, unit: 'کیلوگرم', isWeight: true },
      { item: 'هویج آب‌دار', price: 25000, unit: 'کیلوگرم', isWeight: true },
      { item: 'کاهو پیچ', price: 22000, unit: 'عدد' },
    ],
  },
  {
    category: 'پروتئین تازه',
    brandPool: ['دماوند سبز', 'دشت ناب'],
    minStock: [12, 30],
    items: [
      { item: 'مرغ کامل کشتار روز', price: 185000, unit: 'کیلوگرم', isWeight: true },
      { item: 'ران مرغ بدون استخوان', price: 215000, unit: 'کیلوگرم', isWeight: true },
      { item: 'گوشت گوسفند ران', price: 680000, unit: 'کیلوگرم', isWeight: true },
      { item: 'گوشت چرخ‌کرده مخلوط', price: 520000, unit: 'کیلوگرم', isWeight: true },
      { item: 'فیله ماهی شیر', price: 385000, unit: 'کیلوگرم', isWeight: true },
      { item: 'تخم مرغ — بسته ۳۰ عددی', price: 198000, unit: 'شانه' },
    ],
  },
  {
    category: 'فریزر',
    brandPool: ['هفت‌آسمان', 'سحرخیز'],
    minStock: [8, 20],
    items: [
      { item: 'پیتزا آماده مخلوط', price: 128000, unit: 'عدد' },
      { item: 'سیب‌زمینی سرخ‌کرده فریزر — ۹۰۰ گرم', price: 85000, unit: 'بسته' },
      { item: 'سبزی مخلوط فریزر — ۴۰۰ گرم', price: 58000, unit: 'بسته' },
      { item: 'میگو فریزر — ۴۵۰ گرم', price: 295000, unit: 'بسته' },
      { item: 'بستنی وانیلی خانواده — ۱ لیتر', price: 95000, unit: 'عدد' },
      { item: 'ناچوز پنیری فریزری — ۵۰۰ گرم', price: 115000, unit: 'بسته' },
    ],
  },
  {
    category: 'لوازم برقی کوچک',
    brandPool: ['زرینه', 'دماوند سبز'],
    minStock: [2, 6],
    items: [
      { item: 'قهوه‌ساز اسپرسو خانگی', price: 3850000, unit: 'دستگاه' },
      { item: 'کتری برقی ۱/۷ لیتر', price: 1150000, unit: 'دستگاه' },
      { item: 'سرخ‌کن بدون روغن ۵ لیتری', price: 4850000, unit: 'دستگاه' },
      { item: 'چرخ‌گوشت برقی', price: 2150000, unit: 'دستگاه' },
      { item: 'مخلوط‌کن حرفه‌ای', price: 1650000, unit: 'دستگاه' },
      { item: 'تُست‌ر ۴ تکه', price: 985000, unit: 'دستگاه' },
      { item: 'آبمیوه‌گیری خانگی', price: 2450000, unit: 'دستگاه' },
      { item: 'گریل برقی ساندویچ', price: 890000, unit: 'دستگاه' },
    ],
  },
]

function buildCatalog(personaId: DemoPersona['id']): CatalogCat[] {
  if (personaId === 'gourmet') return GOURMET_CATALOG
  if (personaId === 'neighborhood') return NEIGHBORHOOD_CATALOG
  return [...NEIGHBORHOOD_CATALOG, ...CHAIN_EXTRA_CATALOG]
}

// ============ استخرها و متن‌ها ============

const SUPPLIER_POOL = [
  { name: 'پخش سراسری کوهسار', type: 'DISTRIBUTOR' },
  { name: 'بازرگانی زعفران پارس — مشهد', type: 'MANUFACTURER' },
  { name: 'شرکت واردات دلتا ترید', type: 'BOTH' },
  { name: 'پخش لبنیات دشت ناب', type: 'DISTRIBUTOR' },
  { name: 'توزیع خشکبار گلستان — تهران', type: 'DISTRIBUTOR' },
  { name: 'پخش نوشیدنی هفت‌آسمان', type: 'MANUFACTURER' },
  { name: 'بازرگانی بهار نارنج — شیراز', type: 'BOTH' },
  { name: 'پخش شوینده دماوند سبز', type: 'MANUFACTURER' },
  { name: 'شرکت بازرگانی آریا تجارت', type: 'DISTRIBUTOR' },
  { name: 'پخش پروتئین دشت ناب', type: 'BOTH' },
  { name: 'بازرگانی میوه و سبزی مزرعه سبز', type: 'MANUFACTURER' },
  { name: 'پخش لوازم خانگی زرینه', type: 'DISTRIBUTOR' },
  { name: 'شرکت کالای یخچالی سحرخیز', type: 'BOTH' },
  { name: 'پخش مرکزی زیتون سبز', type: 'DISTRIBUTOR' },
] as const

const CONTACT_NAMES = ['آقای رضایی', 'خانم موسوی', 'آقای کاظمی', 'خانم بهرامی', 'آقای شفیعی', 'خانم نجفی', 'آقای دهقان', 'خانم آرین‌پور', 'آقای صابونی', 'خانم فرهمند'] as const

const FIRST_NAMES = ['خانم رضایی', 'آقای کریمی', 'خانم محمدی', 'آقای حسینی', 'خانم نوری', 'آقای عباسی', 'خانم شاهمرادی', 'آقای ابراهیمی', 'خانم زهرایی', 'آقای برومند', 'خانم دادگر', 'آقای صمدی', 'خانم کوثری', 'آقای یزدانی', 'خانم فرجی', 'آقای مهرآبادی', 'خانم اسدی', 'آقای رحیمی'] as const

const GOURMET_CUSTOMER_NAMES = ['کافه مهر', 'رستوران شتری‌نو', 'کترینگ زعفران', 'هتل پارسیان — کرمان', 'کافه گالری لاله‌زار', 'شیرینی‌سرای بهار', 'رستوران سنتی گنجعلی‌خان', 'کافه رست — چهارباغ', 'آقای آرش دهقان', 'خانم لیدا فرهادی'] as const

const CUSTOMER_PREFERENCES = ['قهوه اتیوپی', 'شکلات تلخ ۷۰٪', 'پسته اعلاء', 'لبنیات کم‌چرب', 'نان تازه صبح', 'میوه فصل', 'پروتئین تازه', 'دمنوش آرام‌بخش', 'خاویار هدیه', 'بدون ماده نگهدارنده'] as const

const TASK_POOL = [
  { title: 'شمارش سریع قفسه لبنیات', checklist: ['برگه شمارش را پر کن', 'اختلاف با سیستم را ثبت کن'] },
  { title: 'چیدمان پروموشن ماست جدید', checklist: ['پالت تبلیغاتی را بچین', 'برچسب قیمت قرمز بزن'] },
  { title: 'بررسی تاریخ‌های نزدیک بخش شیرینی', checklist: ['کالاهای زیر ۷ روز را جدا کن', 'لیست تخفیف را به صندوق بده'] },
  { title: 'سرکشی به انبار خشک', checklist: [] },
  { title: 'تمیز کردن قفسه‌های قهوه', checklist: [] },
  { title: 'آموزش صندوق‌دار جدید', checklist: ['آموزش ورود اولیه', 'بستن شیفت آزمایشی'] },
  { title: 'چک کردن دمای یخچال‌های فروشگاه', checklist: [] },
  { title: 'موجودی‌گیری روزانه بخش تنقلات', checklist: [] },
  { title: 'چیدمان سبد تخفیفی ورودی فروشگاه', checklist: ['سبدها را پر کن', 'تابلوی قیمت را بگذار'] },
  { title: 'به‌روزرسانی تابلوی قیمت نوشیدنی‌ها', checklist: [] },
  { title: 'جمع‌آوری سبدخریدهای پارکینگ', checklist: [] },
  { title: 'هماهنگی بار اول صبح با تحویل‌گیرنده', checklist: [] },
  { title: 'به‌روزرسانی تابلوی قیمت میوه', checklist: [] },
  { title: 'تمیزکاری بخش پروتئین', checklist: ['دستگاه برش را ضدعفونی کن'] },
  { title: 'پیگیری سفارش گم‌شده پخش کوهسار', checklist: [] },
  { title: 'چیدمان ویترین نان تازه', checklist: [] },
  { title: 'چاپ برچسب قیمت‌های جدید شکلات', checklist: [] },
  { title: 'بررسی و جلوسانی قفسه شوینده‌ها', checklist: [] },
  { title: 'کنترل بارکدخوان صندوق دو', checklist: [] },
  { title: 'آماده‌سازی ویترین روز مادر', checklist: [] },
  { title: 'گزارش موجودی صفرها به سرپرست انبار', checklist: [] },
  { title: 'چیدمان غرفه چای و دمنوش', checklist: ['قفسه‌ها را برند به برند بچین'] },
] as const

const ACTIVITY_TITLES: Record<string, readonly string[]> = {
  TASK_DONE: ['تکمیل شمارش قفسه لبنیات', 'انجام وظیفه چیدمان پروموشن', 'بستن گزارش پایان شیفت'],
  DELIVERY: ['دریافت بار صبح از پخش کوهسار', 'پذیرش مرسولات انبار مرکزی', 'تحویل‌گیری بار عصر پخش لبنیات'],
  CLEANING: ['نظافت بخش قهوه و کافئین', 'مرتب‌سازی قفسه‌های شوینده', 'شست‌وشوی ویترین میوه'],
  HELP: ['کمک به تخلیه بار انبار', 'همیاری در صندوق شلوغ عصر', 'کمک به همکار برای جلوسانی'],
  SHELF_STOCK: ['پرکردن قفسه لبنیات', 'چیدمان میوه تازه صبحگاهی', 'جلوسانی قفسه تنقلات'],
  IDEA: ['پیشنهاد چیدمان سبد تخفیفی', 'ایده برچسب تاریخ روی ویترین'],
  CUSTOMER_SERVICE: ['راهنمایی مشتری و حمل سبد تا درب', 'پیگیری درخواست ویژه مشتری', 'پذیرش محترمانه مرجوعی'],
  MANUAL_AWARD: ['قدردانی مدیر بابت نظم قفسه‌ها', 'تشویق ویژه کارمند نمونه هفته', 'قدردانی از همکاری تیمی در بار صبح'],
}

const WALL_POSTS = [
  { content: '🎉 پروموشن پسته نوروزی از شنبه شروع می‌شود — آماده‌سازی قفسه‌ها و برچسب‌های تخفیف را فراموش نکنید. تیم چیدمان حسابی روی آنت هستیم!', pinned: true },
  { content: 'به همکاران جدید خوش آمدید! صبح‌ها چای تازه در اتاق کارکنان آماده است ☕🌿 سؤالی داشتید، بپرسید — همه‌مان روز اول بودیم.', pinned: false },
  { content: 'یادآوری دوستانه: کالاهای نزدیک به انقضا در بخش شیرینی را حتماً جلوسان کنید — کیفیت، اعتبار ماست 🌿', pinned: false },
  { content: 'امتیازهای این هفته ثبت شد؛ تابلوی شایستگی را ببینید 🏅 سه نفر اول جمعه هدیه دارند!', pinned: false },
  { content: 'جلسه کوتاه تیمی فردا ساعت ۸ صبح پشت صحنه — ۱۰ دقیقه بیشتر طول نمی‌کشد. حضور همه‌ی عزیزان گرامی.', pinned: false },
] as const

const FEEDBACK_POOL = [
  { category: 'محیط کار', rating: 4, content: 'چراغ بخش قهوه کمی کم‌نور است؛ برای چیدمان دقیق و چک کردن تاریخ‌ها کمی روشن‌تر شود.', status: 'NEW', response: null },
  { category: 'پلتفرم', rating: 5, content: 'پلتفرم زیتون ثبت سفارش‌ها را خیلی سریع کرده. فقط لطفاً حالت شب هم این‌قدر قشنگ بماند 🙂', status: 'REVIEWED', response: 'حالت شب بررسی و بهبود داده شد — ممنون از توجه دقیقت 🙏' },
  { category: 'گردش کار', rating: 3, content: 'دریافت بار عصرگاهی گاهی دو نفر می‌خواهد؛ برنامه شیفت عصر بهتر چیده شود.', status: 'NEW', response: null },
  { category: 'پلتفرم', rating: 5, content: 'اگر چک‌های نزدیک سرسید هم روی داشبورد نمایش داده شود دیگر هیچ چیزی از قلم نمی‌افتد.', status: 'ACTIONED', response: 'کارت هشدار چک‌های نزدیک و گذشته به داشبورد اضافه شد — پیشنهاد طلایی بود 🏅' },
  { category: 'محیط کار', rating: 4, content: 'انبار خشک به هم ریخته شده بود؛ قفسه‌بندی جدید و برچسب ردیف واقعاً کمک می‌کند.', status: 'ACTIONED', response: 'انبار مرتب شد و قفسه‌بندی جدید نصب شد. ممنون که گزارش دادی 🌿' },
  { category: 'گردش کار', rating: 4, content: 'ثبت هلو با یک کلیک عالیه؛ فقط اگر برگه دریافتی هم آرشیو دیجیتال داشته باشد کامل می‌شود.', status: 'NEW', response: null },
] as const

const IDEA_POOL = [
  { title: 'چراغ یادآور تاریخ انقضا در پلانوگرام', content: 'روی خانه‌های پلانوگرام، کالاهای نزدیک به انقضا یک هلال زرد بگیرند تا چیدمان جلوسان هم‌زمان یادآوری شود.' },
  { title: 'سبد تخفیف پایان هفته کنار صندوق', content: 'یک سبد گردشی کنار صندوق برای کالاهای نزدیک به انقضا با برچسب تخفیف — هم قفسه سبک می‌شود هم مشتری خوشحال.' },
  { title: 'چاپ برچسب حرارتی برای کالاهای وزنی', content: 'برای بخش میوه و پروتئین یک چاپگر برچسب وزنی بگذاریم تا وزن و قیمت روی همان برچسب صندوق چاپ شود.' },
  { title: 'شیفت صبح شنبه‌ها دو نفره شود', content: 'شنبه‌ها بار هفتگی می‌آید؛ پذیرش بار با یک نفر طول می‌کشد و مشتری معطل می‌ماند.' },
  { title: 'جلسه چشایی ماهانه برای مشتریان VIP', content: 'ماهی یک‌بار چشایی قهوه و شکلات جدید برای مشتریان ثابت — هم وفاداری می‌آورد هم بازخورد مستقیم.' },
] as const

const CUSTOMER_REQUEST_POOL = ['شیر بادام', 'نان دونات شکلاتی', 'پنیر فتای بلغاری', 'آبمیوه انار بدون شکر', 'کره بادام‌زمینی ترد'] as const

const ORDER_NOTES = ['لطفاً صبح زود ارسال شود', 'فاکتور رسمی جدا همراه بار باشد', 'هماهنگی قبلی با انبار انجام شود', 'بار با نامه حمل تحویل داده شود'] as const

const STANDALONE_CHEQUES = [
  { purpose: 'خرید تجهیزات قفسه', payeeName: 'شرکت تجهیزات فروشگاهی آرین', status: 'WRITTEN' },
  { purpose: 'وام مسکن مدیر', payeeName: 'بانک رفاه کارگران — شعبه کرمان', status: 'UNCOLLECTED' },
  { purpose: 'نقدی به پخش نوشیدنی', payeeName: 'پخش نوشیدنی هفت‌آسمان', status: 'PENDING_OWNER' },
] as const

// ============ تایپ‌های داخلی ============

interface DemoProduct {
  id: string
  name: string
  barcode: string
  price: number
  cost: number
  stock: number
  minStock: number
  unit: string
  category: string
  isWeight: boolean
  companyId: string
}

interface DemoOrder {
  id: string
  number: number
  supplierId: string
  createdById: string
  status: string
  deliveryDate: string
  paymentType: string
  totalAmount: number
  discount: number
  tax: number
  vat: number
  finalAmount: number
  notes: string | null
  createdAt: Date
  receivedAt: Date | null
  receivedById: string | null
  inspectedAt: Date | null
  inspectedById: string | null
  exportedAt: Date | null
  doneAt: Date | null
  holooRef: string | null
  lockedAt: Date | null
}

interface DemoCheque {
  id: string
  number: string
  amount: number
  dueDate: string
  status: string
  payeeName: string
  payeePhone: string | null
  orderId: string | null
  purpose: string | null
  writtenAt: Date | null
  collectedAt: Date | null
  createdById: string
  createdAt: Date
}

const ORDER_STATUS_FLOW = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXPECTED', 'RECEIVED', 'INSPECTED', 'TO_HOLOO', 'DONE']
const statusIndex = (s: string) => ORDER_STATUS_FLOW.indexOf(s)

// ============ رجیستری ============

export interface DemoRegistry {
  personaId: DemoPersona['id']
  at: string
  ids: {
    productIds: string[]
    supplierIds: string[]
    orderIds: string[]
    chequeIds: string[]
    paymentIds: string[]
    saleOrderIds: string[]
    customerIds: string[]
    taskIds: string[]
    activityIds: string[]
    wallPostIds: string[]
    feedbackIds: string[]
    ideaIds: string[]
    planogramIds: string[]
    warehouseRequestIds: string[]
    customerRequestIds: string[]
    companyIds: string[]
  }
  counts: Record<string, number>
}

const REGISTRY_KEY = 'demo_registry'

async function readRegistry(): Promise<DemoRegistry | null> {
  const row = await db.setting.findUnique({ where: { key: REGISTRY_KEY } })
  if (!row) return null
  try {
    return JSON.parse(row.value) as DemoRegistry
  } catch {
    return null
  }
}

export async function getDemoStatus(): Promise<{ active: boolean; personaId?: string; at?: string; counts?: Record<string, number> }> {
  const reg = await readRegistry()
  if (!reg) return { active: false }
  return { active: true, personaId: reg.personaId, at: reg.at, counts: reg.counts }
}

// ============ تولید داده ============

export async function generateDemo(
  personaId: DemoPersona['id'],
  creator: { id: string; name: string },
): Promise<{ counts: Record<string, number>; persona: DemoPersona }> {
  const persona = DEMO_PERSONAS.find((p) => p.id === personaId)
  if (!persona) throw new Error('شخصیت دمو یافت نشد')
  const scale = PERSONA_SCALE[personaId]
  const rnd = mulberry32(hashSeed(`zeytoon-demo-${personaId}`))
  const runKey = Date.now().toString(36)
  let seq = 0
  const nid = (kind: string) => `demo_${runKey}_${kind}_${seq++}`
  const today = todayJalali()

  const ids: DemoRegistry['ids'] = {
    productIds: [], supplierIds: [], orderIds: [], chequeIds: [], paymentIds: [], saleOrderIds: [],
    customerIds: [], taskIds: [], activityIds: [], wallPostIds: [], feedbackIds: [], ideaIds: [],
    planogramIds: [], warehouseRequestIds: [], customerRequestIds: [], companyIds: [],
  }

  // --- کاربران واقعی برای فیلدهای createdBy ---
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true, roles: true, primaryRole: true } })
  const usersWithRole = (role: string) => users.filter((u) => { try { return (JSON.parse(u.roles) as string[]).includes(role) } catch { return false } })
  const managers = [...usersWithRole('GENERAL_MANAGER'), ...usersWithRole('OPERATION_MANAGER'), ...usersWithRole('OWNER')]
  const accountants = usersWithRole('ACCOUNTANT')
  const cashiers = [...usersWithRole('HEAD_CASHIER'), ...usersWithRole('CASHIER')]
  const salespeople = usersWithRole('SALESPERSON')
  const merchandisers = usersWithRole('MERCHANDISER')
  const receivers = [...usersWithRole('DELIVERY_RECEIVER'), ...usersWithRole('INVENTORY_SUPERVISOR')]
  const supervisors = usersWithRole('INVENTORY_SUPERVISOR')
  const staffAll = users
  const fb = <T,>(arr: T[], fallback: T[]): T[] => (arr.length ? arr : fallback)
  const managerPool = fb(managers, staffAll)
  const accountantPool = fb(accountants, managerPool)
  const cashierPool = fb(cashiers, staffAll)
  const salesPool = fb(salespeople, fb(cashiers, staffAll))
  const merchPool = fb(merchandisers, salesPool)
  const receiverPool = fb(receivers, managerPool)
  const supervisorPool = fb(supervisors, managerPool)
  const managerId = managerPool[0].id

  try {
    // ---------- ۱) کاتالوگ ----------
    const catalog = buildCatalog(personaId)
    const usedBrands: string[] = []
    for (const cat of catalog) for (const b of cat.brandPool) if (!usedBrands.includes(b)) usedBrands.push(b)
    const companyMap = new Map<string, string>()
    const companyRows = usedBrands.map((b) => {
      const id = nid('cmp')
      companyMap.set(b, id)
      return { id, name: b }
    })
    await db.company.createMany({ data: companyRows })
    ids.companyIds.push(...companyRows.map((c) => c.id))

    const productRows: DemoProduct[] = []
    outer: for (const cat of catalog) {
      const [msMin, msMax] = cat.minStock || [5, 20]
      for (const spec of cat.items) {
        for (const brand of cat.brandPool) {
          if (productRows.length >= scale.products) break outer
          const isImport = !IRAN_BRANDS.includes(brand as (typeof IRAN_BRANDS)[number])
          const name = `${spec.item} ${brand}`
          let costFactor: number
          if (productRows.length % 7 === 3) costFactor = 0.92 // حاشیه سود کم
          else if (productRows.length % 5 === 1) costFactor = 0.72 // حاشیه سود بالا
          else costFactor = 0.78 + rnd() * 0.14
          const cost = Math.round((spec.price * costFactor) / 1000) * 1000
          const minStock = ri(rnd, msMin, msMax)
          const lowStock = chance(rnd, 0.15)
          const stock = lowStock ? Math.round(minStock * rnd() * 0.9) : Math.round(minStock * (1.2 + rnd() * 1.8))
          productRows.push({
            id: nid('prd'),
            name,
            barcode: `62${String(ri(rnd, 10000000000, 99999999999))}`,
            price: spec.price,
            cost,
            stock,
            minStock,
            unit: spec.unit || 'عدد',
            category: cat.category,
            isWeight: !!spec.isWeight,
            companyId: companyMap.get(brand) || '',
          })
        }
      }
    }
    await db.product.createMany({ data: productRows.map((p) => ({ ...p, holooName: p.name, barcodes: JSON.stringify([p.barcode]), companyId: p.companyId || null })) })
    ids.productIds.push(...productRows.map((p) => p.id))

    // ---------- ۲) تأمین‌کنندگان ----------
    const supplierRows: { id: string; name: string; phone: string; contactName: string; type: string; paymentType: string; companyIds: string[] }[] = []
    for (let i = 0; i < scale.suppliers; i++) {
      const src = SUPPLIER_POOL[i % SUPPLIER_POOL.length]
      const linkedCompanies = [pick(rnd, ids.companyIds)]
      if (ids.companyIds.length > 3 && chance(rnd, 0.6)) {
        const extra = pick(rnd, ids.companyIds)
        if (!linkedCompanies.includes(extra)) linkedCompanies.push(extra)
      }
      supplierRows.push({
        id: nid('sup'),
        name: src.name,
        phone: chance(rnd, 0.5) ? `0913${ri(rnd, 1000000, 9999999)}` : `034-${ri(rnd, 3000000, 3999999)}`,
        contactName: pick(rnd, CONTACT_NAMES),
        type: src.type,
        paymentType: chance(rnd, 0.6) ? 'CHEQUE' : 'CASH_ON_DELIVERY',
        companyIds: linkedCompanies,
      })
    }
    for (const s of supplierRows) {
      await db.supplier.create({
        data: {
          id: s.id, name: s.name, phone: s.phone, contactName: s.contactName, type: s.type, paymentType: s.paymentType,
          notes: `تأمین‌کننده داده دمو (${persona.name})`,
          companies: { connect: s.companyIds.map((id) => ({ id })) },
        },
      })
    }
    ids.supplierIds.push(...supplierRows.map((s) => s.id))

    // ---------- ۳) سفارشات خرید ----------
    const maxNo = (await db.order.aggregate({ _max: { number: true } }))._max.number || 100
    const STATUS_WEIGHTS: [string, number, number, number][] = [
      // [status, وزن, حداقل روز پیش, حداکثر روز پیش]
      ['DRAFT', 8, 0, 5], ['PENDING_APPROVAL', 7, 0, 5], ['APPROVED', 10, 1, 8], ['EXPECTED', 10, 2, 10],
      ['RECEIVED', 25, 8, 30], ['INSPECTED', 20, 12, 40], ['TO_HOLOO', 15, 15, 50], ['DONE', 5, 20, 55],
    ]
    const weightedStatus = () => {
      const total = STATUS_WEIGHTS.reduce((a, w) => a + w[1], 0)
      let r = rnd() * total
      for (const [s, w, minD, maxD] of STATUS_WEIGHTS) {
        r -= w
        if (r <= 0) return { status: s, daysAgo: ri(rnd, minD, maxD) }
      }
      return { status: 'APPROVED', daysAgo: ri(rnd, 1, 8) }
    }

    type ItemRow = { orderId: string; productId: string; productName: string; holooName: string; barcode: string; quantity: number; unitPrice: number; sellPrice: number; discount: number; lineTotal: number; receivedQty: number | null; status: string; note: string | null }
    const orderRows: DemoOrder[] = []
    const itemRows: ItemRow[] = []

    for (let i = 0; i < scale.orders; i++) {
      const { status, daysAgo } = weightedStatus()
      const createdAt = atTehranHour(Date.now() - daysAgo * DAY, 8 + rnd() * 9, ri(rnd, 0, 59))
      const supplier = pick(rnd, supplierRows)
      const future = statusIndex(status) < statusIndex('RECEIVED')
      const deliveryDate = future
        ? status === 'EXPECTED' && chance(rnd, 0.5)
          ? addDaysJalali(today, -ri(rnd, 2, 6)) // عمداً موعد گذشته برای نمایش هشدار
          : addDaysJalali(today, ri(rnd, 1, 5))
        : addDaysJalali(today, 2 - daysAgo)
      const paymentType = chance(rnd, 0.6) ? 'CHEQUE' : 'CASH_ON_DELIVERY'
      const si = statusIndex(status)

      const itemCount = ri(rnd, 3, 12)
      const orderItems: ItemRow[] = []
      for (let j = 0; j < itemCount; j++) {
        const p = pick(rnd, productRows)
        const qty = ri(rnd, 4, 40)
        const lineDiscount = chance(rnd, 0.25) ? ri(rnd, 1, 5) * 1000 : 0
        let receivedQty: number | null = null
        let itemStatus = 'OK'
        if (si >= statusIndex('RECEIVED')) {
          const r = rnd()
          receivedQty = r < 0.85 ? qty : r < 0.95 ? qty - 1 : qty + 1
          if (receivedQty < 0) receivedQty = 0
          if (chance(rnd, 0.03)) { itemStatus = 'MISSING'; receivedQty = 0 }
        }
        orderItems.push({
          orderId: '', productId: p.id, productName: p.name, holooName: p.name, barcode: p.barcode,
          quantity: qty, unitPrice: p.cost, sellPrice: p.price, discount: lineDiscount,
          lineTotal: qty * p.cost - lineDiscount, receivedQty, status: itemStatus,
          note: itemStatus === 'MISSING' ? 'در بار نیامده بود' : null,
        })
      }
      const totalAmount = orderItems.reduce((a, it) => a + it.lineTotal, 0)
      const discount = Math.round((totalAmount * (2 + rnd() * 3)) / 100 / 1000) * 1000
      const tax = Math.round((totalAmount - discount) * 0.09)
      const vat = tax
      const finalAmount = totalAmount - discount + tax + vat

      const receivedAt = si >= statusIndex('RECEIVED') ? new Date(createdAt.getTime() + ri(rnd, 1, 3) * DAY) : null
      const inspectedAt = si >= statusIndex('INSPECTED') ? new Date((receivedAt || createdAt).getTime() + ri(rnd, 1, 2) * DAY) : null
      const exportedAt = si >= statusIndex('TO_HOLOO') ? new Date((inspectedAt || createdAt).getTime() + 6 * 3600000) : null
      const doneAt = si >= statusIndex('DONE') ? new Date((exportedAt || createdAt).getTime() + ri(rnd, 1, 2) * DAY) : null

      orderRows.push({
        id: nid('ord'),
        number: maxNo + 1 + i,
        supplierId: supplier.id,
        createdById: pick(rnd, managerPool).id,
        status,
        deliveryDate,
        paymentType,
        totalAmount, discount, tax, vat, finalAmount,
        notes: chance(rnd, 0.35) ? pick(rnd, ORDER_NOTES) : null,
        createdAt,
        receivedAt,
        receivedById: receivedAt ? pick(rnd, receiverPool).id : null,
        inspectedAt,
        inspectedById: inspectedAt ? pick(rnd, supervisorPool).id : null,
        exportedAt,
        doneAt,
        holooRef: si >= statusIndex('TO_HOLOO') ? `HL-${ri(rnd, 10000, 99999)}` : null,
        lockedAt: receivedAt,
      })
      for (const it of orderItems) itemRows.push({ ...it, orderId: orderRows[orderRows.length - 1].id })
    }

    for (let i = 0; i < orderRows.length; i += 60) {
      await db.order.createMany({ data: orderRows.slice(i, i + 60) as never })
    }
    ids.orderIds.push(...orderRows.map((o) => o.id))
    for (let i = 0; i < itemRows.length; i += 120) {
      await db.orderItem.createMany({ data: itemRows.slice(i, i + 120) as never })
    }

    // ---------- ۴) چک‌ها ----------
    const chequeRows: DemoCheque[] = []
    const chequeable = orderRows.filter((o) => o.paymentType === 'CHEQUE' && statusIndex(o.status) >= statusIndex('RECEIVED'))
    const CHEQUE_STATUSES_POOL = ['PENDING_OWNER', 'WRITTEN', 'SIGNED', 'READY', 'COLLECTED', 'DONE'] as const
    let nearIdx = 0
    for (const o of chequeable) {
      const id = nid('chq')
      const status = nearIdx < 2 ? (nearIdx === 0 ? 'PENDING_OWNER' : 'WRITTEN') : pick(rnd, CHEQUE_STATUSES_POOL)
      // دو چک اول: سرسید نزدیک (۳-۶ روز بعد) برای نمایش هشدار تقویم
      let dueDate = nearIdx < 2 ? addDaysJalali(today, nearIdx === 0 ? 3 : 6) : addDaysJalali(o.deliveryDate, ri(rnd, 30, 60))
      const createdAt = new Date(o.createdAt.getTime() + DAY)
      if (status === 'COLLECTED' || status === 'DONE') dueDate = addDaysJalali(o.deliveryDate, ri(rnd, 5, 25))
      chequeRows.push({
        id,
        number: String(ri(rnd, 1000, 9999)),
        amount: o.finalAmount,
        dueDate,
        status,
        payeeName: supplierRows.find((s) => s.id === o.supplierId)?.name || 'تأمین‌کننده دمو',
        payeePhone: supplierRows.find((s) => s.id === o.supplierId)?.phone || null,
        orderId: o.id,
        purpose: `چک سفارش شماره ${o.number}`,
        writtenAt: status === 'PENDING_OWNER' ? null : new Date(createdAt.getTime() + DAY),
        collectedAt: status === 'COLLECTED' || status === 'DONE' ? new Date(o.createdAt.getTime() + ri(rnd, 25, 40) * DAY) : null,
        createdById: managerId,
        createdAt,
      })
      nearIdx++
    }
    // یک چک گذشته از موعد (۵ روز قبل) — قرمز تقویم
    const overdueSrc = chequeRows[2] || chequeRows[0]
    if (overdueSrc) {
      overdueSrc.dueDate = addDaysJalali(today, -5)
      overdueSrc.status = 'READY'
      overdueSrc.writtenAt = new Date(Date.now() - 20 * DAY)
    }
    // چک‌های مستقل بدون سفارش
    for (const st of STANDALONE_CHEQUES) {
      const daysAhead = st.status === 'PENDING_OWNER' ? ri(rnd, 10, 25) : ri(rnd, 20, 50)
      chequeRows.push({
        id: nid('chq'),
        number: String(ri(rnd, 1000, 9999)),
        amount: ri(rnd, 3, 45) * 1000000,
        dueDate: addDaysJalali(today, daysAhead),
        status: st.status,
        payeeName: st.payeeName,
        payeePhone: null,
        orderId: null,
        purpose: st.purpose,
        writtenAt: st.status === 'PENDING_OWNER' ? null : new Date(Date.now() - ri(rnd, 2, 10) * DAY),
        collectedAt: null,
        createdById: managerId,
        createdAt: new Date(Date.now() - ri(rnd, 3, 15) * DAY),
      })
    }
    await db.cheque.createMany({ data: chequeRows as never })
    ids.chequeIds.push(...chequeRows.map((c) => c.id))

    // ---------- ۵) پرداخت‌ها ----------
    const paymentRows: { id: string; amount: number; method: string; orderId: string | null; receiptNo: string; note: string | null; createdById: string; createdAt: Date }[] = []
    for (const c of chequeRows) {
      if (c.status === 'COLLECTED' || c.status === 'DONE') {
        paymentRows.push({
          id: nid('pay'), amount: c.amount, method: 'CHEQUE', orderId: c.orderId,
          receiptNo: `R${ri(rnd, 10000, 99999)}`, note: `تسویه چک شماره ${c.number} — ${c.payeeName}`,
          createdById: pick(rnd, accountantPool).id, createdAt: c.collectedAt || new Date(),
        })
      }
    }
    for (const o of orderRows) {
      if (o.paymentType === 'CASH_ON_DELIVERY' && statusIndex(o.status) >= statusIndex('RECEIVED') && chance(rnd, 0.45)) {
        paymentRows.push({
          id: nid('pay'), amount: o.finalAmount, method: chance(rnd, 0.5) ? 'CASH' : 'CARD', orderId: o.id,
          receiptNo: `R${ri(rnd, 10000, 99999)}`, note: null,
          createdById: pick(rnd, accountantPool).id, createdAt: o.receivedAt || o.createdAt,
        })
      }
    }
    await db.payment.createMany({ data: paymentRows as never })
    ids.paymentIds.push(...paymentRows.map((p) => p.id))

    // ---------- ۶) مشتریان ----------
    const customerRows = Array.from({ length: scale.customers }, () => {
      const fancy = personaId === 'gourmet' && chance(rnd, 0.4)
      const name = fancy ? pick(rnd, GOURMET_CUSTOMER_NAMES) : pick(rnd, FIRST_NAMES)
      const phoneBase = chance(rnd, 0.75) ? '0913' : '0921'
      return {
        id: nid('cst'),
        name,
        phone: `${phoneBase}${ri(rnd, 1000000, 9999999)}`,
        birthday: `${ri(rnd, 1340, 1395)}/${pad2(ri(rnd, 1, 12))}/${pad2(ri(rnd, 1, 29))}`,
        preferences: chance(rnd, 0.6) ? pick(rnd, CUSTOMER_PREFERENCES) : null,
        notes: null,
        points: ri(rnd, 0, 800),
        createdById: pick(rnd, salesPool).id,
        createdAt: new Date(Date.now() - ri(rnd, 2, 60) * DAY),
      }
    })
    await db.customer.createMany({ data: customerRows })
    ids.customerIds.push(...customerRows.map((c) => c.id))

    // ---------- ۷) سفارش‌های فروش ----------
    const HOURS = [10, 10, 11, 11, 12, 13, 17, 17, 18, 18, 19, 19, 20, 21]
    const saleRows: { id: string; customerId: string | null; customerName: string; customerPhone: string | null; salespersonId: string; cashierId: string; items: string; total: number; status: string; note: string | null; cashedAt: Date | null; createdAt: Date }[] = []
    for (let i = 0; i < scale.saleOrders; i++) {
      const daysAgo = ri(rnd, 0, 29)
      const created = atTehranHour(Date.now() - daysAgo * DAY, pick(rnd, HOURS), ri(rnd, 0, 59))
      const linked = chance(rnd, 0.4) ? pick(rnd, customerRows) : null
      const name = linked ? linked.name : personaId === 'gourmet' && chance(rnd, 0.35) ? pick(rnd, GOURMET_CUSTOMER_NAMES) : pick(rnd, FIRST_NAMES)
      const itemCount = ri(rnd, 1, 6)
      const items: { productId: string; name: string; qty: number; price: number }[] = []
      for (let j = 0; j < itemCount; j++) {
        const p = pick(rnd, productRows)
        items.push({ productId: p.id, name: p.name, qty: ri(rnd, 1, 5), price: p.price })
      }
      const total = items.reduce((a, it) => a + it.qty * it.price, 0)
      const statusRoll = rnd()
      const status = statusRoll < 0.7 ? 'CASHED' : statusRoll < 0.9 ? 'ACCEPTED' : 'PENDING'
      saleRows.push({
        id: nid('sale'),
        customerId: linked ? linked.id : null,
        customerName: name,
        customerPhone: linked ? linked.phone : chance(rnd, 0.3) ? `0913${ri(rnd, 1000000, 9999999)}` : null,
        salespersonId: pick(rnd, salesPool).id,
        cashierId: pick(rnd, cashierPool).id,
        items: JSON.stringify(items),
        total,
        status,
        note: null,
        cashedAt: status === 'CASHED' ? new Date(created.getTime() + ri(rnd, 10, 90) * 60000) : null,
        createdAt: created,
      })
    }
    for (let i = 0; i < saleRows.length; i += 120) {
      await db.saleOrder.createMany({ data: saleRows.slice(i, i + 120) as never })
    }
    ids.saleOrderIds.push(...saleRows.map((s) => s.id))

    // ---------- ۸) وظایف ----------
    const TASK_STATUSES_POOL = ['TODO', 'TODO', 'IN_PROGRESS', 'IN_PROGRESS', 'FOLLOW_UP', 'DONE', 'DONE'] as const
    const PRIORITIES = ['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'URGENT'] as const
    const taskRows = Array.from({ length: scale.tasks }, (_, i) => {
      const src = TASK_POOL[(i + ri(rnd, 0, 3)) % TASK_POOL.length]
      const status = pick(rnd, TASK_STATUSES_POOL)
      const isRole = chance(rnd, 0.3)
      const dueDate = addDaysJalali(today, chance(rnd, 0.4) ? ri(rnd, -3, 4) : ri(rnd, 5, 14))
      return {
        id: nid('tsk'),
        title: src.title,
        description: null,
        assignedTo: isRole ? 'MERCHANDISER' : pick(rnd, staffAll).id,
        assigneeType: isRole ? 'ROLE' : 'USER',
        createdById: pick(rnd, managerPool).id,
        status,
        priority: pick(rnd, PRIORITIES),
        dueDate,
        checklist: src.checklist.length
          ? JSON.stringify(src.checklist.map((text, ci) => ({ text, done: status === 'DONE' || ci === 0 && chance(rnd, 0.6) })))
          : null,
        blockedNote: status === 'FOLLOW_UP' ? 'منتظر تحویل بار پخش بودیم — به‌محض رسیدن ادامه می‌دهیم.' : null,
        completedAt: status === 'DONE' ? new Date(Date.now() - ri(rnd, 1, 10) * DAY) : null,
        createdAt: new Date(Date.now() - ri(rnd, 1, 20) * DAY),
      }
    })
    await db.task.createMany({ data: taskRows })
    ids.taskIds.push(...taskRows.map((t) => t.id))

    // ---------- ۹) فعالیت‌های تیم ----------
    const ACT_TYPES = Object.keys(ACTIVITY_TITLES)
    const activityRows = Array.from({ length: scale.activities }, () => {
      const type = pick(rnd, ACT_TYPES)
      const title = pick(rnd, ACTIVITY_TITLES[type])
      return {
        id: nid('act'),
        userId: pick(rnd, staffAll).id,
        type,
        title,
        points: ri(rnd, 5, 20),
        note: null,
        awardedById: chance(rnd, 0.8) ? pick(rnd, managerPool).id : null,
        createdAt: new Date(Date.now() - ri(rnd, 0, 30) * DAY),
      }
    })
    await db.activity.createMany({ data: activityRows })
    ids.activityIds.push(...activityRows.map((a) => a.id))

    // ---------- ۱۰) دیوار تیمی ----------
    const wallRows = WALL_POSTS.slice(0, scale.wallPosts).map((w) => {
      const likes = staffAll.filter(() => chance(rnd, 0.25)).map((u) => u.id)
      return {
        id: nid('wall'),
        authorId: pick(rnd, managerPool).id,
        content: w.content,
        pinned: w.pinned,
        likes: JSON.stringify(likes),
        createdAt: new Date(Date.now() - ri(rnd, 1, 15) * DAY),
      }
    })
    await db.wallPost.createMany({ data: wallRows })
    ids.wallPostIds.push(...wallRows.map((w) => w.id))

    // ---------- ۱۱) بازخورد ناشناس ----------
    const feedbackRows = FEEDBACK_POOL.slice(0, scale.feedbacks).map((f) => ({
      id: nid('fdb'),
      content: f.content,
      category: f.category,
      rating: f.rating,
      status: f.status,
      response: f.response,
      createdAt: new Date(Date.now() - ri(rnd, 2, 25) * DAY),
    }))
    await db.feedback.createMany({ data: feedbackRows })
    ids.feedbackIds.push(...feedbackRows.map((f) => f.id))

    // ---------- ۱۲) ایده‌ها ----------
    const ideaRows = IDEA_POOL.slice(0, scale.ideas).map((idea, i) => {
      const status = i === 0 && personaId !== 'gourmet' ? 'ACCEPTED' : pick(rnd, ['SUBMITTED', 'SUBMITTED', 'UNDER_REVIEW', 'UNDER_REVIEW'] as const)
      return {
        id: nid('idea'),
        authorId: pick(rnd, fb(merchandisers, salesPool)).id,
        title: idea.title,
        content: idea.content,
        status,
        rewardPoints: status === 'ACCEPTED' ? 20 : 0,
        reviewedBy: status === 'SUBMITTED' ? null : pick(rnd, managerPool).id,
        createdAt: new Date(Date.now() - ri(rnd, 2, 20) * DAY),
      }
    })
    await db.idea.createMany({ data: ideaRows })
    ids.ideaIds.push(...ideaRows.map((i) => i.id))

    // ---------- ۱۳) پلانوگرام‌ها ----------
    // شکل cells (مطابق /api/planograms): آرایه JSON به طول rows×cols از productId یا null
    const planogramPlansByPersona: Record<DemoPersona['id'], { name: string; cats: string[]; status: string }[]> = {
      gourmet: [
        { name: 'قفسه قهوه و دمنوش — شعبه کرمان', cats: ['قهوه و کافئین', 'دمنوش و گیاهان دارایی'], status: 'PUBLISHED' },
        { name: 'قفسه شکلات و خشکبار — شعبه اصفهان', cats: ['شکلات و کاکائو', 'خشکبار و زعفران'], status: 'DRAFT' },
        { name: 'قفسه خاویار و دریایی — شعبه شیراز', cats: ['خاویار و دریایی'], status: 'PUBLISHED' },
      ],
      neighborhood: [
        { name: 'قفسه لبنیات — فروشگاه اصلی', cats: ['لبنیات', 'یخچالی'], status: 'PUBLISHED' },
        { name: 'قفسه تنقلات کنار صندوق', cats: ['تنقلات', 'نوشیدنی'], status: 'DRAFT' },
        { name: 'قفسه صبحانه', cats: ['صبحانه', 'نان و غلات'], status: 'PUBLISHED' },
      ],
      chain: [
        { name: 'قفسه تنقلات — شعبه فلکه گاز', cats: ['تنقلات', 'نوشیدنی'], status: 'PUBLISHED' },
        { name: 'قفسه شوینده — شعبه امام خمینی', cats: ['شوینده و بهداشتی'], status: 'DRAFT' },
        { name: 'قفسه میوه و سبزی — شعبه سیرجان', cats: ['میوه و سبزی', 'پروتئین تازه'], status: 'PUBLISHED' },
      ],
    }
    const planogramPlans = planogramPlansByPersona[personaId].slice(0, scale.planograms)
    const planogramRows = planogramPlans.map((pl) => {
      const rows = 4
      const cols = 6
      const pool = productRows.filter((p) => pl.cats.includes(p.category)).map((p) => p.id)
      const fallbackPool = productRows.map((p) => p.id)
      const cells = Array.from({ length: rows * cols }, () => {
        const source = pool.length ? pool : fallbackPool
        return chance(rnd, 0.6) ? pick(rnd, source) : null
      })
      return {
        id: nid('plg'),
        name: pl.name,
        rows,
        cols,
        cells: JSON.stringify(cells),
        assignedTo: pick(rnd, merchPool).id,
        status: pl.status,
        createdById: pick(rnd, managerPool).id,
        createdAt: new Date(Date.now() - ri(rnd, 3, 20) * DAY),
      }
    })
    await db.planogram.createMany({ data: planogramRows })
    ids.planogramIds.push(...planogramRows.map((p) => p.id))

    // ---------- ۱۴) درخواست‌های انبار (از کالاهای کم‌موجودی) ----------
    const lowStock = productRows.filter((p) => p.stock <= p.minStock)
    const whSource = lowStock.length >= scale.warehouseRequests ? lowStock : productRows
    const whRows = Array.from({ length: scale.warehouseRequests }, () => {
      const p = pick(rnd, whSource)
      const status = pick(rnd, ['PENDING', 'PENDING', 'PREPARED', 'SENT', 'RECEIVED'] as const)
      return {
        id: nid('whr'),
        productId: p.id,
        productName: p.name,
        quantity: ri(rnd, 10, 30),
        requestedById: pick(rnd, merchPool).id,
        status,
        preparedById: status === 'PENDING' ? null : pick(rnd, supervisorPool).id,
        createdAt: new Date(Date.now() - ri(rnd, 0, 10) * DAY),
      }
    })
    await db.warehouseRequest.createMany({ data: whRows })
    ids.warehouseRequestIds.push(...whRows.map((w) => w.id))

    // ---------- ۱۵) درخواست‌های مشتری ----------
    const custReqRows = CUSTOMER_REQUEST_POOL.slice(0, scale.customerRequests).map((productName) => ({
      id: nid('crq'),
      productName,
      details: chance(rnd, 0.5) ? 'مشتری ثابت پرسید — گفت هر وقت رسید خبرش کنیم.' : null,
      count: ri(rnd, 2, 4),
      requestedById: pick(rnd, fb(cashiers, salesPool)).id,
      status: chance(rnd, 0.5) ? 'OPEN' : 'ORDERED',
      createdAt: new Date(Date.now() - ri(rnd, 0, 12) * DAY),
    }))
    await db.customerRequest.createMany({ data: custReqRows })
    ids.customerRequestIds.push(...custReqRows.map((c) => c.id))

    // ---------- ۱۶) ثبت رجیستری ----------
    const counts: Record<string, number> = {
      products: productRows.length,
      suppliers: supplierRows.length,
      orders: orderRows.length,
      orderItems: itemRows.length,
      cheques: chequeRows.length,
      payments: paymentRows.length,
      saleOrders: saleRows.length,
      customers: customerRows.length,
      tasks: taskRows.length,
      activities: activityRows.length,
      wallPosts: wallRows.length,
      feedbacks: feedbackRows.length,
      ideas: ideaRows.length,
      planograms: planogramRows.length,
      warehouseRequests: whRows.length,
      customerRequests: custReqRows.length,
      companies: companyRows.length,
    }
    const registry: DemoRegistry = { personaId, at: new Date().toISOString(), ids, counts }
    await db.setting.upsert({
      where: { key: REGISTRY_KEY },
      update: { value: JSON.stringify(registry) },
      create: { key: REGISTRY_KEY, value: JSON.stringify(registry) },
    })

    await logAudit(creator.id, creator.name, 'تولید داده دمو', 'DEMO', personaId, { persona: persona.name, counts })

    return { counts, persona }
  } catch (err) {
    // خرابی جزئی نباید رجیستری را خراب کند — تلاش برای پاک‌سازی بهترین‌تلاشیِ ساخته‌شده‌ها
    try {
      if (ids.productIds.length || ids.companyIds.length || ids.orderIds.length) {
        await clearDemoSilent(ids)
      }
    } catch { /* best-effort */ }
    throw err
  }
}

// ============ پاک‌سازی ============

/** پاک‌سازی بدون لمس رجیستری — برای rollback داخلی */
async function clearDemoSilent(ids: DemoRegistry['ids']): Promise<Record<string, number>> {
  const res: Record<string, number> = {}
  res.activities = (await db.activity.deleteMany({ where: { id: { in: ids.activityIds } } })).count
  res.tasks = (await db.task.deleteMany({ where: { id: { in: ids.taskIds } } })).count
  res.wallPosts = (await db.wallPost.deleteMany({ where: { id: { in: ids.wallPostIds } } })).count
  res.feedbacks = (await db.feedback.deleteMany({ where: { id: { in: ids.feedbackIds } } })).count
  res.ideas = (await db.idea.deleteMany({ where: { id: { in: ids.ideaIds } } })).count
  res.payments = (await db.payment.deleteMany({ where: { OR: [{ id: { in: ids.paymentIds } }, { orderId: { in: ids.orderIds } }] } })).count
  res.cheques = (await db.cheque.deleteMany({ where: { OR: [{ id: { in: ids.chequeIds } }, { orderId: { in: ids.orderIds } }] } })).count
  res.orderItems = (await db.orderItem.deleteMany({ where: { orderId: { in: ids.orderIds } } })).count
  res.orders = (await db.order.deleteMany({ where: { id: { in: ids.orderIds } } })).count
  res.saleOrders = (await db.saleOrder.deleteMany({ where: { id: { in: ids.saleOrderIds } } })).count
  res.warehouseRequests = (await db.warehouseRequest.deleteMany({ where: { id: { in: ids.warehouseRequestIds } } })).count
  res.customerRequests = (await db.customerRequest.deleteMany({ where: { id: { in: ids.customerRequestIds } } })).count
  res.planograms = (await db.planogram.deleteMany({ where: { id: { in: ids.planogramIds } } })).count
  res.customers = (await db.customer.deleteMany({ where: { id: { in: ids.customerIds } } })).count
  res.products = (await db.product.deleteMany({ where: { id: { in: ids.productIds } } })).count
  res.suppliers = (await db.supplier.deleteMany({ where: { id: { in: ids.supplierIds } } })).count
  res.companies = (await db.company.deleteMany({ where: { id: { in: ids.companyIds } } })).count
  return res
}

export async function clearDemo(): Promise<{ ok: boolean; counts: Record<string, number> }> {
  const reg = await readRegistry()
  if (!reg) return { ok: false, counts: {} }
  const counts = await clearDemoSilent(reg.ids)
  await db.setting.delete({ where: { key: REGISTRY_KEY } }).catch(() => undefined)
  return { ok: true, counts }
}
