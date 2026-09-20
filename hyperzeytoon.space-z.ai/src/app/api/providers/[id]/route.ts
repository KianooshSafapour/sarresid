import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { parseProviderExtras } from '../route'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/providers/[id] — edit provider + add/remove company links (managers)
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await requireUser(req)
  if (!user?.isManager) return fail('دسترسی غیرمجاز', 403)
  const { id } = await params

  const provider = await db.provider.findUnique({ where: { id }, include: { companies: true } })
  if (!provider) return fail('تأمین‌کننده یافت نشد', 404)

  const body = (await req.json()) as {
    name?: string
    phone?: string | null
    kind?: string
    color?: string
    notes?: string | null
    paymentTermsDays?: unknown
    city?: unknown
    province?: unknown
    addCompanyIds?: string[]
    removeCompanyIds?: string[]
  }

  const data: Record<string, unknown> = {}
  if (body.name?.trim()) data.name = body.name.trim()
  if (body.phone !== undefined) data.phone = body.phone?.trim() || null
  if (body.kind) data.kind = body.kind === 'DIRECT' ? 'DIRECT' : 'DISTRIBUTOR'
  if (body.color) data.color = body.color
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null

  // optional supply-network fields (task 9-a) — undefined = no change, empty = clear
  const extrasPayload: Record<string, unknown> = {}
  if (body.paymentTermsDays !== undefined) extrasPayload.paymentTermsDays = body.paymentTermsDays
  if (body.city !== undefined) extrasPayload.city = body.city
  if (body.province !== undefined) extrasPayload.province = body.province
  if (Object.keys(extrasPayload).length) {
    const extras = parseProviderExtras(extrasPayload)
    if (!extras.ok) return fail(extras.error)
    data.paymentTermsDays = extras.value.paymentTermsDays
    data.city = extras.value.city
    data.province = extras.value.province
  }

  if (Object.keys(data).length) {
    await db.provider.update({ where: { id }, data })
  }

  if (body.addCompanyIds?.length) {
    for (const companyId of body.addCompanyIds) {
      const exists = provider.companies.some((pc) => pc.companyId === companyId)
      if (!exists) {
        await db.providerCompany.create({ data: { providerId: id, companyId } }).catch(() => null)
      }
    }
  }
  if (body.removeCompanyIds?.length) {
    for (const companyId of body.removeCompanyIds) {
      await db.providerCompany
        .delete({ where: { providerId_companyId: { providerId: id, companyId } } })
        .catch(() => null)
    }
  }

  await logActivity(user.id, user.name, 'ویرایش تأمین‌کننده', 'Provider', id, provider.name)
  return ok({ success: true })
}
