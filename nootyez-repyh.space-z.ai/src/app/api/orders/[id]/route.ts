import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ---------- local helpers ----------

async function getUser(id: number) {
  if (!id) return null
  return db.user.findUnique({ where: { id } })
}

async function usersWithRoles(roles: string[]) {
  const users = await db.user.findMany({ where: { active: true } })
  return users.filter((u) => u.roles.split(',').some((r) => roles.includes(r.trim())))
}

async function notifyRoles(roles: string[], title: string, body: string, type = 'INFO') {
  const users = await usersWithRoles(roles)
  if (!users.length) return
  await db.notification.createMany({
    data: users.map((u) => ({ userId: u.id, title, body, type })),
  })
}

async function logEvent(orderId: number, userName: string, action: string, detail?: string) {
  await db.orderEvent.create({ data: { orderId, userName, action, detail } })
}

async function audit(userId: number, userName: string, action: string, entityId: number, detail?: string) {
  await db.auditLog.create({ data: { userId, userName, action, entity: 'Order', entityId, detail } })
}

async function getVatPercent(): Promise<number> {
  const setting = await db.setting.findUnique({ where: { key: 'vatPercent' } })
  const v = setting ? parseFloat(setting.value) : NaN
  return isFinite(v) ? v : 9
}

type ItemPayload = {
  id?: number
  productId?: number
  name?: string
  barcode?: string
  qty?: number
  unitCost?: number
  sellPrice?: number
  deliveredQty?: number
  confirmedQty?: number
  printedPrice?: number
  finalCost?: number
  status?: string
  note?: string
}

function numOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined
  const n = Number(v)
  return isFinite(n) ? n : undefined
}

function strOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  return v === null || v === '' ? null : String(v)
}

// GET /api/orders/[id] → full order
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const orderId = Number(id)
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: { select: { id: true, name: true, barcode: true, imageUrl: true } } }, orderBy: { id: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        supplier: true,
        cheques: { orderBy: { dueDate: 'asc' } },
      },
    })
    if (!order) return NextResponse.json({ error: 'سفارش یافت نشد' }, { status: 404 })
    return NextResponse.json(order)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// PATCH /api/orders/[id] {action, userId, ...}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const orderId = Number(id)
    const body = await request.json()
    const action = String(body?.action ?? '')
    const userId = Number(body?.userId ?? 0)
    const user = await getUser(userId)
    const userName = user?.name ?? 'سیستم'

    const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
    if (!order) return NextResponse.json({ error: 'سفارش یافت نشد' }, { status: 404 })

    switch (action) {
      // ---------------- EDIT ITEMS (DRAFT/SUBMITTED) ----------------
      case 'update': {
        if (!['DRAFT', 'SUBMITTED'].includes(order.status)) {
          return NextResponse.json({ error: 'ویرایش فقط در وضعیت پیش‌نویس یا ارسال‌شده مجاز است' }, { status: 400 })
        }
        const payload: ItemPayload[] = Array.isArray(body?.items) ? body.items : []
        const payloadIds = payload.map((it) => Number(it.id)).filter(Boolean)

        // delete removed items
        const toDelete = order.items.filter((it) => !payloadIds.includes(it.id)).map((it) => it.id)
        if (toDelete.length) await db.orderItem.deleteMany({ where: { id: { in: toDelete } } })

        for (const it of payload) {
          const data: Record<string, unknown> = {}
          if (it.productId !== undefined) data.productId = it.productId ? Number(it.productId) : null
          if (it.name !== undefined) data.name = String(it.name)
          if (it.barcode !== undefined) data.barcode = strOrNull(it.barcode)
          if (it.qty !== undefined) data.qty = Number(it.qty)
          if (it.unitCost !== undefined) data.unitCost = Number(it.unitCost)
          if (it.sellPrice !== undefined) data.sellPrice = Number(it.sellPrice)
          if (it.id) {
            await db.orderItem.update({ where: { id: Number(it.id) }, data })
          } else {
            await db.orderItem.create({
              data: {
                orderId,
                productId: it.productId ? Number(it.productId) : null,
                name: it.name !== undefined ? String(it.name) : '',
                barcode: strOrNull(it.barcode) ?? null,
                qty: it.qty !== undefined ? Number(it.qty) : 0,
                unitCost: it.unitCost !== undefined ? Number(it.unitCost) : 0,
                sellPrice: it.sellPrice !== undefined ? Number(it.sellPrice) : 0,
              },
            })
          }
        }

        const subtotal = payload.reduce((s, it) => s + Number(it.qty ?? 0) * Number(it.unitCost ?? 0), 0)
        const upd: Record<string, unknown> = { subtotal, total: subtotal + order.vat - order.discount }
        if (body?.note !== undefined) upd.note = strOrNull(body.note)
        if (body?.receivingDate !== undefined) {
          const d = new Date(body.receivingDate)
          if (!isNaN(d.getTime())) upd.receivingDate = d
        }
        if (body?.paymentType !== undefined) upd.paymentType = String(body.paymentType)
        await db.order.update({ where: { id: orderId }, data: upd })

        await logEvent(orderId, userName, 'UPDATED', `ویرایش اقلام سفارش (${payload.length} قلم)`)
        await audit(userId, userName, 'ORDER_UPDATE', orderId, `ویرایش سفارش ${order.code}`)
        break
      }

      // ---------------- SUBMIT ----------------
      case 'submit': {
        if (order.status !== 'DRAFT') {
          return NextResponse.json({ error: 'فقط سفارش پیش‌نویس قابل ارسال است' }, { status: 400 })
        }
        await db.order.update({ where: { id: orderId }, data: { status: 'SUBMITTED' } })
        await logEvent(orderId, userName, 'SUBMITTED', 'سفارش برای تأیید مدیر ارسال شد')
        await audit(userId, userName, 'ORDER_SUBMIT', orderId, `ارسال سفارش ${order.code}`)
        const gms = await usersWithRoles(['GENERAL_MANAGER'])
        if (gms.length) {
          await db.notification.createMany({
            data: gms.map((u) => ({
              userId: u.id,
              title: 'سفارش در انتظار تأیید',
              body: `سفارش ${order.code} از ${order.supplierId} awaiting approval`,
              type: 'INFO',
            })),
          })
        }
        break
      }

      // ---------------- APPROVE ----------------
      case 'approve': {
        if (order.status !== 'SUBMITTED') {
          return NextResponse.json({ error: 'فقط سفارش ارسال‌شده قابل تأیید است' }, { status: 400 })
        }
        await db.order.update({ where: { id: orderId }, data: { status: 'APPROVED', approvedAt: new Date() } })
        await logEvent(orderId, userName, 'APPROVED', 'سفارش تأیید شد')
        await audit(userId, userName, 'ORDER_APPROVE', orderId, `تأیید سفارش ${order.code}`)
        await notifyRoles(
          ['INVENTORY_SUPERVISOR', 'DELIVERY_RECEIVER', 'PRODUCT_MANAGER'],
          'سفارش تأیید شد',
          `سفارش ${order.code} تأیید شد و آماده دریافت است`,
          'SUCCESS',
        )
        break
      }

      // ---------------- REJECT ----------------
      case 'reject': {
        if (order.status !== 'SUBMITTED') {
          return NextResponse.json({ error: 'فقط سفارش ارسال‌شده قابل رد است' }, { status: 400 })
        }
        const reason = String(body?.reason ?? '').trim()
        const newNote = [order.note, `رد شد: ${reason}`].filter(Boolean).join('\n')
        await db.order.update({ where: { id: orderId }, data: { status: 'DRAFT', note: newNote || null } })
        await logEvent(orderId, userName, 'REJECTED', reason || 'سفارش رد شد')
        await audit(userId, userName, 'ORDER_REJECT', orderId, `رد سفارش ${order.code}: ${reason}`)
        await db.notification.create({
          data: {
            userId: order.createdById,
            title: 'سفارش رد شد',
            body: `سفارش ${order.code} رد شد. دلیل: ${reason || '—'}`,
            type: 'WARNING',
          },
        })
        break
      }

      // ---------------- CORRECTION (after approval) ----------------
      case 'correct': {
        if (!['APPROVED', 'RECEIVED', 'CONFIRMED'].includes(order.status)) {
          return NextResponse.json({ error: 'اصلاحیه فقط بعد از تأیید سفارش مجاز است' }, { status: 400 })
        }
        const correction = String(body?.correction ?? '').trim()
        if (!correction) return NextResponse.json({ error: 'متن اصلاحیه الزامی است' }, { status: 400 })
        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
        const newCorrection = [order.correction, `[${stamp}] ${userName}: ${correction}`].filter(Boolean).join('\n')
        await db.order.update({ where: { id: orderId }, data: { correction: newCorrection } })
        await logEvent(orderId, userName, 'CORRECTION', correction)
        await audit(userId, userName, 'ORDER_CORRECTION', orderId, `اصلاحیه سفارش ${order.code}: ${correction}`)
        break
      }

      // ---------------- CANCEL ----------------
      case 'cancel': {
        if (order.status === 'DONE') {
          return NextResponse.json({ error: 'سفارش بسته‌شده قابل لغو نیست' }, { status: 400 })
        }
        if (order.status === 'CANCELLED') {
          return NextResponse.json({ error: 'سفارش قبلاً لغو شده است' }, { status: 400 })
        }
        await db.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } })
        await logEvent(orderId, userName, 'CANCELLED', 'سفارش لغو شد')
        await audit(userId, userName, 'ORDER_CANCEL', orderId, `لغو سفارش ${order.code}`)
        break
      }

      // ---------------- RECEIVE ----------------
      case 'receive': {
        if (!['APPROVED', 'RECEIVED'].includes(order.status)) {
          return NextResponse.json({ error: 'دریافت فقط برای سفارش تأییدشده مجاز است' }, { status: 400 })
        }
        const payload: ItemPayload[] = Array.isArray(body?.items) ? body.items : []
        for (const it of payload) {
          if (!it.id) continue
          const data: Record<string, unknown> = {}
          if (it.deliveredQty !== undefined) data.deliveredQty = Number(it.deliveredQty)
          if (it.printedPrice !== undefined) data.printedPrice = it.printedPrice === null ? null : Number(it.printedPrice)
          if (it.finalCost !== undefined) data.finalCost = it.finalCost === null ? null : Number(it.finalCost)
          if (it.status !== undefined) data.status = String(it.status)
          if (it.note !== undefined) data.note = strOrNull(it.note)
          await db.orderItem.update({ where: { id: Number(it.id) }, data })
        }

        // recalc from delivered quantities
        const items = await db.orderItem.findMany({ where: { orderId } })
        const subtotal = items.reduce((s, it) => s + (it.finalCost ?? it.unitCost) * (it.deliveredQty ?? 0), 0)
        const vatPercent = await getVatPercent()
        const vat = (subtotal * vatPercent) / 100
        const discount = body?.discount !== undefined ? Number(body.discount) : 0
        await db.order.update({
          where: { id: orderId },
          data: {
            status: 'RECEIVED',
            receivedAt: new Date(),
            subtotal,
            vat,
            discount,
            total: subtotal + vat - discount,
            ...(body?.paymentType !== undefined ? { paymentType: String(body.paymentType) } : {}),
          },
        })

        const missing = payload.filter((it) => it.status === 'MISSING').length
        const rejected = payload.filter((it) => it.status === 'REJECTED').length
        await logEvent(
          orderId,
          userName,
          'RECEIVED',
          `دریافت سفارش — ${payload.length} قلم، ${missing} ناقص، ${rejected} مردود`,
        )
        await audit(userId, userName, 'ORDER_RECEIVE', orderId, `دریافت سفارش ${order.code}`)
        await notifyRoles(
          ['INVENTORY_SUPERVISOR', 'ACCOUNTANT'],
          'سفارش دریافت شد',
          `سفارش ${order.code} دریافت شد (${missing} ناقص، ${rejected} مردود)`,
          'SUCCESS',
        )
        break
      }

      // ---------------- CONFIRM ----------------
      case 'confirm': {
        if (!['RECEIVED', 'CONFIRMED'].includes(order.status)) {
          return NextResponse.json({ error: 'تأیید نهایی فقط بعد از دریافت مجاز است' }, { status: 400 })
        }
        const payload: ItemPayload[] = Array.isArray(body?.items) ? body.items : []
        for (const it of payload) {
          if (!it.id) continue
          const data: Record<string, unknown> = {}
          if (it.confirmedQty !== undefined) data.confirmedQty = Number(it.confirmedQty)
          if (it.deliveredQty !== undefined) data.deliveredQty = Number(it.deliveredQty)
          if (it.printedPrice !== undefined) data.printedPrice = it.printedPrice === null ? null : Number(it.printedPrice)
          if (it.finalCost !== undefined) data.finalCost = it.finalCost === null ? null : Number(it.finalCost)
          if (it.status !== undefined) data.status = String(it.status)
          if (it.note !== undefined) data.note = strOrNull(it.note)
          await db.orderItem.update({ where: { id: Number(it.id) }, data })
        }

        // recalc from confirmed quantities
        const items = await db.orderItem.findMany({ where: { orderId } })
        const subtotal = items.reduce(
          (s, it) => s + (it.finalCost ?? it.unitCost) * (it.confirmedQty ?? it.deliveredQty ?? 0),
          0,
        )
        const vatPercent = await getVatPercent()
        const vat = (subtotal * vatPercent) / 100
        await db.order.update({
          where: { id: orderId },
          data: { status: 'CONFIRMED', confirmedAt: new Date(), subtotal, vat, total: subtotal + vat - order.discount },
        })

        await logEvent(orderId, userName, 'CONFIRMED', 'تأیید نهایی اقلام دریافت‌شده')
        await audit(userId, userName, 'ORDER_CONFIRM', orderId, `تأیید نهایی سفارش ${order.code}`)
        await notifyRoles(['ACCOUNTANT'], 'سفارش تأیید شد', `سفارش ${order.code} توسط انبار تأیید شد`, 'SUCCESS')
        break
      }

      // ---------------- DONE (close in accounting) ----------------
      case 'done': {
        if (order.status !== 'CONFIRMED') {
          return NextResponse.json({ error: 'بستن سفارش فقط بعد از تأیید نهایی مجاز است' }, { status: 400 })
        }
        await db.order.update({ where: { id: orderId }, data: { status: 'DONE', doneAt: new Date() } })
        await logEvent(orderId, userName, 'DONE', 'سفارش در حسابداری بسته شد')
        await audit(userId, userName, 'ORDER_DONE', orderId, `بستن سفارش ${order.code}`)
        await notifyRoles(
          ['GENERAL_MANAGER', 'PRODUCT_MANAGER', 'OWNER'],
          'سفارش بسته شد',
          `سفارش ${order.code} در حسابداری بسته شد`,
          'SUCCESS',
        )
        // award the accountant +5 points
        if (user && user.roles.split(',').map((r) => r.trim()).includes('ACCOUNTANT')) {
          await db.pointsLog.create({
            data: { userId: user.id, points: 5, reason: 'ثبت و بستن سفارش در حسابداری', awardedById: user.id },
          })
          await db.user.update({ where: { id: user.id }, data: { points: { increment: 5 } } })
        }
        break
      }

      // ---------------- PAYMENT ----------------
      case 'updatePayment': {
        if (body?.paymentType === undefined) {
          return NextResponse.json({ error: 'نوع پرداخت الزامی است' }, { status: 400 })
        }
        await db.order.update({ where: { id: orderId }, data: { paymentType: String(body.paymentType) } })
        await audit(userId, userName, 'ORDER_PAYMENT', orderId, `نوع پرداخت سفارش ${order.code} → ${body.paymentType}`)
        break
      }

      // ---------------- ADD BARCODE ----------------
      case 'addBarcode': {
        const itemId = Number(body?.itemId)
        const barcode = String(body?.barcode ?? '').trim()
        if (!itemId || !barcode) return NextResponse.json({ error: 'شناسه قلم و بارکد الزامی است' }, { status: 400 })
        const item = await db.orderItem.findUnique({ where: { id: itemId } })
        if (!item) return NextResponse.json({ error: 'قلم سفارش یافت نشد' }, { status: 404 })
        if (!item.productId) return NextResponse.json({ error: 'این قلم به محصول متصل نیست' }, { status: 400 })
        const product = await db.product.findUnique({ where: { id: item.productId } })
        if (!product) return NextResponse.json({ error: 'محصول یافت نشد' }, { status: 404 })

        if (!product.barcode) {
          await db.product.update({ where: { id: product.id }, data: { barcode } })
          await logEvent(orderId, userName, 'BARCODE_ADDED', `بارکد ${barcode} به محصول ${product.name} اضافه شد`)
        } else if (product.barcode !== barcode) {
          await logEvent(
            orderId,
            userName,
            'BARCODE_ADDED',
            `بارکد متفاوت روی قلم ${product.name} اسکن شد (محصول: ${product.barcode}، اسکن: ${barcode})`,
          )
        }
        await audit(userId, userName, 'ORDER_BARCODE', orderId, `بارکد ${barcode} روی ${product.name}`)
        break
      }

      default:
        return NextResponse.json({ error: 'عملیات ناشناخته' }, { status: 400 })
    }

    const fresh = await db.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: { select: { id: true, name: true, barcode: true, imageUrl: true } } }, orderBy: { id: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        supplier: true,
        cheques: { orderBy: { dueDate: 'asc' } },
      },
    })
    return NextResponse.json(fresh)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
