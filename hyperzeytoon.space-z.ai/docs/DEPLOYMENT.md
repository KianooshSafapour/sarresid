# راهنمای استقرار — Hyper Zeytoon Platform
# Deployment Guide — Hyper Zeytoon Platform

Two paths are documented:
- **Path A (today):** deploy THIS build (Next.js 16 + SQLite) on your internal server with Docker Compose. Zero code changes needed.
- **Path B (evolution):** migrate to the SvelteKit + PostgreSQL + Redis stack you prefer, reusing the same data model, API contracts and UI concepts 1:1.

---

## Path A — Deploy this build on your internal server (recommended first step)

### 1. Requirements
- Any machine on your shop LAN (even a Mini-PC / NUC) with Docker + Docker Compose:
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```
- The project folder (copy the whole `my-project` directory, or `git clone` your repo of it).

### 2. Dockerfile (create at project root)

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# install deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# prisma client
COPY prisma ./prisma
RUN bunx prisma generate

# build (standalone output already configured in next.config.ts)
COPY . .
ENV NODE_ENV=production
RUN bun run build

FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/db ./db
EXPOSE 3000
CMD ["bun", "server.js"]
```

### 3. docker-compose.yml (create at project root)

```yaml
services:
  zeytoon:
    build: .
    container_name: hyper-zeytoon
    restart: unless-stopped
    ports:
      - "80:3000"          # staff open http://zeytoon.local/
    environment:
      - DATABASE_URL=file:/app/db/custom.db
      - AUTH_SECRET=change-me-to-a-long-random-string
    volumes:
      - ./db:/app/db       # SQLite file persists here (BACKUP THIS FOLDER)
      - ./public/brand:/app/public/brand
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/auth/me"]
      interval: 30s
      timeout: 5s
      retries: 5
```

### 4. Run
```bash
docker compose up -d --build
# seed once (first time only):
docker compose exec zeytoon bun run scripts/seed.ts
```
- Staff access: `http://<server-ip>/` from any phone/laptop on the shop Wi-Fi.
- Give the server a fixed IP + a local DNS name (e.g. `zeytoon.local` via your router).

### 5. Backups (critical — do this from day one)
Add to the server's crontab (`crontab -e`):
```cron
# nightly 3:00 backup of the database into /backups with 30-day rotation
0 3 * * * sqlite3 /home/zeytoon/db/custom.db ".backup /backups/zeytoon-$(date +\%F).db" && find /backups -name 'zeytoon-*.db' -mtime +30 -delete
```

### 6. Updating
```bash
git pull            # or copy new sources
docker compose up -d --build
```

---

## Path B — Evolution to SvelteKit + PostgreSQL + Redis (your preferred stack)

The running system already defines everything you need — port it gradually, module by module, **without breaking the working system**:

| This build | Production stack mapping |
|---|---|
| Prisma schema (36 models) | **Same schema**, change datasource to `postgresql` — models are portable as-is |
| Next.js API routes (`/api/*`) | SvelteKit `+server.ts` endpoints with identical URLs & JSON contracts |
| Cookie session (HMAC) | Keep, or swap to `@auth/sveltekit` + PostgreSQL adapter |
| SQLite | **PostgreSQL 16** (docker image below) |
| In-memory polling (20s notifications / 3s chat) | **Redis** pub/sub + BullMQ for holiday-sync cron, overdue-order watchdog, notification fan-out |
| xlsx import/export | identical (`xlsx` package works in SvelteKit) |
| z-ai image-search endpoint | keep as a Node side-car service |

### docker-compose.yml (target stack)

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: zeytoon
      POSTGRES_PASSWORD: strong-password-here
      POSTGRES_DB: zeytoon
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U zeytoon"]
      interval: 10s

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data

  app:
    build: .            # your SvelteKit app Dockerfile (node:22-alpine, bun/npm build, node server)
    restart: unless-stopped
    ports:
      - "80:3000"
    environment:
      DATABASE_URL: postgres://zeytoon:strong-password-here@db:5432/zeytoon
      REDIS_URL: redis://redis:6379
      AUTH_SECRET: change-me
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started

volumes:
  pgdata:
  redisdata:
```

### Migration recipe (zero-downtime, non-breaking)
1. Stand the new stack up alongside the old one (different port).
2. Port one module at a time in this order: **Products → Orders → Deliveries → Accounting export → Cheques → People hub**. Each module reads/writes the same PostgreSQL tables the Prisma schema defines.
3. Migrate data once with `npx prisma migrate deploy` + a small ETL script from SQLite (`sqlite3 .dump` → transform → COPY INTO).
4. Flip the router/DNS to the new container when a module reaches parity. Keep the old container as fallback for a week.

---

## Holoo integration roadmap (accounting stays in Holoo)

**Phase 1 (works today):** the accountant downloads the ready-made **xlsx** per order (barcode, name, qty, unit price, discount, tax, VAT, line total — match your Holoo import template) and imports it. This alone removes the double-entry work Ms. Darvishi does today.

**Phase 2:** Holoo's SQL database (or Rakhisaz/JSON web API if your version has it) can be read directly:
- A nightly sync job (BullMQ + Redis) pulls the product list & stock → auto-updates this platform (replaces manual xls import).
- Sales data pulled daily powers the per-product "last month sales" cards and SPHL with **real** numbers.

**Phase 3 (optional):** a small print-bridge service on the cashier PC receives "sent-to-cashier" orders from this platform and injects them into Holoo's POS screen or prints a pre-receipt — the cashier only collects money.

## Iran holidays source
The cheque date-guard uses the built-in holiday table (curated official list + Fridays). Admins can add/edit any day in **مدیریت → تعطیلات** and press «همگام‌سازی». For fully automated refresh on your own server, add a cron job that scrapes time.ir monthly and `POST /api/holidays` the parsed days.

## Security checklist before go-live
- [ ] Change `AUTH_SECRET` to a long random string
- [ ] Change every staff PIN from the default `1234` (مدیریت → کاربران → تغییر رمز)
- [ ] Put the server on a staff-only Wi-Fi VLAN; do not port-forward to the internet
- [ ] Enable the nightly SQLite/PostgreSQL backup cron and TEST a restore once

---

# Hardware & Capacity Planning
*Appended by Task 9-g (research; sources accessed 2026-09-15). Sizing target: **16 concurrent staff** on the Path A build (Next.js 16 + Bun + Prisma/SQLite on the shop LAN).*

## 1. Workload profile (why 16 staff is small for this stack)
- Traffic is bursty and human-paced: ~16 users issuing short JSON requests (lists, dialogs, barcode lookups) plus occasional xlsx export/import and print popups. There is no public internet traffic — all load is internal.
- The dominant write patterns (order pipeline events, stock-count commits, activity log) are short transactions; the busiest single operation (stock-count commit) is already transactional in the code (worklog Task 9).
- Conclusion: CPU and RAM needs are modest; the critical constraints are **disk durability, single-writer behavior, and power quality**.

## 2. SQLite single-writer characteristics (read this before scaling ideas)
- SQLite in **WAL (Write-Ahead Logging)** mode allows **unlimited concurrent readers plus ONE writer at a time**; writers take turns (locking is database-level). WAL mode also gives better crash behavior because readers don't block the writer and vice-versa. Official docs: Write-Ahead Logging — https://www.sqlite.org/wal.html ; locking semantics — https://www.sqlite.org/lockingv3.html ; the "multiple READERS and a SINGLE writer" characterization appears verbatim in the official SQLite User Forum (thread "WAL journal and threading mode", Nov 9, 2020, sqlite.org forum) ; independent walkthrough: https://oldmoe.blog (Jul 8, 2024).
- Practical implications for us:
  1. Writes are serialized — fine at 16 staff (writes are milliseconds each), but long write transactions (bulk edits, big imports) delay everyone else's writes. Keep import batches chunked (the xls import already commits per-action).
  2. Set/enforce busy timeout so a queued writer waits instead of erroring (`?connection_limit=1&socket_timeout` / `busy_timeout` in the Prisma datasource config or `PRAGMA busy_timeout=5000`). Under contention the failure mode is a rare "database is locked", not corruption (source: WAL doc + community analysis https://skypilot.ai, Mar 4, 2025).
  3. **Do not** put the DB file on a network share (NFS/SMB) — WAL requires a filesystem with proper POSIX locking; keep it on local SSD. (SQLite official docs, same URLs.)
  4. When 16 staff grows to ~50+ *writing* concurrently, or multiple branches need one DB, that is the trigger for Path B (PostgreSQL) — not before.

## 3. Recommended mini-PC (Path A production)
| Component | Minimum | Recommended | Why |
|---|---|---|---|
| CPU | 4 cores / 4 threads | 4–8 cores (e.g. Intel i5-N305/i5-12th gen U, AMD Ryzen 5) | Next.js build is the only CPU-heavy event; runtime is light |
| RAM | 8 GB | 16 GB | App + OS + (future) Holoo middleware sidecar + backups |
| Disk | 256 GB SSD (SATA OK) | 512 GB NVMe SSD | SQLite file + WAL, 30-day backups, Docker images; SSD durability matters for WAL writes |
| Network | 1 GbE, fixed IP | + second NIC optional | Server on staff VLAN only (see security checklist) |
| Power | **UPS (line-interactive, ≥600 VA)** with USB signaling for graceful shutdown | + auto-shutdown agent (`nut`/vendor tool) | SQLite survives crashes (journal/WAL), but a clean shutdown avoids WAL replay and lets the backup cron finish |
| OS | Any Linux with Docker | Ubuntu LTS | Matches the Docker Compose deploy above |

Cost note (2026): any brand-name mini-PC in this class is a small fraction of one month's revenue for the shop; do not reuse a failing desktop for production.

## 4. Backup strategy (daily file copy + WAL checkpoint, offsite rotation)
1. **Pre-backup checkpoint:** before copying, flush the WAL into the main DB: `sqlite3 /path/db/custom.db "PRAGMA wal_checkpoint(TRUNCATE);"` — this keeps the `.db` file self-contained and the backup consistent. (WAL semantics per https://www.sqlite.org/wal.html.)
2. **Consistent file copy:** prefer SQLite's online backup API over raw `cp`: `sqlite3 db/custom.db ".backup '/backups/zeytoon-$(date +%F).db'"` (as the existing cron above already does). The two-step (checkpoint → .backup) is belt-and-suspenders.
3. **Retention/rotation:** keep 30 daily + 12 weekly-local copies (the crontab above rotates 30 days); GFS rotation (grandfather-father-son) is enough at this size.
4. **Offsite copy (3-2-1 rule):** keep **3** copies of the data, on **2** different media, with **1 offsite** — the standard rule (Veeam: https://www.veeam.com/blog/321-backup-rule.html ; SentinelOne, May 25, 2026: https://www.sentinelone.com/cybersecurity-101/cybersecurity/3-2-1-backup-strategy). Practical for a supermarket: every Friday the accountant copies the week's backup to an encrypted USB SSD kept **at home / another building** (offsite = "not in the same fire/flood/theft domain"), or to an encrypted cloud drive if internet allows.
5. **Verify copies:** a backup that was never restored is a hope, not a backup — the DR drill (§7) validates restores quarterly.

## 5. Monitoring checklist (5-minute daily glance)
- [ ] `GET /api/auth/me` healthcheck green (Docker healthcheck already configured above)
- [ ] Dashboard loads for a manager: briefing rows render = DB readable; create a throwaway task = DB writable
- [ ] `docker compose logs --since 24h zeytoon | grep -iE "error|locked|5xx"` — no surprises (SQLite "database is locked" here = busy-timeout tuning needed)
- [ ] Disk free ≥ 20% (`df -h`) — WAL + backups grow silently
- [ ] Last backup file exists and is >0 bytes and *newer than 24h* (`ls -lh /backups | tail`); restore-test file opens with `sqlite3 ... ".tables"`
- [ ] UPS self-test LED / event log clean; power events logged
- [ ] Weekly: reconciliation numbers sane (Reports KPIs vs Holoo total — see `HOLOO-APEX-INTEGRATION.md` §5.4 once sync runs)

## 6. Upgrade / rollback procedure using git tags
The repo is already tagged: **`v0.1-alpha-hello-world`** = the owner-approved stable build (worklog Task 14; commit `0dae20b`).
```bash
# Before any upgrade: snapshot DB + note current tag
sqlite3 db/custom.db ".backup '/backups/pre-upgrade-$(date +%F-%H%M).db'"
git fetch --tags && git tag            # list available versions

# Upgrade
git checkout v<new-tag> && docker compose up -d --build
# smoke test: login (PIN), dashboard, one order create→receive→accounting export

# Rollback (any time, minutes):
git checkout v0.1-alpha-hello-world
docker compose up -d --build
# if the DB schema moved forward (prisma db push), restore the pre-upgrade backup:
sqlite3 db/custom.db ".restore '/backups/pre-upgrade-<date>.db'"
```
Rules: **tag every owner-approved release** (`git tag -a vX.Y -m "…"`); never run an untagged build outside business hours; schema-changing upgrades require the DB backup step above (Prisma `db push` is forward-only for SQLite — rollback = restore file + old code).

## 7. Disaster-recovery drill (quarterly, 30–45 min, owner + one staff)
1. **Announce drill.** Pick a closed-hour slot. Nobody is allowed to "fix" until the checklist says so.
2. **Freeze & simulate:** stop the app container (`docker compose stop zeytoon`) — this simulates server loss.
3. **Restore on spare hardware** (or a wiped folder): install Docker → restore the repo at the last tag → copy the latest `/backups` file → `sqlite3 db/custom.db ".restore ..."` → `docker compose up -d`.
4. **Verify data currency:** latest order visible? cheque calendar matches the paper book? yesterday's stock count committed? Compare three known numbers against the pre-drill dashboard (order count, open cheques count, stock value KPI).
5. **Measure & record:** time-to-restore (target < 1 hour), gaps found (missing offsite copy, expired USB, wrong tag…), fix owner + deadline. Log the drill in the wall section (or a printed sheet kept with the UPS).
6. **Failover proof for offsite copy:** once a year, perform the drill using **only** the offsite USB — that copy is the real disaster plan; everything else is convenience.
