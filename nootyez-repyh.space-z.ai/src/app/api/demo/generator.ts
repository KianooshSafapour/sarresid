/**
 * Industry Demo Lab — deterministic virtual-company generator (Task 12-a).
 *
 * Pure module: NO db / NO React. Same seed → identical DemoData.
 * Seed is derived from the size key only, so a given size always produces the
 * exact same virtual company (stable for screenshots & follow-up QA).
 *
 * Realism notes: gourmet-retail tomans scale (caviar tins in tens of millions,
 * pistachio per-kg ~۲M, bread per-piece ~۳۵K). KPIs are computed FROM the
 * generated pipeline (fill rate / on-time share) so the numbers agree.
 */

export type DemoSizeKey = 'BOUTIQUE' | 'MID' | 'LARGE'

export const DEMO_SIZES: DemoSizeKey[] = ['BOUTIQUE', 'MID', 'LARGE']

export const DEMO_SIZE_LABELS_FA: Record<DemoSizeKey, string> = {
  BOUTIQUE: 'تک‌شعبه (بوتیک)',
  MID: 'زنجیره متوسط',
  LARGE: 'زنجیره بزرگ',
}

export interface DemoBranch { name: string; staffCount: number; sqm: number; managerName: string }
export interface DemoStaff { name: string; role: string; branch: string }
export interface DemoSupplier { name: string; domain: string; paymentTerms: 'CASH' | 'CHEQUE'; priceListAgeDays: number }
export interface DemoOrderItem { name: string; qty: number; unit: string; unitCost: number }
export interface DemoOrder {
  code: string
  supplier: string
  branch: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RECEIVED' | 'CONFIRMED' | 'DONE'
  total: number
  items: DemoOrderItem[]
  receivingVariancePct: number | null
  onTime: boolean
  daysAgo: number
}
export interface DemoCheque { code: string; payee: string; purpose: string; amount: number; dueDate: string; status: 'PENDING_APPROVAL' | 'WRITTEN' | 'GIVEN' | 'COLLECTED' }
export interface DemoKpi {
  inventoryTurnover: number
  fillRatePct: number
  onTimeDeliveryPct: number
  shrinkagePct: number
  stockoutRatePct: number
  avgReceivingMinutesManual: number
  avgReceivingMinutesPlatform: number
  adminHoursSavedPerWeek: number
  orderToDoneHours: number
}
export interface DemoBenefit { workflow: string; workflowEn: string; beforeMinutes: number; afterMinutes: number; findingId: string }
export interface DemoProfile {
  name: string
  slogan: string
  foundedYear: number
  hqCity: string
  branchCount: number
  staffCount: number
  supplierCount: number
  orderCount: number
}
export interface DemoData {
  profile: DemoProfile
  branches: DemoBranch[]
  departments: string[]
  staff: DemoStaff[]
  suppliers: DemoSupplier[]
  pipeline: DemoOrder[]
  cheques: DemoCheque[]
  kpi: DemoKpi
  benefits: DemoBenefit[]
}

/* ================= deterministic RNG (mulberry32 + string hash) ================= */

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return (h ^ (h >>> 16)) >>> 0
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Rng {
  private next: () => number
  constructor(seed: string) {
    this.next = mulberry32(hashSeed(seed))
  }
  /** float in [0,1) */
  f(): number {
    return this.next()
  }
  /** integer in [min,max] inclusive */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }
  shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice()
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  /** float rounded to 1 decimal in [min,max] */
  r1(min: number, max: number): number {
    return Math.round((min + this.next() * (max - min)) * 10) / 10
  }
}

/* ================= static Persian pools ================= */

const BRANCH_POOL = [
  'زعفرانیه', 'سعادت‌آباد', 'فرمانیه', 'اندرزگو', 'گوهردشت',
  'ولنجک', 'الهیه', 'شریعتی', 'پاسداری', 'نیاوران',
] as const

const DEPARTMENTS = [
  'خاویار و دریای لوکس', 'زعفران و ادویه نایاب', 'خشکبار و پسته', 'پنیر و لبنیات محلی',
  'قهوه و شکلات تک‌خاستگاه', 'روغن‌های فرابکر', 'ترشی و مربا خانگی', 'میوه وارداتی', 'نان سنتی',
] as const

const FIRST_NAMES = [
  'محمدرضا', 'سارا', 'علی', 'فاطمه', 'حسین', 'مریم', 'رضا', 'زهرا', 'امیر', 'نگار',
  'مهدی', 'الهام', 'حسن', 'لیلا', 'کاوه', 'شیرین', 'بهنام', 'پرستو', 'آرش', 'نیلوفر',
  'سینا', 'هستی', 'فرهاد', 'غزل',
] as const

const LAST_NAMES = [
  'محمدی', 'حسینی', 'رضایی', 'کریمی', 'صادقی', 'موسوی', 'جعفری', 'نوری', 'شریفی', 'اقامیری',
  'تهرانی', 'کاظمی', 'زارعی', 'بهرامی', 'سلیمی', 'فرهمند', 'امینی', 'خلج', 'دهقان', 'یزدانی',
] as const

const STAFF_ROLES = ['سرصندوق‌دار', 'انباردار', 'چیدمان', 'فروشنده گورمت'] as const

interface SupplierSeed {
  name: string
  domain: string
  terms: 'CASH' | 'CHEQUE'
  items: { name: string; unit: string; unitCost: number; qtyMin: number; qtyMax: number }[]
}

const SUPPLIER_SEEDS: SupplierSeed[] = [
  {
    name: 'خاویار مازندران', domain: 'خاویار و دریای لوکس', terms: 'CHEQUE',
    items: [
      { name: 'خاویار اوستروگا درجه یک', unit: 'قوطی ۲۵۰ گرمی', unitCost: 78_000_000, qtyMin: 2, qtyMax: 6 },
      { name: 'خاویار سپید طلایی', unit: 'قوطی ۱۲۵ گرمی', unitCost: 41_000_000, qtyMin: 2, qtyMax: 8 },
      { name: 'فیله ماهی سالمون وارداتی', unit: 'کیلوگرم', unitCost: 1_450_000, qtyMin: 10, qtyMax: 40 },
    ],
  },
  {
    name: 'زعفران قائنات', domain: 'زعفران و ادویه نایاب', terms: 'CASH',
    items: [
      { name: 'زعفران سرگل عالی قائنات', unit: 'بسته ۱۰۰ گرمی', unitCost: 18_500_000, qtyMin: 3, qtyMax: 15 },
      { name: 'زعفران پوشال درجه یک', unit: 'بسته ۱۰۰ گرمی', unitCost: 14_200_000, qtyMin: 2, qtyMax: 12 },
      { name: 'ادویه پلویی اعلا', unit: 'بسته ۱ کیلویی', unitCost: 850_000, qtyMin: 10, qtyMax: 45 },
    ],
  },
  {
    name: 'پسته اکبری رفسنجان', domain: 'خشکبار و پسته', terms: 'CHEQUE',
    items: [
      { name: 'پسته اکبری خندان', unit: 'کیلوگرم', unitCost: 1_850_000, qtyMin: 20, qtyMax: 80 },
      { name: 'پسته احمدآقایی', unit: 'کیلوگرم', unitCost: 2_150_000, qtyMin: 15, qtyMax: 60 },
      { name: 'کشمش ملایر ریز', unit: 'کیلوگرم', unitCost: 380_000, qtyMin: 25, qtyMax: 90 },
      { name: 'بادام درختی مامایی', unit: 'کیلوگرم', unitCost: 1_450_000, qtyMin: 15, qtyMax: 55 },
    ],
  },
  {
    name: 'لبنیات لیقوان', domain: 'پنیر و لبنیات محلی', terms: 'CASH',
    items: [
      { name: 'پنیر لیقوان گوسفندی', unit: 'کیلوگرم', unitCost: 620_000, qtyMin: 30, qtyMax: 110 },
      { name: 'ماست سنتی موسیر', unit: 'کیلوگرم', unitCost: 180_000, qtyMin: 30, qtyMax: 120 },
      { name: 'کره حیوانی محلی', unit: 'کیلوگرم', unitCost: 540_000, qtyMin: 15, qtyMax: 60 },
      { name: 'شیر پرچرب اورگانیک', unit: 'لیتر', unitCost: 42_000, qtyMin: 60, qtyMax: 200 },
    ],
  },
  {
    name: 'روغن زیتون طارم', domain: 'روغن‌های فرابکر', terms: 'CHEQUE',
    items: [
      { name: 'روغن زیتون فرابکر طارم', unit: 'بطری ۱ لیتری', unitCost: 1_250_000, qtyMin: 12, qtyMax: 48 },
      { name: 'روغن زیتون پومیس', unit: 'بطری ۱ لیتری', unitCost: 620_000, qtyMin: 12, qtyMax: 60 },
      { name: 'سرکه بالزامیک مودنا', unit: 'بطری ۵۰۰ گرمی', unitCost: 780_000, qtyMin: 10, qtyMax: 36 },
    ],
  },
  {
    name: 'قهوه رشت', domain: 'قهوه و شکلات تک‌خاستگاه', terms: 'CASH',
    items: [
      { name: 'قهوه عربیکا اتیوپی', unit: 'کیلوگرم', unitCost: 4_200_000, qtyMin: 5, qtyMax: 25 },
      { name: 'قهوه روبوستا ویتنامی', unit: 'کیلوگرم', unitCost: 2_900_000, qtyMin: 5, qtyMax: 30 },
      { name: 'کاکائو تلخ ۷۰٪', unit: 'کیلوگرم', unitCost: 1_850_000, qtyMin: 8, qtyMax: 35 },
    ],
  },
  {
    name: 'شکلات‌سازی تبریز', domain: 'قهوه و شکلات تک‌خاستگاه', terms: 'CHEQUE',
    items: [
      { name: 'شکلات تلخ تک‌خاستگاه', unit: 'جعبه ۵۰۰ گرمی', unitCost: 980_000, qtyMin: 10, qtyMax: 40 },
      { name: 'ترافل شکلات فندقی', unit: 'جعبه ۲۴ عددی', unitCost: 1_250_000, qtyMin: 8, qtyMax: 32 },
    ],
  },
  {
    name: 'ترشی و مربا بندرانزلی', domain: 'ترشی و مربا خانگی', terms: 'CASH',
    items: [
      { name: 'ترشی لیته شمالی', unit: 'شیشه ۲ کیلویی', unitCost: 320_000, qtyMin: 15, qtyMax: 60 },
      { name: 'مربای بهارنارنج خانگی', unit: 'شیشه ۱ کیلویی', unitCost: 260_000, qtyMin: 15, qtyMax: 70 },
      { name: 'زیتون پرورده شمال', unit: 'شیشه ۲ کیلویی', unitCost: 410_000, qtyMin: 15, qtyMax: 55 },
    ],
  },
  {
    name: 'میوه وارداتی مهرآسا', domain: 'میوه وارداتی', terms: 'CASH',
    items: [
      { name: 'آووکادو کنیا', unit: 'کیلوگرم', unitCost: 320_000, qtyMin: 12, qtyMax: 45 },
      { name: 'انبه فیلیپین', unit: 'کیلوگرم', unitCost: 280_000, qtyMin: 12, qtyMax: 40 },
      { name: 'بلوبری شیلی', unit: 'بسته ۵۰۰ گرمی', unitCost: 690_000, qtyMin: 10, qtyMax: 36 },
    ],
  },
  {
    name: 'نان سنتی آوند', domain: 'نان سنتی', terms: 'CASH',
    items: [
      { name: 'نان سنگک روزانه', unit: 'عدد', unitCost: 35_000, qtyMin: 80, qtyMax: 220 },
      { name: 'نان بربری محلی', unit: 'عدد', unitCost: 30_000, qtyMin: 80, qtyMax: 200 },
      { name: 'نان خرمای زنجان', unit: 'بسته', unitCost: 120_000, qtyMin: 30, qtyMax: 90 },
    ],
  },
  {
    name: 'چای لاهیجان', domain: 'چای و دمنوش', terms: 'CHEQUE',
    items: [
      { name: 'چای بهاردوم لاهیجان', unit: 'کیلوگرم', unitCost: 1_450_000, qtyMin: 8, qtyMax: 30 },
      { name: 'دمنوش گل‌محمدی کاشان', unit: 'بسته ۲۰۰ گرمی', unitCost: 210_000, qtyMin: 15, qtyMax: 55 },
    ],
  },
  {
    name: 'عسل سبلان', domain: 'عسل طبیعی', terms: 'CASH',
    items: [
      { name: 'عسل کوهی سبلان', unit: 'شیشه ۹۰۰ گرمی', unitCost: 1_650_000, qtyMin: 6, qtyMax: 24 },
      { name: 'عسل گون آذربایجان', unit: 'شیشه ۹۰۰ گرمی', unitCost: 1_380_000, qtyMin: 6, qtyMax: 28 },
    ],
  },
  {
    name: 'زیتون رودبار', domain: 'زیتون و ترشیجات', terms: 'CASH',
    items: [
      { name: 'زیتون سبز رودبار', unit: 'شیشه ۱ کیلویی', unitCost: 290_000, qtyMin: 20, qtyMax: 65 },
      { name: 'روغن زیتون خانگی رودبار', unit: 'بطری ۱ لیتری', unitCost: 850_000, qtyMin: 10, qtyMax: 40 },
    ],
  },
  {
    name: 'دریای اروند', domain: 'میگو و آبزیان', terms: 'CHEQUE',
    items: [
      { name: 'میگو هدیه خوزستان', unit: 'کیلوگرم', unitCost: 640_000, qtyMin: 15, qtyMax: 55 },
      { name: 'قزل‌آلای رنگین‌کمانی تازه', unit: 'کیلوگرم', unitCost: 380_000, qtyMin: 15, qtyMax: 60 },
    ],
  },
]

/**
 * Workload table — the exact 6 demo workflows (Task 12-a spec), flat minutes.
 * Each maps to a «مبانی علمی» finding id (RESEARCH_FINDINGS in src/lib/research.ts)
 * and keeps a research-plausible 3–8× manual→platform speed-up.
 */
const BENEFIT_SEEDS: { workflow: string; workflowEn: string; before: number; after: number; findingId: string }[] = [
  { workflow: 'ثبت دریافت کالا', workflowEn: 'Goods receiving entry', before: 45, after: 6, findingId: 'manual' },
  { workflow: 'شمارش موجودی', workflowEn: 'Stock counting (cycle count)', before: 180, after: 30, findingId: 'abc' },
  { workflow: 'سفارش به تأمین‌کننده', workflowEn: 'Supplier ordering', before: 55, after: 11, findingId: 'reorder' },
  { workflow: 'چک و پرداخت', workflowEn: 'Cheques & payments', before: 35, after: 7, findingId: 'srm' },
  { workflow: 'گزارش فهرست قیمت', workflowEn: 'Price-list reporting', before: 50, after: 10, findingId: 'srm' },
  { workflow: 'جستجوی تاریخچه کالا', workflowEn: 'Product history search', before: 40, after: 8, findingId: 'fefo' },
]

/* ================= size configuration ================= */

interface SizeConfig {
  name: string
  slogan: string
  hqCity: string
  founded: [number, number]
  branches: number
  staffMin: number
  staffMax: number
  suppliers: number
  orders: number
  cheques: number
  departments: number
  sqm: [number, number]
  /** KPI bands — all inside the spec ranges (turnover 2.4–6.8, fill 92–98,
   *  onTime 88–96, shrinkage 0.8–2.4, stockout 2–6, orderToDone 26/14/9,
   *  adminHoursSaved 6/14/31); bigger chains run tighter controls. */
  turnover: [number, number]
  fillRate: [number, number]
  shrinkage: [number, number]
  stockout: [number, number]
  orderToDoneHours: [number, number]
  adminHoursSaved: [number, number]
  onTimeBase: number
}

const SIZE_CONFIG: Record<DemoSizeKey, SizeConfig> = {
  BOUTIQUE: {
    name: 'بوتیک خوراک لوکس زیتون',
    slogan: 'هر قوطی یک داستان؛ هر قفسه یک سفر به خاستگاه طعم',
    hqCity: 'تهران',
    founded: [1400, 1402],
    branches: 1, staffMin: 6, staffMax: 8, suppliers: 6, orders: 20, cheques: 8, departments: 5,
    sqm: [140, 240],
    turnover: [2.4, 3.2], fillRate: [95, 98], shrinkage: [1.9, 2.3], stockout: [4.6, 5.8],
    orderToDoneHours: [24, 28], adminHoursSaved: [6, 7], onTimeBase: 0.94,
  },
  MID: {
    name: 'زنجیره گورمت کاویان',
    slogan: 'طعم اصیل، از زعفران قائنات تا خاویار مازندران',
    hqCity: 'تهران',
    founded: [1395, 1398],
    branches: 4, staffMin: 12, staffMax: 16, suppliers: 9, orders: 45, cheques: 14, departments: 7,
    sqm: [320, 650],
    turnover: [3.8, 5.0], fillRate: [93, 97], shrinkage: [1.3, 1.8], stockout: [3.2, 4.6],
    orderToDoneHours: [13, 15], adminHoursSaved: [14, 15], onTimeBase: 0.92,
  },
  LARGE: {
    name: 'گروه خرده‌فروشی لوکس کاویان',
    slogan: 'از تهران تا اصفهان؛ لوکس‌ترین سفره‌های ایران',
    hqCity: 'تهران',
    founded: [1388, 1393],
    branches: 9, staffMin: 20, staffMax: 24, suppliers: 14, orders: 90, cheques: 22, departments: 9,
    sqm: [500, 950],
    turnover: [5.2, 6.8], fillRate: [92, 96], shrinkage: [0.9, 1.4], stockout: [2.2, 3.4],
    orderToDoneHours: [8, 10], adminHoursSaved: [31, 33], onTimeBase: 0.89,
  },
}

/** realistic gourmet order ceiling (تومان) — orders above this get trimmed deterministically */
const ORDER_TOTAL_CAP = 180_000_000

const PIPELINE_STATUSES: DemoOrder['status'][] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'CONFIRMED', 'DONE']
/** target share of each status across the pipeline (sums to 1) */
const STATUS_SHARE: Record<DemoOrder['status'], number> = {
  DRAFT: 0.1, SUBMITTED: 0.14, APPROVED: 0.15, RECEIVED: 0.17, CONFIRMED: 0.17, DONE: 0.27,
}

/* ================= generator ================= */

export function generateDemoCompany(sizeKey: DemoSizeKey): DemoData {
  const cfg = SIZE_CONFIG[sizeKey]
  const rng = new Rng(`hyper-zeytoon-demo-${sizeKey}-v2`)

  /* ---------- profile ---------- */
  const profile: DemoProfile = {
    name: cfg.name,
    slogan: cfg.slogan,
    foundedYear: rng.int(cfg.founded[0], cfg.founded[1]),
    hqCity: cfg.hqCity,
    branchCount: cfg.branches,
    staffCount: 0, // filled after staff generation
    supplierCount: cfg.suppliers,
    orderCount: cfg.orders,
  }

  /* ---------- branches ---------- */
  const branchNames = BRANCH_POOL.slice(0, cfg.branches)
  const branches: DemoBranch[] = branchNames.map((b) => ({
    name: `شعبه ${b}`,
    staffCount: 0, // filled after staff assignment
    sqm: Math.round(rng.int(cfg.sqm[0], cfg.sqm[1]) / 10) * 10,
    managerName: '',
  }))

  /* ---------- staff ---------- */
  const totalStaff = rng.int(cfg.staffMin, cfg.staffMax)
  const staff: DemoStaff[] = []
  const usedNames = new Set<string>()
  const nextName = (): string => {
    for (let tries = 0; tries < 40; tries++) {
      const n = `${FIRST_NAMES[rng.int(0, FIRST_NAMES.length - 1)]} ${LAST_NAMES[rng.int(0, LAST_NAMES.length - 1)]}`
      if (!usedNames.has(n)) {
        usedNames.add(n)
        return n
      }
    }
    return `${FIRST_NAMES[0]} ${LAST_NAMES[0]} ${usedNames.size + 1}`
  }
  // one مدیر شعبه per branch first
  for (const br of branches) {
    const manager = nextName()
    br.managerName = manager
    staff.push({ name: manager, role: 'مدیر شعبه', branch: br.name })
  }
  // remaining staff spread over branches with gourmet-shop roles
  const rest = totalStaff - branches.length
  for (let i = 0; i < rest; i++) {
    // weighted: فروشنده گورمت 40%، انباردار 20%، سرصندوق‌دار 20%، چیدمان 20%
    const r = rng.f()
    const role = r < 0.4 ? STAFF_ROLES[3] : r < 0.6 ? STAFF_ROLES[1] : r < 0.8 ? STAFF_ROLES[0] : STAFF_ROLES[2]
    staff.push({ name: nextName(), role, branch: branches[i % branches.length].name })
  }
  for (const br of branches) br.staffCount = staff.filter((s) => s.branch === br.name).length
  profile.staffCount = staff.length

  /* ---------- departments ---------- */
  const departments = DEPARTMENTS.slice(0, cfg.departments)

  /* ---------- suppliers ---------- */
  const chosenSeeds = rng.shuffle(SUPPLIER_SEEDS).slice(0, cfg.suppliers)
  // ~1/3 intentionally stale (≥30d) so the «فهرست قیمت کهنه» concept shows —
  // and at least ⌈n/5⌉ guaranteed stale so even BOUTIQUE always demos the amber banner
  const forcedStale = Math.ceil(cfg.suppliers / 5)
  const suppliers: DemoSupplier[] = chosenSeeds.map((s, i) => ({
    name: s.name,
    domain: s.domain,
    paymentTerms: s.terms,
    priceListAgeDays: i < forcedStale || rng.f() < 0.34 ? rng.int(31, 74) : rng.int(2, 29),
  }))

  /* ---------- pipeline (last 30 days) ---------- */
  const statusCounts: Record<DemoOrder['status'], number> = { DRAFT: 0, SUBMITTED: 0, APPROVED: 0, RECEIVED: 0, CONFIRMED: 0, DONE: 0 }
  let remaining = cfg.orders
  PIPELINE_STATUSES.forEach((st, i) => {
    const n = i === PIPELINE_STATUSES.length - 1 ? remaining : Math.max(1, Math.round(cfg.orders * STATUS_SHARE[st]))
    statusCounts[st] = Math.min(n, remaining)
    remaining -= statusCounts[st]
  })
  const statusBag: DemoOrder['status'][] = []
  for (const st of PIPELINE_STATUSES) for (let i = 0; i < statusCounts[st]; i++) statusBag.push(st)
  const shuffledStatuses = rng.shuffle(statusBag)

  const codes = rng.shuffle(Array.from({ length: 1000 }, (_, i) => `HZ-${9000 + i}`)).slice(0, cfg.orders)
  const pipeline: DemoOrder[] = shuffledStatuses.map((status, i) => {
    const seed = chosenSeeds[rng.int(0, chosenSeeds.length - 1)]
    const branch = branches[rng.int(0, branches.length - 1)].name
    const itemCount = rng.int(2, 5)
    const items: DemoOrderItem[] = rng.shuffle(seed.items).slice(0, Math.min(itemCount, seed.items.length)).map((it) => ({
      name: it.name,
      qty: rng.int(it.qtyMin, it.qtyMax),
      unit: it.unit,
      unitCost: it.unitCost,
    }))
    // realistic gourmet ceiling (۲–۱۸۰M تومان): deterministically trim the
    // costliest lines until the order fits the cap (caviar tins can blow past it)
    for (;;) {
      const total = items.reduce((sum, it) => sum + it.qty * it.unitCost, 0)
      if (total <= ORDER_TOTAL_CAP) break
      const costliest = items.reduce((a, b) => (b.qty * b.unitCost > a.qty * a.unitCost ? b : a), items[0])
      if (costliest.qty <= 1) break
      costliest.qty -= 1
    }
    const total = items.reduce((sum, it) => sum + it.qty * it.unitCost, 0)
    const received = status === 'RECEIVED' || status === 'CONFIRMED' || status === 'DONE'
    // receiving variance: ~82% land exactly on the invoice; the rest miss by 1–6% —
    // shortages (negative) are more common than over-receipts (positive)
    let receivingVariancePct: number | null = null
    if (received) {
      if (rng.f() < 0.82) {
        receivingVariancePct = 0
      } else {
        const mag = Math.round(rng.f() * 50) / 10 + 1 // 1.0–6.0, one decimal
        receivingVariancePct = rng.f() < 0.65 ? -mag : mag
      }
    }
    const onTime = rng.f() < cfg.onTimeBase
    const daysAgo = Math.min(29, Math.floor((i * 30) / cfg.orders) + rng.int(0, 1))
    return { code: codes[i], supplier: seed.name, branch, status, total, items, receivingVariancePct, onTime, daysAgo }
  })

  /* ---------- cheques (next 60 days, due in 3..60 days) ---------- */
  /** spec statuses — weighted: pending 30% · written 25% · given 32% · collected 13% */
  const pickChequeStatus = (): DemoCheque['status'] => {
    const r = rng.f()
    if (r < 0.3) return 'PENDING_APPROVAL'
    if (r < 0.55) return 'WRITTEN'
    if (r < 0.87) return 'GIVEN'
    return 'COLLECTED'
  }
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const chequeSeeds = rng.shuffle(pipeline.filter((o) => o.status === 'DONE' || o.status === 'CONFIRMED'))
  const cheques: DemoCheque[] = Array.from({ length: cfg.cheques }, (_, i) => {
    const reuse = i >= chequeSeeds.length
    const order = chequeSeeds.length > 0 ? chequeSeeds[i % chequeSeeds.length] : pipeline[i % pipeline.length]
    const dueDays = Math.min(60, 3 + Math.floor((i * 57) / Math.max(1, cfg.cheques - 1)) + rng.int(0, 2))
    const due = new Date(today.getTime() + dueDays * 86400000)
    return {
      code: `CH-${1400 + i}`,
      payee: order.supplier,
      purpose: reuse ? `چک قسطی سفارش ${order.code}` : `تسویه سفارش ${order.code}`,
      amount: Math.round((reuse ? order.total / 2 : order.total) / 100_000) * 100_000,
      dueDate: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`,
      status: pickChequeStatus(),
    }
  })

  /* ---------- KPI (bands per size, spec-aligned; on-time derived from the pipeline) ---------- */
  const nonDraft = pipeline.filter((o) => o.status !== 'DRAFT')
  const kpi: DemoKpi = {
    inventoryTurnover: rng.r1(cfg.turnover[0], cfg.turnover[1]),
    fillRatePct: rng.int(cfg.fillRate[0], cfg.fillRate[1]),
    onTimeDeliveryPct: Math.min(96, Math.max(88, nonDraft.length > 0 ? Math.round((nonDraft.filter((o) => o.onTime).length / nonDraft.length) * 100) : 92)),
    shrinkagePct: rng.r1(cfg.shrinkage[0], cfg.shrinkage[1]),
    stockoutRatePct: rng.r1(cfg.stockout[0], cfg.stockout[1]),
    // spec constants: 45 min manual vs 6 min on the platform (mirrored by benefit row 1)
    avgReceivingMinutesManual: 45,
    avgReceivingMinutesPlatform: 6,
    adminHoursSavedPerWeek: rng.int(cfg.adminHoursSaved[0], cfg.adminHoursSaved[1]),
    orderToDoneHours: rng.int(cfg.orderToDoneHours[0], cfg.orderToDoneHours[1]),
  }

  /* ---------- benefits (the 6 spec workflows, flat minutes, 3–8× speed-ups) ---------- */
  const benefits: DemoBenefit[] = BENEFIT_SEEDS.map((b) => ({
    workflow: b.workflow,
    workflowEn: b.workflowEn,
    beforeMinutes: b.before,
    afterMinutes: b.after,
    findingId: b.findingId,
  }))

  return { profile, branches, departments, staff, suppliers, pipeline, cheques, kpi, benefits }
}
