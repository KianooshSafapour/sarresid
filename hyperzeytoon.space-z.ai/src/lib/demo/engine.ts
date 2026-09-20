/**
 * Demo Company Simulator — «آزمایشگاه نمایشی»
 *
 * Generates a complete, realistic virtual supermarket company so prospects
 * (testers, chains, investor meetings) can walk through a living platform:
 * staff with roles, providers network, product catalog with 45-day sales
 * history, orders across the whole pipeline, cheques, planogram, tasks,
 * SOPs, gamification — everything contextual to the chosen scenario.
 *
 * Three scenarios:
 *   boutique — «بوتیک زیتون» high-class gourmet single store (small team)
 *   hyper    — «هایپر زرین بزرگ‌راه» large single hypermarket (big team)
 *   chain    — «گروه زنجیره‌ای سروِ زرین» premium 3-branch chain franchise
 *
 * All staff PINs: 1234. Demo state is recorded in settings (`demo_mode`);
 * restoreRealData() brings the real Hyper Zeytoon dataset back.
 */
import type { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'
import { addDays, toJalali } from '../jalali'
import { seedRealData } from './seed-core'

function hashPin(pin: string): string {
  return createHash('sha256').update(`hz:${pin}`).digest('hex')
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// deterministic-enough RNG so a scenario always demos well
function mulberry(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DemoScenarioMeta {
  key: string
  name: string
  tagline: string
  description: string
  branches: string[]
  highlights: string[]
  icon: string
  accent: string
}

export const DEMO_SCENARIOS: DemoScenarioMeta[] = [
  {
    key: 'boutique',
    name: 'بوتیک زیتون',
    tagline: 'فروشگاه گورمت تک‌شعبه — محصول ویژه، تیم کوچک',
    description:
      'یک فروشگاه لوکس و کوچک در محله اعیانی‌نشین؛ دست‌کار‌ترین قهوه‌ها، خاویار و زعفران. تیم ۸ نفره و سرعت تصمیم‌گیری بالا — مناسب نشان‌دادن ظرافت پلتفرم برای کسب‌وکارهای بوتیک.',
    branches: ['شعبه الهیه'],
    highlights: ['محصولات ویژه و قیمت‌گذاری پرمارجن', 'چک‌های بزرگ با دوره‌های توافقی', 'گزارش هفتگی مدیریت'],
    icon: 'Gem',
    accent: '#7D5BA6',
  },
  {
    key: 'hyper',
    name: 'هایپر زرین بزرگ‌راه',
    tagline: 'هایپرمارکت بزرگ تک‌شعبه — حجم بالا، تنوع کامل',
    description:
      'هایپرمارکتی با بیش از ۲۵ همکار و صد‌ها قلم کالا از لبنیات تا شوینده‌ها؛ روزانه چند توزیع، جرد بخش‌به‌بخش و گردش مالی سنگین — مناسب نشان‌دادن قدرت عملیات در مقیاس بالا.',
    branches: ['شعبه بزرگ‌راه'],
    highlights: ['خط کامل سفارش→تحویل→انبار→حسابداری', 'جرد یک‌کلیکی و هشدار کمبود', 'بازی‌وارسازی عملکرد (SPHL)'],
    icon: 'Building2',
    accent: '#3E7C59',
  },
  {
    key: 'chain',
    name: 'گروه زنجیره‌ای سروِ زرین',
    tagline: 'زنجیره ۳ شعبه لوکس — تیم چندشعبه‌ای و دید یکپارچه',
    description:
      'گروهی سه‌شعبه‌ای در تهران، اصفهان و شیراز با محصولات گورمت و وارداتی؛ مدیریت متمرکز، چیدمان استاندارد و مقایسه شعب — مناسب نشان‌دادن مقیاس‌پذیری برای فرنچایزها.',
    branches: ['شعبه اوین — تهران', 'شعبه چهارباغ — اصفهان', 'شعبه قصردشت — شیراز'],
    highlights: ['چند شعبه در یک پلتفرم', 'شبکه تأمین ویژه گورمت', 'داشبورد مدیریت زنجیره'],
    icon: 'Network',
    accent: '#B07D2B',
  },
]

// ---------------- catalog pool (compact tuples) ----------------
// [name, category, brand, unit, buy, sell, avgDaily]
type P = [string, string, string, string, number, number, number]

const BASE_POOL: P[] = [
  ['شیر کم‌چرب پگاه ۱ لیتری', 'لبنیات', 'پگاه', 'عدد', 22000, 26000, 26],
  ['ماست ساده کاله ۹۰۰ گرمی', 'لبنیات', 'کاله', 'عدد', 48000, 56000, 14],
  ['پنیر لیقوان ۴۰۰ گرمی', 'لبنیات', 'لیقوان', 'عدد', 95000, 112000, 9],
  ['کره حیوانی میهن ۱۰۰ گرمی', 'لبنیات', 'میهن', 'عدد', 35000, 41000, 11],
  ['دوغ علفی آبعلی ۱.۵ لیتری', 'لبنیات', 'آبعلی', 'عدد', 30000, 35000, 18],
  ['خامه صبحانه پگاه ۲۰۰ گرمی', 'لبنیات', 'پگاه', 'عدد', 25000, 30000, 16],
  ['ماست موسیر کاله ۷۰۰ گرمی', 'لبنیات', 'کاله', 'عدد', 58000, 68000, 7],
  ['برنج هاشمی طارم اعلا ۵ کیلویی', 'خواربار', 'دامار', 'کیسه', 680000, 760000, 6],
  ['روغن سرخ‌کردنی لادن ۱.۸ لیتری', 'خواربار', 'لادن', 'عدد', 135000, 152000, 12],
  ['رب گوجه‌فرنگی چین‌چین ۸۰۰ گرمی', 'خواربار', 'چین‌چین', 'عدد', 98000, 112000, 8],
  ['ماکارونی رشته‌ای زر ۵۰۰ گرمی', 'خواربار', 'زر', 'عدد', 28000, 34000, 20],
  ['تن ماهی گالکسی ۱۸۰ گرمی', 'خواربار', 'گالکسی', 'عدد', 88000, 99000, 13],
  ['عسل طبیعی سبلان ۹۰۰ گرمی', 'خواربار', 'سبلان', 'عدد', 320000, 385000, 3],
  ['مربای آلبالو بیژن ۳۰۰ گرمی', 'خواربار', 'بیژن', 'عدد', 42000, 50000, 6],
  ['برنج قهوه‌ای ارگانیک ۹۰۰ گرمی', 'خواربار', 'دامار', 'بسته', 145000, 168000, 4],
  ['پفک نمکی مینو ۳۰ عددی', 'تنقلات', 'مینو', 'بسته', 96000, 108000, 15],
  ['چیپس نمکی چی‌توز ۷۵ گرمی', 'تنقلات', 'چی‌توز', 'عدد', 18000, 22000, 30],
  ['بیسکویت ساقه طلایی مینو', 'تنقلات', 'مینو', 'بسته', 9000, 12000, 25],
  ['ویفر مادر ۴۰ گرمی', 'تنقلات', 'مادر', 'عدد', 12000, 15000, 22],
  ['آجیل مخلوط شور ۲۰۰ گرمی', 'تنقلات', 'زرین', 'بسته', 165000, 195000, 5],
  ['پسته خندق اکبری ۵۰۰ گرمی', 'تنقلات', 'اکبری', 'بسته', 480000, 560000, 4],
  ['کشمش ملایر ۴۰۰ گرمی', 'تنقلات', 'ملایر', 'بسته', 85000, 100000, 6],
  ['نوشابه کوکاکولا ۱.۵ لیتری', 'نوشیدنی', 'کوکاکولا', 'عدد', 26000, 31000, 35],
  ['دوغ گازدار دوغو ۱.۵ لیتری', 'نوشیدنی', 'دوغو', 'عدد', 28000, 33000, 17],
  ['آب معدنی دماوند ۱.۵ لیتری', 'نوشیدنی', 'دماوند', 'عدد', 12000, 15000, 40],
  ['ماءالشعیر مالتا ۰.۳۳ لیتری', 'نوشیدنی', 'مالتا', 'قوطی', 18000, 23000, 24],
  ['آبمیوه سن‌ایچ ۱ لیتری', 'نوشیدنی', 'سن‌ایچ', 'عدد', 55000, 65000, 12],
  ['تخم‌مرغ بسته ۶ عددی', 'پروتئین', 'هراز', 'بسته', 54000, 62000, 19],
  ['سوسیس کاکل ۷۰۰ گرمی', 'پروتئین', 'کاکل', 'بسته', 135000, 155000, 9],
  ['مرغ منجمد ۱ کیلویی', 'پروتئین', 'زرین‌طیور', 'کیلو', 118000, 132000, 14],
  ['گوشت چرخ‌کرده گوساله ۵۰۰ گرمی', 'پروتئین', 'زرین‌گوشت', 'بسته', 320000, 365000, 6],
  ['مایع ظرفشویی ریکا ۳.۷۵ لیتری', 'شوینده', 'ریکا', 'گالن', 155000, 178000, 8],
  ['پودر لباسشویی پرسیل ۴.۵ کیلویی', 'شوینده', 'پرسیل', 'عدد', 420000, 480000, 4],
  ['دستمال کاغذی سافتلن ۳۰۰ برگ', 'شوینده', 'سافتلن', 'بسته', 32000, 38000, 18],
  ['فویل آلومینیومی مسکو ۳۰ متر', 'شوینده', 'مسکو', 'عدد', 65000, 76000, 7],
  ['شامپو کلیر ۴۰۰ میلی‌لیتری', 'شوینده', 'کلیر', 'عدد', 128000, 148000, 5],
  ['گوجه‌فرنگی گلخانه‌ای', 'تازه', '—', 'کیلو', 28000, 36000, 22],
  ['خیار گلخانه‌ای', 'تازه', '—', 'کیلو', 25000, 32000, 20],
  ['سیب قرمز دماوند', 'تازه', '—', 'کیلو', 32000, 41000, 18],
  ['موز درجه یک', 'تازه', '—', 'کیلو', 78000, 92000, 15],
  ['پرتقال تامسون شمال', 'تازه', '—', 'کیلو', 36000, 45000, 16],
  ['سیر طارم', 'تازه', '—', 'کیلو', 85000, 98000, 5],
]

const GOURMET_POOL: P[] = [
  ['قهوه اسپرسو عربیکا موکاپا ۲۵۰ گرمی', 'قهوه و نوشیدنی گورمت', 'موکاپا', 'بسته', 385000, 465000, 6],
  ['قهوه کلمبیا تک‌خاستگاه ۲۵۰ گرمی', 'قهوه و نوشیدنی گورمت', 'موکاپا', 'بسته', 495000, 590000, 4],
  ['شکلات تلخ ۷۰٪ بلژیکی لئونیداس ۱۰۰ گرمی', 'شیرینی و شکلات گورمت', 'لئونیداس', 'عدد', 145000, 178000, 7],
  ['خاویار ایرانی درجه یک ۱۰۰ گرمی', 'دلخواه ویژه', 'میرزایی', 'قوطی', 3800000, 4500000, 1],
  ['زعفران سرگل قائنات ۴.۶ گرمی', 'دلخواه ویژه', 'قائنات', 'بسته', 890000, 1050000, 2],
  ['روغن زیتون فرابکر رودبار ۱ لیتری', 'دلخواه ویژه', 'رودبار', 'عدد', 420000, 495000, 3],
  ['پاستا باریلا ایتالیا ۵۰۰ گرمی', 'خواربار گورمت', 'باریلا', 'عدد', 98000, 122000, 6],
  ['سرکه بالزامیک مودنا ۲۵۰ میلی‌لیتری', 'خواربار گورمت', 'مودنا', 'عدد', 265000, 320000, 2],
  ['چای سیاه ممتاز احمد ۵۰۰ گرمی', 'قهوه و نوشیدنی گورمت', 'احمد', 'بسته', 340000, 398000, 5],
  ['پنیر پارمزان رنده‌شده ۲۰۰ گرمی', 'لبنیات گورمت', 'پارمزانو', 'بسته', 480000, 560000, 3],
  ['ماءالشعیر مالت ویژه باربارا', 'نوشیدنی گورمت', 'باربارا', 'عدد', 42000, 52000, 9],
  ['بیسکویت لوکر کلاسیک', 'شیرینی و شکلات گورمت', 'لوکر', 'بسته', 78000, 92000, 8],
  ['عسل کنار ویژه طبیعت ۹۰۰ گرمی', 'دلخواه ویژه', 'طبیعت', 'شیشه', 560000, 660000, 2],
  ['هل و دارچین بسته‌بندی ویژه', 'دلخواه ویژه', 'زیتون اسپایس', 'بسته', 190000, 235000, 3],
]

// ---------------- staff pools ----------------
interface StaffDef {
  username: string; name: string; title: string; gender: 'MALE' | 'FEMALE'; roles: string[]; branch?: string
}
const M_COLORS = ['#7D5BA6', '#3E7C59', '#2E6E8E', '#B07D2B', '#8A3B5C', '#5E8C61', '#6B8E23', '#C9A227', '#C96F27', '#4C7A34', '#444A54']

const BOUTIQUE_STAFF: StaffDef[] = [
  { username: 'farhad.rostami', name: 'فرهاد رستمی', title: 'مالک و مدیر ارشد', gender: 'MALE', roles: ['owner', 'gm'] },
  { username: 'shirin.kaviani', name: 'شیرین کاویانی', title: 'مدیر فروشگاه', gender: 'FEMALE', roles: ['gm', 'om'] },
  { username: 'bahar.montazeri', name: 'بهار منتظری', title: 'حسابدار', gender: 'FEMALE', roles: ['accountant'] },
  { username: 'omid.rahmani', name: 'امید رحمانی', title: 'سرپرست انبار', gender: 'MALE', roles: ['inventory', 'pm'] },
  { username: 'leila.hashemi', name: 'لیلا هاشمی', title: 'فروشنده ارشد گورمت', gender: 'FEMALE', roles: ['sales'] },
  { username: 'kaveh.alizadeh', name: 'کاوه علی‌زاده', title: 'تحویل‌گیرنده و قهوه‌شناس', gender: 'MALE', roles: ['delivery', 'sales'] },
  { username: 'mahtab.karimi', name: 'مهتاب کریمی', title: 'صندوق‌دار', gender: 'FEMALE', roles: ['cashier'] },
  { username: 'sohrab.nikpour', name: 'سهراب نیک‌پور', title: 'چیدمان‌کار ویترین', gender: 'MALE', roles: ['merchandiser'] },
]

const HYPER_STAFF: StaffDef[] = [
  { username: 'golnaz.tabesh', name: 'گلناز تابش', title: 'مدیر کل', gender: 'FEMALE', roles: ['gm'] },
  { username: 'babak.zamani', name: 'بابک زمانی', title: 'مالک', gender: 'MALE', roles: ['owner'] },
  { username: 'hamed.ghorbani', name: 'حامد قربانی', title: 'مدیر عملیات', gender: 'MALE', roles: ['om'] },
  { username: 'sanaz.azadi', name: 'سانا آزادی', title: 'مدیر محصول و چیدمان', gender: 'FEMALE', roles: ['pm'] },
  { username: 'vahid.mousavi', name: 'وحید موسوی', title: 'حسابدار ارشد', gender: 'MALE', roles: ['accountant'] },
  { username: 'rezvan.beheshti', name: 'رضوان بهشتی', title: 'حسابدار', gender: 'FEMALE', roles: ['accountant'] },
  { username: 'farzin.tavakoli', name: 'فرزین توکلی', title: 'سرپرست انبار', gender: 'MALE', roles: ['inventory'] },
  { username: 'parisa.jafari', name: 'پریسا جعفری', title: 'انباردار', gender: 'FEMALE', roles: ['inventory'] },
  { username: 'mehdi.hosseini', name: 'مهدی حسینی', title: 'تحویل‌گیرنده', gender: 'MALE', roles: ['delivery'] },
  { username: 'shahnaz.vahidi', name: 'شهناز وحیدی', title: 'تحویل‌گیرنده و مرچندایزر', gender: 'FEMALE', roles: ['delivery', 'merchandiser'] },
  { username: 'roza.moradi', name: 'روزا مرادی', title: 'سرصندوق‌دار', gender: 'FEMALE', roles: ['cashier'] },
  { username: 'yasser.abdi', name: 'یاسر عبدی', title: 'صندوق‌دار', gender: 'MALE', roles: ['cashier'] },
  { username: 'elyas.karbalaei', name: 'الیهاس کربلایی', title: 'صندوق‌دار', gender: 'MALE', roles: ['cashier'] },
  { username: 'nastaran.talebi', name: 'نستاران طالبی', title: 'فروشنده', gender: 'FEMALE', roles: ['sales'] },
  { username: 'sina.daneshvar', name: 'سینا دانش‌ور', title: 'فروشنده', gender: 'MALE', roles: ['sales'] },
  { username: 'farnaz.shokri', name: 'فرناز شُکری', title: 'فروشنده پروتئین', gender: 'FEMALE', roles: ['sales'] },
  { username: 'aidin.marandi', name: 'آیدین مرندی', title: 'مرچندایزر ارشد', gender: 'MALE', roles: ['merchandiser'] },
  { username: 'somayeh.fathi', name: 'سمیه فتحی', title: 'مرچندایزر', gender: 'FEMALE', roles: ['merchandiser'] },
  { username: 'kambiz.dousti', name: 'کامبیز دوستی', title: 'مرچندایزر', gender: 'MALE', roles: ['merchandiser'] },
  { username: 'afsaneh.rashedi', name: 'افسانه راشدی', title: 'مرچندایزر', gender: 'FEMALE', roles: ['merchandiser'] },
  { username: 'behrouz.saberi', name: 'بهروز صابری', title: 'مرچندایزر', gender: 'MALE', roles: ['merchandiser'] },
  { username: 'taraneh.yazdani', name: 'ترانه یزدانی', title: 'کارشناس فناوری اطلاعات', gender: 'FEMALE', roles: ['it_admin'] },
  { username: 'jamshid.pakzad', name: 'جمشید پاکزاد', title: 'نگهبان ورودی', gender: 'MALE', roles: ['sales'] },
  { username: 'zahra.momeni', name: 'زهرا مومنی', title: 'پشتیبانی مشتریان', gender: 'FEMALE', roles: ['sales'] },
  { username: 'arash.khajeh', name: 'آرش خواجه', title: 'اپراتور انبار', gender: 'MALE', roles: ['inventory'] },
  { username: 'delaram.nouri', name: 'دلارام نوری', title: 'صندوق‌دار', gender: 'FEMALE', roles: ['cashier'] },
]

const CHAIN_STAFF: StaffDef[] = [
  { username: 'mahnaz.ghaffari', name: 'مهناز غفاری', title: 'مدیرعامل گروه', gender: 'FEMALE', roles: ['owner', 'gm'] },
  { username: 'khashayar.bayat', name: 'خشایار بیات', title: 'مدیر عملیات زنجیره', gender: 'MALE', roles: ['om'] },
  { username: 'farima.sabet', name: 'فریماه ثابت', title: 'مدیر مالی گروه', gender: 'FEMALE', roles: ['accountant'] },
  { username: 'amirhossein.gholi', name: 'امیرحسین قلی', title: 'حسابدار گروه', gender: 'MALE', roles: ['accountant'] },
  { username: 'naheed.eslami', name: 'ناهید اسلامی', title: 'مدیر بازرگانی و تأمین', gender: 'FEMALE', roles: ['pm'] },
  { username: 'shayan.motlagh', name: 'شایان مطلق', title: 'کارشناس فناوری اطلاعات گروه', gender: 'MALE', roles: ['it_admin'] },
  { username: 'parviz.ashouri', name: 'پرویز عاشوری', title: 'مدیر شعبه اوین', gender: 'MALE', roles: ['gm'], branch: 'اوین' },
  { username: 'nasim.salehi', name: 'نسیم صالحی', title: 'سرپرست انبار شعبه اوین', gender: 'FEMALE', roles: ['inventory'], branch: 'اوین' },
  { username: 'kourosh.vafa', name: 'کوروش وفادار', title: 'تحویل‌گیرنده شعبه اوین', gender: 'MALE', roles: ['delivery'], branch: 'اوین' },
  { username: 'hana.zarrinkolah', name: 'هنا زرین‌کلاه', title: 'صندوق‌دار شعبه اوین', gender: 'FEMALE', roles: ['cashier'], branch: 'اوین' },
  { username: 'mitra.rahnama', name: 'مهسا رهنما', title: 'فروشنده ارشد شعبه اوین', gender: 'FEMALE', roles: ['sales'], branch: 'اوین' },
  { username: 'bardia.kashi', name: 'بردیا کاشی', title: 'چیدمان‌کار شعبه اوین', gender: 'MALE', roles: ['merchandiser'], branch: 'اوین' },
  { username: 'mohadeseh.kian', name: 'محدثه کیان', title: 'مدیر شعبه چهارباغ', gender: 'FEMALE', roles: ['gm'], branch: 'چهارباغ' },
  { username: 'rahim.balouch', name: 'رحیم بلوچ', title: 'سرپرست انبار شعبه چهارباغ', gender: 'MALE', roles: ['inventory'], branch: 'چهارباغ' },
  { username: 'sogand.nazari', name: 'سوگند نظری', title: 'تحویل‌گیرنده شعبه چهارباغ', gender: 'FEMALE', roles: ['delivery'], branch: 'چهارباغ' },
  { username: 'farshid.maghsoodi', name: 'فرشید مقصودی', title: 'صندوق‌دار شعبه چهارباغ', gender: 'MALE', roles: ['cashier'], branch: 'چهارباغ' },
  { username: 'tina.abbaszadeh', name: 'تینا عباس‌زاده', title: 'فروشنده شعبه چهارباغ', gender: 'FEMALE', roles: ['sales'], branch: 'چهارباغ' },
  { username: 'davood.sarlak', name: 'داوود سرلاک', title: 'چیدمان‌کار شعبه چهارباغ', gender: 'MALE', roles: ['merchandiser'], branch: 'چهارباغ' },
  { username: 'mahsa.esmaeeli', name: 'مهسا اسماعیلی', title: 'مدیر شعبه قصردشت', gender: 'FEMALE', roles: ['gm'], branch: 'قصردشت' },
  { username: 'younes.khoshdel', name: 'یونس خوشدل', title: 'سرپرست انبار شعبه قصردشت', gender: 'MALE', roles: ['inventory'], branch: 'قصردشت' },
  { username: 'neda.faramarzi', name: 'ندا فرامرزی', title: 'تحویل‌گیرنده شعبه قصردشت', gender: 'FEMALE', roles: ['delivery'], branch: 'قصردشت' },
  { username: 'saeed.heydari', name: 'سعید حیدری', title: 'صندوق‌دار شعبه قصردشت', gender: 'MALE', roles: ['cashier'], branch: 'قصردشت' },
  { username: 'banafsheh.tohidi', name: 'بنفشه توهیدی', title: 'فروشنده شعبه قصردشت', gender: 'FEMALE', roles: ['sales'], branch: 'قصردشت' },
  { username: 'masoud.golchin', name: 'مسعود گلچین', title: 'چیدمان‌کار شعبه قصردشت', gender: 'MALE', roles: ['merchandiser'], branch: 'قصردشت' },
  { username: 'azadeh.sabouri', name: 'آزاده صبوری', title: 'بازرس کیفیت گروه', gender: 'FEMALE', roles: ['inventory'], branch: undefined },
]

// (staff definitions above are the single source of truth)

const PROVIDER_DEFS = [
  { name: 'پخش مهرام جنوب', phone: '۰۳۴-۳۲۴۵۱۱۲۲', kind: 'DISTRIBUTOR' },
  { name: 'مرکز توزیع جنوبشرق', phone: '۰۳۴-۳۳۸۸۴۵۶۷', kind: 'DISTRIBUTOR' },
  { name: 'بازرگانی پخش آرین', phone: '۰۳۴-۳۲۲۲۹۰۱۰', kind: 'DISTRIBUTOR' },
  { name: 'شرکت صنایع پگاه ایران', phone: '۰۲۱-۸۸۷۷۳۳۴۴', kind: 'DIRECT' },
  { name: 'گروه لبنی کاله', phone: '۰۲۶-۳۲۳۴۵۶۷۸', kind: 'DIRECT' },
  { name: 'شرکت کلوچه و بیسکویت مینو', phone: '۰۲۱-۶۶۵۵۸۸۹۹', kind: 'DIRECT' },
  { name: 'پخش نوشیدنی کوکاکولا', phone: '۰۲۱-۲۲۳۳۴۴۵۵', kind: 'DISTRIBUTOR' },
  { name: 'بازرگانی تن‌واعقاری گلستان', phone: '۰۳۴-۳۴۵۶۷۸۹۰', kind: 'DISTRIBUTOR' },
  { name: 'پخش ویژه گورمت رفسنجان', phone: '۰۳۴-۳۴۵۶۱۱۳۳', kind: 'DISTRIBUTOR' },
  { name: 'بازرگانی خاویار و زعفران پارس', phone: '۰۲۱-۸۸۴۴۵۵۶۶', kind: 'DIRECT' },
]

const COMPANY_DEFS = [
  { name: 'صنایع شیر پاستوریزه پگاه', kind: 'MANUFACTURER' },
  { name: 'گروه لبنی کاله', kind: 'MANUFACTURER' },
  { name: 'شرکت کلوچه‌سازی مینو', kind: 'MANUFACTURER' },
  { name: 'شرکت چی‌توز', kind: 'MANUFACTURER' },
  { name: 'گروه زر', kind: 'MANUFACTURER' },
  { name: 'شرکت چین‌چین', kind: 'MANUFACTURER' },
  { name: 'مرکز توزیع جنوبشرق', kind: 'DISTRIBUTION_CENTER' },
  { name: 'پخش مهرام', kind: 'DISTRIBUTION_CENTER' },
  { name: 'بازرگانی پخش آرین', kind: 'BOTH' },
  { name: 'پخش ویژه گورمت رفسنجان', kind: 'DISTRIBUTION_CENTER' },
]

const SECTIONS_BASE = ['لبنیات', 'خواربار', 'تنقلات', 'نوشیدنی', 'پروتئین', 'شوینده', 'تازه']

const SOP_DEFS = [
  { title: 'رویه دریافت توزیع و کنترل مغایرت', body: '۱) رسید تحویل را با سفارش مطابقت دهید.\n۲) هر قلم را شمارش و وضعیت را ثبت کنید.\n۳) مغایرت را با یادداشت ثبت کنید و از تصویر کالا بایگانی بگیرید.\n۴) در پایان «ثبت دریافت» را بزنید تا مدیران مطلع شوند.' },
  { title: 'رویه صدور چک و کنترل تعطیلات', body: '۱) تاریخ چک هرگز پنجشنبه/جمعه یا تعطیل رسمی نمی‌افتد؛ سامانه پیشنهاد می‌دهد.\n۲) پیش از صدور، موجودی چک‌های باز را از بخش چک‌ها ببینید.\n۳) امضای مالک الزامی است؛ بدون امضا به بانک ندهید.' },
  { title: 'رویه جرد بخش‌های فروشگاه', body: '۱) از بخش جرد انبار، محدوده را انتخاب کنید (همه، یک دسته یا یک بخش).\n۲) قلم‌به‌قلم شمارش و ثبت کنید؛ سیستم مغایرت را زنده نشان می‌دهد.\n۳) بعد از تأیید، سند چاپی را امضا و در پرونده بایگانی کنید.' },
  { title: 'رویه ورود کالای جدید از اکسل هولو', body: '۱) فایل اکسل هولو را در بخش محصولات بارگذاری کنید.\n۲) ردیف‌های تکراری را «ادغام» بزنید تا بارکد به کالای اصلی منتقل شود.\n۳) خلاصه ورود را بررسی و تأیید کنید.' },
]

const TASK_DEFS = [
  { title: 'کنترل تاریخ انقضای لبنیات یخچال ۲', note: 'اقلام کمتر از ۵ روز مانده را جدا و برچسب تخفیف بزنید.', points: 15 },
  { title: 'چیدمان ویترین قهوه گورمت', note: 'بر اساس پلنوگرام جدید، قهوه تک‌خاستگاه در ردیف دید باشد.', points: 20 },
  { title: 'شمارش دوره‌ای شوینده‌ها', note: 'اختلاف بیش از ۳ عدد را در جرد ثبت کنید.', points: 10 },
  { title: 'تمیزکاری یخچال‌های پروتئین', note: 'پس از بستن فروشگاه؛ چک‌لیست بهداشت کامل شود.', points: 12 },
  { title: 'پیگیری چک سررسید نزدیک', note: 'با تأمین‌کننده هماهنگ کنید که چک در روز کاری تحویل شود.', points: 18 },
  { title: 'برچسب‌گذاری تخفیف پنجشنبه', note: 'میوه و سبزیجات نرم‌شده اولویت اول است.', points: 10 },
]

const WALL_DEFS = [
  'همکاران عزیز، تا پایان هفته موجودی زعفران سرگل را کامل کنید — مشتری‌های گورمت منتظرند 🌟',
  'خلاصه جلسه: از این هفته جرد بخش‌ها هر سه‌شنبه انجام می‌شود؛ دسترسی‌ها را چک کنید.',
  'آفرین به تیم انبار — مغایرت‌های دریافت این ماه نصف شد 👏',
  'یادآوری: عکس کالای مغایرت‌دار را حتماً در فرم دریافت ضمیمه کنید.',
]

const FEEDBACK_DEFS = [
  { message: 'اگر تاریخ انقضا روی کارت محصول هم نمایش داده شود عالی می‌شود.', kind: 'IDEA', anonymous: true },
  { message: 'دریافت توزیع با گوشی خیلی سریع شد؛ ممنون از تیم فناوری.', kind: 'PRAISE', anonymous: false },
  { message: 'ساعت شلوغی صندوق ۲ گرم می‌شود — امکان جابه‌جایی صندوق‌دار بدهیم؟', kind: 'CONCERN', anonymous: true },
]

const CUSTOMER_DEFS = [
  { name: 'رستوران دُر داریوش', phone: '۰۳۴-۳۱۲۲۴۴۵۵', note: 'خرید عمده پروتئین و لبنیات — تسویه هفتگی' },
  { name: 'کافه رستوران گیلانه', phone: '۰۳۴-۳۱۵۵۸۸۷۷', note: 'قهوه تک‌خاستگاه و خاویار — سفارش هفته‌ای' },
  { name: 'تالار پذیرایی آیسان', phone: '۰۳۴-۳۳۷۷۱۲۳۴', note: 'سفارش‌های مجالس — چک یک‌ماهه' },
  { name: 'فست‌فود برگرلند', phone: '۰۳۴-۳۲۴۴۹۹۸۸', note: 'نان برگر و گوشت چرخ‌کرده' },
]

function jalaliTodayStamp(d = new Date()): string {
  const j = toJalali(d)
  return `${j.jy}${String(j.jm).padStart(2, '0')}${String(j.jd).padStart(2, '0')}`
}

async function wipeAll(db: PrismaClient) {
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
}

async function seedRoles(db: PrismaClient): Promise<Record<string, string>> {
  const roleDefs = [
    { key: 'owner', name: 'مالک', color: '#7D5BA6', isManager: true, description: 'مدیریت ارشد کسب‌وکار' },
    { key: 'gm', name: 'مدیر کل', color: '#3E7C59', isManager: true, description: 'مدیریت کل فروشگاه' },
    { key: 'om', name: 'مدیر عملیات', color: '#2E6E8E', isManager: true, description: 'مدیریت عملیات و فرایندها' },
    { key: 'pm', name: 'مدیر محصول', color: '#B07D2B', isManager: true, description: 'مدیریت انبار و چیدمان' },
    { key: 'accountant', name: 'حسابدار ارشد', color: '#8A3B5C', isManager: true, description: 'حسابداری و هولو' },
    { key: 'inventory', name: 'سرپرست انبار', color: '#5E8C61', isManager: true, description: 'انباردار' },
    { key: 'delivery', name: 'تحویل‌گیرنده', color: '#6B8E23', isManager: false, description: 'دریافت توزیع‌ها' },
    { key: 'cashier', name: 'صندوق‌دار', color: '#C9A227', isManager: false, description: 'صندوق' },
    { key: 'sales', name: 'فروشنده', color: '#C96F27', isManager: false, description: 'فروش و مشاوره' },
    { key: 'merchandiser', name: 'چیدمان‌کار (مرچندایزر)', color: '#4C7A34', isManager: false, description: 'چیدمان قفسه‌ها' },
    { key: 'it_admin', name: 'مدیر فناوری اطلاعات', color: '#444A54', isManager: true, description: 'مدیریت پلتفرم' },
  ]
  const roles: Record<string, string> = {}
  for (const r of roleDefs) {
    const created = await db.role.create({ data: r })
    roles[r.key] = created.id
  }
  return roles
}

async function seedHolidays(db: PrismaClient) {
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
}

export async function getDemoStatus(db: PrismaClient): Promise<{ active: boolean; scenario: string | null }> {
  const s = await db.settings.findUnique({ where: { key: 'demo_mode' } })
  return { active: Boolean(s?.value), scenario: s?.value ?? null }
}

export async function generateDemoData(db: PrismaClient, scenarioKey: string): Promise<{ ok: true; scenario: string; stats: Record<string, number> }> {
  const meta = DEMO_SCENARIOS.find((s) => s.key === scenarioKey)
  if (!meta) throw new Error('سناریوی نمایشی نامعتبر است')
  const rnd = mulberry(scenarioKey === 'boutique' ? 41 : scenarioKey === 'hyper' ? 87 : 133)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]

  await wipeAll(db)
  await seedHolidays(db)
  const roles = await seedRoles(db)

  // ---------- staff ----------
  let staff: StaffDef[]
  if (scenarioKey === 'boutique') staff = BOUTIQUE_STAFF
  else if (scenarioKey === 'hyper') staff = HYPER_STAFF
  else staff = CHAIN_STAFF

  const U: Record<string, string> = {}
  for (let i = 0; i < staff.length; i++) {
    const s = staff[i]
    const created = await db.user.create({
      data: {
        username: s.username.trim(),
        pin: hashPin('1234'),
        name: s.name,
        title: s.branch ? `${s.title} — ${s.branch}` : s.title,
        gender: s.gender,
        color: M_COLORS[i % M_COLORS.length],
        active: true,
        points: Math.floor(rnd() * 60) + 55,
        roles: { create: s.roles.map((rk) => ({ roleId: roles[rk] })) },
      },
    })
    U[s.username.trim()] = created.id
  }
  const adminIds = staff.filter((s) => s.roles.some((r) => ['owner', 'gm', 'om'].includes(r))).map((s) => U[s.username.trim()])

  // ---------- companies / providers ----------
  const companyIds: string[] = []
  for (const c of COMPANY_DEFS) {
    const created = await db.company.create({ data: { name: c.name, kind: c.kind } })
    companyIds.push(created.id)
  }
  const providerCount = scenarioKey === 'boutique' ? 5 : scenarioKey === 'hyper' ? 8 : 10
  const P: Record<string, { id: string; name: string }> = {}
  for (let i = 0; i < providerCount; i++) {
    const def = PROVIDER_DEFS[i]
    const created = await db.provider.create({
      data: {
        name: def.name,
        phone: def.phone,
        kind: def.kind,
        color: M_COLORS[(i + 3) % M_COLORS.length],
        notes: i % 3 === 0 ? 'تسویه چک یک‌ماهه توافقی' : i % 3 === 1 ? 'تحویل صبح‌ها قبل از ۹' : null,
      },
    })
    P[def.name] = { id: created.id, name: def.name }
    // link 1-2 companies
    const links = [companyIds[i % companyIds.length], companyIds[(i * 3 + 1) % companyIds.length]]
    for (const cid of Array.from(new Set(links))) {
      await db.providerCompany.create({ data: { providerId: created.id, companyId: cid } })
    }
  }
  const providerList = Object.values(P)

  // ---------- catalog ----------
  const pool = scenarioKey === 'boutique' ? [...GOURMET_POOL, ...BASE_POOL.slice(0, 18)]
    : scenarioKey === 'hyper' ? [...BASE_POOL, ...GOURMET_POOL.slice(0, 6)]
    : [...BASE_POOL, ...GOURMET_POOL]
  const priceMul = scenarioKey === 'boutique' ? 1.15 : 1

  const products: { id: string; name: string; sell: number; buy: number; daily: number; category: string; provider: { id: string; name: string } }[] = []
  for (let i = 0; i < pool.length; i++) {
    const [name, category, brand, unit, buy, sell, daily] = pool[i]
    const created = await db.product.create({
      data: {
        name,
        category,
        brand: brand === '—' ? null : brand,
        unit,
        buyPrice: Math.round(buy * priceMul),
        sellPrice: Math.round(sell * priceMul),
        sellPrice2: rnd() > 0.7 ? Math.round(sell * priceMul * 0.97) : null,
        stock: Math.max(0, Math.round(daily * (rnd() * 5 + 1.5))),
        minStock: Math.max(4, Math.round(daily * 1.4)),
        capacity: Math.max(10, Math.round(daily * 6)),
        holooCode: `H${(1000 + i).toString()}D${scenarioKey === 'chain' ? 3 : 1}`,
        status: 'ACTIVE',
        barcodes: { create: [{ code: `2000000000${String(i + 1).padStart(4, '0')}`, isPrimary: true }] },
      },
    })
    products.push({ id: created.id, name, sell: sell * priceMul, buy: buy * priceMul, daily, category, provider: providerList[i % providerList.length] })
  }

  // ---------- 45-day sales history with Friday/Thursday seasonality ----------
  for (const p of products) {
    for (let d = 45; d >= 1; d--) {
      const date = addDays(new Date(), -d)
      const dow = date.getDay() // 4=Thu,5=Fri in JS? JS: 0=Sun ... 4=Thu, 5=Fri
      const mul = dow === 4 ? 1.55 : dow === 5 ? 1.35 : dow === 6 ? 1.1 : 0.92
      const qty = Math.max(0, Math.round(p.daily * mul * (0.6 + rnd() * 0.9)))
      if (qty === 0) continue
      await db.productSale.create({ data: { productId: p.id, qty, amount: qty * p.sell, date } })
    }
  }

  // ---------- orders across the pipeline ----------
  const jToday = jalaliTodayStamp()
  const statuses = [
    'PENDING_APPROVAL', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'RECEIVING',
    'RECEIVED_BY_DELIVERY', 'CONFIRMED_BY_INVENTORY', 'ACCOUNTING_DONE', 'DONE', 'DONE', 'DONE', 'CANCELLED',
  ]
  let seq = 1
  for (let i = 0; i < statuses.length; i++) {
    const status = statuses[i]
    const provider = providerList[i % providerList.length]
    const createdBy = adminIds[i % adminIds.length]
    const daysAgo = Math.floor(rnd() * 10)
    const receiving = addDays(new Date(), status === 'CANCELLED' ? daysAgo : (i % 3) - 1)
    const itemCount = 3 + Math.floor(rnd() * 5)
    const chosen: typeof products = []
    while (chosen.length < itemCount) {
      const p = pick(products)
      if (!chosen.find((x) => x.id === p.id)) chosen.push(p)
    }
    let total = 0
    const items = chosen.map((p) => {
      const qty = Math.max(2, Math.round(p.daily * (1 + rnd() * 2)))
      const unitPrice = Math.round(p.buy)
      const itTotal = qty * unitPrice
      total += itTotal
      return { productId: p.id, name: p.name, barcode: `2000000000${String(products.indexOf(p) + 1).padStart(4, '0')}`, unit: 'عدد', qty, unitPrice, total: itTotal, vat: Math.round(itTotal * 0.09) }
    })
    const vat = Math.round(total * 0.09)
    const finalAmount = total + vat
    const createdOrder = await db.order.create({
      data: {
        code: `ORD-${jToday}-${String(seq++).padStart(3, '0')}`,
        providerId: provider.id,
        providerName: provider.name,
        status,
        paymentType: i % 3 === 0 ? 'CASH' : 'CHEQUE',
        receivingDate: receiving,
        createdById: createdBy,
        totalAmount: total,
        vat,
        finalAmount,
        note: status === 'CANCELLED' ? 'لغو شد — تأمین‌کننده موجودی نداشت' : null,
        deliveredAt: ['RECEIVED_BY_DELIVERY', 'CONFIRMED_BY_INVENTORY', 'ACCOUNTING_DONE', 'DONE'].includes(status) ? addDays(new Date(), -1) : null,
        confirmedAt: ['CONFIRMED_BY_INVENTORY', 'ACCOUNTING_DONE', 'DONE'].includes(status) ? addDays(new Date(), -1) : null,
        accountingDoneAt: ['ACCOUNTING_DONE', 'DONE'].includes(status) ? addDays(new Date(), -1) : null,
        items: { create: items },
      },
    })
    await db.orderHistory.createMany({
      data: [
        { orderId: createdOrder.id, userId: createdBy, userName: staffName(staff, createdBy, U), action: 'ایجاد سفارش', detail: `${itemCount} قلم` },
        ...(status !== 'PENDING_APPROVAL' ? [{ orderId: createdOrder.id, userId: createdBy, userName: staffName(staff, createdBy, U), action: 'تأیید سفارش' }] : []),
        ...(status === 'CANCELLED' ? [{ orderId: createdOrder.id, userId: createdBy, userName: staffName(staff, createdBy, U), action: 'لغو سفارش', detail: 'ناموجود بودن' }] : []),
      ] as never[],
    })
    // cheques for CHEQUE orders in later stages
    if (createdOrder.paymentType === 'CHEQUE' && ['CONFIRMED_BY_INVENTORY', 'ACCOUNTING_DONE', 'DONE'].includes(status)) {
      await db.cheque.create({
        data: {
          number: `CH-${jToday}-${String(seq).padStart(3, '0')}`,
          amount: finalAmount,
          dueDate: addDays(new Date(), 10 + Math.floor(rnd() * 40)),
          payeeName: provider.name,
          status: status === 'DONE' ? 'COLLECTED' : 'SIGNED',
          createdById: createdBy,
          writtenAt: addDays(new Date(), -2),
          collectedAt: status === 'DONE' ? addDays(new Date(), -1) : null,
          note: `بابت سفارش ${createdOrder.code}`,
          orderId: createdOrder.id,
        },
      })
    }
    if (status === 'DONE' && createdOrder.paymentType === 'CASH') {
      await db.payment.create({
        data: { type: 'CASH_ON_DELIVERY', amount: finalAmount, receiptNo: `R-${1000 + seq}`, orderId: createdOrder.id },
      })
    }
  }

  // ---------- shelves / planogram ----------
  const sections = scenarioKey === 'boutique' ? ['قهوه گورمت', 'دلخواه ویژه', 'لبنیات', 'تنقلات', 'شیرینی گورمت'] : SECTIONS_BASE
  let shelfIdx = 0
  for (const section of sections) {
    const inSection = products.filter((p) => p.category.includes(section.split(' ')[0]) || p.category === section).slice(0, scenarioKey === 'hyper' ? 6 : 4)
    for (let row = 1; row <= Math.max(1, Math.ceil(inSection.length / 2)); row++) {
      for (let col = 1; col <= 2; col++) {
        const p = inSection[(row - 1) * 2 + (col - 1)]
        await db.shelf.create({
          data: {
            name: `${section} — ردیف ${row} طبقه ${col}`,
            section,
            row,
            col,
            capacity: 24,
            productId: p ? p.id : null,
          },
        })
        shelfIdx++
      }
    }
  }

  // ---------- tasks / SOPs / checklists ----------
  const taskOwners = staff.filter((s) => !s.roles.includes('owner'))
  for (let i = 0; i < TASK_DEFS.length; i++) {
    const t = TASK_DEFS[i]
    const owner = taskOwners[i % taskOwners.length]
    const created = await db.task.create({
      data: {
        title: t.title,
        description: t.note,
        priority: i === 0 ? 'HIGH' : 'MEDIUM',
        status: i === 0 ? 'DONE' : i === 1 ? 'IN_PROGRESS' : 'TODO',
        fromOwner: true,
        createdById: adminIds[0],
        assignedToId: U[owner.username.trim()],
        dueDate: addDays(new Date(), (i % 4) + 1),
      },
    })
    if (i === 0) {
      await db.taskUpdate.create({
        data: { taskId: created.id, userId: U[owner.username.trim()], userName: owner.name, content: 'انجام شد ✅' },
      })
      await db.award.create({
        data: { userId: U[owner.username.trim()], points: t.points, reason: `انجام کامل: ${t.title}`, grantedById: adminIds[0] },
      })
    }
  }
  for (let i = 0; i < SOP_DEFS.length; i++) {
    const s = SOP_DEFS[i]
    await db.sOP.create({
      data: {
        title: s.title,
        category: i === 0 ? 'انبار و دریافت' : i === 1 ? 'مالی' : i === 2 ? 'انبار و دریافت' : 'محصولات',
        summary: s.body.split('\n')[0],
        steps: JSON.stringify(
          s.body.split('\n').map((line, idx) => ({ title: `گام ${idx + 1}`, detail: line.replace(/^\d+\)\s*/, '') }))
        ),
        roleKeys: i === 0 ? 'delivery,inventory' : i === 1 ? 'accountant,owner' : i === 2 ? 'inventory' : '',
        createdBy: adminIds[0],
      },
    })
  }
  const checklistDefs = [
    { title: 'چک‌لیست بازگشایی فروشگاه (صبح)', roleKey: 'cashier', items: ['چراغ‌ها و کولرها', 'صندوق و شروع شیفت', 'چیدمان تازه‌ها', 'کنترل تاریخ انقضای لبنیات'] },
    { title: 'چک‌لیست بستن فروشگاه (شب)', roleKey: 'cashier', items: ['بستن صندوق‌ها', 'گزارش فروش روز', 'خروجی اکسل هولو', 'قطع کولرهای ویترین'] },
  ]
  for (const c of checklistDefs) {
    await db.checklist.create({
      data: { title: c.title, roleKey: c.roleKey, items: JSON.stringify(c.items.map((text) => ({ text }))) },
    })
  }

  // ---------- wall / feedback / notes ----------
  for (let i = 0; i < WALL_DEFS.length; i++) {
    await db.wallPost.create({
      data: {
        content: WALL_DEFS[i],
        userId: adminIds[i % adminIds.length],
        category: i % 2 === 0 ? 'INFO' : 'TIP',
        pinned: i === 0,
      },
    })
  }
  for (const f of FEEDBACK_DEFS) {
    if (f.kind === 'IDEA') {
      await db.ideaPost.create({
        data: { title: 'پیشنهاد بهبود سامانه', content: f.message, userId: adminIds[0], status: 'SUBMITTED' },
      })
    } else {
      await db.feedbackPost.create({
        data: { content: f.message, anonymous: f.anonymous, userId: f.anonymous ? null : adminIds[1] ?? adminIds[0], rating: 5 },
      })
    }
  }
  await db.personalNote.create({
    data: { title: 'یادداشت هفته', content: 'با پخش گورمت برای تخفیف پله‌ای قهوه صحبت شود.', userId: adminIds[0] },
  })

  // ---------- customers ----------
  for (const c of CUSTOMER_DEFS.slice(0, scenarioKey === 'boutique' ? 2 : 4)) {
    await db.customer.create({ data: { name: c.name, phone: c.phone, tasteNotes: c.note } })
  }

  // ---------- conversation ----------
  const conv = await db.conversation.create({ data: { isGroup: true, title: 'هماهنگی دریافت‌های امروز' } })
  const deliveryUser = staff.find((s) => s.roles.includes('delivery'))
  const invUser = staff.find((s) => s.roles.includes('inventory'))
  const participants = Array.from(new Set([
    ...adminIds.slice(0, 2),
    ...(deliveryUser ? [U[deliveryUser.username.trim()]] : []),
    ...(invUser ? [U[invUser.username.trim()]] : []),
  ]))
  await db.conversationParticipant.createMany({ data: participants.map((userId) => ({ conversationId: conv.id, userId })) })
  await db.message.createMany({
    data: [
      { conversationId: conv.id, userId: adminIds[0], content: 'سلام همکاران؛ توزیع پخش مهرام ساعت ۹ می‌رسد.' },
      ...(deliveryUser ? [{ conversationId: conv.id, userId: U[deliveryUser.username.trim()], content: 'دریافت شد، بارکد اسکنر آماده است ✅' }] : []),
      ...(invUser ? [{ conversationId: conv.id, userId: U[invUser.username.trim()], content: 'بعد از ثبت دریافت، جرد بخش لبنیات را شروع می‌کنیم.' }] : []),
    ],
  })

  // ---------- awards / notifications / activity ----------
  const bestSeller = staff.find((s) => s.roles.includes('sales'))
  if (bestSeller) {
    await db.award.create({
      data: { userId: U[bestSeller.username.trim()], points: 25, reason: 'ست فروش هفته 🏆 — بالاترین فروش در بخش گورمت', grantedById: adminIds[0] },
    })
  }
  await db.notification.createMany({
    data: adminIds.slice(0, 2).map((userId) => ({
      userId,
      title: 'به پلتفرم خوش آمدید 🌿',
      body: `نسخه نمایشی «${meta.name}» آماده است — همه داده‌ها مصنوعی و شبیه‌سازی‌شده هستند.`,
      type: 'INFO',
    })),
  })
  await db.activityLog.createMany({
    data: [
      { userId: adminIds[0], userName: staffName(staff, adminIds[0], U), action: `راه‌اندازی نسخه نمایشی «${meta.name}»` },
      { userId: adminIds[0], userName: staffName(staff, adminIds[0], U), action: 'ورود به سامانه' },
    ],
  })

  // ---------- settings ----------
  const settings: [string, string][] = [
    ['demo_mode', scenarioKey],
    ['demo_name', meta.name],
    ['tolerance_toman', '1000'],
    ['sphl_labor_hours', scenarioKey === 'hyper' ? '46' : '24'],
    ['store_name', meta.name],
  ]
  for (const [key, value] of settings) {
    await db.settings.create({ data: { key, value } })
  }

  const stats = {
    staff: staff.length,
    products: products.length,
    providers: providerCount,
    companies: companyIds.length,
    orders: statuses.length,
    shelves: shelfIdx,
    branches: meta.branches.length,
  }
  return { ok: true, scenario: scenarioKey, stats }
}

/** username lookup helper */
function staffName(staff: StaffDef[], userId: string, U: Record<string, string>): string {
  const entry = Object.entries(U).find(([, id]) => id === userId)
  const s = staff.find((x) => x.username.trim() === entry?.[0])
  return s?.name ?? 'مدیر'
}

export async function restoreRealData(db: PrismaClient): Promise<{ ok: true }> {
  await seedRealData(db)
  return { ok: true }
}
