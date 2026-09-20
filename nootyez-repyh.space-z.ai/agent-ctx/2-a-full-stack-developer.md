# Task 2-a — Holoo sales XLS import (ورود فروش از هولو)

Agent: full-stack-developer
Date: 2026-09-10 (sandbox clock, UTC)

## Files created/modified
- NEW `src/app/api/sales/import/route.ts` — POST-only route, dispatches on content-type:
  - multipart (`file` + `userId`) → parse-only preview, zero DB writes.
  - JSON (`userId`, `rows[]`, `defaultSellerId?`, `force?`) → commit.
- MODIFIED `src/components/platform/CrmSection.tsx` — SalesTab: `canImport` gate (OWNER/GM/OM/IT_ADMIN/ACCOUNTANT),
  GhostButton «ورود فروش هولو | Holoo import» in the quick-log card header, and new `HolooImportModal`
  component appended at end of file (2-step: file+parse → preview table + default-seller select + commit).
- NEW `scripts/holoo-test-xlsx.ts` — bun script generating `/tmp/holoo-sales-test.xlsx` (Persian headers, 7 mixed rows).

## API contract (downstream agents)
### POST /api/sales/import (multipart) — preview
Request: FormData { file: .xls/.xlsx/.csv, userId }
Response 200:
```json
{
  "rows": [{
    "name": "…", "barcode": "…", "qty": 2, "unitPrice": 34000, "total": 68000,
    "isoDate": "2026-09-10T00:00:00.000Z",          // Jalali dates converted; now() if missing
    "sellerName": "…?", "sellerId": 63?, "sellerMatched": true|false,
    "productId": 97?, "matchedName": "Kalleh Milk 1L Full Fat"?, "matched": true?,
    "duplicateOfId": 185?,                            // existing Sale id when duplicate
    "status": "ok" | "duplicate" | "invalid", "reason": "…?"
  }],
  "total": 7, "ok": 4, "duplicates": 2, "invalid": 1,
  "sellers": [{ "id": 63, "name": "Ms. Yadegari (فروشنده)" }]   // active SALESPERSON+CASHIER users
}
```
Errors → 400 `{ error: '<Persian>' }` (missing/empty file, unrecognized headers).

Header matching: scans first 10 rows, best score wins; normalized (Persian/Arabic digits, ZWNJ,
spaces/dashes, Arabic ك→ک ي→ی). Priority: seller → barcode → date → unitPrice → total → qty → name
(seller/name precedence so «نام فروشنده» never matches the name column).
Derived fields: total = qty×unitPrice if missing; unitPrice = round(total÷qty) if missing.
Row validity: (name OR barcode) AND qty > 0.
Product match: normalized barcode exact → else normalized name key (indexed over BOTH product.name and
product.nameFa — Holoo exports Persian descriptions).
Dedup key: normNameKey(matched product name, else row name, else barcode) + '|' + qty + '|' + round(total)
+ '|' + server-local dayKey(createdAt) — checked against Sales from last 90 days; key uses the product's
canonical name so Persian/English file variants of the same product still collide.
Seller match: normalized contains both ways vs active SALESPERSON/CASHIER names (paren-stripped variant too;
Mr/Ms/Mrs/خانم/آقای prefixes stripped from the cell).

### POST /api/sales/import (JSON) — commit
Request: `{ userId, rows: [{ name, barcode?, qty, unitPrice, total, isoDate, sellerId?, productId? }], defaultSellerId?, force? }`
Auth: actor must be active with any of OWNER/GENERAL_MANAGER/OPERATION_MANAGER/IT_ADMIN/ACCOUNTANT
→ else 403 `{ error: 'شما اجازه ورود فروش از هولو را ندارید…' }`.
- Max 1000 rows/commit (400 beyond). qty<=0 or name-less rows counted as `invalid` and skipped.
- sellerId = row.sellerId (validated active) ?? defaultSellerId (validated) ?? userId.
- Creates Sale: `{ productId?, name, qty, unitPrice, total: round(total||qty*unitPrice), channel:'WALKIN',
  salespersonId, cashierId: null, note: 'ورود از هولو | Holoo import', createdAt: isoDate (or now) }`
  via createMany. **createdAt comes from the row date** so SPHL day buckets are correct.
- NO PointsLog / no points changes (register sales recorded collectively).
- Dedup re-check identical to preview (skipped as `skippedDuplicates`) unless `force: true`; inserted keys are
  added to the set so in-file duplicates are skipped too.
- Single audit: `SALES_IMPORT`, entity `Sale`, entityId null,
  detail `ورود N قلم فروش از فایل هولو — مجموع X تومان` (fa digits).
- Response: `{ created: n, skippedDuplicates: m, invalid: k }`.

## Verification evidence (all against live dev server)
- Parse of `/tmp/holoo-sales-test.xlsx` (7 rows): `{total:7, ok:4, duplicates:2, invalid:1, sellers:6}`.
  Jalali `1405/06/19` → `2026-09-10`, `1405/06/18` → `2026-09-09`; nameFa match found product 97;
  'Mrs. Mohammadi' fuzzy-matched id 62; 'Ms. Yadegari (فروشنده)' matched id 63; unknown seller unmatched.
- Commit (actor 54 ACCOUNTANT, defaultSellerId 63): `{created:4, skippedDuplicates:0, invalid:0}`;
  Sale ids 186–189 with correct per-row createdAt (186 = 2026-09-09T00:00:00Z), cashierId null,
  note 'ورود از هولو | Holoo import', 0 PointsLog rows.
- Re-commit identical payload: `{created:0, skippedDuplicates:4, invalid:0}`.
- Re-parse same file after commit: `{ok:0, duplicates:6, invalid:1}` — whole file flips to duplicate.
- 403: userId 55 (MERCHANDISER) rejected with Persian message, HTTP 403.
- Error paths: unrecognized headers / missing file / empty rows → 400 Persian messages.
- GET /api/sales summary moved: todayTotal 2,051,000 → 2,599,000 (+548,000 = 212,000 import + 336,000 seed sale),
  count 183 → 188; Mrs. Mohammadi appears in bySalesperson.
- Browser (agent-browser): logged in, CRM → «فروش و SPHL» tab → modal opens from the header button →
  `agent-browser upload` + Parse → preview badges «۰ قابل ثبت / ۶ تکراری / ۱ نامعتبر» + status table rendered.
  Screenshots: /tmp/holoo-import-preview.png, /tmp/holoo-modal.png.
- `bun run lint`: 0 errors 0 warnings. `bunx tsc --noEmit`: clean for app code (only pre-existing examples/skills errors).
- dev.log: POST /api/sales/import 200, no errors.

## Deviations / notes
- Product matching also indexes `nameFa` (spec said "normalized name key"; Holoo files use Persian
  descriptions, so this is required for real files to match).
- Sellers list/fuzzy-match restricted to active SALESPERSON+CASHIER per spec; if the file has no seller column,
  rows get defaultSellerId/actor server-side (UI select only appears when some ok row lacks sellerId).
- Duplicate-key day slice uses server-local dayKey (same as /api/sales summary buckets), not UTC slice.
- Test artifacts left intentionally: Sale 185 (seed via POST /api/sales for the duplicate test, +2 pts to
  Ms. Yadegari per normal sale rules) + imported Sales 186–189. `scripts/holoo-test-xlsx.ts` kept for re-testing.
- A commit with 0 created rows still writes the SALES_IMPORT audit (documents the attempt).
- UI note: Escape does not close the kit Modal (pre-existing kit behavior; closes via X/backdrop).
