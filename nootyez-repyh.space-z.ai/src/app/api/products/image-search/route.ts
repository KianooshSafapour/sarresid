import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// POST /api/products/image-search {query} → {images:[url...]} via z-ai-web-dev-sdk image search
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const query = String(body?.query ?? '').trim()
    if (!query) return NextResponse.json({ images: [] })

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const res = await zai.images.search.create({ query, count: 8 })
    const images = Array.isArray(res?.results)
      ? res.results
          .map((r) => r?.original_url)
          .filter((u): u is string => typeof u === 'string' && u.length > 0)
          .slice(0, 8)
      : []
    return NextResponse.json({ images })
  } catch (e) {
    // graceful fallback — frontend handles empty list
    return NextResponse.json({ images: [], error: e instanceof Error ? e.message : 'image search failed' })
  }
}
