import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Anonymous staff feedback — NO audit logging (anonymous by design).

// GET /api/feedback → sorted desc (management reads)
export async function GET() {
  try {
    const feedback = await db.feedback.findMany({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ feedback })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/feedback {content, rating?}
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const content = String(b?.content ?? '').trim()
    if (!content) return NextResponse.json({ error: 'متن بازخورد الزامی است' }, { status: 400 })
    let rating: number | null = null
    if (b?.rating !== undefined && b.rating !== null && b.rating !== '') {
      const r = Number(b.rating)
      if (!Number.isFinite(r) || r < 1 || r > 5)
        return NextResponse.json({ error: 'امتیاز باید بین ۱ تا ۵ باشد' }, { status: 400 })
      rating = Math.round(r)
    }
    const item = await db.feedback.create({ data: { content, rating } })
    return NextResponse.json({ feedback: item })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
