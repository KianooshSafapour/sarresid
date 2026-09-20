import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity, notify, notifyRoles } from '@/lib/server-utils'
import { hasRole } from '@/lib/auth'
import { formatJalali } from '@/lib/jalali'
import { computeRow } from '../../_calc'

interface ItemPatch {
  id: string
  deliveredQty?: number
  itemStatus?: string // OK | MISSING | REJECTED | CORRECTED
  correctedPrice?: number | null
  issue?: string | null
}

const COUNTED = ['OK', 'CORRECTED']

/** apply delivery/inventory corrections to item rows + recompute order totals from OK/CORRECTED rows */
async function applyItemPatches(orderId: string, patches: ItemPatch[]) {
  const items = await db.orderItem.findMany({ where: { orderId } })
  const byId = new Map(items.map((i) => [i.id, i]))

  for (const p of patches) {
    const it = byId.get(p.id)
    if (!it) continue
    const status = p.itemStatus || it.itemStatus
    const deliveredQty = p.deliveredQty !== undefined && p.deliveredQty !== null ? Number(p.deliveredQty) : (it.deliveredQty ?? it.qty)
    const correctedPrice = p.correctedPrice !== undefined && p.correctedPrice !== null && Number(p.correctedPrice) > 0 ? Number(p.correctedPrice) : it.correctedPrice
    const counted = COUNTED.includes(status)
    const row = counted
      ? computeRow(deliveredQty, correctedPrice ?? it.unitPrice, it.discount)
      : { base: 0, vat: 0, total: 0 }
    await db.orderItem.update({
      where: { id: it.id },
      data: {
        deliveredQty,
        itemStatus: status,
        correctedPrice: correctedPrice ?? null,
        issue: p.issue ?? it.issue,
        checkedAt: new Date(),
        vat: counted ? row.vat : 0,
        total: counted ? row.total : 0,
      },
    })
  }

  const fresh = await db.orderItem.findMany({ where: { orderId } })
  const countedRows = fresh.filter((r) => COUNTED.includes(r.itemStatus))
  const totalAmount = countedRows.reduce((s, r) => s + Math.round((r.deliveredQty ?? r.qty) * (r.correctedPrice ?? r.unitPrice) - r.discount), 0)
  const discount = countedRows.reduce((s, r) => s + r.discount, 0)
  const vat = countedRows.reduce((s, r) => s + r.vat, 0)
  const finalAmount = countedRows.reduce((s, r) => s + r.total, 0)
  await db.order.update({ where: { id: orderId }, data: { totalAmount, discount, vat, finalAmount } })
  return { finalAmount, countedRows: countedRows.length }
}

// ---------- POST { action, payload } ----------
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await params

  const order = await db.order.findUnique({ where: { id }, include: { items: true } })
  if (!order) return fail('سفارش یافت نشد', 404)

  const body = (await req.json()) as {
    action: string
    payload?: {
      reason?: string
      items?: ItemPatch[]
      newBarcodes?: { productId: string; code: string }[]
      correctionNote?: string
      holooTotal?: number
      payment?: { type?: string; receiptNo?: string; posReceiptNo?: string; amount?: number }
    }
  }
  const p = body.payload ?? {}

  switch (body.action) {
    // --------- approve: gm / om / owner / pm (+managers) ---------
    case 'approve': {
      if (!hasRole(user, 'gm', 'om', 'owner', 'pm')) return fail('اجازه تأیید سفارش را ندارید', 403)
      if (order.status !== 'PENDING_APPROVAL') return fail('این سفارش در مرحله تأیید نیست')
      await db.order.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: user.id,
          history: { create: { userId: user.id, userName: user.name, action: 'تأیید سفارش', detail: 'سفارش تأیید و برای ارسال آماده شد' } },
        },
      })
      await notify(order.createdById, 'سفارش شما تأیید شد', `${order.code} توسط ${user.name} تأیید شد.`, 'SUCCESS', 'orders')
      await logActivity(user.id, user.name, 'تأیید سفارش', 'Order', id, order.code)
      return ok({ success: true, status: 'APPROVED' })
    }

    // --------- send to provider: creator or managers ---------
    case 'send': {
      if (order.createdById !== user.id && !user.isManager) return fail('اجازه ارسال سفارش را ندارید', 403)
      if (order.status !== 'APPROVED') return fail('فقط سفارش تأییدشده قابل ارسال است')
      await db.order.update({
        where: { id },
        data: {
          status: 'SENT',
          history: { create: { userId: user.id, userName: user.name, action: 'ارسال به تأمین‌کننده', detail: `دریافت در ${formatJalali(order.receivingDate)}` } },
        },
      })
      await notifyRoles(['delivery', 'inventory'], 'تحویل فردا/امروز', `سفارش ${order.code} از ${order.providerName} — زمان دریافت: ${formatJalali(order.receivingDate)}`, 'INFO', 'deliveries')
      await logActivity(user.id, user.name, 'ارسال سفارش به تأمین‌کننده', 'Order', id, order.code)
      return ok({ success: true, status: 'SENT' })
    }

    // --------- start receiving: delivery / inventory (+managers) ---------
    case 'start_receiving': {
      if (!hasRole(user, 'delivery', 'inventory')) return fail('اجازه شروع دریافت را ندارید', 403)
      if (!['APPROVED', 'SENT', 'RECEIVING'].includes(order.status)) return fail('سفارش در مرحله دریافت نیست')
      await db.order.update({
        where: { id },
        data: {
          status: 'RECEIVING',
          history: { create: { userId: user.id, userName: user.name, action: 'شروع دریافت', detail: 'فرآیند دریافت توزیع آغاز شد' } },
        },
      })
      await logActivity(user.id, user.name, 'شروع دریافت سفارش', 'Order', id, order.code)
      return ok({ success: true, status: 'RECEIVING' })
    }

    // --------- receive delivery: delivery / inventory (+managers) ---------
    case 'receive_delivery': {
      if (!hasRole(user, 'delivery', 'inventory')) return fail('اجازه ثبت دریافت را ندارید', 403)
      if (!['APPROVED', 'SENT', 'RECEIVING'].includes(order.status)) return fail('سفارش در مرحله دریافت نیست')
      const patches = Array.isArray(p.items) ? p.items : []
      if (patches.length === 0) return fail('اطلاعات ردیف‌های دریافت ارسال نشده است')

      const res = await applyItemPatches(id, patches)

      // attach unknown barcodes to existing products
      let newBarcodes = 0
      for (const nb of p.newBarcodes ?? []) {
        if (!nb?.code?.trim() || !nb.productId) continue
        await db.barcode.upsert({
          where: { code: nb.code.trim() },
          create: { code: nb.code.trim(), productId: nb.productId, isPrimary: false },
          update: {},
        })
        newBarcodes++
      }

      const discrepancies = (await db.orderItem.findMany({ where: { orderId: id } })).filter(
        (r) => r.itemStatus !== 'OK' || (r.deliveredQty ?? r.qty) !== r.qty
      ).length

      await db.order.update({
        where: { id },
        data: {
          status: 'RECEIVED_BY_DELIVERY',
          deliveredAt: new Date(),
          lockedAt: order.lockedAt ?? new Date(),
          correctionNote: p.correctionNote?.trim() ? p.correctionNote.trim() : order.correctionNote,
          history: {
            create: {
              userId: user.id,
              userName: user.name,
              action: 'ثبت دریافت توزیع',
              detail: discrepancies > 0 ? `${discrepancies} مغایرت ثبت شد` : 'دریافت کامل بدون مغایرت',
            },
          },
        },
      })
      await notifyRoles(['inventory', 'accountant', 'gm'], 'دریافت ثبت شد — نیازمند تأیید انبار', `${order.code} از ${order.providerName} توسط ${user.name} دریافت شد${discrepancies > 0 ? ` (${discrepancies} مغایرت)` : ''}.`, discrepancies > 0 ? 'WARNING' : 'INFO', 'deliveries', user.id)
      await logActivity(user.id, user.name, 'ثبت دریافت توزیع', 'Order', id, `${order.code} — ${discrepancies} مغایرت`)
      return ok({ success: true, status: 'RECEIVED_BY_DELIVERY', finalAmount: res.finalAmount, discrepancies, newBarcodes })
    }

    // --------- confirm inventory (+corrections): inventory (+managers) ---------
    case 'confirm_inventory': {
      if (!hasRole(user, 'inventory')) return fail('اجازه تأیید انبار را ندارید', 403)
      if (!['RECEIVED_BY_DELIVERY', 'RECEIVING'].includes(order.status)) return fail('سفارش هنوز دریافت نشده است')
      if (Array.isArray(p.items) && p.items.length > 0) await applyItemPatches(id, p.items)

      const fresh = await db.order.findUnique({ where: { id }, select: { finalAmount: true } })
      await db.order.update({
        where: { id },
        data: {
          status: 'CONFIRMED_BY_INVENTORY',
          confirmedAt: new Date(),
          lockedAt: order.lockedAt ?? new Date(),
          correctionNote: p.correctionNote?.trim() ? p.correctionNote.trim() : order.correctionNote,
          history: {
            create: {
              userId: user.id,
              userName: user.name,
              action: 'تأیید انبار',
              detail: `مبلغ نهایی ${Math.round(fresh?.finalAmount ?? 0).toLocaleString('fa-IR')} تومان`,
            },
          },
        },
      })
      await notifyRoles(['accountant'], 'آماده ثبت در هولو', `سفارش ${order.code} تأیید انبار شد و آماده ثبت حسابداری است.`, 'INFO', 'accounting', user.id)
      await logActivity(user.id, user.name, 'تأیید انبار سفارش', 'Order', id, order.code)
      return ok({ success: true, status: 'CONFIRMED_BY_INVENTORY' })
    }

    // --------- mark accounting done: accountant (+managers) ---------
    case 'mark_accounting_done': {
      if (!hasRole(user, 'accountant')) return fail('اجازه ثبت حسابداری را ندارید', 403)
      if (!['CONFIRMED_BY_INVENTORY', 'RECEIVED_BY_DELIVERY'].includes(order.status))
        return fail('سفارش در مرحله ثبت حسابداری نیست')

      const payment = p.payment
      if (payment && Number(payment.amount ?? 0) > 0) {
        await db.payment.create({
          data: {
            orderId: order.id,
            amount: Number(payment.amount),
            type: payment.type === 'CHEQUE' ? 'CHEQUE' : 'CASH_ON_DELIVERY',
            receiptNo: payment.receiptNo || null,
            posReceiptNo: payment.posReceiptNo || null,
            note: `ثبت هولو — ${order.code}`,
            userId: user.id,
          },
        })
      }

      await db.order.update({
        where: { id },
        data: {
          status: 'DONE',
          accountingDoneAt: new Date(),
          holooTotal: p.holooTotal !== undefined && p.holooTotal !== null && Number(p.holooTotal) > 0 ? Number(p.holooTotal) : order.holooTotal,
          history: {
            create: {
              userId: user.id,
              userName: user.name,
              action: 'ثبت در هولو',
              detail: `مبلغ هولو: ${p.holooTotal ? Math.round(p.holooTotal).toLocaleString('fa-IR') : '—'} تومان`,
            },
          },
        },
      })
      await notifyRoles(['owner', 'gm', 'pm', 'om'], `سفارش ${order.code} ثبت و تکمیل شد`, `ثبت هولو توسط ${user.name} انجام شد و چرخه سفارش تکمیل گردید.`, 'SUCCESS', 'accounting', user.id)
      await logActivity(user.id, user.name, 'ثبت سفارش در هولو', 'Order', id, order.code)
      return ok({ success: true, status: 'DONE' })
    }

    // --------- cancel: managers ---------
    case 'cancel': {
      if (!user.isManager) return fail('فقط مدیران می‌توانند سفارش را لغو کنند', 403)
      if (['DONE', 'CANCELLED'].includes(order.status)) return fail('این سفارش قابل لغو نیست')
      await db.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          history: {
            create: { userId: user.id, userName: user.name, action: 'لغو سفارش', detail: p.reason?.trim() || 'بدون دلیل' },
          },
        },
      })
      await notify(order.createdById, 'سفارش لغو شد', `${order.code} توسط ${user.name} لغو شد. دلیل: ${p.reason?.trim() || '—'}`, 'WARNING', 'orders')
      await logActivity(user.id, user.name, 'لغو سفارش', 'Order', id, `${order.code} — ${p.reason ?? ''}`)
      return ok({ success: true, status: 'CANCELLED' })
    }

    default:
      return fail('عملیات ناشناخته')
  }
}
