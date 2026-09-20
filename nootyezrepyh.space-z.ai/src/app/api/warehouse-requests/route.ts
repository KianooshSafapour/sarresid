import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit } from '@/lib/audit'

interface WReqOut {
  id: string
  productId: string
  productName: string
  quantity: number
  status: string
  requestedById: string
  requestedByName: string
  preparedByName: string | null
  createdAt: Date
  updatedAt: Date
}

function out(r: {
  id: string; productId: string; productName: string; quantity: number; status: string
  requestedById: string; preparedById: string | null
  createdAt: Date; updatedAt: Date
}, userMap: Map<string, string>): WReqOut {
  return {
    id: r.id,
    productId: r.productId,
    productName: r.productName,
    quantity: r.quantity,
    status: r.status,
    requestedById: r.requestedById,
    requestedByName: userMap.get(r.requestedById) || '—',
    preparedByName: r.preparedById ? userMap.get(r.preparedById) || null : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

async function userNameMap() {
  const users = await db.user.findMany({ select: { id: true, name: true } })
  return new Map(users.map((u) => [u.id, u.name]))
}

/** roles allowed to run the storekeeper queue (prepare/send) */
function isStorekeeper(roles: string[]): boolean {
  return roles.includes('INVENTORY_SUPERVISOR') ||
    roles.includes('GENERAL_MANAGER') ||
    roles.includes('OPERATION_MANAGER')
}

// ============ GET: mine / queue ============

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope') || (isStorekeeper(session.roles) ? 'all' : 'mine')

  let where: Record<string, unknown> = {}
  if (scope === 'mine') {
    where = { requestedById: session.id }
  } else if (scope === 'queue') {
    if (!isStorekeeper(session.roles)) {
      return Response.json({ error: 'اجازه مشاهده صف انبار را ندارید' }, { status: 403 })
    }
    where = { status: { in: ['PENDING', 'PREPARED'] } }
  }

  const [requests, userMap] = await Promise.all([
    db.warehouseRequest.findMany({ where: where as never, orderBy: { createdAt: 'desc' }, take: 200 }),
    userNameMap(),
  ])

  return Response.json({ requests: requests.map((r) => out(r, userMap)) })
}

// ============ POST: create (merchandiser / warehouse staff) ============

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const allowed = canUser(session.roles, PERMISSIONS.WAREHOUSE) || session.roles.includes('MERCHANDISER')
  if (!allowed) {
    return Response.json({ error: 'اجازه ثبت درخواست انبار را ندارید' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as { productId?: string; quantity?: number } | null
  const productId = String(body?.productId || '')
  const quantity = Number(body?.quantity)
  if (!productId) return Response.json({ error: 'انتخاب کالا الزامی است' }, { status: 400 })
  if (!quantity || quantity <= 0) return Response.json({ error: 'تعداد باید بزرگ‌تر از صفر باشد' }, { status: 400 })

  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product || !product.active) {
    return Response.json({ error: 'کالا یافت نشد' }, { status: 404 })
  }

  const created = await db.warehouseRequest.create({
    data: {
      productId,
      productName: product.name,
      quantity,
      requestedById: session.id,
      status: 'PENDING',
    },
  })

  await logAudit(session.id, session.name, 'CREATE_WAREHOUSE_REQUEST', 'WAREHOUSE_REQUEST', created.id, {
    productName: product.name,
    quantity,
  })

  const userMap = await userNameMap()
  return Response.json({ request: out(created, userMap) }, { status: 201 })
}
