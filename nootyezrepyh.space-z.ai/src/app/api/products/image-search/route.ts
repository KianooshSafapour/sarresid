import { NextRequest } from 'next/server'
import { getSessionUser, unauthorized } from '@/lib/auth'

/**
 * POST /api/products/image-search  { query: string }
 * Uses z-ai-web-dev-sdk in-house image search. Degrades gracefully:
 * any failure returns { results: [] } so the UI can fall back to device upload.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  try {
    const body = (await req.json().catch(() => null)) as { query?: string } | null
    const query = String(body?.query || '').trim()
    if (!query) return Response.json({ results: [] })

    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    const zai = await ZAI.create()
    const res = await zai.images.search.create({ query, count: 8, rank: false })

    if (!res || !res.success || !Array.isArray(res.results)) {
      return Response.json({ results: [] })
    }

    const results = res.results
      .filter((r) => r && r.original_url)
      .map((r) => ({ url: r.original_url, image: r.original_url, source: r.source || '' }))

    return Response.json({ results })
  } catch (e) {
    console.error('image-search failed:', e)
    return Response.json({ results: [] })
  }
}
