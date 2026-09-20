import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'

// GET /api/companies — list with provider counts
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const companies = await db.company.findMany({
    include: { _count: { select: { providers: true } } },
    orderBy: { name: 'asc' },
  })
  return ok({
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      notes: c.notes,
      providerCount: c._count.providers,
    })),
  })
}

// POST /api/companies — create company (managers)
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.isManager) return fail('دسترسی غیرمجاز', 403)

  const body = (await req.json()) as { name?: string; kind?: string; notes?: string }
  const name = (body.name ?? '').trim()
  if (!name) return fail('نام شرکت الزامی است')

  const exists = await db.company.findUnique({ where: { name } })
  if (exists) return fail('شرکتی با این نام قبلاً ثبت شده است')

  const created = await db.company.create({
    data: {
      name,
      kind: ['MANUFACTURER', 'DISTRIBUTION_CENTER', 'BOTH'].includes(body.kind ?? '')
        ? body.kind!
        : 'MANUFACTURER',
      notes: body.notes?.trim() || null,
    },
  })
  await logActivity(user.id, user.name, 'ایجاد شرکت', 'Company', created.id, name)
  return ok({ success: true, id: created.id })
}
