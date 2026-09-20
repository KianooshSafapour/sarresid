# Task 7-a — Daily Notification Digest

Agent: full-stack-developer
Date: 2026-09-10 (Jalali ۱۹ Shahrivar ۱۴۰۵)

## What was built

Closes round-6 backlog item #1: per-role daily digest with an **on-first-load-of-day trigger** (no cron exists in the sandbox).

### 1. API — `src/app/api/notifications/digest/route.ts` (NEW)
`POST /api/notifications/digest` body `{ userId }`

- **Validation (only 400 path)**: missing/invalid userId, unknown user, or inactive user → 400 Persian.
- **Idempotency**: one `DIGEST` notification per user per server-local calendar day — `findFirst Notification { userId, type: 'DIGEST', createdAt >= startOfToday }` → `{ created: false, reason: 'already' }`.
- **Audience** (from `user.roles` comma string): OWNER/GENERAL_MANAGER/OPERATION_MANAGER/IT_ADMIN/PRODUCT_MANAGER → management digest; ACCOUNTANT → finance digest; everyone else → personal digest.
- **Never 500s on data issues**: every section query is wrapped in a `safe()` helper (try/catch → fallback value, section omitted); outer catch-all → 200 `{ created: false, reason: 'error' }`.
- **Sections**:
  - Management («📰 Briefing ۱۹ Shahrivar ۱۴۰۵»): deliveries today (Order receivingDate today + status DRAFT..CONFIRMED, same as dashboard), cheques due ≤7d (WRITTEN/SIGNED/GIVEN count + fmtMoney sum), orders SUBMITTED, my open tasks, low-stock products (stock<=minStock && !mergedInto), unread messages.
  - Accountant («📰 Accounting Briefing …»): cheques PENDING_APPROVAL, cheques due ≤7d (count+sum), sales today (count+total), pipeline orders DRAFT+SUBMITTED, unread messages.
  - Personal («📰 My Day …»): my open tasks + nearest due date, unread messages, PointsLog sum last 7d. Assigned-deliveries omitted (Order model has no assignee field).
- All numbers in Persian digits (`toFaDigits`); bullets `•`; footer «— هایپر زیتون 🫒 روزی پربار آرزوستیم».
- **Audit**: `db.auditLog.create({ userId, userName, action: 'DIGEST_GENERATE', entity: 'Notification', entityId: created.id, detail: 'دایجست روزانه (kind) — <title> | Daily digest generated on first load of day' })`.

### 2. Trigger — `src/components/platform/BadgesPoller.tsx` (MODIFIED)
After the first successful badges fetch per mount, fire-and-forget POST digest `{ userId }`; if `created === true` → re-run `load()` so the bell badge includes it. `digestDoneRef`/`digestUidRef` reset on session-user change so each new user gets their digest. Silent on failure. Reuses existing stale-response guards.

### 3. UI — `src/components/platform/Header.tsx` (MODIFIED)
DIGEST rows in the bell dropdown: gold gradient bg (`from-[#FBF3DC] via-[#FCF6E4] to-[#FDF9EE]`), 3px `#DAA520` start-edge bar, gold `Newspaper` lucide icon, title 15px/800 `#8A6508`, body `whitespace-pre-line leading-5` (no line-clamp), `min-h-[44px]` touch target. Other notification types unchanged.

## Verification evidence

- `bun run lint` → 0 errors/0 warnings; `bunx tsc --noEmit` → clean for src/** (only pre-existing examples/ + skills/ errors).
- curl: GM 50 → `already` (live poller had created #32 seconds earlier after hot-reload — dev.log `POST /api/notifications/digest 200 in 13ms`; proves client trigger E2E); repeat → `already`; ACCOUNTANT 54 → created #33; SALESPERSON 63 → created #34; missing/bad body/nonexistent user → 400.
- Temp Prisma script (deleted): rows #32-34 correct per-role content; numbers cross-checked against /api/dashboard + /api/badges (deliveries 1=ordersToday, lowStock 8, unread 1=messagesUnread, sales 14/2,599,000, cheques pending 2); audits #71-73 correct.
- agent-browser (GM session): digest visible in panel with distinct styling (computed styles verified: gradient + 3px gold border + 15px/800 title + newspaper icon + pre-line body + 44px min-height); badges intact; `window.__errs` = 0 after fresh desktop + 390px mobile loads/interactions. Screenshots: /tmp/r7a-panel.png, /tmp/r7a-page.png, /tmp/r7a-desktop.png, /tmp/r7a-mobile.png.

## Contracts for downstream agents

- `POST /api/notifications/digest {userId}` → `{created:true, notification}` | `{created:false, reason:'already'}` | `{created:false, reason:'error'}`; 400 only for bad/unknown userId. Audit action `DIGEST_GENERATE`.
- `Notification.type = 'DIGEST'` is a plain string (schema untouched); Header bell renders it specially — keep the special-case if you touch the dropdown.
- BadgesPoller owns the digest trigger; a future cron/mini-service can call the same endpoint directly.
- Limitation: a tab left open across midnight fires the next day's digest only on next reload/remount (server idempotency is safe; next load catches up).
- Test artifacts left intentionally: Notifications #32-34 + DIGEST_GENERATE audits #71-73 (today's legit digests).
