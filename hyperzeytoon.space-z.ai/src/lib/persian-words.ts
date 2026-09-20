// ============================================================
// Persian number-to-words (اعداد به حروف فارسی)
// Used on printable payment vouchers («مبلغ به حروف») — a
// classic requirement of Iranian accounting documents.
// Supports 0 … 999,999,999,999,999 (up to هزار میلیارد).
// ============================================================

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه']
const TEENS = [
  'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده',
]
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد']

/** words for a 0-999 group, e.g. 325 → «سیصد و بیست و پنج» */
function threeDigitsToWords(n: number): string {
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const rest = n % 100
  if (h > 0) parts.push(HUNDREDS[h])
  if (rest >= 10 && rest < 20) {
    parts.push(TEENS[rest - 10])
  } else {
    const t = Math.floor(rest / 10)
    const o = rest % 10
    if (t > 0) parts.push(TENS[t])
    if (o > 0) parts.push(ONES[o])
  }
  return parts.join(' و ')
}

/** Convert a non-negative integer (< 1e15) to Persian words. */
export function numberToPersianWords(input: number | string): string {
  let num = typeof input === 'string' ? Number(input.replace(/[^\d-]/g, '')) : Math.round(input)
  if (!isFinite(num) || isNaN(num)) return ''
  if (num < 0) return 'منفی ' + numberToPersianWords(-num)
  if (num === 0) return 'صفر'
  if (num >= 1e15) return String(num) // beyond supported range — keep digits

  // split into groups of three digits
  const groups: number[] = []
  while (num > 0) {
    groups.push(num % 1000)
    num = Math.floor(num / 1000)
  }

  const chunks: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (g === 0) continue
    const scale = SCALES[i]
    // «هزار» alone: «یک هزار» is spoken as just «هزار» when standalone,
    // but «یک میلیون / یک میلیارد» keep the یک.
    if (g === 1 && scale === 'هزار') {
      chunks.push('هزار')
    } else {
      chunks.push(threeDigitsToWords(g) + (scale ? ' ' + scale : ''))
    }
  }
  return chunks.join(' و ')
}

/** Full amount-in-words phrase for vouchers: «صد و بیست هزار تومان» */
export function amountInPersianWords(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return '—'
  return `${numberToPersianWords(Math.round(n))} تومان`
}

// ============================================================
// Formal Persian honorifics (خطاب رسمی)
// Platform rule: everywhere a person is addressed, the FULL name
// with a formal title is used — never first names or initials.
// ============================================================

/** «جناب آقای کیانوش صفاپور» / «سرکار خانم مریم درویشی» */
export function formalName(
  gender: string | null | undefined,
  name: string | null | undefined
): string {
  if (!name) return ''
  const g = (gender || '').toUpperCase()
  return g === 'FEMALE' ? `سرکار خانم ${name}` : `جناب آقای ${name}`
}

/** Short formal greeting line for topbar/dashboard: «جناب آقای نوروزی» style kept full */
export function formalWelcome(
  gender: string | null | undefined,
  name: string | null | undefined
): string {
  return `${formalName(gender, name)}، خوش آمدید`
}
