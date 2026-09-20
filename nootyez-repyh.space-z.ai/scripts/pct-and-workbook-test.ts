/**
 * Task 10-b fixtures:
 *  /tmp/pct-test.xlsx   — header «درصد تغییر»: empty-buy + pct (explicit sell wins),
 *                         explicit sell change + pct (buy from pct), unknown + pct (notfound)
 *  /tmp/pct-edge.xlsx   — header «تغیییر%» (triple-ی typo): Persian-digit «۱۰٪» on both-empty
 *                         cells, pct 0 → unchanged, pct -۱۵۰٪ → invalid «درصد تغییر نامعتبر»
 *  /tmp/pct-arabic.xlsx — header «درصد تغيير» (Arabic ي): barcode-only row, both prices ×25%
 *
 * DB baselines (asserted by scripts/pct-verify.ts): p98 21500/24000, p97 28000/34000,
 * p101 25000/32500, p110 38000/45000.
 */
import * as XLSX from 'xlsx'

function write(path: string, aoa: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Prices')
  XLSX.writeFile(wb, path)
  console.log('wrote', path)
}

// p98 buy 21500 → 21500×1.1 = 23650 (the task example); sell explicit 24000 = current → wins
// p97 buy 28000 → 30800 from pct; sell explicit 35000 (≠ 34000) → explicit change wins
write('/tmp/pct-test.xlsx', [
  ['بارکد', 'نام کالا', 'قیمت خرید', 'قیمت فروش', 'درصد تغییر'],
  ['6260110000025', 'شیر کم‌چرب کاله ۵۰۰', '', 24000, 10], // buy-only change from pct
  ['6260110000018', 'شیر پرچرب کاله ۱ لیتری', '', 35000, 10], // buy from pct + explicit sell change
  ['9999999999999', 'کالای خیالی ناموجود', '', '', 15], // notfound (pct irrelevant)
])

write('/tmp/pct-edge.xlsx', [
  ['نام کالا', 'قیمت خرید', 'قیمت فروش', 'تغیییر%'],
  ['شکر ۹۰۰ گرمی', '', '', '۱۰٪'], // both ×1.1 → 41800 / 49500
  ['دوغ میهن ۱.۵ لیتری', '', '', '۰'], // pct 0 → unchanged
  ['شیر پرچرب کاله ۱ لیتری', 28500, '', '-۱۵۰٪'], // pct ≤ -100 → invalid
])

write('/tmp/pct-arabic.xlsx', [
  ['بارکد', 'درصد تغيير'],
  ['6260110000025', '25'], // both ×1.25 → 26875 / 30000
])
