import { db } from '@/lib/db'
import { appendHistory, fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'
import { emitNotif } from '@/lib/notif-engine'
import { faNum } from '@/lib/jalali'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const order = await db.order.findUnique({ where: { id } })
  if (!order) return fail('سفارش یافت نشد', 404)
  const items = await db.orderItem.findMany({ where: { orderId: id } })
  const today = new Date().toISOString().slice(0, 10)
  return json({
    order: {
      ...order,
      history: JSON.parse(order.history || '[]'),
      isOverdue: ['APPROVED', 'RECEIVING'].includes(order.status) && order.deliveryDate < today,
    },
    items,
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  const order = await db.order.findUnique({ where: { id } })
  if (!order) return fail('سفارش یافت نشد', 404)
  const action = body.action as string

  const now = new Date().toISOString()
  const data: Record<string, unknown> = {}
  let historyEntry: Record<string, unknown> | null = null

  switch (action) {
    case 'submit': {
      if (order.status !== 'DRAFT' && order.status !== 'SUBMITTED')
        return fail('این سفارش در وضعیت قابل ارسال نیست')
      data.status = 'SUBMITTED'
      historyEntry = { action: 'ارسال برای تأیید', detail: body.detail || '' }
      break
    }
    case 'approve': {
      if (!['GM', 'OM'].includes(me.role)) return fail('فقط مدیر کل / مدیر عملیات تأیید می‌کند', 403)
      if (order.status !== 'SUBMITTED') return fail('سفارش در انتظار تأیید نیست')
      data.status = 'APPROVED'
      historyEntry = { action: 'تأیید و ارسال به تأمین‌کننده', detail: body.detail || '' }
      break
    }
    case 'start_receiving': {
      if (!['APPROVED', 'RECEIVING'].includes(order.status)) return fail('سفارش قابل دریافت نیست')
      data.status = 'RECEIVING'
      historyEntry = { action: 'شروع دریافت مرسوله', detail: body.detail || '' }
      break
    }
    case 'edit': {
      const execRole = ['OWNER', 'GM', 'OM', 'ADMIN'].includes(me.role)
      const locked = ['RECEIVED', 'VERIFIED', 'ACCOUNTED', 'DONE', 'CANCELLED'].includes(order.status)
      if (locked) {
        // «ویرایش در جریان» — فقط مدیران اجرایی / حسابدار و فقط برای سفارش‌های ناتمام؛ اقلام دست‌نخورده
        if (!execRole && me.role !== 'ACC')
          return fail('سفارش پس از دریافت قابل ویرایش نیست؛ از «اصلاحیه» استفاده کنید')
        if (['DONE', 'CANCELLED'].includes(order.status))
          return fail('سفارش بسته‌شده قابل ویرایش نیست — از «اصلاحیه» استفاده کنید')
        if (Array.isArray(body.items) && body.items.length)
          return fail('تغییر اقلام پس از دریافت مجاز نیست — از «تحویل و نهایی‌سازی» استفاده کنید')
      }
      if (body.deliveryDate) data.deliveryDate = body.deliveryDate
      if (body.notes !== undefined) data.notes = body.notes
      if (body.payMethod) data.payMethod = body.payMethod
      if (Array.isArray(body.items) && body.items.length) {
        for (const it of body.items) {
          if (it.id && (it.qty !== undefined || it.unitBuyPrice !== undefined)) {
            await db.orderItem.update({
              where: { id: it.id },
              data: {
                ...(it.qty !== undefined ? { qty: Number(it.qty) } : {}),
                ...(it.unitBuyPrice !== undefined ? { unitBuyPrice: Number(it.unitBuyPrice) } : {}),
              },
            })
          } else if (!it.id && it.productId) {
            const p = await db.product.findUnique({ where: { id: it.productId } })
            await db.orderItem.create({
              data: {
                orderId: id,
                productId: it.productId,
                productName: p?.name || '',
                barcode: p ? JSON.parse(p.barcodes || '[]')[0] || '' : '',
                qty: Number(it.qty) || 1,
                unitBuyPrice: Number(it.unitBuyPrice) || 0,
                vat: 9,
              },
            })
          }
        }
        const items = await db.orderItem.findMany({ where: { orderId: id } })
        data.totalAmount = items.reduce((s, i) => s + i.qty * i.unitBuyPrice, 0)
      }
      historyEntry = { action: locked ? 'ویرایش در جریان (توسط حسابداری/مدیریت)' : 'ویرایش سفارش', detail: body.detail || '' }
      break
    }
    case 'correct': {
      // correction after lock — appended, never destructive
      historyEntry = { action: `اصلاحیه: ${body.title || ''}`, detail: body.detail || '' }
      break
    }
    case 'receive': {
      if (!['RECEIVING', 'APPROVED'].includes(order.status))
        return fail('سفارش در مرحله دریافت نیست')
      // ── قاعدهٔ قابل‌تنظیم تأخیر تحویل (admin/manager): مجازبودن دریافت سفارش‌های سرآمده + روزهای بخشش
      const allowPastDue = (await db.setting.findUnique({ where: { key: 'delivery.allowPastDue' } }))?.value !== 'false'
      const graceDays = Number((await db.setting.findUnique({ where: { key: 'delivery.graceDays' } }))?.value ?? '14')
      const canBypass = ['GM', 'OM', 'OWNER', 'ADMIN'].includes(me.role)
      if (!allowPastDue && order.deliveryDate && new Date(order.deliveryDate) < new Date(new Date().toISOString().slice(0, 10)) && !canBypass)
        return fail('دریافت سفارش سرآمده توسط مدیریت غیرفعال شده است — با مدیر عملیات هماهنگ کنید')
      if (order.deliveryDate && allowPastDue && !canBypass) {
        const daysLate = Math.floor((Date.now() - new Date(order.deliveryDate + 'T00:00:00Z').getTime()) / 86400000)
        if (daysLate > graceDays)
          return fail(`سفارش ${daysLate} روز سرآمده است (بخشش ${graceDays} روز) — دریافت آن نیازمند تأیید مدیر است`)
      }
      if (Array.isArray(body.items)) {
        for (const it of body.items) {
          await db.orderItem.update({
            where: { id: it.id },
            data: {
              receivedQty: it.receivedQty === null || it.receivedQty === '' ? null : Number(it.receivedQty),
              printedPrice: it.printedPrice === '' || it.printedPrice === null ? null : Number(it.printedPrice),
              discount: Number(it.discount) || 0,
              vat: it.vat !== undefined ? Number(it.vat) : 9,
              status: it.status || 'RECEIVED',
              note: it.note || '',
              ...(it.expiryDate ? { expiryDate: String(it.expiryDate).slice(0, 10) } : {}),
            },
          })
        }
      }
      data.status = 'RECEIVED'
      historyEntry = {
        action: 'دریافت مرسوله ثبت شد',
        detail: body.detail || 'برای تأیید انبار ارسال شد',
      }
      break
    }
    case 'verify': {
      if (me.role !== 'SK' && !['OM', 'GM'].includes(me.role))
        return fail('فقط سرپرست انبار تأیید می‌کند', 403)
      if (order.status !== 'RECEIVED' && order.status !== 'VERIFIED')
        return fail('سفارش در مرحله تأیید انبار نیست')
      // stock moves into inventory on the first verification (RECEIVED → VERIFIED)
      const firstVerify = order.status === 'RECEIVED'
      if (Array.isArray(body.items)) {
        for (const it of body.items) {
          const prev = await db.orderItem.findUnique({ where: { id: it.id } })
          await db.orderItem.update({
            where: { id: it.id },
            data: {
              ...(it.receivedQty !== undefined ? { receivedQty: Number(it.receivedQty) } : {}),
              ...(it.printedPrice !== undefined ? { printedPrice: Number(it.printedPrice) } : {}),
              ...(it.status !== undefined ? { status: it.status } : {}),
              ...(it.note !== undefined ? { note: it.note } : {}),
            },
          })
          if (firstVerify && prev && prev.status !== 'REJECTED') {
            const qty = it.receivedQty !== undefined ? Number(it.receivedQty) : prev.receivedQty
            if (qty && qty > 0) {
              await db.product.update({
                where: { id: prev.productId },
                data: { stock: { increment: qty } },
              })
            }
          }
        }
      }
      data.status = 'VERIFIED'
      historyEntry = { action: 'تأیید انبار و افزایش موجودی', detail: body.detail || 'برای حسابداری ارسال شد' }
      break
    }
    case 'account': {
      if (me.role !== 'ACC' && !['OM', 'OWNER'].includes(me.role))
        return fail('فقط حسابدار ثبت حسابداری می‌کند', 403)
      if (order.status !== 'VERIFIED' && order.status !== 'ACCOUNTED')
        return fail('سفارش در مرحله حسابداری نیست')
      data.status = body.done ? 'DONE' : 'ACCOUNTED'
      historyEntry = {
        action: body.done ? 'تسویه و تکمیل کامل سفارش' : 'ثبت در نرم‌افزار هلو',
        detail: body.detail || (body.done ? 'اطلاع به مدیریت و مالک' : 'خروجی اکسل گرفته شد'),
      }
      break
    }
    case 'checkout': {
      // ── تحویل و تصویب حسابداری — اصلاح دریافتی‌ها، مرجوعی، کسری، قیمت چاپی و انقضا ──
      const execRole = ['OWNER', 'GM', 'OM', 'ADMIN'].includes(me.role)
      if (!execRole && me.role !== 'ACC' && !(await hasCap(me, 'orders.checkout')))
        return fail('فقط حسابدار یا مدیریت می‌تواند تحویل را نهایی کند', 403)
      if (!['RECEIVED', 'VERIFIED', 'ACCOUNTED'].includes(order.status))
        return fail('سفارش در مرحلهٔ تحویل/بازبینی حسابداری نیست')

      const orderItems = await db.orderItem.findMany({ where: { orderId: id } })
      const byId = new Map(orderItems.map((i) => [i.id, i]))
      const incoming: any[] = Array.isArray(body.items) ? body.items : []
      if (!incoming.length) return fail('اقلام تحویل را وارد کنید')
      // گارد سلامت: شناسهٔ ناشناس یا متعلق به سفارش دیگر → ۴۰۰ (نه نادیده‌گرفتن)
      const unknownIds = incoming.filter((r) => r.id && !byId.has(r.id)).map((r) => String(r.id))
      if (unknownIds.length)
        return fail(`${faNum(unknownIds.length)} قلم شناسایی نشد — اقلام این سفارش را دوباره بارگذاری کنید`, 400)

      const summaries: string[] = []
      for (const row of incoming) {
        const it = row.id ? byId.get(row.id) : undefined
        if (!it) return fail('یک قلم بدون شناسه معتبر است — صفحه را دوباره بارگذاری کنید')
        // تعداد دریافتی — ≥ صفر و ≤ تعداد سفارش (اضافه‌دریافت نیازمند مرجوعی/توضیح)
        let receivedQty: number | null = it.receivedQty
        if (row.receivedQty !== undefined && row.receivedQty !== null && row.receivedQty !== '') {
          const n = Math.round(Number(row.receivedQty))
          if (!isFinite(n) || n < 0) return fail(`تعداد دریافتی «${it.productName}» باید عددی ≥ صفر باشد`)
          receivedQty = n
        }
        const missingQty =
          row.missingQty === undefined || row.missingQty === '' || row.missingQty === null
            ? it.missingQty || 0
            : Math.max(0, Math.round(Number(row.missingQty) || 0))
        if (!isFinite(missingQty) || missingQty < 0) return fail(`کسری «${it.productName}» باید عددی ≥ صفر باشد`)
        const returned = row.returned === undefined ? it.returned : !!row.returned
        const returnReason = String(row.returnReason !== undefined ? row.returnReason : it.returnReason || '').trim().slice(0, 300)
        if (returned && returnReason.length < 3)
          return fail(`برای مرجوع‌کردن «${it.productName}» نوشتن دلیل مرجوعی (حداقل ۳ حرف) الزامی است`)
        const baseQty = receivedQty === null ? it.qty : receivedQty
        const note = String(row.note !== undefined ? row.note : it.note || '').trim().slice(0, 400)
        if (baseQty > it.qty && !returned && note.length < 3)
          return fail(`دریافت «${it.productName}» بیش از سفارش است — مرجوعی با دلیل یا توضیح ثبت کنید`)

        const itemData: Record<string, unknown> = {
          receivedQty,
          missingQty,
          returned,
          returnReason,
          status: returned ? 'REJECTED' : missingQty > 0 ? 'SHORT' : 'RECEIVED',
        }
        if (row.printedPrice !== undefined && row.printedPrice !== '') {
          const pp = Number(row.printedPrice)
          if (!isFinite(pp) || pp < 0) return fail(`قیمت چاپی «${it.productName}» نامعتبر است`)
          itemData.printedPrice = pp
        }
        if (row.expiryDate) itemData.expiryDate = String(row.expiryDate).slice(0, 10)
        if (row.note !== undefined) itemData.note = note
        await db.orderItem.update({ where: { id: it.id }, data: itemData })
        if (returned) summaries.push(`${it.productName}: مرجوع (${returnReason})`)
        else if (missingQty > 0) summaries.push(`${it.productName}: کسری ${missingQty}`)
        else if (receivedQty !== null && receivedQty !== it.qty) summaries.push(`${it.productName}: دریافتی ${receivedQty} از ${it.qty}`)
      }

      // محاسبهٔ مجدد مبلغ نهایی از دریافتی مؤثر (منهای مرجوعی و کسری)
      const fresh = await db.orderItem.findMany({ where: { orderId: id } })
      const finalTotal = Math.round(
        fresh.reduce((s, it) => {
          if (it.returned) return s
          const base = it.receivedQty ?? it.qty
          return s + Math.max(0, base - (it.missingQty || 0)) * it.unitBuyPrice
        }, 0)
      )
      data.status = 'ACCOUNTED'
      data.totalAmount = finalTotal
      data.checkedById = me.id
      data.checkedByName = me.name
      data.checkedAt = now
      const checkNote = String(body.checkNote || '').trim().slice(0, 300)
      historyEntry = {
        action: 'تحویل و تصویب حسابداری ✓',
        detail: `مبلغ نهایی: ${finalTotal.toLocaleString('en-US')} تومان${summaries.length ? ` — ${summaries.join(' • ')}` : ' — بدون مغایرت'}${checkNote ? ` — یادداشت: ${checkNote}` : ''}`,
      }
      break
    }
    case 'cancel': {
      if (['DONE', 'CANCELLED'].includes(order.status)) return fail('امکان لغو نیست')
      data.status = 'CANCELLED'
      historyEntry = { action: 'لغو سفارش', detail: body.detail || '' }
      break
    }
    default:
      return fail('عملیات نامعتبر')
  }

  if (historyEntry) {
    data.history = appendHistory(
      order.history,
      { userId: me.id, userName: me.name, ...historyEntry }
    )
  }
  const updated = await db.order.update({ where: { id }, data })
  await logActivity(me, historyEntry ? String(historyEntry.action) : 'به‌روزرسانی سفارش', 'order', id, `${order.code}`)

  if (action === 'checkout') {
    await emitNotif({
      event: 'order.checked',
      title: 'تحویل سفارش تصویب شد ✓',
      detail: `${order.code} — ${order.providerName} • مبلغ نهایی: ${Number(data.totalAmount || 0).toLocaleString('en-US')} تومان • بررسی‌کننده: ${me.name}`,
      go: '#/orders',
      icon: '🧾',
      severity: 'important',
      actor: { id: me.id, name: me.name },
    })
  }
  return json({ order: { ...updated, history: JSON.parse(updated.history || '[]') } })
}
