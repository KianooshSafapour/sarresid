# Task 7-b — Polish & features pack (round-6 backlog items #2 #3 #4 #5)

Agent: full-stack-developer
Date: 2026-09-10/11 (sandbox clock, UTC)

## Files created/modified
- NEW `src/lib/code39.ts` — dependency-free Code 39 barcode generator:
  - `CODE39_PATTERNS` canonical 44-char table (9 elements/char, exactly 3 wide; invariants + binary
    expansion cross-checked against Wikipedia/JsBarcode known values: 0→101001101101, 1→110100101011, 2→101100101011).
  - `sanitizeCode39(value)` — defensive uppercase + strip non-charset chars.
  - `code39Bars(value, opts?)` → JSX-friendly run data `[[1|0, widthPx], ...]` (bar/space runs incl.
    start/stop `*` + inter-char gaps; quiet zone NOT included). `[]` when nothing encodable.
  - `code39Svg(value, opts?)` → standalone inline `<svg>` string (quiet zone 10×narrow, white bg,
    crispEdges, `role=img` + aria-label, optional monospace human-readable text WITHOUT `*`,
    ink color default `#1C2A16`, `responsive:true` → `width="100%" + viewBox` for container sizing).
- MODIFIED `src/components/platform/OrdersSection.tsx` — print sheet (`.pz-print-only`, inside the
  existing global @media print isolation): Code39 barcode block between the meta table and the items
  table — wrapper `<div data-code39 data-code39-value={code} style={{width:'58%'}}>` +
  `dangerouslySetInnerHTML` with `code39Svg(order.code, { height:46, responsive:true })`, hint line
  «اسکن بارکد برای ثبت دریافت سریع کالا | Scan for quick delivery receipt»; meta «شماره سفارش» value
  wrapped in `pz-barcode` mono span.
- MODIFIED `src/app/api/export/cheques/route.ts` — optional `status` query param (comma-separated,
  uppercased, deduped, validated against `CHEQUE_STATUSES`): unknown → ignored, none valid → no
  filter (backward compatible); `where.status = { in: [...] }`; XLS header row «فیلتر وضعیت: …» when
  applied; CHEQUES_EXPORT audit detail mentions the filter.
- MODIFIED `src/components/platform/PaymentsSection.tsx` — export-status filter for BOTH register
  exports: `exportStatuses` state (default [] = all), shadcn Popover + native checkbox rows
  (supplier-modal pattern, min-h-[44px], olive accent) placed directly above the full-register export
  button; trigger shows count badge or «همه»; active filter renders amber GhostButton chip in the
  header next to the month-export button «فیلتر: N وضعیت ✕» (click = clear, aria-label); toast names
  the active filter on download.
- MODIFIED `src/app/globals.css` — `.pz-skeleton` cream/stone shimmer utility (reuses the existing
  `pz-shimmer` keyframes — they already animate background-position; NOT redeclared), 200% gradient
  sweep 1.6s, rounded 0.75rem, `prefers-reduced-motion: reduce` opt-out, `.dark .pz-skeleton` stone
  variant (future-proof; app has no theme toggle yet).
- MODIFIED `src/components/platform/ProductsSection.tsx` — replaced `<Loading>` spinner with skeleton
  grid matching the real product-card layout (image block + 2 text lines + barcode line + price/badge
  row + big-stock footer): `SkeletonBlock` + `ProductCardSkeleton` + grid of 8 with
  `data-products-skeleton` + `role=status` aria-label; same grid classes as the real grid → instant
  swap, no layout shift. (Products has no table view → 8 cards per spec.)
- MODIFIED `src/app/api/suppliers/route.ts` (GET only) — response now `{ suppliers, priceImport }`
  where `priceImport` = latest `AuditLog{action:'PRODUCT_PRICE_IMPORT'}` as `{ at, by } | null`
  (createdAt ISO + userName); each supplier gains `productsCount` (all products with supplierId) and
  `lowCount` (active products with stock <= minStock) computed from one lightweight
  `product.findMany` select + JS reduce. POST/PATCH responses unchanged (fields only on GET list).
- MODIFIED `src/lib/types.ts` — `SupplierT += productsCount?/lowCount?`; NEW `PriceImportInfo`.
- MODIFIED `src/components/platform/SuppliersSection.tsx` — header recency chip (`data-price-recency`
  + `data-price-stale` for testability): olive when fresh («فهرست قیمت‌ها: آخرین ورود <TimeAgo/> — by»),
  amber when stale/null (age > 30d) with «— ورود فهرست قیمت | Import price list» hint; per-supplier
  card footer line (`data-supplier-stock-footer`) «N قلم · M کم‌موجود» with rose dot when lowCount>0.
  Read-only — no mutations, no audit entries (per constraints).

## API contract changes (additive, non-breaking)
- `GET /api/export/cheques?userId=&from=&to=&status=PENDING_APPROVAL,APPROVED` — `status` optional;
  unknown values ignored; no valid values → unfiltered (old callers unaffected).
- `GET /api/suppliers` — `suppliers[i] += productsCount:number, lowCount:number`;
  top-level `priceImport: { at: string(ISO), by: string } | null`.
- No schema changes; no new mutation surfaces; userId/audit conventions untouched.

## Verification
- `bun run lint` → 0 errors/0 warnings; `bunx tsc --noEmit` → clean for src/** (only pre-existing
  examples/, skills/ errors).
- curl: `GET /api/suppliers` → priceImport `{at:2026-09-10T23:22:03.756Z, by:Mrs. Lotfi…}` + counts
  (16→7/3, 18→2/1, 17→2/1, 20→4/0, 19→17/3). `export/cheques?userId=54&status=PENDING_APPROVAL` → 200,
  XLS parsed: 2 data rows + «فیلتر وضعیت: در انتظار تایید مالک» header + totals 9,959,400/۲ فقره;
  `status=BOGUS,NOT_REAL` → identical to unfiltered (5 rows, 5,632 bytes both); merchandiser id 55 → 403.
- Browser (agent-browser, GM session): print preview on HZ-1005 → `[data-code39]` SVG in DOM (46 rects
  = 45 bars incl. `*HZ-1005*` + white bg, text node «HZ-1005», aria-label, 56% of sheet width,
  g fill #1C2A16); PDF export of print sheet saved. Payments: popover lists all 9 cheque statuses,
  PENDING_APPROVAL check → header chip «فیلتر: ۱ وضعیت», full export → dev.log
  `GET /api/export/cheques?userId=50&status=PENDING_APPROVAL 200` + toast, month export →
  `?from=2026-08-23&to=2026-09-22&status=PENDING_APPROVAL 200`; chip click clears. Products: fetch
  throttled +1.2s → `[data-products-skeleton]` with 8 cards / 72 `.pz-skeleton` blocks → instant swap
  to 32 real cards. Suppliers: fresh chip olive with TimeAgo «۲۵ دقیقه پیش»; +40d Date.now shift →
  amber chip with hint (data-price-stale="1"); footers «۷ قلم · ۳ کم‌موجود» + rose dot (low>0) and
  «۴ قلم · ۰ کم‌موجود» without dot. Mobile 390px: filter trigger 44px, no horizontal overflow.
- Console: window.__errs listener across Orders→print→Payments→Products→Suppliers sweep = `[]`;
  `agent-browser errors` empty. dev.log: only 200s for touched routes.
- Artifacts: /tmp/r7b-print.png, /tmp/r7b-print.pdf, /tmp/r7b-skeleton.png,
  /tmp/r7b-products-loaded.png, /tmp/r7b-suppliers.png, /tmp/r7b-suppliers-stale.png,
  /tmp/r7b-payments-mobile.png.

## Deviations / notes
1. `@keyframes pz-shimmer` already existed in globals.css (used by .pz-glow-border) — reused instead
   of redeclaring; `.pz-skeleton` adds the gradient sweep at 1.6s.
2. kit `Badge` doesn't forward extra DOM props, so `data-price-recency`/`data-price-stale` live on the
   chip's wrapper div (Badge kept for styling).
3. Barcode sizing uses `responsive:true` SVG (width 100% of a 58%-wide wrapper) so it keeps the
   2:1 wide/narrow ratio at any sheet width — verified 56% of sheet.
4. Suppliers lowCount counts ACTIVE products only (inactive stock shouldn't trigger alerts);
   productsCount matches the existing `_count.products` semantics (all).
5. TimeAgo (kit) renders minute/hour values in Latin digits by design («25 دقیقه پیش») — reused as-is
   per task instruction; switch to Jalali datetime after 24h automatically.
6. Test data: a stale-state check temporarily monkey-patched `Date.now` in the live browser session
   only (restored); no DB rows mutated by this task (cheque export audit rows created by the curl/
   browser exports themselves: CHEQUES_EXPORT ×~4).
