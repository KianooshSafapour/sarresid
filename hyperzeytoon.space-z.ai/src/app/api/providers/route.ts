import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { normalizeName } from '../products/shared'

// ---------- optional supply-network fields (task 9-a) ----------
// paymentTermsDays: agreed cheque window (0..365) · city/province: ≤40 chars
export function parseProviderExtras(body: {
  paymentTermsDays?: unknown
  city?: unknown
  province?: unknown
}): { ok: true; value: { paymentTermsDays: number | null; city: string | null; province: string | null } } | { ok: false; error: string } {
  let paymentTermsDays: number | null = null
  if (body.paymentTermsDays !== undefined && body.paymentTermsDays !== null && body.paymentTermsDays !== '') {
    const n = Math.floor(Number(body.paymentTermsDays))
    if (!Number.isFinite(n) || n < 0 || n > 365) return { ok: false, error: 'شرایط پرداخت (روز چک) باید عددی بین ۰ تا ۳۶۵ باشد' }
    paymentTermsDays = n
  }
  const str = (v: unknown, label: string): string | null | { ok: false; error: string } => {
    if (v === undefined || v === null) return null
    const s = String(v).trim()
    if (!s) return null
    if (s.length > 40) return { ok: false, error: `${label} حداکثر ۴۰ نویسه است` }
    return s
  }
  const city = str(body.city, 'شهر')
  if (typeof city === 'object' && city !== null && 'error' in city) return city
  const province = str(body.province, 'استان')
  if (typeof province === 'object' && province !== null && 'error' in province) return province
  return { ok: true, value: { paymentTermsDays, city: city as string | null, province: province as string | null } }
}

// brand ↔ company fuzzy matching
const STOPWORDS = new Set([
  'صنایع', 'شرکت', 'گروه', 'مرکز', 'توزیع', 'بازرگانی', 'جنوبشرق', 'co', 'company', 'ltd', 'و',
])

function tokensOf(name: string): string[] {
  return normalizeName(name)
    .split(/[\s()\-–_/‌.,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
}

type MiniProduct = { id: string; name: string; brand: string | null; sellPrice: number; stock: number; minStock: number; image: string | null; unit: string }

function matchProducts(companyTokens: string[], companyName: string, products: MiniProduct[]) {
  const cn = normalizeName(companyName)
  const hits = products.filter((p) => {
    const b = normalizeName(p.brand ?? '')
    if (!b || b.length < 2) return false
    if (cn === b) return true
    // either direction contains on full name
    if (cn.includes(b) || b.includes(cn)) return true
    // token-level match
    return companyTokens.some((t) => b.includes(t) || (b.length >= 3 && t.includes(b)))
  })
  if (hits.length) return hits
  // fallback: top products by stock (capped)
  return [...products].sort((a, b) => b.stock - a.stock).slice(0, 12)
}

// GET /api/providers — supply network with companies + matched products
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const [providers, products] = await Promise.all([
    db.provider.findMany({
      include: { companies: { include: { company: true } } },
      orderBy: { name: 'asc' },
    }),
    db.product.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, brand: true, sellPrice: true, stock: true, minStock: true, image: true, unit: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const result = providers.map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    kind: p.kind,
    color: p.color,
    notes: p.notes,
    paymentTermsDays: p.paymentTermsDays,
    city: p.city,
    province: p.province,
    companies: p.companies.map((pc) => {
      const tokens = tokensOf(pc.company.name)
      const matched = matchProducts(tokens, pc.company.name, products)
      return {
        id: pc.company.id,
        name: pc.company.name,
        kind: pc.company.kind,
        note: pc.note,
        isDirect: pc.isDirect,
        productCount: matched.length,
        products: matched.slice(0, 12),
      }
    }),
  }))

  return ok({ providers: result })
}

// POST /api/providers — create provider with company links (managers)
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.isManager) return fail('دسترسی غیرمجاز', 403)

  const body = (await req.json()) as {
    name?: string
    phone?: string
    kind?: string
    color?: string
    notes?: string
    paymentTermsDays?: unknown
    city?: unknown
    province?: unknown
    companyIds?: string[]
  }
  const name = (body.name ?? '').trim()
  if (!name) return fail('نام تأمین‌کننده الزامی است')

  const extras = parseProviderExtras(body)
  if (!extras.ok) return fail(extras.error)

  const exists = await db.provider.findFirst({ where: { name } })
  if (exists) return fail('تأمین‌کننده‌ای با این نام قبلاً ثبت شده است')

  const created = await db.provider.create({
    data: {
      name,
      phone: body.phone?.trim() || null,
      kind: body.kind === 'DIRECT' ? 'DIRECT' : 'DISTRIBUTOR',
      color: body.color || '#8A6F3C',
      notes: body.notes?.trim() || null,
      paymentTermsDays: extras.value.paymentTermsDays,
      city: extras.value.city,
      province: extras.value.province,
      companies: { create: (body.companyIds ?? []).map((companyId) => ({ companyId })) },
    },
  })
  await logActivity(user.id, user.name, 'ایجاد تأمین‌کننده', 'Provider', created.id, name)
  return ok({ success: true, id: created.id })
}
