# Task 5-b — agent-5-b — Deliveries / Accounting / Payments sections

## Scope
Exactly three files created (nothing else touched):
1. `src/components/platform/DeliveriesSection.tsx`
2. `src/components/platform/AccountingSection.tsx`
3. `src/components/platform/PaymentsSection.tsx`

All are `'use client'` + `export default function XSection({ user }: { user: PUser })`, built only on kit primitives, `@/lib/{api,store,types,jalali}`, `JalaliCalendar`, `sonner`, `lucide-react`, `recharts`. No new packages, no API changes.

## API shapes verified before coding
- `GET /api/orders?status=` → `{orders}` with `supplier`, `items` SUBSET (qty/deliveredQty/confirmedQty/unitCost), `_count.items`. Therefore receive/confirm sheet fetches `GET /api/orders/[id]` (full items + `product.imageUrl`).
- `PATCH /api/orders/[id]`: `receive` (APPROVED/RECEIVED; items `[{id, deliveredQty, printedPrice, status, note, finalCost}]`), `confirm` (RECEIVED/CONFIRMED; `confirmedQty`), `done` (CONFIRMED only; +5 pts for ACCOUNTANT actor), `addBarcode {itemId, barcode}` (needs item.productId).
- `GET /api/export/order/[id]?userId=` → xls attachment; used via `downloadFile(url, `${code}-holoo.xls`)`.
- `GET /api/dashboard` → `counts.chequesPendingOwner`, `ordersByStatus[{status,count}]`.
- `GET /api/holidays` → `{holidays:[{date,title}]}` → `Record<iso,title>` map.
- `/api/cheques`: GET `{cheques}` incl `order{code}`; POST `{orderId?,purpose,amount,dueDate,recipientName,recipientPhone,payee,note,createdById}` (server 400 on holiday); PATCH actions `approve|reschedule|write|sign|give|collect|reject{reason}|bounce|update`.
- `GET /api/users` → `{users}` for created-by names.

## Section behavior (summary)
- **Deliveries**: tabs by role (receive / confirm / overview / history; default confirm>receive>overview). Holiday banner today. Overview stats + active order cards with overdue alert + openOrder. Shared wide-Modal sheet for receive & confirm: per-item card (image, name, mono barcode, ordered qty), 44px stepper, printedPrice/finalCost input, OK/MISSING/REJECTED toggles, conditional note, auto-focus scan box (Enter → mark OK + full qty + toast "تایید شد ✓"), per-row "افزودن بارکد" → PATCH addBarcode; footer recalcs Σcost×qty, VAT 9%, total, delta chip vs order.total (green ≤1000). Submit → receive/confirm PATCH → toast → refresh.
- **Accounting**: stats (CONFIRMED queue, Jalali-month DONE sum, chequesPendingOwner). Queue cards → Excel export for Holoo + Mark Done w/ confirm modal ("import into Holoo first") → toast "سفارش بسته شد +۵ امتیاز"; read-only for GM/OM. History DONE table + re-export. Insights: recharts AreaChart (Jalali month labels), PieChart by supplier, VAT stat. Holoo Bridge Guide card (5 steps, friendly tone for خانم درویشی).
- **Payments**: calendar card (month anchor navigation, 💰 cheque highlights, holiday dots, legend) + month cheque list; stats (due this month / awaiting owner / collected). GM-only "چک جدید" modal with ORDER (order select autofills amount) / OTHER, JalaliDateField min today, holiday warning + 1–3-days-earlier chips (submit disabled on holiday). Six collapsible status groups; cards show amount, due (rose on holiday), cheque StatusBadge, order chip → openOrder, recipient/payee/created-by. OWNER: pending section emphasized (gold ring, "مناسب تایید آقای نوروزی", big approve) + approve/reject(modal reason)/write/sign; GM: give/collect/bounce. Rose banner for SIGNED & signedAt>3d.

## Verification
- `bun run lint` → 0 errors; only pre-existing warnings in Login.tsx / kit.tsx (not my files).
- `bunx tsc --noEmit` → no errors in my three files (fixed initial TS2430 by not redeclaring `supplier` on DetailOrder).
- Dev log: no compile/module errors; APIs returning 200.

## Notes for next agents
- page.tsx (shell) should render `<DeliveriesSection/>`, `<AccountingSection/>`, `<PaymentsSection/>` for roles: deliveries → DELIVERY_RECEIVER/INVENTORY_SUPERVISOR/GM/OM/ACCOUNTANT/PM; accounting → ACCOUNTANT (+GM/OM read-only); payments → OWNER/GM (sections self-gate actions by role, safe to render wider).
- Recalc footer compares new total (incl. VAT) vs original order.total (excl. VAT) per spec — hint text explains the base.
