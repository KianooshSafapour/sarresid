import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, requireUser, logActivity, notifyRoles } from '@/lib/server-utils'
import { toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/** inventory team + managers */
function canCount(user: { isManager: boolean; roleKeys: string[] }) {
  return user.isManager || user.roleKeys.includes('inventory')
}

const ITEM_SELECT = {
  id: true,
  productId: true,
  systemStock: true,
  countedQty: true,
  countedAt: true,
  countedByName: true,
  note: true,
  product: {
    select: {
      id: true,
      name: true,
      altName: true,
      unit: true,
      category: true,
      brand: true,
      buyPrice: true,
      stock: true,
      image: true,
      barcodes: { select: { code: true }, take: 3, orderBy: { createdAt: 'asc' as const } },
    },
  },
}

// ---------- GET: session detail with items ----------
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canCount(user)) return fail('دسترسی به تیم انبار و مدیریت محدود است', 403)

  const { id } = await params
  const session = await db.stockCount.findUnique({
    where: { id },
    include: { items: { orderBy: { createdAt: 'asc' }, select: ITEM_SELECT } },
  })
  if (!session) return fail('جلسه جرد یافت نشد', 404)

  const counted = session.items.filter((i) => i.countedQty !== null)
  const diffs = counted.filter((i) => i.countedQty !== i.systemStock)
  const diffValue = diffs.reduce(
    (sum, i) => sum + (i.countedQty! - i.systemStock) * i.product.buyPrice,
    0
  )

  return ok({
    session: {
      id: session.id,
      code: session.code,
      status: session.status,
      scope: session.scope,
      category: session.category,
      note: session.note,
      createdByName: session.createdByName,
      createdAt: session.createdAt,
      committedAt: session.committedAt,
      committedByName: session.committedByName,
    },
    items: session.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.product.name,
      altName: i.product.altName,
      unit: i.product.unit,
      category: i.product.category,
      brand: i.product.brand,
      image: i.product.image,
      buyPrice: i.product.buyPrice,
      currentStock: i.product.stock, // live stock (differs from snapshot if stock moved during session)
      systemStock: i.systemStock,
      countedQty: i.countedQty,
      countedAt: i.countedAt,
      countedByName: i.countedByName,
      note: i.note,
      barcodes: i.product.barcodes.map((b) => b.code),
    })),
    stats: {
      totalItems: session.items.length,
      countedItems: counted.length,
      diffItems: diffs.length,
      diffValue: Math.round(diffValue),
      shortageValue: Math.round(
        diffs.filter((i) => i.countedQty! < i.systemStock)
          .reduce((s, i) => s + (i.systemStock - i.countedQty!) * i.product.buyPrice, 0)
      ),
      surplusValue: Math.round(
        diffs.filter((i) => i.countedQty! > i.systemStock)
          .reduce((s, i) => s + (i.countedQty! - i.systemStock) * i.product.buyPrice, 0)
      ),
    },
  })
}

// ---------- POST: actions on a session ----------
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canCount(user)) return fail('اجازه ثبت جرد را ندارید', 403)

  const { id } = await params
  const session = await db.stockCount.findUnique({ where: { id } })
  if (!session) return fail('جلسه جرد یافت نشد', 404)

  const body = await req.json().catch(() => null)
  const action = body?.action as string

  // ----- record single count -----
  if (action === 'count') {
    if (session.status !== 'IN_PROGRESS')
      return fail('این جلسه جرد بسته شده است', 409)
    const productId = typeof body?.productId === 'string' ? body.productId : ''
    const countedQty = body?.countedQty
    if (!productId || !Number.isFinite(Number(countedQty)) || Number(countedQty) < 0)
      return fail('تعداد شمرده‌شده نامعتبر است', 400)

    const item = await db.stockCountItem.findUnique({
      where: { countId_productId: { countId: session.id, productId } },
      include: { product: { select: { name: true } } },
    })
    if (!item) return fail('این کالا در محدوده این جلسه جرد نیست', 404)

    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 300) : null
    await db.stockCountItem.update({
      where: { id: item.id },
      data: {
        countedQty: Math.round(Number(countedQty)),
        countedAt: new Date(),
        countedByName: user.name,
        note,
      },
    })
    return ok({ ok: true, name: item.product.name })
  }

  // ----- bulk count (fast entry / scanner session) -----
  if (action === 'bulk_count') {
    if (session.status !== 'IN_PROGRESS')
      return fail('این جلسه جرد بسته شده است', 409)
    const rows: { productId: string; countedQty: number }[] = Array.isArray(body?.items)
      ? body.items
      : []
    if (!rows.length) return fail('ردیفی برای ثبت نیست', 400)

    let applied = 0
    const errors: string[] = []
    for (const r of rows) {
      const qty = Number(r?.countedQty)
      if (!r?.productId || !Number.isFinite(qty) || qty < 0) {
        errors.push('ردیف نامعتبر')
        continue
      }
      const res = await db.stockCountItem.updateMany({
        where: { countId: session.id, productId: r.productId },
        data: {
          countedQty: Math.round(qty),
          countedAt: new Date(),
          countedByName: user.name,
        },
      })
      applied += res.count
    }
    return ok({ applied, errors })
  }

  // ----- commit: apply differences to stock -----
  if (action === 'commit') {
    if (session.status !== 'IN_PROGRESS')
      return fail('این جلسه جرد قبلاً بسته شده است', 409)

    const items = await db.stockCountItem.findMany({
      where: { countId: session.id, countedQty: { not: null } },
      include: { product: { select: { name: true, buyPrice: true } } },
    })
    if (!items.length)
      return fail('هنوز هیچ ردیفی شمرده نشده است', 400)

    const diffs = items.filter((i) => i.countedQty !== i.systemStock)

    // transactional stock adjustment + session close
    const result = await db.$transaction(async (tx) => {
      for (const i of diffs) {
        await tx.product.update({
          where: { id: i.productId },
          data: { stock: i.countedQty! },
        })
      }
      const closed = await tx.stockCount.update({
        where: { id: session.id },
        data: { status: 'COMMITTED', committedAt: new Date(), committedByName: user.name },
      })
      return closed
    })

    const shortage = diffs.filter((i) => i.countedQty! < i.systemStock)
    const surplus = diffs.filter((i) => i.countedQty! > i.systemStock)
    const netValue = diffs.reduce(
      (sum, i) => sum + (i.countedQty! - i.systemStock) * i.product.buyPrice,
      0
    )

    await logActivity(
      user.id,
      user.name,
      'بستن جرد و اصلاح موجودی',
      'stockCount',
      session.id,
      `${session.code}: ${toFaDigits(diffs.length)} مغایرت از ${toFaDigits(items.length)} قلم شمرده‌شده — کسری ${toFaDigits(shortage.length)} / مازاد ${toFaDigits(surplus.length)} — اثر ارزشی ${Math.round(netValue).toLocaleString('fa-IR')} تومان`
    )
    await notifyRoles(
      ['gm', 'om', 'accountant'],
      'جرد انبار بسته شد',
      `${user.name} جرد ${session.code} را بست — ${toFaDigits(diffs.length)} مغایرت اصلاح شد (${toFaDigits(shortage.length)} کسری، ${toFaDigits(surplus.length)} مازاد)`,
      'INFO',
      'stock-count',
      user.id
    )

    return ok({
      ok: true,
      code: result.code,
      adjusted: diffs.length,
      counted: items.length,
      shortage: shortage.length,
      surplus: surplus.length,
      netValue: Math.round(netValue),
    })
  }

  // ----- cancel -----
  if (action === 'cancel') {
    if (session.status !== 'IN_PROGRESS')
      return fail('این جلسه جرد قبلاً بسته شده است', 409)
    await db.stockCount.update({
      where: { id: session.id },
      data: { status: 'CANCELLED' },
    })
    await logActivity(user.id, user.name, 'لغو جلسه جرد', 'stockCount', session.id, session.code)
    return ok({ ok: true })
  }

  return fail('عملیات نامعتبر', 400)
}
