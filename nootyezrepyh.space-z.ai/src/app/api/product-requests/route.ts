import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

// ============ GET: list suggestions ============

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const [requests, users] = await Promise.all([
    db.productRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    db.user.findMany({ select: { id: true, name: true } }),
  ])
  const userMap = new Map(users.map((u) => [u.id, u.name]))

  return Response.json({
    requests: requests.map((r) => ({
      id: r.id,
      productName: r.productName,
      details: r.details,
      suggestedById: r.suggestedById,
      suggestedByName: userMap.get(r.suggestedById) || '—',
      status: r.status,
      reviewedByName: r.reviewedById ? userMap.get(r.reviewedById) || null : null,
      createdAt: r.createdAt,
    })),
  })
}

// ============ POST: staff submit suggestion ============

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const body = (await req.json().catch(() => null)) as { productName?: string; details?: string } | null
  const productName = String(body?.productName || '').trim()
  const details = String(body?.details || '').trim() || null
  if (!productName) return Response.json({ error: 'نام کالا الزامی است' }, { status: 400 })

  const created = await db.productRequest.create({
    data: {
      productName,
      details,
      suggestedById: session.id,
      status: 'PENDING',
    },
  })
  await logAudit(session.id, session.name, 'CREATE_PRODUCT_REQUEST', 'PRODUCT_REQUEST', created.id, { productName })
  return Response.json({ request: created }, { status: 201 })
}
