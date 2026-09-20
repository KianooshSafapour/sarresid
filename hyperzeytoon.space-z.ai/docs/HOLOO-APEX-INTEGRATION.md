# Holoo APEX (Network Edition) — Researched Integration Plan

**Status:** Research document (RESEARCH-ONLY deliverable of Task 9-g) · **Date of research:** 2026-09-15 (all web sources accessed on this date) · **Author:** research agent (general-purpose)
**Scope:** A ground-truth survey of every integration surface the Holoo APEX accounting family offers, followed by a recommended middleware architecture for the Hyper Zeytoon platform. This document deliberately distinguishes **verified facts** (with URLs) from **inference** and from items that **need vendor confirmation**. Nothing here should be treated as an official spec of Holoo until confirmed by Holoo (TorfeNegar) support.

---

## خلاصه اجرایی (Persian executive summary)

هلو اپکس (APEX) محصول گروه فناوری اطلاعات هلو (شرکت طرفه‌نگار) است و نسخه‌ی فروشگاهی آن — از جمله «نرم‌افزار حسابداری سوپرمارکت هلو APEX» — در سطوح تک‌کاربره با قفل سخت‌افزاری و نسخه‌های شبکه‌ای دو و چهار کاربره عرضه می‌شود. یافته‌ی کلیدی این پژوهش آن است که هلو برای اتصال سیستم‌های بیرونی **یک محصول رسمی به نام «وب‌سرویس ابری نرم‌افزار هلو APEX»** دارد که در هلواستور (فروشگاه رسمی) با قیمت ۵٬۰۰۰٬۰۰۰ تومان فروخته می‌شود و هدف آن ایجاد «ارتباط دوطرفه» میان فروشگاه اینترنتی/سیستم فروش و نرم‌افزار حسابداری است: ثبت خودکار سفارش، صدور خودکار فاکتور و به‌روزرسانی آنلاین موجودی کالا بدون دخالت اپراتور.

از منابع فنی غیررسمی اما هم‌خوان (کلاینت متن‌باز PHP روی GitHub و راهنمای رسمی ۵۱ صفحه‌ای «نصب وب سرویس متدها و پارامترها») مشخص می‌شود که این وب‌سرویس روی آدرس الگوی `http://{IP}:8080/TncHoloo/api` سرو می‌شود، متدهای ورود (Login) و خواندن/نوشتن برای **کالاها، مشتریان و فاکتورها** را دارد و بر بستر SQL Server که هلو روی آن نصب است کار می‌کند؛ پرسش‌وپاسخ رسمی هلو نیز امکان Attach دستی دیتابیس هلو در SQL Server را تأیید می‌کند. با این حال نام دقیق جداول، پشتیبانی از چک/خزانه، و محدوده‌ی متدهای نسخه‌ی فروشگاهی، به تأیید رسمی فروشنده نیاز دارد («نیازمند تأیید پشتیبانی هلو»).

توصیه‌ی ما یک **معماری میان‌افزار READ-ONLY-FIRST** است: در فاز صفر فقط یک آینه‌ی شبانه‌ی فقط‌خواندنی از موجودی و کالاهای هلو؛ سپس همگام‌سازی کالا/تأمین‌کننده؛ سپس صدور فاکتور فروش به داخل هلو؛ و تنها در فاز پایانی، رفت‌وبرگشت دومرحله‌ای با «دروازه‌ی تأیید انسانی». تمام همگام‌سازی‌ها idempotent (با کلید `holooCode`)، با ژورنال الحاق‌گرای دارای چک‌سام، و با رویه‌ی بازگشت (rollback) مکتوب پیاده می‌شوند تا هیچ سناریوی قطع برق یا خرابی داده‌ای نتواند حسابداری خانم درویشی را مغشوش کند. فاز فعلی (خروجی xlsx از سفارش‌ها که امروز در پلتفرم فعال است) با این نقشه‌ی راه تناقضی ندارد و به‌عنوان خط دوم دفاعی باقی می‌ماند.

---

## 1. Executive summary (English)

The platform already ships an xlsx "Holoo bridge" (per-order export at `GET /api/orders/[id]/export` and the Holoo xls import/dedup wizard in Products) built in Tasks 1–8 of the worklog. This document researches what a *direct* integration with **Holoo APEX network edition** can look like. We found one officially sold integration product (the "Holoo APEX cloud web service"), a reproducible technical profile of that web service (endpoint pattern + method families) corroborated by an official 51-page installation guide and a community PHP client, community-level confirmation that Holoo's data lives in **SQL Server**, and a small but active Iranian ISV middleware ecosystem that resells Holoo connectivity. Confidence levels are assigned per surface; the recommended architecture is a read-first, journaled, idempotent middleware that never lets the platform write into Holoo until the owner flips a gate.

---

## 2. Baseline: what the platform does today (no new research needed)

- **Export path:** accountant downloads a ready-made xlsx per order (barcode, name, qty, unit price, discount, tax, VAT, line total) via `/api/orders/[id]/export`, then imports into Holoo manually. Documented in `docs/DEPLOYMENT.md` §"Holoo integration roadmap".
- **Import path:** `/api/products/import` + `/api/products/import-commit` parse Holoo xls with Persian header synonyms, detect duplicates by barcode or normalized name, and let the user merge/create per row. `holooCode`-style codes and normalized names (`normalizeName`) already exist in `src/app/api/products/shared.ts` — the mapping-table groundwork (§4.5 below) is therefore half-built.
- **Accounting reconciliation:** the Accounting section stores `holooTotal` per order with a tolerance setting, so the platform already models "what Holoo says" vs "what we computed".

This xlsx path is the fallback transport for every phase below — if the direct integration degrades, the business continues unchanged.

---

## 3. Discovered integration surfaces, with confidence levels

### 3.1 Holoo APEX product family and network editions — **Confidence: HIGH (vendor-published)**
- Holoo is produced by **گروه فناوری اطلاعات هلو (Holoo Technology Group / TorfeNegar)**; the official site presents APEX as the current generation of its accounting/finance software. [S1]
- The official store sells **«نرم‌افزار حسابداری فروشگاهی هلو APEX»** focused on item/warehouse definition and all invoice types for shops. [S1][S2]
- A dedicated **«نرم‌افزار حسابداری سوپرمارکت هلو APEX»** (supermarket edition) exists, priced ۱۳٬۷۰۰٬۰۰۰–۶۹٬۷۰۰٬۰۰۰ تومان, with tiers: پیشرفته (advanced)، **پیشرفته شبکه دو کاربره (network 2-user)**، جامع ساده، **جامع شبکه چهار کاربره (network 4-user)**، اتوماسیون تخصصی. Published features include: automated inventory/buy/sell/cheque/bank operations; role-based access for مدیر، صندوق‌دار، ترازودار، حسابدار; product definition with brand/model; per-item min/max amount & quantity thresholds; transfer notes (حواله) between warehouse and store; **free connection to the Moadian tax platform (سامانه مودیان)**. Paid add-ons include **«خروجی Text، Excel، HTML»** (structured text/Excel/HTML output). [S4]
- The download page distinguishes the **single-user edition with a hardware dongle (قفل سخت‌افزاری)** from **network editions** ("if two people must work simultaneously, buy the network two-user edition"). [S16]
- Official help-base documents APEX server/client network installation and troubleshooting. [S15]
- Implication for us: the owner's "network edition" is most plausibly one of the two network tiers of the supermarket APEX family, installed on a shop server with clients on cashier/office PCs. Exact tier → **needs vendor confirmation**.

### 3.2 Official cloud web service («وب‌سرویس ابری نرم‌افزار هلو APEX») — **Confidence: HIGH (vendor-published product)**
- Sold on the official Holoo Store for **5,000,000 Toman** (product ID ۲۸۰۱۱۸۵, category "افزونه‌های هلو"; listing indexed Feb 7, 2024; a customer review is dated ۱۸ بهمن ۱۴۰۲). [S3]
- Vendor description: a **two-way bridge** between an online shop/website and Holoo APEX — each site order is automatically registered in Holoo, invoices are issued automatically, and inventory stays online-synced "so selling out-of-stock items on the site becomes impossible". [S3]
- The "what you get" section lists: connection of Holoo accounting to **CRM systems, HR systems, e-commerce/shop systems, and office-automation systems**, plus **complete installation guidance and a guide file covering the installation and all methods and parameters** of the web service. [S3]
- Implication: the vendor itself sells API connectivity for APEX as a paid add-on. This is our primary, sanctioned integration surface.

### 3.3 Web service technical profile (TncHoloo API) — **Confidence: MEDIUM-HIGH (official guide snippet + independent community client agree)**
- An official **51-page guide titled «نصب وب سرویس متدها و پارامترها»** is indexed on the official store domain. Its indexed text shows: web-service files installed locally with a **Config** step pointing to **"the SQL Server path on which Holoo is installed"**, the service address pattern **`http://{IPSystem}:8080/TncHoloo/api`**, and a **Login** method required before use. [S5]
- The community PHP client `zoghal/HolooWebService` (built "based on the official Holoo web-service connection guide") reproduces the same config call — `Holoo::config('http://server-ip:8080/TncHoloo/api/','DB Name','UserName','PassWord')` then `Holoo::login()` — and documents working method families [S6]:
  - **Product:** `GetProduct`, `GetProductCount`, `GetMainGroup`, `GetSideGroup`, `GetUnit`, `NewProduct`, `EditProduct` (fields incl. `sidegroupErpcode`, `name`, `erpcode`).
  - **Customer:** `GetCustomer` (by `Code`), `GetCustomerCount`, `NewCustomer`, `EditCustomer` (fields incl. `name`, `ispurchaser`, `isseller`, `custtype`, `nationalid`, `isblacklist`, `erpcode`).
  - **Invoice:** `GetInvoiceList` (filters `Code`, `type`), `NewInvoice` (header: `id`, `type`, `customererpcode`, `date`, `time`, `Nesiyeh` (credit), `comment`; lines: `ProductErpCode`, `few` (qty), `price`, `Comment`), `GetPreInvoiceList`, `NewPreInvoice`.
  - Identifiers are opaque base64-like **ErpCode** strings (e.g. `bBALNA1mckd7QB4O`) — Holoo's internal cross-reference keys, not barcodes. Any middleware must therefore keep its own mapping table keyed on barcode + Holoo `erpcode` (§4.5).
- A vendor-ecosystem post (Nov 19, 2020) also describes two service flavors, including a **one-way read** flavor (pull product list etc. into WordPress). [S10]
- Gaps: the community client documents **no cheque/treasury, no stock-adjustment, and no purchase-invoice methods**; pagination/rate-limits are unknown. → **needs vendor confirmation** (see checklist §8).

### 3.4 SQL Server database surface — **Confidence: MEDIUM (community + official Q&A; no official schema doc found)**
- The official Holoo Q&A ("شبکه دانش مالی هلو") hosts the question **"Attach دیتا بیس در sql server — چگونه دیتای نرم‌افزار هلو را در sql server به صورت دستی Attach کنیم؟"** (Dec 12, 2022) — confirming Holoo data is held in a SQL Server database that can be detached/attached manually. [S7]
- The web-service Config step references the **SQL Server instance Holoo runs on**. [S5]
- Third-party integrators openly describe reading Holoo's database/SQL path for synchronization (e.g. store-connectors with automatic product/price/stock transfer). [S11][S14]
- **No official schema documentation, table names, or ERD was found in public sources.** Community knowledge of table names is folklore and changes between Holoo versions. Direct DB reading is therefore a *fallback/Phase-0 power tool*, not the primary interface. → **needs vendor confirmation**.

### 3.5 API entitlement process — **Confidence: MEDIUM (ISV-published)**
- A WooCommerce-connector vendor (July 30, 2026) describes obtaining a Holoo/Dasht API key as a gated process: forms, identity/business documents, and approval by the vendor. [S9] The official cloud web service is likewise a purchased add-on. [S3]
- Implication: budget and lead-time for entitlement; the platform owner (the shop) is the buyer, our middleware is the consumer.

### 3.6 Iranian ISV middleware ecosystem — **Confidence: HIGH (they exist and advertise), MEDIUM (capability claims unverified)**
- **Foroshgostar** — commercial "connect Holoo to your online store" service: automatic transfer of products, orders, customers; sync/update automation (listed at ۲۲٬۹۰۰٬۰۰۰ ریال). [S11]
- **Sepehr (sepehrcc.com)** — shop-builder that activates a "Holoo API" add-on to link the store to Holoo, with automatic transaction/stock posting and reduced human error; also marketed for food-distribution (پخش مویرگی) use cases. [S12]
- **realwp.net** — WordPress/WooCommerce ↔ Holoo price & stock synchronization tutorials/services. [S13]
- **Holoocenter** — site-connector with per-object toggles (enable/disable product transfer, name/price/stock matching). [S14]
- **p30web.org** (Jan 14, 2025) — general write-ups of web-service/API availability for Sepidar, Holoo, Dasht. [S10]
- Implication: a competitive local market of connectors proves feasibility; we can hire one as an implementation partner, but our architecture (§4) keeps us vendor-neutral.

### 3.7 Remote access surface — **Confidence: HIGH (product exists), LOW (integration value)**
- The official **«ابزار دورکاری هلو»** (teleworking) product gives browser-based remote access to Holoo APEX/Aspad. [S17] Useful for the accountant working from home; not an integration API.

### 3.8 Moadian (سامانه مودیان) context — **Confidence: MEDIUM**
- Supermarket APEX advertises free Moadian connection. [S4] Any invoice we export into Holoo will inherit the Moadian compliance pipeline. Our platform must never bypass it: invoices are created *inside* Holoo (Phase 2), not in parallel. Exact Moadian behavior of the web service → **needs vendor confirmation**.

### 3.9 Confidence summary table

| # | Surface | What it gives us | Confidence | Primary evidence |
|---|---|---|---|---|
| 1 | APEX family / network editions / supermarket edition | Edition context, roles, min/max stock fields | HIGH | [S1][S4][S15][S16] |
| 2 | Official cloud web service product | Sanctioned two-way API (paid add-on) | HIGH | [S3] |
| 3 | TncHoloo API methods (product/customer/invoice, Login) | Read+write master data & invoices | MEDIUM-HIGH | [S5][S6] |
| 4 | SQL Server storage | Phase-0 read-only DB mirror possible | MEDIUM | [S7][S5] |
| 5 | API key entitlement | Purchased, gated by vendor approval | MEDIUM | [S9][S3] |
| 6 | ISV middleware ecosystem | Proof of feasibility, potential partner | HIGH exist / MEDIUM claims | [S11][S12][S13][S14][S10] |
| 7 | Cheque/treasury/purchase-invoice/stock-write methods | — not evidenced | LOW → ask vendor | §8 |
| 8 | Direct DB schema | — not published | LOW → ask vendor | §8 |

---

## 4. Recommended middleware architecture

### 4.1 Principles
1. **READ-ONLY-FIRST.** The first connector writes nothing to Holoo. Every phase widens write scope only after a stable read baseline (see roadmap §7).
2. **Holoo remains the accounting system of record.** The platform is the *operations* system (orders, receiving, tasks, people). Ledger truth = Holoo.
3. **Nothing is trusted on arrival.** Every payload is staged, validated, checksummed, then upserted idempotently.
4. **The xlsx bridge is always available** as manual fallback.

### 4.2 Components

```
┌────────────────────────── shop LAN (segmented) ──────────────────────────┐
│                                                                          │
│  ┌────────────────┐        ┌──────────────────────────────────────┐      │
│  │ Holoo APEX     │ 8080   │ HZ-Middleware (sidecar on mini-PC)   │      │
│  │ (SQL Server +  │◄──────►│  - adapter/TncHoloo REST client      │      │
│  │  TncHoloo svc) │        │  - scheduler (nightly + incremental) │      │
│  └────────────────┘        │  - staging DB (SQLite, separate file)│      │
│        ▲                   │  - sync journal (append-only)        │      │
│        │ read-only SQL     │  - checksum manifest per batch       │      │
│        │ (Phase 0 fallback)│  - mapping tables (holooCode ↔ hz)   │      │
│  ┌─────┴──────────┐        └───────────────┬──────────────────────┘      │
│  │ sqlmirror-view │                        │ HTTPS, token (LAN only)     │
│  │ (SQL views)    │                        ▼                             │
│  └────────────────┘        ┌──────────────────────────────────────┐      │
│                            │ Hyper Zeytoon (Next.js + SQLite)     │      │
│                            │  /api/holoo/sync/*  (server-to-server│      │
│                            │  token; human gates in UI)           │      │
│                            └──────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────────────┘
                                   no direct internet exposure
```

- The middleware is a small Bun/Node sidecar (could live on the same mini-PC as the platform, or on the Holoo server) — it is the **only** process that talks to `TncHoloo/api` or to SQL Server. The platform never holds Holoo credentials.
- A dedicated **staging DB** (a separate SQLite file, e.g. `db/holoo-staging.db`) holds raw snapshots + mapping tables; the platform DB is only touched by idempotent upserts after staging passes validation.

### 4.3 Sync model: nightly full snapshot + append-only incremental journal (git-like timeline)

**Nightly full snapshot (source of truth reset):**
1. Middleware pulls full product list (`GetProduct`/`GetProductCount` with pagination), customer list, and stock levels; writes them as a **snapshot batch** into staging.
2. It computes a manifest: per-table row count, per-batch SHA-256 over (sorted canonical JSON of rows), and stores `manifest.json` next to the batch: `{batchId, startedAt, finishedAt, tables:{products:{rows, sha256}, customers:{...}}, source:'holoo-apex', direction:'inbound'}`.
3. Diff against previous snapshot → change-set for the platform.

**Intraday incremental pull (every 10–30 min, Phase ≥1):**
- Pull deltas via ID/`Code`-based queries (e.g. `GetProductCount` vs last count, `GetInvoiceList` filtered by `type`/recent). Because the public method surface may not expose "changed since" filters (→ vendor question), incrementals are *best-effort*: counts + recent-record windows. The nightly snapshot is the correction mechanism; incrementals only add freshness.
- Each incremental is an **append-only journal entry** — never an update:
  `journal/<batchId>.json = {prevBatchId, seq, startedAt, direction:'inbound'|'outbound', ops:[{op:'upsert|delete', entity:'product', holooCode, payloadSha256, appliedToPlatform:bool}], countsPerTable, sha256, checkpoint:{...}}`.
- The journal forms a **git-like timeline**: `seq` + `prevBatchId` form a hash-linked chain; any break in the chain = gap = alert + forced snapshot. Replaying any range is deterministic (same ops + same base = same state), which makes both *audit* and *recovery* trivial.

**Outbound (Phase 2+) journal entries** are created the same way, but their `ops` stay `appliedToPlatform:false` until the Holoo-side call is **acknowledged by the vendor API** and **verified by a read-back** (e.g. re-fetch the invoice and compare totals).

### 4.4 Staging DB rules
- Staging tables mirror the platform's Prisma models 1:1 (`HolooStagingProduct`, `HolooStagingCustomer`, `HolooStagingInvoice`, …) plus `_sync_batches`, `_sync_journal`, `_mapping_*`.
- Staging is **disposable**: wipe-and-rebuild from the last snapshot at any time. Nothing in staging is ever shown to staff directly.
- Validation gate before upsert: row counts match manifest; barcode uniqueness within staging; price/stock numeric ranges; Persian normalization via the platform's existing `normalizeName` so the same «ی/ي، ک/ك، ZWNJ» dedup logic used in xls import also drives API sync.

### 4.5 Idempotent upserts keyed on `holooCode`
- Every upsert is `INSERT ... ON CONFLICT(holooCode) DO UPDATE` semantics (SQLite: `INSERT OR REPLACE` guarded by a version column, or Prisma `upsert` on a unique `holooCode` field on Product/Company/Provider).
- `holooCode` = Holoo's stable identifier for the record. Preferred source = the web-service **ErpCode** (base64-like) — it is the only identifier the write methods accept; for DB-based Phase 0, the platform's existing xls codes (the "کد" column staff already import) can seed the mapping. → confirm ErpCode stability across product edits with the vendor.
- Re-running any batch is a no-op if state already matches (payload hash compared before write). **Duplicate invoices are impossible** by construction: outbound invoice ops carry a client-generated `externalId` (the platform order code, e.g. `ORD-14050619-006`); if the same `externalId` is sent twice, the middleware checks for an existing read-back match instead of issuing a second `NewInvoice`.
- Every applied op appends to the platform's existing `ActivityLog` («همگام‌سازی هلو: ایجاد/به‌روزرسانی …») so the audit trail matches the rest of the app.

### 4.6 Mapping tables (Holoo ↔ platform)

| Mapping table | Platform entity | Holoo side | Notes |
|---|---|---|---|
| `_map_products` | Product (+ Barcode) | ErpCode, کد, name, mainGroup/sideGroup, unit | ~400 products today; `holooCode` unique index; match assists: normalized name + barcode exact |
| `_map_barcodes` | Barcode | Holoo per-product barcode/کد field | first barcode isPrimary per platform convention |
| `_map_companies` | Company | Holoo طرف‌حساب (company/brand entities) | the platform currently holds ~12 companies; owner speaks of ~400 provider-company entities at chain scale — mapping is bulk-imported from Holoo and human-confirmed in a review UI |
| `_map_providers` | Provider ↔ ProviderCompany | Holoo side-accounts (خریدار/فروشنده/هر دو flags mirror `ispurchaser`/`isseller`/`custtype`) | customer & vendor may be the same Holoo record; keep both directions |
| `_map_invoices` | Order (+Payment) | Holoo invoice Code + type | outbound only (Phase 2); stores Holoo invoice Code returned by read-back |
| `_map_categories` | Product.category | Holoo main/side groups | drives auto-creation of missing groups (Phase 1) |
| `_map_units` | Product.unit | Holoo `GetUnit` | exact-string match, human-confirm fallback |

Mapping UI: a section in the platform (managers/accountant) listing **unmapped** items on both sides with one-click link / create / ignore actions — the same review-first UX the xls import already established.

---

## 5. Fail-safe design

### 5.1 Transactional batches
- Each batch applies inside one SQLite transaction per table (the platform already does this for stock-count commits). Any validation failure → whole batch rejected to a `quarantine` state with a Persian reason; the pipeline continues with other batches; nothing partial is ever visible.
- Staging writes are append-only; platform upserts are the only mutating step and are idempotent (§4.5), so "apply twice" is always safe.

### 5.2 Resumable checkpoints
- Every batch records `checkpoint = {lastEntity, lastCode, lastSeq, rowsApplied}`. On restart the scheduler reads the last journal entry with `appliedToPlatform:true` and resumes from `checkpoint` — it never re-pulls a completed batch and never skips a gap (a missing `prevBatchId` link forces a full snapshot before anything else runs).

### 5.3 Power-outage recovery procedure (posted next to the server)
1. Boot the mini-PC; the middleware autostarts (systemd/Docker `restart: unless-stopped`).
2. Middleware runs integrity checks: journal chain walk (seq/prev/sha256), staging `PRAGMA integrity_check`, snapshot manifest re-hash.
3. If checks pass → resume from checkpoint (§5.2). If a journal entry is truncated (power cut mid-write) → the tail entry is discarded (append-only ⇒ safe), the previous checkpoint stands, and a corrective incremental batch is pulled.
4. If the **platform** DB was interrupted mid-batch, the transaction rollback guarantees pre-batch state; the batch is simply re-applied (idempotent).
5. If Holoo-side state is uncertain after an outage during **outbound** sync (e.g. `NewInvoice` sent, ack lost): the middleware never auto-retries a financial write; it raises a human task «بررسی فاکتور نامطمئن <orderCode>» with the journal entry attached. The accountant verifies inside Holoo and marks the op resolved (manual `read-back` button re-verifies automatically).

### 5.4 Corruption detection
- **Checksums:** every batch and every journal op carries `payloadSha256`; manifests are re-verified nightly before diffing.
- **Row counts:** manifest row-count per table must equal staged rows; platform upsert count must equal staged count minus quarantined; any mismatch halts the pipeline and notifies managers (reusing the platform watchdog notification path).
- **Business invariants:** daily reconcilers compare (a) platform stock value vs Holoo stock value per category (tolerance from settings, like `tolerance_toman`), (b) invoice count parity for the day, (c) orphaned mappings (`holooCode` present on one side only) — surfaced in the mapping UI as «مغایرت‌های همگام‌سازی».

### 5.5 Rollback runbook (laminated card)
1. **Freeze:** stop the scheduler (`hz-holoo-sync stop`) — journal/jobs preserved.
2. **Scope:** identify the last good batch `B_good` in the journal UI (before the bad one).
3. **Platform rollback:** for inbound data, run the replay tool with `--until B_good`; because ops are idempotent and journaled, replay of the chain rebuilds prior state (products/prices/stock), or restore last night's platform DB backup (`/backups/zeytoon-*.db`, see DEPLOYMENT.md) and replay journal after `B_good`.
4. **Holoo-side rollback (outbound):** invoices are **cancelled inside Holoo by the accountant** (void/cancel per Holoo's own procedure) — the middleware never deletes Holoo financial documents; it marks the journal ops `reversed` with the accountant's note.
5. **Unfreeze:** resume scheduler, run a fresh snapshot, diff, and log the incident in ActivityLog.
6. If anything is unrecoverable: fall back to the xlsx bridge (§2) and open a vendor support ticket.

---

## 6. Security

- **Dedicated least-privilege accounts.**
  - Web service: a Holoo user dedicated to integration with the minimum role set the vendor allows (ideally read-mostly; write rights enabled only in Phase ≥2). Confirm role granularity → vendor.
  - SQL Server (Phase 0): one SQL login with `db_datareader` on the Holoo database only, `SELECT` only through our own mirror views; no `db_owner`. Access is by allow-listed IP (the middleware host) — standard SQL Server least-privilege practice.
- **Network segmentation.** Holoo server, middleware, and platform live on the staff LAN/VLAN (per DEPLOYMENT.md security checklist: no port-forwarding, staff-only Wi-Fi). The TncHoloo endpoint (port 8080) is bound to the LAN — never exposed to the internet; the platform's reverse proxy denies external access to `/api/holoo/*`.
- **Secrets handling.** Holoo DB name/user/password and the platform sync token are stored only on the middleware (env file `0600`, or Docker secrets); the platform stores only an opaque sync token (rotatable) for the middleware → platform channel. Secrets never appear in logs or journal files (log payloads' hashes, not bodies). If the cloud web service is used in its hosted flavor, its API key is requested through the vendor's documented gated process and stored likewise. [S3][S9]
- **Separation of failure domains.** Middleware staging DB and platform DB are separate files; compromise or corruption of one never propagates to the other.
- **Human gates** (§7) double as security controls: no financial document is created without a named approver, and every op is attributable via ActivityLog.

---

## 7. Phased roadmap

| Phase | Name | Direction | What runs | Human gate |
|---|---|---|---|---|
| **Phase 0** (1–2 weeks) | Read-only inventory mirror | Holoo → platform | Web service read methods (or read-only SQL mirror views if entitlement lags): nightly full snapshot + per-hour stock counts; mapping UI seeded from a fresh xls import; daily stock-value reconciliation report | None (read-only). Owner reviews the «مغایرت‌های همگام‌سازی» report weekly |
| **Phase 1** (2–4 weeks) | Product/supplier master sync | Holoo ↔ platform (master data both ways, prices one-way Holoo→platform by default) | Idempotent upserts keyed on `holooCode`; category/unit mapping; new-Holoo-product → platform draft with confirm; platform-created products stay local until mapped | Mapping review UI: every new/ambiguous link confirmed by inventory manager |
| **Phase 2** (4–8 weeks) | Invoice export into Holoo | Platform → Holoo | On `mark_accounting_done`, middleware issues `NewInvoice` (purchase-type record for received deliveries, per accountant's workflow) in Holoo; read-back verification; holooTotal auto-filled from read-back instead of typed | **Accountant confirmation dialog** («ثبت در هلو») remains — automation only prepares, human clicks commit; uncertain states raise tasks (§5.3) |
| **Phase 3** (optional, later) | Bi-directional operations | both | Stock write-back (receiving adjustments), customer sync for CRM, cheque/treasury surfaces **if/when vendor confirms methods**; multi-store rollout follows the chain scenario (Tehran/Isfahan/Shiraz in the demo lab) | Two-key rule: any bi-directional flow requires sender + receiver different people (human confirmation gates at every financial boundary) |

Each phase ends with a **go/no-go review** against the reconciliation reports from §5.4, and each phase is independently reversible to the xlsx bridge without business interruption.

---

## 8. Open questions checklist for the Holoo vendor / support

Copy-paste list for the owner's next visit to the Holoo representative:

1. Does our supermarket APEX network edition (which tier exactly are we licensed for?) include the **وب‌سرویس ابری** entitlement, or is it the separate ۵٬۰۰۰٬۰۰۰-تومان add-on? Per-seat or per-database? [S3][S4]
2. May we receive the official guide «نصب وب سرویس متدها و پارامترها» (51 pages) and any OpenAPI/WSDL definition for `http://{IP}:8080/TncHoloo/api`? [S5]
3. What is the **full method list** beyond product/customer/invoice (community client shows those three families)? Specifically: stock level & stock adjustment methods, purchase invoices (حواله خرید), cheques/treasury, pre-invoice → invoice conversion? [S6]
4. Is there a **"changed since" filter or change-log/webhook** for incremental pulls, or is full polling the only option?
5. Is the product **ErpCode stable** across product edits/merges in Holoo's UI? Can we supply our own external reference (e.g. platform order code) on `NewInvoice` for dedup? [S6]
6. What is the procedure to request the **API key/entitlement** for our business (documents, fees, lead time)? [S9]
7. Which **SQL Server** version/edition does our APEX install use, and may we create our own **read-only views** on the database? Is the schema documented or supported for read-only access? [S7]
8. How does the web service interact with **سامانه مودیان** — are service-created invoices automatically Moadian-compliant like UI-created ones? [S4]
9. Are there **rate limits / concurrency limits** on the web service? Recommended polling frequency?
10. Is there a formal **ISV/partner program** for integrators (the store lists "همکاری با ما / ثبت درخواست تأمین‌کنندگان" for suppliers) — can our middleware be reviewed/certified? [S2]
11. Support posture: who do we call at 21:00 when a sync batch is stuck? Response-time commitment?
12. Multi-branch (chain) licensing: one Holoo DB per branch, or consolidated? This decides whether `_map_*` tables are per-branch. [S4]

---

## 9. Sources (all accessed 2026-09-15)

- [S1] Holoo official site (Holoo Technology Group): https://holoo.co.ir/ — English homepage (services/products) and Persian page «نرم‌افزار حسابداری فروشگاهی هلو APEX» (shop-focused item/warehouse/invoice structure). No dates on-page; site live at access date.
- [S2] Holoo Store (official e-shop for Holoo + third-party products): https://holoostore.com/ — homepage metadata dateModified 2026-05-23; categories «افزونه‌های متصل به نرم افزار هلو»، «افزونه‌های اتصال و یکپارچه‌سازی»، «همکاری با ما / ثبت درخواست تأمین‌کنندگان».
- [S3] «وب‌سرویس ابری نرم‌افزار هلو APEX» product page: https://holoostore.com/product/%D9%88%D8%A8-%D8%B3%D8%B1%D9%88%DB%8C%D8%B3-%D8%A7%D8%AA%D8%B5%D8%A7%D9%84-%D8%A8%D9%87-%D9%86%D8%B1%D9%85-%D8%A7%D9%81%D8%B2%D8%A7%D8%B1-%D9%87%D9%84%D9%88/ — price ۵٬۰۰۰٬۰۰۰ تومان، شناسه ۲۸۰۱۱۸۵؛ features (CRM/HR/e-commerce/automation connectivity; install guidance + methods/parameters guide file); search-index date Feb 7, 2024; review dated ۱۸ بهمن ۱۴۰۲.
- [S4] «نرم‌افزار حسابداری سوپرمارکت هلو APEX» product page: https://holoostore.com/product/%d9%86%d8%b1%d9%85-%d8%a7%d9%81%d8%b2%d8%a7%d8%b1-%d8%ad%d8%b3%d8%a7%d8%a8%d8%af%d8%a7%d8%b1%db%8c-%d8%b3%d9%88%d9%be%d8%b1-%d9%85%d8%a7%d8%b1%da%a9%d8%aa-%d9%87%d9%84%d9%88/ — tiers (پیشرفته شبکه دو کاربره، جامع شبکه چهار کاربره، اتوماسیون تخصصی), ۱۳.۷–۶۹.۷ م تومان, Moadian connection, min/max per item, warehouse transfer notes, «خروجی Text، Excel، HTML» add-on.
- [S5] Official web-service guide «نصب وب سرویس متدها و پارامترها» (51 pages, indexed on holoostore.com): Config step references «مسیر Sql Server که هلو بر روی آن نصب»؛ address `http://{IPSystem}:8080/TncHoloo/api`; Login method. PDF URL not publicly linked — obtain from vendor (see §8 Q2).
- [S6] `zoghal/HolooWebService` — community PHP client based on the official connection guide: https://github.com/zoghal/HolooWebService (README documents `Holoo::config('http://server-ip:8080/TncHoloo/api/', 'DB Name', 'UserName', 'PassWord')`, `login()`, `Customer::GetCustomer/NewCustomer/EditCustomer`, `Invoice::GetInvoiceList/NewInvoice/NewPreInvoice`, `Product::GetProduct/GetProductCount/GetMainGroup/GetSideGroup/GetUnit/NewProduct/EditProduct`, ErpCode-style identifiers).
- [S7] Holoo official Q&A «شبکه دانش مالی هلو»: https://qa.holoo.co.ir — thread «Attach دیتا بیس در sql server» (Dec 12, 2022).
- [S8] HolooMag: «Holoo APEX؛ فصل جدید نرم‌افزار حسابداری» (Dec 28, 2021): https://holoomag.com — CEO claim that Holoo is the only offline Windows accounting software with an API structure for add-on developers.
- [S9] WooConnect: «کلید API هلو و دشت | چرا ووکانکت به آن نیاز ندارد؟» (Jul 30, 2026): https://wooconnect.ir — API key requires forms, identity/business documents, vendor approval.
- [S10] p30web: «وب سرویس یا api حسابداری سپیدار، هلو و دشت» (Jan 14, 2025): https://www.p30web.org ; plus an Instagram post by the same ecosystem (Nov 19, 2020) describing one-way receive flavors of the Holoo web service (host-level citation; exact post URL not retained).
- [S11] Foroshgostar (commercial Holoo↔online-store middleware, auto sync of products/orders/customers): https://www.foroshgostar.com
- [S12] Sepehr shop-builder — Holoo API connection for e-commerce and food distribution: https://sepehrcc.com
- [S13] realwp — WooCommerce ↔ Holoo price/stock sync: https://realwp.net
- [S14] Holoocenter — Holoo↔site connector with per-object transfer toggles: https://www.holoocenter.com
- [S15] Holoo official help base — APEX installation & troubleshooting (server/client network setup): https://help.holoo.co.ir/?knowledgebase=i11
- [S16] Holoo Store download page — single-user edition with hardware dongle vs network (2-user) editions: https://holoostore.com/%d8%af%d8%a7%d9%86%d9%84%d9%88%d8%af-%d9%86%d8%b1%d9%85-%d8%a7%d9%81%d8%b2%d8%a7%d8%b1-%d9%87%d9%84%d9%88
- [S17] Holoo teleworking tool («ابزار دورکاری هلو» — web access to APEX/Aspad): https://holoostore.com/product/teleworking
- [S18] VendorSelect overview of Holoo APEX accounting features (Aug 14, 2026): https://www.vendorselect.ir
- [S19] My Holoo portal (official account/files portal): https://myholoo.ir

**Explicitly not found in public sources (hence «needs vendor confirmation»):** official SQL schema/ERD of Holoo APEX; cheque/treasury/stock-write web-service methods; SLA/rate limits; formal integration-partner certification program.
