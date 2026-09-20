import { NextRequest } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { getSessionUser, unauthorized } from '@/lib/auth'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg']

/** POST /api/uploads — multipart image upload → /public/uploads/<uuid>.<ext> */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return Response.json({ error: 'فایلی ارسال نشده است' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return Response.json({ error: 'فقط فایل تصویری مجاز است' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return Response.json({ error: 'حجم تصویر باید کمتر از ۵ مگابایت باشد' }, { status: 400 })
    }

    const rawExt = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const ext = ALLOWED_EXT.includes(rawExt) ? rawExt : (file.type.split('/')[1] || 'png').replace(/[^a-z0-9]/g, '')

    const fileName = `${crypto.randomUUID()}.${ext}`
    const dir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, fileName), Buffer.from(await file.arrayBuffer()))

    return Response.json({ url: `/uploads/${fileName}` })
  } catch (e) {
    console.error('upload failed:', e)
    return Response.json({ error: 'بارگذاری فایل ناموفق بود' }, { status: 500 })
  }
}
