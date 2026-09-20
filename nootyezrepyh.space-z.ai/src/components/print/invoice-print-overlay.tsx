'use client'

import * as React from 'react'
import { toFaDigits, formatMoney, formatJalaliDateTime } from '@/lib/jalali'
import { ORDER_STATUSES, PAYMENT_LABELS_FALLBACK } from '@/components/print/print-helpers'
import { Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface PrintableOrder {
  number: number
  supplierName: string
  status: string
  deliveryDate: string
  paymentType: string
  notes?: string | null
  createdAt: string
  createdByName?: string
  totalAmount: number
  discount: number
  tax: number
  vat: number
  finalAmount: number
  items: {
    productName: string
    barcode?: string | null
    quantity: number
    unitPrice: number
    receivedQty?: number | null
    printedPrice?: number | null
    discount: number
    lineTotal: number
    status?: string
  }[]
}

/** Formal print-friendly invoice overlay (matches paper archive format) */
export function InvoicePrintOverlay({ order, open, onClose }: { order: PrintableOrder | null; open: boolean; onClose: () => void }) {
  React.useEffect(() => {
    if (open) setTimeout(() => window.print(), 350)
  }, [open])

  if (!open || !order) return null
  const st = ORDER_STATUSES[order.status]

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 print-invoice-root theme-paper" dir="rtl">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative bg-white text-neutral-900 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto">
        {/* screen-only toolbar */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 border-b border-neutral-200 bg-white no-print">
          <div className="text-sm font-bold text-neutral-700">پیش‌نمایش چاپ فاکتور — سفارش #{toFaDigits(order.number)}</div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-olive hover:bg-olive/90 gap-1.5" onClick={() => window.print()}>
              <Printer className="size-4" /> چاپ
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="size-4" /> بستن
            </Button>
          </div>
        </div>

        {/* A4-ish printable body */}
        <div id="zeytoon-print-area" className="p-8 text-neutral-900" style={{ fontFamily: 'inherit' }}>
          {/* letterhead */}
          <div className="flex items-start justify-between border-b-2 border-double border-neutral-800 pb-4 mb-4">
            <div>
              <div className="text-xl font-black">هایپر زیتون کرمان</div>
              <div className="text-xs text-neutral-500 mt-1">سامانه مدیریت گردش کار — سند داخلی</div>
            </div>
            <div className="text-left">
              <div className="text-sm font-bold">فاکتور سفارش خرید</div>
              <div className="text-xs mt-1">شماره: {toFaDigits(order.number)}</div>
              <div className="text-xs">تاریخ ثبت: {formatJalaliDateTime(order.createdAt)}</div>
              <div className="text-xs">موعد تحویل: {toFaDigits(order.deliveryDate)}</div>
            </div>
          </div>

          {/* meta */}
          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div className="border border-neutral-300 rounded-lg p-3">
              <span className="text-neutral-500">تأمین‌کننده: </span>
              <span className="font-bold">{order.supplierName}</span>
            </div>
            <div className="border border-neutral-300 rounded-lg p-3">
              <span className="text-neutral-500">نوع پرداخت: </span>
              <span className="font-bold">{PAYMENT_LABELS_FALLBACK[order.paymentType] || order.paymentType}</span>
              {st && (
                <>
                  <span className="text-neutral-500"> — وضعیت: </span>
                  <span className="font-bold">{st.label}</span>
                </>
              )}
            </div>
          </div>

          {/* items */}
          <table className="w-full text-sm border-collapse mb-4">
            <thead>
              <tr className="bg-neutral-100">
                <th className="border border-neutral-300 p-2 text-right">#</th>
                <th className="border border-neutral-300 p-2 text-right">کالا</th>
                <th className="border border-neutral-300 p-2 text-center">بارکد</th>
                <th className="border border-neutral-300 p-2 text-center">تعداد</th>
                <th className="border border-neutral-300 p-2 text-center">قیمت واحد</th>
                <th className="border border-neutral-300 p-2 text-center">تخفیف</th>
                <th className="border border-neutral-300 p-2 text-center">جمع</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it, i) => {
                const qty = it.receivedQty ?? it.quantity
                return (
                  <tr key={i}>
                    <td className="border border-neutral-300 p-2 text-center">{toFaDigits(i + 1)}</td>
                    <td className="border border-neutral-300 p-2 font-medium">
                      {it.productName}
                      {it.status === 'MISSING' && <span className="text-red-600 text-xs font-bold"> (نیامده)</span>}
                      {it.status === 'REJECTED' && <span className="text-red-600 text-xs font-bold"> (مرجوع)</span>}
                    </td>
                    <td className="border border-neutral-300 p-2 text-center text-xs" dir="ltr">{toFaDigits(it.barcode || '—')}</td>
                    <td className="border border-neutral-300 p-2 text-center">{toFaDigits(Math.round(qty))}</td>
                    <td className="border border-neutral-300 p-2 text-center">{formatMoney(it.printedPrice ?? it.unitPrice)}</td>
                    <td className="border border-neutral-300 p-2 text-center">{formatMoney(it.discount)}</td>
                    <td className="border border-neutral-300 p-2 text-center font-bold">{formatMoney(qty * (it.printedPrice ?? it.unitPrice) - it.discount)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* totals */}
          <div className="flex justify-end mb-6">
            <div className="w-64 text-sm space-y-1">
              <div className="flex justify-between"><span>جمع اقلام:</span><b>{formatMoney(order.totalAmount)} تومان</b></div>
              <div className="flex justify-between"><span>تخفیف:</span><b>{formatMoney(order.discount)} تومان</b></div>
              <div className="flex justify-between"><span>مالیات:</span><b>{formatMoney(order.tax)} تومان</b></div>
              <div className="flex justify-between"><span>ارزش افزوده:</span><b>{formatMoney(order.vat)} تومان</b></div>
              <div className="flex justify-between border-t-2 border-neutral-800 pt-1 text-base"><span className="font-bold">مبلغ نهایی:</span><b>{formatMoney(order.finalAmount)} تومان</b></div>
            </div>
          </div>

          {order.notes && (
            <div className="border border-neutral-300 rounded-lg p-3 text-sm mb-8">
              <span className="text-neutral-500">یادداشت: </span>{order.notes}
            </div>
          )}

          {/* signatures */}
          <div className="grid grid-cols-3 gap-6 text-center text-xs text-neutral-600 mt-10">
            <div>
              <div className="border-t border-neutral-400 pt-2">تحویل‌گیرنده</div>
            </div>
            <div>
              <div className="border-t border-neutral-400 pt-2">سرپرست انبار</div>
            </div>
            <div>
              <div className="border-t border-neutral-400 pt-2">نماینده تأمین‌کننده</div>
            </div>
          </div>
          <div className="text-center text-[10px] text-neutral-400 mt-6">
            صادرشده توسط سامانه هایپر زیتون — {formatJalaliDateTime(new Date())}
          </div>
        </div>
      </div>
    </div>
  )
}
