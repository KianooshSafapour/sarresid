import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, requireUser, logActivity, notifyRoles } from '@/lib/server-utils'

export const dynamic = 'force-dynamic'

/** inventory team + managers (accountant/gm/om/owner/pm are isManager in seed) */
function canCount(user: { isManager: boolean; roleKeys: string[] }) {
  return user.isManager || user.roleKeys.includes('inventory')
}

function codeFor(now: Date, seq: number) {
  // JC-1405/06/19-003 (Jalali-based like other codes in the platform)
  const j = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => j.find((p) => p.type === t)?.value ?? ''
  const y = get('year').replace(/[^\d]/g, '')
  const m = get('month').padStart(2, '0')
  const d = get('day').padStart(2, '0')
  return `JC-${y}${m}${d}-${String(seq).padStart(3, '0')}`
}

// ---------- GET: list sessions ----------
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canCount(user)) return fail('دسترسی این بخش به تیم انبار و مدیریت محدود است', 403)

  const sessions = await db.stockCount.findMany({
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: {
      items: {
        select: { countedQty: true, systemStock: true, product: { select: { buyPrice: true } } },
      },
    },
  })

  const data = sessions.map((s) => {
    const counted = s.items.filter((i) => i.countedQty !== null)
    const diffs = counted.filter((i) => i.countedQty !== i.systemStock)
    const diffValue = diffs.reduce(
      (sum, i) => sum + (i.countedQty! - i.systemStock) * i.product.buyPrice,
      0
    )
    return {
      id: s.id,
      code: s.code,
      status: s.status,
      scope: s.scope,
      category: s.category,
      note: s.note,
      createdByName: s.createdByName,
      createdAt: s.createdAt,
      committedAt: s.committedAt,
      committedByName: s.committedByName,
      totalItems: s.items.length,
      countedItems: counted.length,
      diffItems: diffs.length,
      diffValue: Math.round(diffValue),
    }
  })

  return ok({ sessions: data })
}

// ---------- POST: create a new count session (snapshot stock) ----------
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canCount(user)) return fail('اجازه شروع جرد را ندارید', 403)

  const body = await req.json().catch(() => null)
  const scope = body?.scope === 'CATEGORY' ? 'CATEGORY' : body?.scope === 'SECTION' ? 'SECTION' : 'ALL'
  const category = typeof body?.category === 'string' ? body.category.trim() : ''
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : ''

  if (scope === 'CATEGORY' && !category) return fail('برای جرد یک دسته، دسته را انتخاب کنید')
  if (scope === 'SECTION' && !category) return fail('برای جرد یک بخش، بخش را انتخاب کنید')

  // only one open session at a time (prevents conflicting stock writes)
  const open = await db.stockCount.findFirst({ where: { status: 'IN_PROGRESS' } })
  if (open) return fail(`جرد باز وجود دارد (${open.code}) — ابتدا آن را ببندید`, 409)

  // SECTION scope → products physically placed on shelves of that planogram section
  let sectionProductIds: string[] | null = null
  if (scope === 'SECTION') {
    const shelves = await db.shelf.findMany({
      where: { section: category },
      select: { productId: true },
    })
    sectionProductIds = [...new Set(shelves.map((s) => s.productId).filter((v): v is string => !!v))]
    if (!sectionProductIds.length) return fail('در این بخش قفسه‌ای با کالا ثبت نشده است', 400)
  }

  const where = scope === 'CATEGORY'
    ? { status: 'ACTIVE' as const, category }
    : scope === 'SECTION'
      ? { status: 'ACTIVE' as const, id: { in: sectionProductIds! } }
      : { status: 'ACTIVE' as const }

  const products = await db.product.findMany({
    where,
    select: { id: true, stock: true },
    orderBy: { name: 'asc' },
  })
  if (!products.length) return fail('محصولی برای جرد در این محدوده یافت نشد', 400)

  const now = new Date()
  const last = await db.stockCount.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { code: true },
  })
  // simple per-day sequence
  const todayPrefix = codeFor(now, 0).slice(0, -3) // JC-XXXXXXXX-
  const seq = last?.code?.startsWith(todayPrefix)
    ? parseInt(last.code.slice(-3), 10) + 1
    : 1
  const code = codeFor(now, seq)

  const session = await db.stockCount.create({
    data: {
      code,
      scope,
      category: scope === 'ALL' ? null : category,
      note: note || null,
      createdById: user.id,
      createdByName: user.name,
      items: {
        create: products.map((p) => ({ productId: p.id, systemStock: p.stock })),
      },
    },
  })

  await logActivity(
    user.id,
    user.name,
    'شروع جلسه جرد انبار',
    'stockCount',
    session.id,
    `${scope === 'CATEGORY' ? `دسته ${category}` : scope === 'SECTION' ? `بخش ${category}` : 'همه محصولات'} — ${products.length} قلم`
  )
  await notifyRoles(
    ['gm', 'om', 'inventory'],
    'جرد انبار آغاز شد',
    `${user.name} جلسه جرد ${scope === 'CATEGORY' ? `دسته «${category}»` : scope === 'SECTION' ? `بخش «${category}»` : 'کل انبار'} را با ${products.length} قلم شروع کرد`,
    'INFO',
    'stock-count',
    user.id
  )

  return ok({ id: session.id, code: session.code, totalItems: products.length })
}
