import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit } from '@/lib/audit'

interface PlanogramOut {
  id: string
  name: string
  rows: number
  cols: number
  cells: (string | null)[]
  assignedTo: string | null
  assignedUser: { id: string; name: string; color: string } | null
  status: string
  createdById: string
  creatorName: string
  createdAt: Date
  updatedAt: Date
}

export function planogramOut(
  p: {
    id: string; name: string; rows: number; cols: number; cells: string
    assignedTo: string | null; status: string; createdById: string
    createdAt: Date; updatedAt: Date
  },
  userMap: Map<string, { id: string; name: string; color: string }>,
): PlanogramOut {
  let cells: (string | null)[] = []
  try { cells = JSON.parse(p.cells || '[]') } catch { cells = [] }
  return {
    id: p.id,
    name: p.name,
    rows: p.rows,
    cols: p.cols,
    cells,
    assignedTo: p.assignedTo,
    assignedUser: p.assignedTo ? userMap.get(p.assignedTo) || null : null,
    status: p.status,
    createdById: p.createdById,
    creatorName: userMap.get(p.createdById)?.name || '—',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }
}

// ============ GET: list (managers: all, others: assigned to me) ============

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const isManager = canUser(session.roles, PERMISSIONS.MANAGE_PLANOGRAM)

  const planograms = await db.planogram.findMany({
    where: isManager ? {} : { assignedTo: session.id },
    orderBy: { updatedAt: 'desc' },
  })

  const users = await db.user.findMany({ select: { id: true, name: true, color: true } })
  const userMap = new Map(users.map((u) => [u.id, u]))

  return Response.json({ planograms: planograms.map((p) => planogramOut(p, userMap)) })
}

// ============ POST: create (manager) ============

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_PLANOGRAM)) {
    return Response.json({ error: 'اجازه مدیریت پلانوگرام را ندارید' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as { name?: string; rows?: number; cols?: number } | null
  const name = String(body?.name || '').trim()
  const rows = Math.min(8, Math.max(2, Math.round(Number(body?.rows) || 4)))
  const cols = Math.min(12, Math.max(3, Math.round(Number(body?.cols) || 6)))
  if (!name) return Response.json({ error: 'نام پلانوگرام الزامی است' }, { status: 400 })

  const created = await db.planogram.create({
    data: {
      name,
      rows,
      cols,
      cells: JSON.stringify(Array.from({ length: rows * cols }, () => null)),
      status: 'DRAFT',
      createdById: session.id,
    },
  })

  await logAudit(session.id, session.name, 'CREATE_PLANOGRAM', 'PLANOGRAM', created.id, { name, rows, cols })

  const users = await db.user.findMany({ select: { id: true, name: true, color: true } })
  const userMap = new Map(users.map((u) => [u.id, u]))
  return Response.json({ id: created.id, planogram: planogramOut(created, userMap) }, { status: 201 })
}
