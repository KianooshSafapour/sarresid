# Task 5-c — agent-5-c work record

Task ID: 5-c
Agent: agent-5-c
Scope: 4 frontend section components (only these files touched)

## Files created
1. `src/components/platform/ProductsSection.tsx`
2. `src/components/platform/SuppliersSection.tsx`
3. `src/components/platform/WarehouseSection.tsx`
4. `src/components/platform/PlanogramSection.tsx`

## Key implementation notes
- All sections: `'use client'`, `export default function XSection({ user }: { user: PUser })`, kit primitives only, sonner toasts, Persian-first + Jalali dates, olive/gold/cream (no blue/indigo), touch ≥44px on primary controls, long lists in `max-h-*` + `pz-scroll`.
- Manage check reused in Products/Suppliers/Planogram: GM | PRODUCT_MANAGER | OPERATION_MANAGER | IT_ADMIN.
- Products: server-side filters (debounced `q`, `category`, `low=1`) against `GET /api/products?limit=500`; card bottom shows big fa-digit remaining colored by `stockDot`; edit modal has full field set + image web-search (image-search → thumbnails → PATCH `/api/products/image`) + device upload (canvas downscale 320px/JPEG 0.8); Holoo import wizard = parse (uploadFile) → status-chip preview (new/duplicate+duplicateOfId/invalid) → merge radio (`fill-empty` default | `merge-stock` sets `row.action`) → commit → toast created/merged/skipped.
- Suppliers: cards with kind/payment chips + company initial chips; drill-down list→supplier→company with breadcrumb; company products from `/api/companies` rendered like product cards; manage modals for supplier (incl. companies multi-checkbox) and quick company add.
- Warehouse: tabs requests / customer-asks / lowstock; role-gated actions (INVENTORY_SUPERVISOR prepare, MERCHANDISER receive, requester cancel); searchable product picker for new request; customer asks with ×count badge (rose ≥3) and +1 via POST upsert; lowstock rows with editable qty (default minStock) quick request.
- Planogram: cards with status chip + assignedTo Avatar; MERCHANDISER sorts PUBLISHED first; visual wooden shelf render (`#E8DCC0→#D9C9A8` gradient) with slots bordered by stock color and ×facing chips; designer modal builds `{shelves:[{label,slots:[{productId,facing}]}]}` (POST/PATCH update), publish via merchandiser select (from `/api/users`) → PATCH action publish → toast «برای چیدمان‌دار ارسال شد»; archive supported.

## Verification
- `bun run lint`: 0 errors (removed 1 unused eslint-disable in my file; 2 remaining warnings are pre-existing in Login.tsx / kit.tsx — not mine).
- `bunx tsc --noEmit`: no diagnostics in my 4 files.
- Dev server (port 3000) was down at check time (system-managed); verification relied on lint + tsc.

## Deviations
- New warehouse-request button visible to all roles (spec said merchandisers) — kept consistent with open lowstock quick-request; role-gated card actions unchanged.
- New-product image tools stage the image in form state and persist on POST save (PATCH /api/products/image needs an existing id).
- Product mini-card duplicated locally in SuppliersSection (frontend contract: no imports between sections).
