import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Personal notes — private, NO audit logging.

// GET /api/notes?userId= → sorted updatedAt desc
export async function GET(request: Request) {
  try {
    const userId = Number(new URL(request.url).searchParams.get('userId'))
    if (!userId) return NextResponse.json({ error: 'پارامتر userId الزامی است' }, { status: 400 })
    const notes = await db.personalNote.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json({ notes })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/notes {userId, title, content?, color?}
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const userId = Number(b?.userId)
    const title = String(b?.title ?? '').trim()
    if (!userId) return NextResponse.json({ error: 'کاربر الزامی است' }, { status: 400 })
    if (!title) return NextResponse.json({ error: 'عنوان یادداشت الزامی است' }, { status: 400 })
    const note = await db.personalNote.create({
      data: {
        userId,
        title,
        content: b?.content ? String(b.content) : null,
        color: b?.color ? String(b.color) : 'olive',
      },
    })
    return NextResponse.json({ note })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/notes {id, title?, content?, color?}
export async function PATCH(request: Request) {
  try {
    const b = await request.json()
    const id = Number(b?.id)
    if (!id) return NextResponse.json({ error: 'شناسه یادداشت الزامی است' }, { status: 400 })
    const data: Record<string, unknown> = {}
    if (b?.title !== undefined) data.title = String(b.title).trim()
    if (b?.content !== undefined) data.content = b.content ? String(b.content) : null
    if (b?.color !== undefined) data.color = String(b.color) || 'olive'
    const note = await db.personalNote.update({ where: { id }, data })
    return NextResponse.json({ note })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// DELETE /api/notes?id=
export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'پارامتر id الزامی است' }, { status: 400 })
    await db.personalNote.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
