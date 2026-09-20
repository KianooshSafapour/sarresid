import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'

// ============================================================
// گنجینه شخصی — یادداشت‌ها و پرونده‌های خصوصی هر همکار
// دسترسی سخت‌گیرانه: هر کاربر تنها به پرونده‌های خودش دسترسی دارد
// ============================================================

const MAX_DATAURL_CHARS = 600_000 // dataUrl محدود به ~۴۵۰KB باینری
const MAX_SIZE_BYTES = 450_000

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const files = await db.vaultFile.findMany({
    where: { userId: user.id }, // STRICT: فقط پرونده‌های خود کاربر
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  const folderSet = new Set<string>(['عمومی'])
  for (const f of files) if (f.folder) folderSet.add(f.folder)

  return ok({ files, folders: Array.from(folderSet) })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    mime?: string
    size?: number
    dataUrl?: string
    folder?: string
    note?: string
  }

  const name = body.name?.trim()
  if (!name) return fail('نام پرونده لازم است')
  if (name.length > 120) return fail('نام پرونده حداکثر ۱۲۰ نویسه است')

  const dataUrl = body.dataUrl
  if (dataUrl !== undefined && dataUrl !== null && typeof dataUrl !== 'string') {
    return fail('محتوای پرونده نامعتبر است')
  }
  if (dataUrl && dataUrl.length > MAX_DATAURL_CHARS) {
    return fail('حجم این پرونده برای گنجینه شخصی زیاد است — لطفاً تصویر کوچک‌تری انتخاب کنید یا فشرده‌سازی را فعال کنید')
  }
  const size = Number(body.size) || (dataUrl ? Math.round((dataUrl.length * 3) / 4) : 0)
  if (size > MAX_SIZE_BYTES) {
    return fail('حجم پرونده بیش از حد مجاز (حدود ۴۵۰ کیلوبایت) است — پس از فشرده‌سازی دوباره تلاش کنید')
  }

  const folder = body.folder?.trim() || 'عمومی'
  if (folder.length > 60) return fail('نام پوشه حداکثر ۶۰ نویسه است')
  const note = body.note?.trim() || null
  if (note && note.length > 1000) return fail('یادداشت حداکثر ۱۰۰۰ نویسه است')

  const created = await db.vaultFile.create({
    data: {
      userId: user.id,
      name,
      mime: body.mime?.trim() || null,
      size,
      dataUrl: dataUrl || null,
      folder,
      note,
    },
  })

  await logActivity(user.id, user.name, 'افزودن پرونده به گنجینه شخصی', 'VaultFile', created.id, name)
  return ok({ success: true, file: created })
}
