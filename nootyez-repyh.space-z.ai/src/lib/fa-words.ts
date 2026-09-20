/**
 * Persian number-to-words ("مبلغ به حروف") — used on bank cheque print sheets
 * and anywhere an official amount-in-words is required (فارسی فارسی، رسمی).
 */

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه']
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده']
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']
const SCALES = ['', ' هزار', ' میلیون', ' میلیارد', ' هزار میلیارد']

/** three-digit group → words (no scale suffix) */
function threeDigits(n: number): string {
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

/** integer (0 .. 999,999,999,999,999) → Persian words, e.g. ۲۵۰۰۰ → «بیست و پنج هزار» */
export function numToFaWords(value: number): string {
  let n = Math.floor(Math.abs(Number(value) || 0))
  if (n === 0) return 'صفر'
  if (!isFinite(n)) return ''
  const groups: number[] = []
  while (n > 0) {
    groups.push(n % 1000)
    n = Math.floor(n / 1000)
  }
  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (g === 0) continue
    // «هزار» alone (group=1 at scale 1) reads «یک هزار» formally — keep it
    parts.push(threeDigits(g) + SCALES[i])
  }
  return parts.join(' و ')
}

/** full cheque line: amount + تومان, e.g. «بیست و پنج هزار تومان» */
export function amountToFaWords(value: number): string {
  const words = numToFaWords(value)
  return words ? `${words} تومان` : ''
}
