# Task 2-b — full-stack-developer — Sales & SPHL module

## Files touched (exactly)
1. `prisma/schema.prisma` — appended `Sale` model (no relations; manual user joins), `db:push` OK
2. `src/app/api/sales/route.ts` — NEW: GET/POST/DELETE with full SPHL summary
3. `src/app/api/preorders/route.ts` — 'done' case now auto-creates Sale rows (idempotent via `db.sale.count({preOrderId})===0` guard), audit detail extended
4. `src/components/platform/CrmSection.tsx` — third tab 'فروش و SPHL' (key `sales`) + `SalesTab` component (StatCards, quick-log form, recharts 14-day gold bar chart, SPHL leaderboard, today's sales list with two-step delete)
5. `scripts/seed-sales.ts` — NEW: idempotent seed (guard: Sale count > 50 skips), 180 sales / 30 days / 6 role-resolved sellers / 20 products, `Setting shiftHours='8'` upsert
6. `worklog.md` — appended Task 2-b entry (includes exact GET /api/sales summary JSON shape)

`next.config.ts` was touched + byte-identically restored (zero net diff) solely to trigger Next dev's native config-restart so the running server reloaded the regenerated Prisma Client (it held a stale pre-schema client → `db.sale` undefined).

## API quick reference
- `GET /api/sales?from&to&salespersonId&limit=200` → `{sales[], summary}`; summary keys: `todayTotal, todayCount, weekTotal, monthTotal, count, byDay[14], bySalesperson[{userId,name,color,total,count,sphl}] (desc by total), sphlOverall, topProducts[≤8]`
- `POST /api/sales {userId, productId?, name, qty, unitPrice, salespersonId, cashierId?, customerName?, channel?, note?}` → `{sale}` + PointsLog +2 + audit `sale.create`
- `DELETE /api/sales?id=&userId=` → `{ok:true}` + compensating −2 points (floor 0) + audit `sale.delete`
- Preorder PATCH `done` → auto Sale rows `channel:'PREORDER'`, `preOrderId` linked

## Verification
- lint 0/0; tsc only pre-existing examples/+skills/ errors
- curl: POST/DELETE round-trip (points 65→67→65, totals balanced), audit rows written, preorder done flow created 2 PREORDER sales and re-done did not duplicate, GET /api/preorders intact, GET / 200

---

# Task 2-b (round 4) — full-stack-developer — Nav badge counts + dashboard sales pulse

## Files touched (exactly)
1. `src/app/api/badges/route.ts` — NEW: GET per-user badge counts (Promise.all of 6 counts; zeros on bad input/error, never 500)
2. `src/lib/store.ts` — `badges`, `badgesUserId`, `setBadges(b, userId?)`, `ZERO_BADGES` (backward compatible)
3. `src/components/platform/BadgesPoller.tsx` — NEW: invisible poller (immediate + 25s + window focus; silent-fail; logout cleanup zeroes in effect cleanup)
4. `src/lib/nav.ts` — badgeKey union `'orders'|'deliveries'|'tasksMine'|'messagesUnread'|'cheques'`, wired 5 items, added `badgeCountText()` (Fa digits, «+»>9, cap «۹۹+»)
5. `src/components/platform/Sidebar.tsx` — NavButton badge pills (gold orders/cheques, olive deliveries/tasks, rose messages + animate-ping halo, motion-reduce safe); same component serves the mobile drawer
6. `src/app/page.tsx` — MobileTabBar absolute rose dots on main tabs + inline pills on «more» chips (no layout shift); `<BadgesPoller />` mounted after QuickNav
7. `src/app/api/dashboard/route.ts` — `sales: { todayTotal, todayCount, sphl, topSeller, byDay[14] }` appended (same Promise.all + shiftHours Setting)
8. `src/components/platform/DashboardSection.tsx` — DashData.sales + clickable «نبض فروش امروز | Sales pulse today» card (Money + invoices + SPHL gold badge + 🏆 top-seller chip + 14-day AreaChart sparkline, dir='ltr', #B8860B; zero-day empty text; onClick → setView('crm'))
9. `worklog.md` — appended Task 2-b entry

NOT touched (per constraints): CrmSection.tsx, src/app/api/sales/*, src/app/api/products/*, prisma/schema.prisma, globals.css.

## /api/badges contract
`GET /api/badges?userId=<id>` → `{ orders, deliveries, tasksMine, messagesUnread, cheques, notifications }`
- orders: status DRAFT/SUBMITTED/APPROVED · deliveries: APPROVED/RECEIVED · tasksMine: mine OPEN/IN_PROGRESS/PAUSED · messagesUnread: unread others' in my conversations (`conversation: { is: { OR: [userAId/userBId] } }`) · cheques: PENDING_APPROVAL OR WRITTEN/SIGNED/GIVEN due ≤ now+7d · notifications: mine unread
- Invalid/missing userId or DB error → zeros (never 500). Example: userId=50 → `{orders:4,deliveries:2,tasksMine:0,messagesUnread:1,cheques:2,notifications:7}`

## Verification
- lint 0/0; tsc clean for my files (only pre-existing examples/+skills/ errors)
- Badge counts cross-checked against direct Prisma queries — exact match; dashboard `sales` numbers identical to GET /api/sales summary (todayTotal 2,051,000 / count 10)
- agent-browser: sidebar + drawer pills, ping halo, logout→zero→login→re-target (users 50 & 54 give different per-user counts), pulse card renders + sparkline SVG + click→CRM, mobile 390×844 dots/chips intact (48px tabs)
- Screenshots: qa4-badges.png, qa4-pulse.png, qa4-mobile-badges.png; browser errors empty; dev.log 200s only
- QA data left intentionally: conversation #1 (49↔50) + 1 unread message to GM
