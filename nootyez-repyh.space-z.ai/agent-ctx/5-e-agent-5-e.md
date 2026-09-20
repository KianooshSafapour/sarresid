# Task 5-e — Frontend Sections (Messages / CRM / Profile / Admin / Audit)

Agent: agent-5-e
Date: 2026 (Task 5-e)

## Files created (only these 5)
1. `src/components/platform/MessagesSection.tsx`
2. `src/components/platform/CrmSection.tsx`
3. `src/components/platform/ProfileSection.tsx`
4. `src/components/platform/AdminSection.tsx`
5. `src/components/platform/AuditSection.tsx`

## Implementation notes per file

### MessagesSection
- Trust banner exact text. GET /api/conversations?userId= polled every 5s; users list once (self excluded).
- Desktop two-pane flex: left conv list (other user Avatar+name+color, last message, rose unread badge with fa digits, relative time → Jalali date for >24h), right chat pane (header Avatar+name, scroll area max-h-[50vh] pz-scroll, my bubbles right olive-gradient white text, theirs left white bordered, fmtJalaliTime small under each + read receipt for mine).
- Mobile: list ↔ chat switch via state, back button (ArrowRight) in chat header (md:hidden).
- Enter submits (shift not required); send → POST /api/messages then reload messages + convs; active conv polled every 4s; auto-scroll to bottom.
- New chat Modal: 2/3-col user grid (inactive users disabled) → POST /api/conversations → opens conv.

### CrmSection
- Tabs preorders/customers. Explainer card with exact friendly text.
- PREORDERS: GET polled 10s; salesperson status-change toasts computed from prev-status ref map (only for own preorders: PREPARED/DONE/CANCELLED messages; +2 pts mention on DONE).
- New preorder modal (SALESPERSON only): customer select OR new name input, product picker (GET /api/products?limit=500; search by name/nameFa/barcode; click adds row / increments), qty steppers (44px buttons), editable price (default sellPrice), note, live total; POST /api/preorders.
- Cards: customer name, salesperson Avatar, expandable items list (name ×qty line total Money), total, status chips PENDING amber / PREPARED violet / DONE emerald / CANCELLED stone, note, TimeAgo. PENDING gets subtle amber ring.
- CASHIER actions exactly as specced: PENDING → PrimaryButton 'آماده‌سازی شد' + hint 'محصولات را کنار صندوق بگذار' (PATCH action prepare, cashierId+userId); PREPARED → GoldButton 'تسویه/چاپ شد ✓' + hint 'در Holoo اسکن و رسید چاپ شد' (action done).
- CUSTOMERS: debounced q search → GET /api/customers?q=; cards with phone (fa digits), preference chips split by '،', created TimeAgo; add/edit modal (SALESPERSON/GM/OM) → POST/PATCH.

### ProfileSection
- GET /api/points?userId= (logs ≤50), /api/dashboard (staffPoints), /api/users (resolve awardedById names).
- Hero: 88px Avatar, name, RoleBadge, huge pz-gold-text points, level = floor(points/25)+1, ladder ['جوانه','شاخ و برگ','شکوفه','زیتون‌دار','استاد باغ'] min(level-1,4), gold-gradient progress bar (points%25)/25.
- Badge grid at 10/25/50/100/200/300 exact labels/emojis; earned = colored cards, unearned = grayscale + dashed + lock icon.
- History list: ±points pill (emerald/rose), reason, awardedById name, TimeAgo. Warm banner exact text. Leaderboard top-8 with rank medals, self highlighted '(شما)'.

### AdminSection
- Tabs users (only IT_ADMIN/OM/OWNER see it; default tab adapts) / settings / holidays.
- USERS: TableWrap (Avatar+name, RoleBadge, ⭐ points, active dot emerald/rose, edit 44px). Editor modal: name, 4-digit pin (blank=unchanged, numeric-only input), ROLES checkboxes, 6 preset color swatches, Switch active → PATCH/POST with userId/userName for audit.
- SETTINGS: 8 keys with Persian labels+hints; text rows save per-row when dirty (PATCH {key,value,userId}) → toast; holidayCheckEnabled is a Switch writing 'true'/'false'.
- HOLIDAYS: grouped by Jalali year (isoToJalali), rows show fmtJalali + title + source chip (WEB 'اینترنت 🌐' vs MANUAL 'دستی ✍️'), delete per row; add row = JalaliDateField + title → POST; PrimaryButton 'به‌روزرسانی از اینترنت 🌐' → POST /api/holidays/fetch → toast added N / source or error fallback; info card exact text.

### AuditSection
- Gate GENERAL_MANAGER/OPERATION_MANAGER/IT_ADMIN/OWNER else 'دسترسی محدود' EmptyState.
- GET /api/audit?limit=200 (+userId/entity filters refetch) + /api/audit?stats=1.
- 3 StatCards: actions today (computed vs today on loaded window), top actor (stats[0]), entities tracked (count + first 3 names).
- Filters: user select, entity select (from stats), client-side search across action/userName/entity/detail.
- Table in pz-scroll max-h-[65vh] with sticky thead: TimeAgo + fmtJalaliTime, actor Avatar+name, action chip (color by verb class: delete/rose, create/emerald, update/amber, else olive), entity #id, detail line-clamp-2. Trust banner exact text.

## Verification
- `bunx tsc --noEmit`: 0 errors in my 5 files (remaining project errors are pre-existing in other agents' files/page.tsx placeholders).
- `bun run lint`: 0 errors, 0 warnings in my files (3 pre-existing warnings in Login.tsx / ProductsSection.tsx / kit.tsx — not mine).
- Dev server log clean, no compile issues.

## Deviations
- MessagesSection: for conv rows older than 24h the list shows the Jalali date instead of a relative time (unread badge + last message per spec); chat bubbles always use fmtJalaliTime.
- ProfileSection: leaderboard comes from /api/dashboard staffPoints (top 8) as contract defines; rank medal colors gold/silver/bronze.
- AdminSection settings: numeric keys kept as free-text inputs (server stores strings); holidayCheckEnabled rendered as Switch for better UX.
- AuditSection: "today" count is computed over the fetched 200-row window (spec: compute); entity select sourced from stats endpoint.
- No new packages; sonner toast only; no blue/indigo primaries (olive/gold/cream only; kit's preset tones reused).
