# Task 3-b — agent-3-b — Secondary APIs

## Scope
Built all 20 "secondary" API route files listed in worklog API CONTRACTS §3-b. Did NOT touch: src/app/api/{auth,users,products,suppliers,companies,orders,export,dashboard}/, src/lib/db.ts, prisma.

## Files created (all `src/app/api/.../route.ts`)
1. **cheques** — GET ?status= (dueDate asc, include order.code); POST (amount>0 + dueDate validation, **holiday check on dueDate** → 400 `{error:'تاریخ سررسید تعطیل است — due date is a holiday', date, title}`, status PENDING_APPROVAL, notify OWNER 'چک جدید در انتظار تایید', audit CHEQUE_CREATE); PATCH actions: approve (OWNER/GM role check, PENDING_APPROVAL→APPROVED, decidedById/decidedAt, notify GM), reschedule {newDueDate} (WRITTEN/SIGNED only + holiday re-check), write, sign (notify GM 'چک آماده تحویل'), give {recipientName,recipientPhone} (notify GM), collect (notify GM), reject {reason}, bounce (notify GM+OWNER), update {note,recipientName,recipientPhone}. Each audited.
2. **holidays** — GET all sorted date asc; POST upsert by date (validates yyyy-mm-dd); DELETE ?date=. Audits HOLIDAY_ADD / HOLIDAY_DELETE.
3. **holidays/fetch** — POST: keybit (`https://api.keybit.ir/holidays/`, Accept json, AbortSignal.timeout(5000)) → defensive recursive scan of JSON for arrays of events, extracts title + Jalali jy/jm/jd (direct fields, nested objects, or yyyy-mm-dd strings in 1300–1600 range) → `toGregorian` (jalaali-js) → upsert source 'WEB'. Skips events explicitly marked holiday:false. Fallback probe of time.ir (HTML parsing skipped). ALWAYS 200 {added, source, error?}; audit only if added>0.
4. **tasks** — GET ?userId=&mine=1&status= (JS sort: OPEN first → priority URGENT>HIGH>MEDIUM>LOW → dueDate asc; manual join assignedTo{id,name,color} + createdBy{id,name} — Task model has no Prisma relations); POST (notify assignee); PATCH start/pause{pauseReason}/done (+3 pts, +5 URGENT via pointsLog+user.points increment, notify creator)/reopen/cancel/edit (notify new assignee on change). Audits TASK_*.
5. **sops** — GET (department, title sort, steps parsed to array); POST/PATCH (steps JSON.stringify); DELETE ?id=. Audits SOP_*.
6. **wall** — GET (pinned desc, createdAt desc, take 100, author {id,name,color}); POST (+2 pts 'اشتراک‌گذاری اطلاع در دیوار دیجیتال'); PATCH {id,pinned}. Audits WALL_POST / WALL_PIN.
7. **notes** — GET ?userId= (updatedAt desc); POST/PATCH/DELETE. **NO audit** (private).
8. **feedback** — GET desc; POST {content, rating? 1..5}. **NO audit** (anonymous).
9. **ideas** — GET (author join, desc); POST (+3 pts 'ارسال ایده'); PATCH {id,status,decision,decidedById} → decidedAt, +20 ACCEPTED / +50 IMPLEMENTED (award guarded by status transition to prevent double-award), notify owner 'ایده شما پیگیری شد'. Audit IDEA_SUBMIT / IDEA_DECIDE.
10. **conversations** — GET ?userId= (both directions; other{id,name,color}, lastMessage/lastAt, unread = messages senderId≠userId && readAt null; sorted lastAt desc); POST find-or-create either direction → {conversation:{id}}.
11. **messages** — GET ?conversationId=&userId= (marks not-from-user as read **inside GET**, returns asc); POST (create + notify other participant 'پیام جدید' body 60 chars, audit MESSAGE_SEND); PATCH {conversationId,userId} mark all read.
12. **audit** — GET ?limit= (default 100, max 500)&entity=&userId=; ?stats=1 → {stats: top 20 by userName count, entities by entity count} via groupBy.
13. **points** — GET ?userId= (desc, 50); POST (create + user.points increment + notify 'امتیاز جدید' + audit POINTS_AWARD).
14. **planograms** — GET (updatedAt desc, assignedTo join, layout parsed); POST (layout object → JSON.stringify); PATCH update (blocked if ARCHIVED)/publish (publishedAt + notify assignee 'پلانوگرام جدید')/archive. Audits PLANOGRAM_*.
15. **warehouse-requests** — GET (product {id,name,sellPrice,stock} + requestedBy joins, OPEN first then createdAt desc); POST (notify INVENTORY_SUPERVISOR); PATCH prepare (preparedAt, notify requester 'درخواست آماده شد')/receive (**increments product.stock by qty**)/cancel. Audits WAREHOUSE_REQUEST_*.
16. **customer-requests** — GET (count desc, updatedAt desc, requestedBy join); POST with Persian name normalization (ي→ی, ك→ک, ZWNJ→space, collapse ws): duplicate → count+1 (notify PRODUCT_MANAGER+GENERAL_MANAGER at count 3 & 5), new → create +1 pt 'ثبت درخواست مشتری'; PATCH {id,note}. Audits CUSTOMER_REQUEST_*.
17. **customers** — GET ?q= (name/phone contains, createdAt desc); POST/PATCH. Audits CUSTOMER_CREATE/UPDATE.
18. **preorders** — GET ?status=&salespersonId= (PENDING first then createdAt desc; salesperson/cashier joins — no Prisma relations on PreOrder, items parsed from JSON); POST (total=Σ qty*sellPrice, notify CASHIER 'پیش‌صورتحساب جدید از فروشنده'); PATCH prepare (cashierId, notify salesperson 'سفارش شما آماده شد')/done (+2 pts salesperson)/cancel. Audits PREORDER_*.
19. **notifications** — GET ?userId=&limit=30 (max 200) → {notifications, unread count}; PATCH {id} one or {all:true,userId} mark all.
20. **settings** — GET → {settings: Record<string,string>}; PATCH {key,value} upsert. Audit SETTING.

## Deviations
- **Idea.decidedById**: schema has no `decidedById` column on Idea (only decidedAt/decision). Request's `decidedById` is accepted and used for the audit log, but not persisted on the Idea row (would fail Prisma otherwise; prisma/ is out of my scope).
- Role-targeted notifications exclude the acting user (avoid self-notify).
- Task/mine=1 treated as alias of assignedToId=userId filter.
- customers ?q= uses Prisma `contains` (SQLite contains = case-insensitive for ASCII only).
- Error responses use 400/500 only (per code rules), including role-denial (400).

## Verification
- `bun run lint` → 0 errors (1 pre-existing warning in kit.tsx, not mine).
- `bunx tsc --noEmit` filtered to my 20 files → 0 errors.
- Prisma accessor names verified against generated client (sOP, wallPost, preOrder, …).
- jalaali-js `toGregorian` named export verified.
- Dev server was not running (port 3000 not listening) and starting it is forbidden → no HTTP smoke test; runtime behavior rests on the checks above.

## Stage Summary
- All 3-b secondary APIs implemented per contract, audit/notify/points conventions honored; ready for frontend agents 5-x.
