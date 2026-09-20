// Test-data generator for Task 2-a: Holoo sales XLS import
// Creates /tmp/holoo-sales-test.xlsx with a Persian header row + 7 mixed rows.
// Run: bun scripts/holoo-test-xlsx.ts
import * as XLSX from 'xlsx'

const rows: (string | number)[][] = [
  // Persian header row (typical Holoo register-sales export)
  ['نام کالا', 'کد کالا', 'بارکد', 'تعداد', 'قیمت فروش', 'جمع کل', 'تاریخ', 'فروشنده'],
  // R1 — barcode match (Kalleh Milk 1L, product 97), Jalali today date, no seller → ok
  ['شیر پرچرب کاله ۱ لیتری', 'HZ-101', '6260110000018', 2, 34000, 68000, '1405/06/19', ''],
  // R2 — barcode match (Golha Tuna, product 108), Jalali yesterday, seller exact match → ok
  ['تن ماهی گلها ۱۸۰ گرمی', 'HZ-102', '6260150000020', 2, 168000, 336000, '1405/06/18', 'Ms. Yadegari (فروشنده)'],
  // R3 — name-only match via Persian nameFa, NO total (derive from qty × price), no date → today
  ['شیر پرچرب کاله ۱ لیتری', 'HZ-103', '', 1, 34000, '', '', ''],
  // R4 — unmatched product + unmatched seller → ok + amber seller badge
  ['کالای ناشناخته هولو', 'HZ-104', '9999999999999', 5, 10000, 50000, '1405/06/19', 'ناشناس فلانی'],
  // R5 — barcode match (Mihan Doogh), Jalali date + English-partial seller match (Mrs. Mohammadi)
  ['دوغ میهن ۱.۵ لیتری', 'HZ-105', '6260130000011', 4, 32000, 128000, '1405/06/19', 'Mrs. Mohammadi'],
  // R6 — duplicate of the sale created via POST /api/sales right before parse (Tuna qty 2 × 168000 today)
  ['تن ماهی گلها ۱۸۰ گرمی', 'HZ-106', '6260150000020', 2, 168000, 336000, '1405/06/19', 'Ms. Yadegari (فروشنده)'],
  // R7 — invalid row: name present but qty = 0
  ['کالای بدون تعداد', 'HZ-107', '111', 0, 0, '', '', ''],
]

const ws = XLSX.utils.aoa_to_sheet(rows)
const wb = XLSX.utils.book_new()
wb.Workbook = { Views: [{ RTL: true }] }
XLSX.utils.book_append_sheet(wb, ws, 'Sales')
XLSX.writeFile(wb, '/tmp/holoo-sales-test.xlsx')
console.log('✅ wrote /tmp/holoo-sales-test.xlsx with', rows.length - 1, 'data rows')
