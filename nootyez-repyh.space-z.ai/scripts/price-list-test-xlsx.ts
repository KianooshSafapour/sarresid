/**
 * Generates a supplier price-list test XLSX at /tmp/price-list-test.xlsx
 * Persian headers: بارکد | نام کالا | قیمت خرید | قیمت فروش
 * Rows: 2 barcode matches (1 changed buy, 1 changed sell), 1 name-only match
 * with Persian digits + commas, 1 unknown barcode, 1 no-price row (invalid).
 */
import * as XLSX from 'xlsx'

const aoa: (string | number)[][] = [
  ['بارکد', 'نام کالا', 'قیمت خرید', 'قیمت فروش'],
  ['6260110000025', 'Kalleh Milk 500cc', 21500, 24000], // barcode hit — buy changed
  ['6260130000011', 'دوغ میهن ۱.۵ لیتری', 27000, '۳۲,۵۰۰'], // barcode hit — sell changed (fa digits+comma)
  ['', 'برنج صدف هندی ۱۰ کیلویی', '94,500', 105000], // name-only hit — both changed
  ['9999999999999', 'کالای ناموجود', 10000, 12000], // not found
  ['6260110000018', 'Kalleh Milk 1L Full Fat', '', ''], // invalid — no price
]

const ws = XLSX.utils.aoa_to_sheet(aoa)
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Prices')
XLSX.writeFile(wb, '/tmp/price-list-test.xlsx')
console.log('wrote /tmp/price-list-test.xlsx')
