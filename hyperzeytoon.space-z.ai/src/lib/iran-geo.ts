// ============================================================
// ایران — داده جغرافیایی سبک برای «نقشه تأمین» هایپر زیتون
// کارتوگرام شبه‌مربعی: ۳۱ استان روی شبکه ۸×۷ (تقریب جغرافیا)
// خلیج فارس در جنوب‌غرب، دریای عمان جنوب‌شرق، دریای خزر شمال
// ISO 3166-2:IR — فهرست رسمی ۳۱ استان ایران
// ============================================================

export interface IranProvince {
  id: string
  name: string // نام کامل رسمی
  /** تقسیم دو خطی برای سلول‌های باریک */
  lines?: [string, string]
  /** مختصات شبکه کارتوگرام (x: 0..7 غرب→شرق، y: 0..6 شمال→جنوب) */
  x: number
  y: number
  /** استانِ خانه — هایپر زیتون در کرمان */
  home?: boolean
}

export interface IranSeaCell {
  x: number
  y: number
  /** برچسب فقط روی سلول نخست هر پهنه آبی */
  label?: string
}

export const IRAN_PROVINCES: IranProvince[] = [
  { id: '01', name: 'آذربایجان شرقی', lines: ['آذربایجان', 'شرقی'], x: 1, y: 0 },
  { id: '02', name: 'آذربایجان غربی', lines: ['آذربایجان', 'غربی'], x: 0, y: 0 },
  { id: '03', name: 'اردبیل', x: 2, y: 0 },
  { id: '04', name: 'اصفهان', x: 3, y: 4 },
  { id: '05', name: 'البرز', x: 2, y: 3 },
  { id: '06', name: 'ایلام', x: 0, y: 3 },
  { id: '07', name: 'بوشهر', x: 1, y: 5 },
  { id: '08', name: 'تهران', x: 3, y: 2 },
  { id: '09', name: 'چهارمحال و بختیاری', lines: ['چهارمحال', 'و بختیاری'], x: 2, y: 4 },
  { id: '10', name: 'خراسان جنوبی', lines: ['خراسان', 'جنوبی'], x: 7, y: 1 },
  { id: '11', name: 'خراسان رضوی', lines: ['خراسان', 'رضوی'], x: 7, y: 0 },
  { id: '12', name: 'خراسان شمالی', lines: ['خراسان', 'شمالی'], x: 6, y: 0 },
  { id: '13', name: 'خوزستان', x: 0, y: 4 },
  { id: '14', name: 'زنجان', x: 1, y: 1 },
  { id: '15', name: 'سمنان', x: 4, y: 1 },
  { id: '16', name: 'سیستان و بلوچستان', lines: ['سیستان', 'و بلوچستان'], x: 6, y: 5 },
  { id: '17', name: 'فارس', x: 2, y: 5 },
  { id: '18', name: 'قزوین', x: 2, y: 2 },
  { id: '19', name: 'قم', x: 4, y: 3 },
  { id: '20', name: 'کردستان', x: 0, y: 1 },
  { id: '21', name: 'کرمان', x: 5, y: 5, home: true },
  { id: '22', name: 'کرمانشاه', x: 0, y: 2 },
  { id: '23', name: 'کهگیلویه و بویراحمد', lines: ['کهگیلویه', 'و بویراحمد'], x: 1, y: 4 },
  { id: '24', name: 'گلستان', x: 5, y: 0 },
  { id: '25', name: 'گیلان', x: 2, y: 1 },
  { id: '26', name: 'لرستان', x: 1, y: 3 },
  { id: '27', name: 'مازندران', x: 3, y: 1 },
  { id: '28', name: 'مرکزی', x: 3, y: 3 },
  { id: '29', name: 'هرمزگان', x: 3, y: 6 },
  { id: '30', name: 'همدان', x: 1, y: 2 },
  { id: '31', name: 'یزد', x: 5, y: 4 },
]

/** پهنه‌های آبی اطراف کارتوگرام (سلول‌های خالی شبکه) */
export const IRAN_SEA_CELLS: IranSeaCell[] = [
  { x: 3, y: 0, label: 'دریای خزر' },
  { x: 4, y: 0 },
  { x: 0, y: 5, label: 'خلیج فارس' },
  { x: 0, y: 6 },
  { x: 1, y: 6 },
  { x: 2, y: 6 },
  { x: 4, y: 6, label: 'دریای عمان' },
  { x: 5, y: 6 },
  { x: 6, y: 6 },
]

/** ابعاد شبکه کارتوگرام */
export const IRAN_GRID = { cols: 8, rows: 7 }

/**
 * شهرهای مهم ایران برای دراپ‌داون‌های آتی (انتخاب شهر تأمین‌کننده و …)
 * ≥ ۴۰ شهر با انتساب استان
 */
export const IRAN_TOP_CITIES: { name: string; province: string }[] = [
  { name: 'تهران', province: 'تهران' },
  { name: 'کرج', province: 'البرز' },
  { name: 'مشهد', province: 'خراسان رضوی' },
  { name: 'اصفهان', province: 'اصفهان' },
  { name: 'تبریز', province: 'آذربایجان شرقی' },
  { name: 'شیراز', province: 'فارس' },
  { name: 'قم', province: 'قم' },
  { name: 'اهواز', province: 'خوزستان' },
  { name: 'کرمانشاه', province: 'کرمانشاه' },
  { name: 'ارومیه', province: 'آذربایجان غربی' },
  { name: 'رشت', province: 'گیلان' },
  { name: 'زاهدان', province: 'سیستان و بلوچستان' },
  { name: 'همدان', province: 'همدان' },
  { name: 'کرمان', province: 'کرمان' },
  { name: 'یزد', province: 'یزد' },
  { name: 'اردبیل', province: 'اردبیل' },
  { name: 'بندرعباس', province: 'هرمزگان' },
  { name: 'اراک', province: 'مرکزی' },
  { name: 'زنجان', province: 'زنجان' },
  { name: 'سنندج', province: 'کردستان' },
  { name: 'قزوین', province: 'قزوین' },
  { name: 'خرم‌آباد', province: 'لرستان' },
  { name: 'گرگان', province: 'گلستان' },
  { name: 'ساری', province: 'مازندران' },
  { name: 'سمنان', province: 'سمنان' },
  { name: 'بیرجند', province: 'خراسان جنوبی' },
  { name: 'بجنورد', province: 'خراسان شمالی' },
  { name: 'ایلام', province: 'ایلام' },
  { name: 'بوشهر', province: 'بوشهر' },
  { name: 'شهرکرد', province: 'چهارمحال و بختیاری' },
  { name: 'یاسوج', province: 'کهگیلویه و بویراحمد' },
  { name: 'کاشان', province: 'اصفهان' },
  { name: 'نیشابور', province: 'خراسان رضوی' },
  { name: 'سبزوار', province: 'خراسان رضوی' },
  { name: 'سیرجان', province: 'کرمان' },
  { name: 'رفسنجان', province: 'کرمان' },
  { name: 'بم', province: 'کرمان' },
  { name: 'جیرفت', province: 'کرمان' },
  { name: 'چابهار', province: 'سیستان و بلوچستان' },
  { name: 'زابل', province: 'سیستان و بلوچستان' },
  { name: 'دزفول', province: 'خوزستان' },
  { name: 'آبادان', province: 'خوزستان' },
  { name: 'مراغه', province: 'آذربایجان شرقی' },
  { name: 'خوی', province: 'آذربایجان غربی' },
  { name: 'لنگرود', province: 'گیلان' },
  { name: 'آمل', province: 'مازندران' },
  { name: 'دماوند', province: 'تهران' },
  { name: 'ساوه', province: 'مرکزی' },
]

/** کمکی: استان با تطابق نرم نام (برای گروه‌بندی تأمین‌کنندگان) */
export function findProvince(name: string | null | undefined): IranProvince | undefined {
  if (!name) return undefined
  const n = name.replace(/[ةه]/g, 'ه').replace(/\u200c/g, ' ').replace(/\s+/g, ' ').trim()
  return IRAN_PROVINCES.find(
    (p) => p.name.replace(/\u200c/g, ' ') === n || p.name.includes(n) || n.includes(p.name)
  )
}
