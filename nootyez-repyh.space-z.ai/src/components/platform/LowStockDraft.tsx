'use client'
import * as React from 'react'
import { toast } from 'sonner'
import { PackageMinus, ShoppingCart, Wand2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { hasRole, type PUser, type ProductT, type SupplierT } from '@/lib/types'
import { addDaysISO, fmtJalali, fmtMoney, toFaDigits, todayISO } from '@/lib/jalali'
import {
  Badge, Card, EmptyState, GhostButton, inputCls, Loading, Modal,
  Money, PrimaryButton, Spinner, stockDot,
} from './kit'
import { JalaliDateField } from './JalaliCalendar'

/**
 * LowStockDraftModal — one-click "restock draft" generator.
 * Groups low-stock products (stock ≤ minStock) by supplier and creates one
 * DRAFT order per supplier via POST /api/orders (status DRAFT).
 * Suggested qty per product = minStock − stock (min 1), fully editable,
 * rows can be excluded. Products without supplier need a supplier picked
 * per group or they are skipped.
 */
export function LowStockDraftModal({ user, open, onClose }: {
  user: PUser
  open: boolean
  onClose: () => void
}) {
  const openOrder = useApp((s) => s.openOrder)

  const [loading, setLoading] = React.useState(false)
  const [products, setProducts] = React.useState<ProductT[]>([])
  const [suppliers, setSuppliers] = React.useState<SupplierT[]>([])
  const [qty, setQty] = React.useState<Record<number, string>>({})
  const [excluded, setExcluded] = React.useState<Record<number, boolean>>({})
  const [noSupSupplier, setNoSupSupplier] = React.useState<string>('')
  const [dueDate, setDueDate] = React.useState<string | null>(null)
  const [holidays, setHolidays] = React.useState<Record<string, string>>({})
  const [creating, setCreating] = React.useState(false)
  const [created, setCreated] = React.useState<{ code: string; id: number; supplier: string; lines: number; total: number }[]>([])

  const canCreate =
    hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'PRODUCT_MANAGER') ||
    hasRole(user, 'OPERATION_MANAGER') || hasRole(user, 'IT_ADMIN')

  const reset = () => {
    setQty({}); setExcluded({}); setNoSupSupplier(''); setCreated([])
  }

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [p, s, h] = await Promise.all([
        api.get<{ products: ProductT[] }>('/api/products?low=1&limit=500'),
        api.get<{ suppliers: SupplierT[] }>('/api/suppliers'),
        api.get<{ holidays: { date: string; title: string }[] }>('/api/holidays'),
      ])
      const list = p.products ?? []
      setProducts(list)
      setSuppliers(s.suppliers ?? [])
      setHolidays(Object.fromEntries((h.holidays ?? []).map((x) => [x.date, x.title])))
      setQty(Object.fromEntries(list.map((p2) => [p2.id, String(Math.max(1, Math.ceil(p2.minStock - p2.stock)))])))
      setDueDate(addDaysISO(todayISO(), 1))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت کمبود موجودی')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (open) { reset(); void load() }
  }, [open, load])

  /* ---------- grouping ---------- */
  const groups = React.useMemo(() => {
    const map = new Map<number, { supplierId: number | null; name: string; rows: ProductT[] }>()
    for (const p of products) {
      const sid = p.supplier?.id ?? null
      const name = p.supplier?.name ?? 'بدون تأمین‌کننده'
      const g = map.get(sid ?? -1) ?? { supplierId: sid, name, rows: [] }
      g.rows.push(p)
      map.set(sid ?? -1, g)
    }
    return [...map.values()].sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name, 'fa'))
  }, [products])

  const included = products.filter((p) => !excluded[p.id] && (p.supplier?.id || noSupSupplier))
  const totalCost = included.reduce((s, p) => s + (Number(qty[p.id]) || 0) * p.buyPrice, 0)
  const groupsToCreate = new Set(included.map((p) => p.supplier?.id ?? Number(noSupSupplier)))

  /* ---------- create ---------- */
  const createDrafts = async () => {
    if (!dueDate) { toast.error('تاریخ دریافت را انتخاب کنید'); return }
    if (holidays[dueDate]) { toast.error('تاریخ دریافت روی روز تعطیل است — روز دیگری انتخاب کنید'); return }
    if (included.length === 0) { toast.error('هیچ قلمی انتخاب نشده است'); return }
    setCreating(true)
    try {
      const results: typeof created = []
      for (const gid of groupsToCreate) {
        const rows = included.filter((p) => (p.supplier?.id ?? Number(noSupSupplier)) === gid)
        const items = rows.map((p) => ({
          productId: p.id,
          name: p.name,
          barcode: p.barcode ?? undefined,
          qty: Math.max(1, Number(qty[p.id]) || 1),
          unitCost: p.buyPrice,
          sellPrice: p.sellPrice,
        }))
        const subtotal = items.reduce((s, it) => s + it.qty * it.unitCost, 0)
        const order = await api.post<{ id: number; code: string }>('/api/orders', {
          supplierId: gid,
          status: 'DRAFT',
          userId: user.id,
          receivingDate: dueDate,
          paymentType: 'CHEQUE',
          note: `تولید خودکار از کمبود موجودی — ${rows.length} قلم (تاریخ ${fmtJalali(dueDate)})`,
          items,
          subtotal,
          total: subtotal,
        })
        results.push({
          id: order.id, code: order.code,
          supplier: rows[0]?.supplier?.name ?? suppliers.find((s2) => s2.id === gid)?.name ?? '—',
          lines: items.length, total: subtotal,
        })
      }
      setCreated(results)
      toast.success(`${toFaDigits(results.length)} پیش‌نویس سفارش ساخته شد ✓`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ساخت پیش‌نویس‌ها')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} wide title="سفارش خودکار از کمبود موجودی | Auto-draft restock">
      {loading ? (
        <Loading label="در حال دریافت کالاهای کم‌موجود…" />
      ) : created.length > 0 ? (
        /* ---------- success view ---------- */
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            <Wand2 className="h-5 w-5" />
            {toFaDigits(created.length)} پیش‌نویس سفارش ساخته شد — آماده بازبینی و ارسال برای تایید
          </div>
          {created.map((o) => (
            <Card key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="pz-barcode text-sm font-extrabold text-[#253A2A]">{o.code}</span>
                <Badge className="border-[#E4DCC8] bg-white text-[#4A5A44]">{o.supplier}</Badge>
                <span className="text-xs text-[#6B7A66]">{toFaDigits(o.lines)} قلم</span>
              </div>
              <div className="flex items-center gap-2">
                <Money value={o.total} className="text-sm font-bold text-[#8A6508]" />
                <GhostButton
                  className="min-h-[36px] px-2.5 py-1 text-xs"
                  onClick={() => { onClose(); openOrder(o.id) }}
                >
                  بازکردن سفارش
                </GhostButton>
              </div>
            </Card>
          ))}
          <div className="flex justify-end gap-2 border-t border-[#EFEAD8] pt-3">
            <GhostButton className="min-h-[44px]" onClick={onClose}>بستن</GhostButton>
            <GhostButton
              className="min-h-[44px]"
              onClick={() => { setCreated([]); void load() }}
            >
              <PackageMinus className="h-4 w-4" /> کمبودهای باقی‌مانده
            </GhostButton>
          </div>
        </div>
      ) : products.length === 0 ? (
        <EmptyState icon={<PackageMinus className="h-10 w-10" />} title="کمبود موجودی نداریم 🎉" hint="همه کالاها بالای حداقل موجودی هستند." />
      ) : (
        <div className="space-y-4">
          {!canCreate && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
              ایجاد سفارش فقط برای مدیران محصول/عملیات فعال است — می‌توانید فهرست را ببینید ولی ثبت با مدیران است.
            </div>
          )}

          {/* summary bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#EAD9A8] bg-[#FBF6E8] px-4 py-3">
            <div className="text-sm font-bold text-[#6B5B2A]">
              {toFaDigits(included.length)} قلم در {toFaDigits(groupsToCreate.size)} سفارش پیش‌نویس
            </div>
            <div className="text-sm font-bold text-[#8A6508]">
              برآورد خرید: <Money value={totalCost} className="text-sm" />
            </div>
          </div>

          {/* receiving date */}
          <div className="max-w-[290px]">
            <JalaliDateField
              label="تاریخ دریافت پیشنهادی"
              value={dueDate}
              onChange={setDueDate}
              holidays={holidays}
              minDate={todayISO()}
            />
            {dueDate && holidays[dueDate] && (
              <div className="mt-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">
                ⚠ این روز تعطیل است: {holidays[dueDate]}
              </div>
            )}
          </div>

          {/* supplier groups */}
          <div className="max-h-[46vh] space-y-3 overflow-y-auto pl-1 pz-scroll">
            {groups.map((g) => {
              const gid = g.supplierId ?? -1
              const chosenForNoSup = g.supplierId == null ? Number(noSupSupplier) : g.supplierId
              const skipped = g.supplierId == null && !noSupSupplier
              const gRows = g.rows.filter((p) => !excluded[p.id])
              const gTotal = gRows.reduce((s, p) => s + (Number(qty[p.id]) || 0) * p.buyPrice, 0)
              return (
                <Card key={gid} className={`p-3.5 ${skipped ? 'border-dashed border-amber-300' : ''}`}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-[#253A2A]">{g.name}</span>
                      <Badge className="border-[#E4DCC8] bg-white text-[#6B7A66]">{toFaDigits(g.rows.length)} قلم</Badge>
                      {skipped && <Badge className="border-amber-300 bg-amber-50 text-amber-800">بدون تأمین‌کننده — رد می‌شود</Badge>}
                    </div>
                    <Money value={gTotal} className="text-xs font-bold text-[#8A6508]" />
                  </div>

                  {g.supplierId == null && (
                    <div className="mb-2">
                      <select
                        className={`${inputCls} min-h-[40px] text-xs`}
                        value={noSupSupplier}
                        onChange={(e) => setNoSupSupplier(e.target.value)}
                        aria-label="انتخاب تأمین‌کننده برای کالاهای بدون تأمین‌کننده"
                      >
                        <option value="">— تأمین‌کننده این گروه را انتخاب کنید —</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={String(s.id)}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="divide-y divide-[#EFEAD8]">
                    {g.rows.map((p) => {
                      const off = !!excluded[p.id]
                      const suggested = Math.max(1, Math.ceil(p.minStock - p.stock))
                      const q = Number(qty[p.id]) || 0
                      return (
                        <div key={p.id} className={`flex items-center gap-2.5 py-2 ${off ? 'opacity-45' : ''}`}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={!off}
                            aria-label={`شامل کردن ${p.name}`}
                            onClick={() => setExcluded((m) => ({ ...m, [p.id]: !off }))}
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-xs font-black transition ${
                              off ? 'border-[#D8D2BC] bg-white text-transparent' : 'border-[#3E6B4A] bg-[#3E6B4A] text-white'
                            }`}
                          >
                            ✓
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-bold text-[#253A2A]" title={p.name}>{p.name}</div>
                            <div className={`text-[10px] font-semibold tabular-nums ${stockDot(p.stock, p.minStock)}`}>
                              موجودی {toFaDigits(Math.floor(p.stock))} / حداقل {toFaDigits(Math.floor(p.minStock))}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setQty((m) => ({ ...m, [p.id]: String(Math.max(1, q - 1)) }))}
                              className="h-9 w-8 rounded-lg border border-[#E4DCC8] bg-white font-black text-[#4A5A44] transition hover:bg-[#F3F7EF]"
                              aria-label="کاهش تعداد"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={qty[p.id] ?? ''}
                              onChange={(e) => setQty((m) => ({ ...m, [p.id]: e.target.value }))}
                              className="w-14 rounded-lg border border-[#D8D2BC] bg-white px-1 py-1.5 text-center text-xs font-bold tabular-nums"
                              aria-label={`تعداد سفارش ${p.name}`}
                            />
                            <button
                              type="button"
                              onClick={() => setQty((m) => ({ ...m, [p.id]: String(q + 1) }))}
                              className="h-9 w-8 rounded-lg border border-[#E4DCC8] bg-white font-black text-[#4A5A44] transition hover:bg-[#F3F7EF]"
                              aria-label="افزایش تعداد"
                            >
                              +
                            </button>
                            {q !== suggested && (
                              <button
                                type="button"
                                onClick={() => setQty((m) => ({ ...m, [p.id]: String(suggested) }))}
                                className="rounded-full border border-[#EAD9A8] bg-[#FBF6E8] px-2 py-1 text-[10px] font-bold text-[#8A6508] transition hover:bg-[#F5EDD3]"
                                title={`پیشنهاد سامانه: ${suggested}`}
                              >
                                پیشنهاد {toFaDigits(suggested)}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )
            })}
          </div>

          {/* actions */}
          <div className="flex flex-col gap-2 border-t border-[#EFEAD8] pt-3 sm:flex-row sm:justify-end">
            <GhostButton className="min-h-[44px]" onClick={onClose}>
              <X className="h-4 w-4" /> انصراف
            </GhostButton>
            <PrimaryButton
              className="min-h-[48px] text-base"
              onClick={() => void createDrafts()}
              disabled={creating || included.length === 0 || !canCreate || !!holidays[dueDate ?? ''] || !dueDate}
            >
              {creating ? <Spinner /> : <ShoppingCart className="h-4 w-4" />}
              ساخت {toFaDigits(groupsToCreate.size)} پیش‌نویس سفارش
            </PrimaryButton>
          </div>
          {included.length === 0 && products.length > 0 && (
            <p className="text-center text-[11px] font-semibold text-amber-700">حداقل یک قلم را انتخاب کنید</p>
          )}
        </div>
      )}
    </Modal>
  )
}
