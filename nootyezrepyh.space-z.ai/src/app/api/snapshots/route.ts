import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { APP_VERSION, APP_CODENAME, HELLO_WORLD_SNAPSHOT } from '@/lib/constants'
import { formatJalaliDateTime } from '@/lib/jalali'

/**
 * Version & restore-point management.
 * Snapshots are physical SQLite copies of db/custom.db stored in db/snapshots/.
 * Restore = pre-restore auto backup, then file swap with prisma reconnect.
 * Permission: IT_ADMIN / OPERATION_MANAGER / OWNER roles only.
 */

const SNAP_DIR = path.join(process.cwd(), 'db', 'snapshots')
const DB_PATH = path.join(process.cwd(), 'db', 'custom.db')
const RESTORE_ROLES = ['IT_ADMIN', 'OPERATION_MANAGER', 'OWNER']

interface SnapMeta {
  name: string
  label?: string
  at: string
  atJalali?: string
  note?: string
  createdBy?: string
  sizeBytes?: number
}

async function readIndex(): Promise<SnapMeta[]> {
  try {
    const raw = await fs.readFile(path.join(SNAP_DIR, 'index.json'), 'utf-8')
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

async function writeIndex(list: SnapMeta[]) {
  await fs.mkdir(SNAP_DIR, { recursive: true })
  await fs.writeFile(path.join(SNAP_DIR, 'index.json'), JSON.stringify(list, null, 2), 'utf-8')
}

function slug(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06FF-_ ]/g, '').replace(/\s+/g, '-').slice(0, 48)
}

/** Force WAL merge into the main db file so the copy is complete */
async function checkpoint() {
  try { await db.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)') } catch { /* best-effort */ }
}

async function copyDb(to: string) {
  await checkpoint()
  await fs.copyFile(DB_PATH, to)
}

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'ابتدا وارد سامانه شوید.' }, { status: 401 })
  const list = await readIndex()
  const withMeta = await Promise.all(list.map(async (m) => {
    let exists = false
    let sizeBytes = m.sizeBytes || 0
    try {
      const st = await fs.stat(path.join(SNAP_DIR, `${m.name}.db`))
      exists = true
      sizeBytes = st.size
    } catch { /* missing */ }
    return { ...m, exists, sizeBytes }
  }))
  return NextResponse.json({
    version: APP_VERSION,
    codename: APP_CODENAME,
    helloWorld: HELLO_WORLD_SNAPSHOT,
    snapshots: withMeta.sort((a, b) => (a.at < b.at ? 1 : -1)),
  })
}

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'ابتدا وارد سامانه شوید.' }, { status: 401 })
  if (!RESTORE_ROLES.some(r => user.roles.includes(r)))
    return NextResponse.json({ error: 'اجازه مدیریت نسخه‌ها را ندارید.' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const label: string = (body.label || '').trim()
  const note: string = (body.note || '').trim()
  const base = slug(label) || 'snapshot'
  const name = `${base}-${Date.now().toString(36)}`
  try {
    await copyDb(path.join(SNAP_DIR, `${name}.db`))
    const st = await fs.stat(path.join(SNAP_DIR, `${name}.db`))
    const list = await readIndex()
    const meta: SnapMeta = {
      name,
      label: label || name,
      at: new Date().toISOString(),
      atJalali: formatJalaliDateTime(new Date()),
      note,
      createdBy: user.name,
      sizeBytes: st.size,
    }
    list.push(meta)
    await writeIndex(list)
    await logAudit(user.id, user.name, 'ایجاد نسخه پشتیبان', 'SNAPSHOT', name, { label })
    return NextResponse.json({ ok: true, snapshot: meta })
  } catch (e) {
    return NextResponse.json({ error: 'ساخت نسخه پشتیبان ناموفق بود: ' + (e as Error).message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'ابتدا وارد سامانه شوید.' }, { status: 401 })
  if (!RESTORE_ROLES.some(r => user.roles.includes(r)))
    return NextResponse.json({ error: 'اجازه بازگردانی نسخه را ندارید.' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const name: string = String(body.name || '')
  const list = await readIndex()
  const meta = list.find(m => m.name === name)
  if (!meta) return NextResponse.json({ error: 'این نسخه یافت نشد.' }, { status: 404 })
  const snapPath = path.join(SNAP_DIR, `${name}.db`)
  try { await fs.access(snapPath) } catch {
    return NextResponse.json({ error: 'فایل نسخه پشتیبان یافت نشد.' }, { status: 404 })
  }
  try {
    // 1) auto-backup current state before overwriting
    const autoName = `auto-pre-restore-${Date.now().toString(36)}`
    await copyDb(path.join(SNAP_DIR, `${autoName}.db`))
    const st = await fs.stat(path.join(SNAP_DIR, `${autoName}.db`))
    list.push({
      name: autoName,
      label: `خودکار — قبل از بازگردانی ${meta.label || name}`,
      at: new Date().toISOString(),
      atJalali: formatJalaliDateTime(new Date()),
      createdBy: user.name,
      sizeBytes: st.size,
    })
    await writeIndex(list)
    // 2) swap the live database file
    await db.$disconnect()
    await fs.copyFile(snapPath, DB_PATH)
    await fs.rm(DB_PATH + '-wal', { force: true })
    await fs.rm(DB_PATH + '-shm', { force: true })
    // 3) reconnect prisma to the restored file
    const g = globalThis as unknown as { prisma?: unknown }
    g.prisma = undefined
    await db.$connect()
    await logAudit(user.id, user.name, 'بازگردانی نسخه پشتیبان', 'SNAPSHOT', name, { label: meta.label, autoBackup: autoName })
    return NextResponse.json({ ok: true, message: 'بازگردانی انجام شد. لطفاً صفحه را کامل بارگذاری کنید.', autoBackup: autoName })
  } catch (e) {
    try { await db.$connect() } catch { /* ignore */ }
    return NextResponse.json({ error: 'بازگردانی ناموفق بود: ' + (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'ابتدا وارد سامانه شوید.' }, { status: 401 })
  if (!RESTORE_ROLES.some(r => user.roles.includes(r)))
    return NextResponse.json({ error: 'اجازه حذف نسخه را ندارید.' }, { status: 403 })
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name') || ''
  if (name === HELLO_WORLD_SNAPSHOT)
    return NextResponse.json({ error: 'نسخه «Hello, World» محافظت‌شده است و قابل حذف نیست.' }, { status: 400 })
  const list = await readIndex()
  const next = list.filter(m => m.name !== name)
  if (next.length === list.length) return NextResponse.json({ error: 'این نسخه یافت نشد.' }, { status: 404 })
  await fs.rm(path.join(SNAP_DIR, `${name}.db`), { force: true })
  await writeIndex(next)
  await logAudit(user.id, user.name, 'حذف نسخه پشتیبان', 'SNAPSHOT', name)
  return NextResponse.json({ ok: true })
}
