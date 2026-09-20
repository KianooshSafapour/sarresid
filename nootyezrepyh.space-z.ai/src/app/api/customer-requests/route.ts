import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

function normalizeName(s: string): string {
  return String(s || '')
    .replace(/[\u200c\u200f\u200e\u064b-\u0652]/g, '')
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase()
}

// ============ GET: list (aggregated by name, count desc) ============

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const [requests, users] = await Promise.all([
    db.customerRequest.findMany({ orderBy: [{ count: 'desc' }, { createdAt: 'desc' }], take: 200 }),
    db.user.findMany({ select: { id: true, name: true } }),
  ])
  const userMap = new Map(users.map((u) => [u.id, u.name]))

  return Response.json({
    requests: requests.map((r) => ({
      id: r.id,
      productName: r.productName,
      details: r.details,
      count: r.count,
      requestedById: r.requestedById,
      requestedByName: userMap.get(r.requestedById) || '—',
      status: r.status,
      createdAt: r.createdAt,
    })),
  })
}

// ============ POST: add (auto-increment count when same productName) ============

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const body = (await req.json().catch(() => null)) as { productName?: string; details?: string } | null
  const productName = String(body?.productName || '').trim()
  const details = String(body?.details || '').trim() || null
  if (!productName) return Response.json({ error: 'نام کالا الزامی است' }, { status: 400 })

  const key = normalizeName(productName)
  const existing = await db.customerRequest.findMany({ where: { status: { not: 'RESOLVED' } } })
  const match = existing.find((r) => normalizeName(r.productName) === key)

  if (match) {
    const updated = await db.customerRequest.update({
      where: { id: match.id },
      data: {
        count: { increment: 1 },
        requestedById: session.id,
        details: details || match.details,
      },
    })
    await logAudit(session.id, session.name, 'CUSTOMER_REQUEST_INCREMENT', 'CUSTOMER_REQUEST', match.id, {
      productName: updated.productName,
      count: updated.count,
    })
    return Response.json({ request: updated, incremented: true })
  }

  const created = await db.customerRequest.create({
    data: {
      productName,
      details,
      count: 1,
      requestedById: session.id,
      status: 'OPEN',
    },
  })
  await logAudit(session.id, session.name, 'CREATE_CUSTOMER_REQUEST', 'CUSTOMER_REQUEST', created.id, { productName })
  return Response.json({ request: created, incremented: false }, { status: 201 })
}
