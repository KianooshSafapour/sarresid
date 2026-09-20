# Task 5-d — agent-5-d — Platform Sections (Tasks, SOPs, Community, Notes)

## Scope
Created EXACTLY 4 files (no other file modified):
1. `src/components/platform/TasksSection.tsx`
2. `src/components/platform/SopsSection.tsx`
3. `src/components/platform/CommunitySection.tsx`
4. `src/components/platform/NotesSection.tsx`

All: `'use client'`, `export default function XSection({ user }: { user: PUser })`, kit primitives + `api` + `jalali` + `types`, `dir="rtl"` roots, sonner toasts, olive/gold/cream palette, ≥44px touch targets, `max-h + pz-scroll` lists, warm "helps-not-controls" Persian copy.

## TasksSection
- Loads `GET /api/tasks` (all) + `GET /api/users` (managers only, active only for assignee select).
- Tabs: `mine` (default; `assignedToId===user.id && status ∉ {DONE, CANCELLED}`) | `all` (GM/OM/IT/OWNER) | `done` (`assignedToId===user.id && DONE`, ✨ pride banner).
- Card: priority chip (URGENT rose/HIGH amber/MEDIUM olive/LOW gray), `StatusBadge kind="task"`, title bold, description, due `fmtJalali` + overdue via `daysBetweenISO(due.slice(0,10), todayISO()) < 0` → rose `⏰ گذشته`, assignee Avatar (fallback createdBy), `TimeAgo(createdAt)`.
- My-task actions: OPEN→start ('شروع می‌کنم'); IN_PROGRESS→done ('انجام شد ✓' → toast `آفرین! +۳/+۵ امتیاز 🎉` by priority) + pause modal (textarea reason); PAUSED→pauseReason amber box + 'ادامه' (reopen→start chain; API `start` only accepts OPEN) + done.
- Managers: create modal (title, description, priority, assignee, JalaliDateField) → POST; edit = same modal prefilled → PATCH `{action:'edit'}`; two-step cancel; card 'ویرایش'.
- API shapes used: `PATCH {id, action, userId, ...}`, responses `{task}` — replaces row in local state.

## SopsSection
- `GET /api/sops` (steps arrive parsed as `string[]`). Tabs: sops | 'راهنما | FAQ'.
- Dept chips: `همه` + GENERAL/WAREHOUSE/CASHIER/MERCHANDISING/SALES + dynamic extras found, each with `toFaDigits` count.
- Viewer (wide modal): numbered steps (`toFaDigits`), local `Set<number>` checkboxes 'انجام دادم', progress bar olive→gold gradient + ٪, 100% → celebration `🎉 آفرین! همه مراحل انجام شد` + calm hint referencing the task pause button / supervisor + reset.
- Managers (GM/OM/IT): create/edit modal (title, dept select, textarea-per-step rows with add/remove) → POST/PATCH; two-step delete → `DELETE /api/sops?id=&userId=` (stopPropagation on card buttons).
- HELP tab: native `details/summary` accordion, 5 FAQs (سفارش ثبت، بارکد، امتیاز، ایده به مدیر، درخواست انبار) with friendly answers referencing platform sections.

## CommunitySection
- Tabs: `wall` | `ideas` | `feedback` (+ `inbox` 'صندوق بازخورد' only for GM/OM/OWNER/IT).
- WALL: composer → `POST /api/wall {userId, content}` (prepends response post, +2 pts toast); list pinned-first w/ 📌 badge; moderators (GM/OM/IT) pin/unpin → `PATCH {id, pinned}`.
- IDEAS: submit card → `POST /api/ideas {userId, title, content}` → toast 'ایده‌ات ثبت شد! اگر پیاده شود جایزه دارد 🌟'; list w/ status chips (IDEA_STATUSES + IDEA_STATUS_LABELS; colors gray/amber/emerald/gold/rose), 💬 decision box, TimeAgo; GM/OM/IT decision control (status select + decision input → `PATCH {id, status, decision, decidedById}`).
- FEEDBACK: anonymous 5-star (gold, 44px) + textarea → `POST /api/feedback {content, rating?}` → toast '...ممنون که کمک می‌کنی بهتر شویم 💚'; privacy note; inbox tab lists stars+content+TimeAgo (feedback fetched only when `canReadFeedback`).

## NotesSection
- `GET /api/notes?userId=` (updatedAt desc). Sticky grid `grid-cols-2 md:grid-cols-3 xl:grid-cols-4`.
- Colors map: olive `#F3F7EF`, gold `#FBF3DC`, rose `#FBEAEA`, sky `#EAF3F7` (+ matching borders); 4-dot picker in modal.
- Big dashed '+ یادداشت جدید' tile + header PrimaryButton; create/edit modal (title required, content, color) → POST/PATCH; two-step delete (🗑️ → 'حذف؟') → `DELETE /api/notes?id=`.
- Privacy banner: '🔒 این یادداشت‌ها فقط برای خودت است'.

## Verification
- `bun run lint` → 0 errors; only pre-existing warnings in Login.tsx / kit.tsx (not mine).
- `bunx tsc --noEmit` → no errors in my 4 files.

## Deviations
- PAUSED tasks also expose 'انجام شد ✓' (spec put it under IN_PROGRESS only) so completion doesn't require resuming first.
- 'ادامه' = reopen→start sequence (API constraint).
- Two-step inline delete confirms instead of `window.confirm`.
- `dir="rtl"` set per-section root (shell has no RTL; harmless if added globally later).
- Tailwind v4 trailing `!` important syntax for compact manager card buttons.

## Stage Summary
- 4 sections contract-complete and clean; page.tsx already imports them by name.
