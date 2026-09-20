import { NextRequest } from 'next/server'
import { requireUser, fail, ok } from '@/lib/server-utils'

interface ImageResult {
  url: string
  caption: string
  source: string
}

// POST /api/products/image-search — web image search via z-ai CLI (server-side only)
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const body = (await req.json()) as { query?: string }
  const query = (body.query ?? '').trim()
  if (!query) return fail('عبارت جستجو لازم است')

  try {
    let out = ''
    // Bun runtime (Bun.spawnSync) with Node child_process fallback
    type BunLike = {
      spawnSync?: (
        cmd: string[],
        opts: { timeout: number; stdout: string; stderr: string }
      ) => { stdout: Uint8Array | string }
    }
    const bun = (globalThis as unknown as { Bun?: BunLike }).Bun
    if (bun?.spawnSync) {
      const proc = bun.spawnSync(['z-ai', 'image-search', '-q', query, '--count', '6', '--no-rank'], {
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      out = typeof proc.stdout === 'string' ? proc.stdout : new TextDecoder().decode(proc.stdout)
    } else {
      const { spawnSync } = await import('child_process')
      const proc = spawnSync('z-ai', ['image-search', '-q', query, '--count', '6', '--no-rank'], {
        timeout: 120_000,
        encoding: 'utf8',
      })
      out = proc.stdout ?? ''
    }

    const start = out.indexOf('{')
    if (start < 0) throw new Error('no json output')
    const data = JSON.parse(out.slice(start)) as {
      results?: Record<string, unknown>[]
      images?: Record<string, unknown>[]
    }

    const raw = data.results ?? data.images ?? []
    const results: ImageResult[] = raw
      .map((r) => ({
        url: String(r.original_url ?? r.url ?? r.image ?? ''),
        caption: String(r.caption ?? r.title ?? ''),
        source: String(r.source ?? r.source_url ?? r.domain ?? ''),
      }))
      .filter((r) => !!r.url && r.url.startsWith('http'))

    return ok({ success: true, results })
  } catch {
    return fail('جستجوی تصویر در دسترس نیست', 500)
  }
}
