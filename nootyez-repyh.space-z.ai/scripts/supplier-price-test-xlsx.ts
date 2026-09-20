/**
 * Generates supplier-scoped price-list test XLSX files (task 8-b):
 *  /tmp/supplier-test.xlsx        — supplier header «تأمين كننده» (Arabic ي + space variant)
 *  /tmp/supplier-test-fa.xlsx     — supplier header «تامین کننده» (Persian + space variant)
 *  /tmp/supplier-test-vendor.xlsx — supplier header "Vendor" (English variant)
 * Rows (main file):
 *  a) barcode 6260110000025 (Kalleh Milk 500ml, supplier 16) + supplier «Pegah Kerman Direct» (17)
 *     + buyPrice 22900 → ok + buy change + supplier change
 *  b) name-only «دوغ میهن ۱.۵ لیتری» (Mihan Doogh, supplier 18) + UNKNOWN supplier + sellPrice 33900
 *     → ok + sell change + supplierStatus unknown
 *  c) barcode 9999999999999 → notfound (supplier cell empty)
 *  d) name-only «برنج تک ۵ کیلویی» (Tak Rice, supplier 19) + variant-cased supplier
 *     «  zeytoon   GROCERY-wholesale  » (= 19) + unchanged prices → unchanged + matched, no change
 *  e) name-only «شکر ۹۰۰ گرمی» (Sugar, supplier 19) + «Snacks & Sweets Co.» (20) + unchanged prices
 *     → unchanged + supplier-only reassignment
 *  f) barcode 6260110000018 (Kalleh Milk 1L, supplier 16) + buyPrice 28500 + BLANK supplier cell
 *     → ok + buy change + no supplier info
 */
import * as XLSX from 'xlsx'

const mainAoa: (string | number)[][] = [
  ['بارکد', 'نام کالا', 'قیمت خرید', 'قیمت فروش', 'تأمين كننده'],
  ['6260110000025', 'Kalleh Milk 500ml Low Fat', 22900, 24000, 'Pegah Kerman Direct'], // a
  ['', 'دوغ میهن ۱.۵ لیتری', 25000, '۳۳,۹۰۰', 'توزیع‌کننده شب‌گرد خیال'], // b — unknown supplier
  ['9999999999999', 'کالای ناموجود', 10000, 12000, ''], // c — notfound
  ['', 'برنج تک ۵ کیلویی', 680000, 790000, '  zeytoon   GROCERY-wholesale  '], // d — variant match, same supplier
  ['', 'شکر ۹۰۰ گرمی', 38000, 45000, 'Snacks & Sweets Co.'], // e — unchanged + supplier change
  ['6260110000018', 'Kalleh Milk 1L Full Fat', 28500, 34000, ''], // f — blank supplier cell
]

function write(path: string, aoa: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Prices')
  XLSX.writeFile(wb, path)
  console.log('wrote', path)
}

write('/tmp/supplier-test.xlsx', mainAoa)
write('/tmp/supplier-test-fa.xlsx', [
  ['بارکد', 'قیمت خرید', 'تامین کننده'],
  ['6260120000014', '36,000', 'Pegah Kerman Direct'],
])
write('/tmp/supplier-test-vendor.xlsx', [
  ['barcode', 'sellPrice', 'Vendor'],
  ['6260130000011', 34000, 'Mihan Dairy Rep — Mr. Rezaei'],
])
