import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const [planograms, products, preorders] = await Promise.all([
    db.planogram.findMany({ orderBy: { updatedAt: 'desc' } }),
    db.product.findMany({ where: { active: true } }),
    db.preOrder.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) }, status: { not: 'CANCELLED' } },
      select: { items: true },
    }),
  ])
  // سرعت فروش ۳۰ روز اخیر برای رنگ‌آمیزی قفسه‌ها بر اساس تقاضا
  const sales30 = new Map<string, number>()
  for (const po of preorders) {
    try {
      for (const it of JSON.parse(po.items || '[]') as { productId?: string; qty: number }[]) {
        if (it.productId) sales30.set(it.productId, (sales30.get(it.productId) || 0) + (it.qty || 0))
      }
    } catch { /* skip malformed rows */ }
  }
  return json({
    planograms: planograms.map((pl) => ({
      ...pl,
      layout: JSON.parse(pl.layout || '[]'),
      cells: (JSON.parse(pl.layout || '[]') as any[]).flat().filter(Boolean).length,
    })),
    productMap: Object.fromEntries(
      products.map((p) => [p.id, { id: p.id, name: p.name, stock: p.stock, reorderLevel: p.reorderLevel, imageUrl: p.imageUrl, category: p.category, sales30: sales30.get(p.id) || 0 }])
    ),
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me || !['GM', 'PM', 'OM'].includes(me.role))
    return fail('فقط مدیریت می‌تواند پلانوگرام بسازد', 403)
  const body = await req.json()
  if (!body.name) return fail('نام پلانوگرام الزامی است')
  const rows = Number(body.rows) || 3
  const cols = Number(body.cols) || 6
  const planogram = await db.planogram.create({
    data: {
      name: body.name,
      section: body.section || '',
      rows,
      cols,
      layout: JSON.stringify(Array.from({ length: rows }, () => Array(cols).fill(null))),
      status: 'DRAFT',
    },
  })
  await logActivity(me, 'ایجاد پلانوگرام', 'planogram', planogram.id, body.name)
  return json({ planogram: { ...planogram, layout: JSON.parse(planogram.layout) } }, 201)
}
