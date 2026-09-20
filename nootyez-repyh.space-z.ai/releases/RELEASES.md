# Hyper Zeytoon — Releases & Restore Points

## v0.1.0-alpha «Hello, World» (2026-09-11)

The first reliable & stable baseline of the Hyper Zeytoon Operations Platform.
If a future change breaks anything, restore this exact version.

### Restore methods

**1. Git tag (preferred):**
```bash
git checkout v0.1.0-alpha-hello-world
# or view diff against it:
git diff v0.1.0-alpha-hello-world -- src
```

**2. Offline archive:**
```bash
tar -xzf releases/hyper-zeytoon-v0.1.0-alpha-hello-world.tar.gz -C restore-dir/
```
The archive contains the full source tree at the moment the tag was cut
(src/, prisma/, scripts/, config — no node_modules, no build output, no database).

> Note: the SQLite database (`db/custom.db`) is runtime data, not part of the tag.
> Back it up separately if you need the data snapshot too.

### What's inside v0.1.0-alpha

Full order→delivery→acceptance→accounting→payment pipeline (Holoo XLS import/export),
barcode scanning (keyboard + camera + analytics + leaderboard), supplier price
round-trip (per-supplier + all-suppliers workbook), warehouse requests, planogram,
CRM, tasks, SOPs, team wall, gamification, Jalali cheques, audit trail, notifications,
8am digest, stale-price nudges, scan-to-receive focus, Persian RTL luxury UI.
