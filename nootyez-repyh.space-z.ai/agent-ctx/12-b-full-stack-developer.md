# Task 12-b — Shrinkage Ledger + Smart Inventory Insights (work record)

## Situation on takeover
Both features were ALREADY implemented in the working tree by a prior 12-b instance that died
before verification/worklog: `src/app/api/shrinkage/route.ts`, `src/app/api/insights/route.ts`,
and both WarehouseSection tabs (defoliation ledger + insights, incl. skeletons, forms, gates).
Prisma schema (ShrinkageLog) was main-agent's round-12 work — untouched. This session verified
everything against the task spec, fixed fidelity gaps, and ran the FULL verification battery.

## Fidelity fixes applied
1. `/api/shrinkage` GET role gate: now includes DELIVERY_RECEIVER (spec: GET and POST share the
   same 7-role set). Was VIEW_ROLES (6, receiver excluded). Proof: `GET ?userId=61` (receiver) → 200.
2. `/api/shrinkage` GET rows: added spec fields `value` (Math.round(qty×unitCost)) and
   `reporterName`; kept additive `reporter` object consumed by the UI.
3. `/api/shrinkage` POST audit detail → exact spec format
   «ثبت نزولات — <name> — <qty> <reason fa> — <value> تومان» (+ documented clamp suffix
   « — موجودی به صفر رسید» only when stock was clamped).
4. `/api/insights` response `abc` now carries the spec-keyed shape
   `{ A:{count,revenueShare}, B:{…}, C:{…}, topAItems:[5 names] }` alongside additive
   `classes`/`topA` aliases consumed by the existing UI (no UI refactor).
5. `/api/insights` audit detail → «تحلیل هوشمند انبار — N پیشنهاد سفارش — M کندگرد» (dash
   separators per spec, was «،»), fa-IR digits.
6. WarehouseSection (additive only): shrinkage product-pick now pre-fills unitCost input with
   `p.buyPrice` (spec «auto-filled, editable»); recent-list rows show «qty unit × unitCost».
7. Removed noisy `log:['query']` from the route's fallback PrismaClient.

## Verification (all executed this session)
- `bun run lint` → 0/0. `bunx tsc --noEmit` → only pre-existing examples/ + skills/ errors.
- Seeds via curl (userId 56): #97 Kalleh Milk 1L qty 2 SPOILAGE (auto cost 28000, stock 48→46),
  #103 Cheese Lighvan qty 1 EXPIRED (95,000, 8→7), #107 Tomato Paste qty 1 DAMAGED (145,000, 22→21).
- Clamp: POST product 101 (stock 0) qty 2 → `{clamped:true, productStock:0}`; test row + its audit
  then deleted via Prisma (ledger left clean).
- 400 Persian: bad reason / qty 0 / empty name / unknown product. 403: user 55 (MERCHANDISER),
  missing userId. GET user 61 (DELIVERY_RECEIVER) → 200.
- Summary math by hand: totalValue 724,000 = SPOILAGE 142,000 + EXPIRED 237,000 + DAMAGED 145,000
  + THEFT 200,000 + OTHER 0 ✓. ratioPct: days=7 → 2.63 (724k/27,505,000), days=30 → 0.94
  (724k/77,422,000), days=90 → 0.92 (724k/78,300,000) — days param changes ratioPct ✓.
- Insights curl (userId 56): demandSource SALES; counts A5/B8/C19 reorder 9 slow 10; abc keyed
  shape + topAItems (Sadaf Rice, Tak Rice, Osta Oil, Golha Tuna, Tak Chocolate Coin); reorder row
  shape exact; suggestQty spot-checks Doogh 27 / Tomato 20 / Orange 18 ✓; Mahram Vinegar included
  via ROP OR-rule (stock 9 ≥ min 8 but rop 11.5) ✓. 403 user 55 + no-user ✓.
- Cross-check: `tmp-scripts/insights-crosscheck-12b.ts` — 9/9 API reorder rows equal an independent
  DB recomputation (all fields); low-stock Doogh (0/18) present; slow #1 (Chicken Breast) has 0
  sales in 60d and stockValue 4,800,000 = 15×320,000 buyPrice; ABC shares sum 99.9% (rounding).
- Browser QA (agent-browser, user 56 INVENTORY_SUPERVISOR+DELIVERY_RECEIVER, PIN 1234):
  Warehouse → «دفتر نزولات و ضایعات» + «تحلیل هوشمند انبار» both render. 7-day pill flips badge
  to gold «بالای معیار علمی — ۲.۶۳٪»; 30-day shows olive «در محدوده سالم — ۰.۹۴٪». UI form:
  picked Kalleh Milk 1L (unitCost input auto-filled ۲۸,۰۰۰), qty 3, reason THEFT, note, submit →
  toast + POST 200 + summary live-updated ۸۰۸,۰۰۰ تومان / ۹ / THEFT ۲۸۴,۰۰۰ / ۱.۰۴٪; product 97
  stock 46→43 (final 43 = 48−2−3 exact). Insights: ABC chips + top A list, 9 reorder rows with
  gold suggestQty badges + tiny stock bars, slow-mover rows with amber «قیمت ویژه بزن» chips.
  `window.__errs=[]` armed before every interaction, stayed empty. Screenshots: /tmp/r12b-shrinkage-desktop.png,
  /tmp/r12b-insights-desktop.png, /tmp/r12b-shrinkage-mobile.png, /tmp/r12b-insights-mobile.png,
  /tmp/r12b-shrinkage-form-mobile.png (390×844: scrollWidth 390 == viewport on all — no h-scroll).
- dev.log: all shrinkage/insights calls 200 or deliberate 4xx; 0 fives in all recent activity.
  (Historical 500s at log lines ~498-529 predate this session — the prior instance's stale-Prisma-
  client issue, resolved by its pdb() self-healing guard.)

## Final DB state (intended demo data, left in place)
9 ShrinkageLog rows: ids 1-5 (prior instance's QA, incl. one by user 61), ids 6-8 (my curl seeds),
id 10 (my genuine UI submission). SHRINKAGE_REPORT audits 148/149/150 (curl, spec format) + 157
(UI). INSIGHTS_VIEWED audits from each GET (spec format). Clamp-test row 9 + its audit removed.
