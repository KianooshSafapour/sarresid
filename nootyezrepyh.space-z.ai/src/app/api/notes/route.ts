import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

const NOTE_COLORS = ['olive', 'gold', 'amber', 'rose']

/** GET /api/notes — strictly my private notes */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const notes = await db.note.findMany({
    where: { userId: session.id },
    orderBy: { updatedAt: 'desc' },
  })
  return Response.json(notes)
}

/** POST /api/notes — create private note */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const body = await req.json().catch(() => null) as { content?: string; color?: string } | null
  if (!body?.content?.trim()) {
    return Response.json({ error: 'متن یادداشت خالی است' }, { status: 400 })
  }

  const note = await db.note.create({
    data: {
      userId: session.id,
      content: body.content.trim().slice(0, 5000),
      color: NOTE_COLORS.includes(body.color || '') ? body.color! : 'olive',
    },
  })

  await logAudit(session.id, session.name, 'NOTE_CREATE', 'NOTE', note.id, {})
  return Response.json({ note }, { status: 201 })
}
