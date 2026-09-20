'use client'

// Orders section — pipeline list, detail dialog, role-based actions, wizard mount
import * as React from 'react'
import {
  SectionHeader, StatusBadge, StatCard, EmptyState, LoadingBlock, ChipSelect, ConfirmButton, OrnateDivider,
} from '@/components/platform/ui/shared'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus, Search, TriangleAlert, Truck, CheckCircle2, PackageCheck, Calculator, Pencil, Ban, Loader2, FileSpreadsheet, Printer, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { money, toFaDigits, isoDay, formatJalali, formatJalaliFull, formatJalaliDateTime, addDays } from '@/lib/jalali'
import { ORDER_STATUSES, orderStatusInfo, type OrderDTO, type OrderItemDTO, type OrderHistoryDTO } from '@/lib/types'
import { useApp } from '@/store/app'
import { NewOrderWizard } from './NewOrderWizard'
import {
  Toman, StatusTimeline, OrderItemsTable, ITEM_STATUSES, isOverdueOrder, useCatalog,
} from './commerce-bits'

interface OrderRow {
  id: string
  code: string
  providerName: string
  companyName?: string | null
  status: string
  paymentType: string
  receivingDate: string
  deliveredAt?: string | null
  confirmedAt?: string | null
  accountingDoneAt?: string | null
  totalAmount: number
  discount: number
  vat: number
  finalAmount: number
  holooTotal?: number | null
  note?: string | null
  correctionNote?: string | null
  lockedAt?: string | null
  createdById: string
  createdByName?: string
  createdAt: string
  itemsCount: number
}

interface OrderDetail extends OrderRow {
  items: OrderItemDTO[]
  history: OrderHistoryDTO[]
  providerPhone?: string | null
}

const STATUS_FILTERS = [{ key: 'ALL', label: 'همه', color: '#3E7C59' }, ...ORDER_STATUSES] as { key: string; label: string; color: string }[]

// ---------- printable order sheet (self-contained RTL HTML in a new window) ----------
function printOrderSheet(d: OrderDetail) {
  const rows = d.items
    .map((it, i) => {
      const price = it.correctedPrice ?? it.unitPrice
      const qty = it.deliveredQty ?? it.qty
      return `<tr>
        <td class="c">${toFaDigits(i + 1)}</td>
        <td class="mono">${it.barcode || '—'}</td>
        <td>${it.name}</td>
        <td class="c">${toFaDigits(qty)} ${it.unit}</td>
        <td class="c mono">${money(price)}</td>
        <td class="c mono">${money(it.discount)}</td>
        <td class="c mono">${money(it.vat)}</td>
        <td class="c mono">${money(it.total)}</td>
      </tr>`
    })
    .join('')
  const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8">
  <title>${d.code} — برگه سفارش</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; font-family: Vazirmatn, Tahoma, sans-serif; }
    body { margin: 0; color: #1d2a22; }
    .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px double #C9A227; padding-bottom: 12px; }
    .brand { font-size: 20px; font-weight: 900; color: #2c5443; }
    .brand small { display: block; font-size: 10px; font-weight: 400; color: #7d8a80; }
    .code { font-size: 16px; font-weight: 800; color: #8A6F3C; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
    th { background: #3E7C59; color: #fff; padding: 7px 6px; font-weight: 700; border: 1px solid #356b4c; }
    td { padding: 6px; border: 1px solid #d8d2c2; }
    tr:nth-child(even) td { background: #f7f4ea; }
    .c { text-align: center; } .mono { font-variant-numeric: tabular-nums; }
    .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 12px; font-size: 12px; }
    .meta div { border: 1px solid #d8d2c2; border-radius: 8px; padding: 6px 9px; background: #fbf9f2; }
    .meta b { color: #7d8a80; font-weight: 500; font-size: 10px; display: block; }
    .totals { margin-top: 12px; display: flex; justify-content: flex-start; gap: 10px; flex-wrap: wrap; font-size: 12px; }
    .totals div { border: 1px solid #d8d2c2; border-radius: 10px; padding: 7px 14px; background: #fbf9f2; }
    .grand { background: #3E7C59 !important; color: #fff; font-weight: 800; border-color: #356b4c !important; }
    .sign { margin-top: 34px; display: flex; justify-content: space-between; font-size: 12px; }
    .sign div { width: 30%; text-align: center; }
    .sign .line { margin-top: 26px; border-top: 1px dashed #9aa396; padding-top: 5px; color: #7d8a80; }
    .note { margin-top: 10px; font-size: 11px; background: #fdf6e3; border: 1px solid #e6d9a8; border-radius: 8px; padding: 7px 10px; }
    @media print { .noprint { display: none; } }
  </style></head><body>
  <div class="head">
    <div class="brand">هایپر زیتون <small>کرمان — برگه سفارش خرید</small></div>
    <div class="code mono">${d.code}</div>
  </div>
  <div class="meta">
    <div><b>تأمین‌کننده</b>${d.providerName}${d.companyName ? ' — ' + d.companyName : ''}</div>
    <div><b>تاریخ تحویل</b>${formatJalaliFull(d.receivingDate)}</div>
    <div><b>نوع پرداخت</b>${d.paymentType === 'CASH' ? 'نقدی هنگام تحویل' : 'چک'}</div>
    <div><b>ثبت‌کننده</b>${d.createdByName || '—'}</div>
    <div><b>تاریخ ثبت</b>${formatJalaliDateTime(d.createdAt)}</div>
    <div><b>تعداد اقلام</b>${toFaDigits(d.itemsCount)} قلم</div>
  </div>
  <table>
    <thead><tr><th>#</th><th>بارکد</th><th>شرح کالا</th><th>تعداد</th><th>قیمت واحد</th><th>تخفیف</th><th>مالیات بر ارزش افزوده</th><th>جمع کل</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div>جمع کالاها: <span class="mono">${money(d.totalAmount)}</span></div>
    <div>تخفیف: <span class="mono">${money(d.discount)}</span></div>
    <div>ارزش افزوده: <span class="mono">${money(d.vat)}</span></div>
    <div class="grand">مبلغ نهایی: <span class="mono">${money(d.finalAmount)}</span> تومان</div>
  </div>
  ${d.note ? `<div class="note">یادداشت: ${d.note}</div>` : ''}
  ${d.correctionNote ? `<div class="note">اصلاحیه: ${d.correctionNote}</div>` : ''}
  <div class="sign">
    <div><div class="line">امضای سفارش‌دهنده</div></div>
    <div><div class="line">امضای تأیید مدیریت</div></div>
    <div><div class="line">امضای دریافت کالا</div></div>
  </div>
  <script>window.onload = function () { window.print() }<\/script>
  </body></html>`
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) {
    toast({ title: 'اجازه باز شدن پنجره چاپ داده نشد', variant: 'destructive' })
    return
  }
  w.document.write(html)
  w.document.close()
}

export function Orders() {
  const user = useApp((s) => s.user)
  const setSection = useApp((s) => s.setSection)
  const quickAction = useApp((s) => s.quickAction)
  const setQuickAction = useApp((s) => s.setQuickAction)

  const [orders, setOrders] = React.useState<OrderRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL')
  const [search, setSearch] = React.useState('')
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<OrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [wizardOpen, setWizardOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<OrderDetail | null>(null)
  const [invDialogOpen, setInvDialogOpen] = React.useState(false)
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [cancelReason, setCancelReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const { data: catalog } = useCatalog()

  const canCreate = Boolean(user && (user.isManager || ['gm', 'pm', 'om', 'owner'].some((k) => user.roleKeys.includes(k))))
  const canApprove = Boolean(user && (user.isManager || ['gm', 'om', 'owner', 'pm'].some((k) => user.roleKeys.includes(k))))
  const isInventory = Boolean(user && (user.isManager || user.roleKeys.includes('inventory')))
  const isAccountant = Boolean(user && (user.isManager || user.roleKeys.includes('accountant')))

  const refresh = React.useCallback(async () => {
    try {
      const list = await api<OrderRow[]>('/api/orders')
      setOrders(list)
    } catch (e) {
      toast({ title: 'خطا در دریافت سفارش‌ها', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  const loadDetail = React.useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const d = await api<OrderDetail>(`/api/orders/${id}`)
      setDetail(d)
    } catch (e) {
      toast({ title: 'خطا در دریافت جزئیات', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setDetailLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (detailId) loadDetail(detailId)
    else setDetail(null)
  }, [detailId, loadDetail])

  // quick action from topbar FAB
  React.useEffect(() => {
    if (quickAction === 'new-order') {
      setEditing(null)
      setWizardOpen(true)
      setQuickAction(null)
    }
  }, [quickAction, setQuickAction])

  // smart reorder: fetch velocity-based suggestions → prefill wizard
  const orderSmart = async () => {
    try {
      const s = await api<{
        items: { id: string; suggestedQty: number }[]
        summary: { totalQty: number }
        providerGroups: { providerId: string | null; providerName: string; itemCount: number }[]
        allSameProvider: boolean
      }>('/api/reorders/suggestions')
      if (!s.items.length) {
        toast({ title: 'پیشنهادی نیست', description: 'همه اقلام پوشش کافی دارند — سفارش دستی ثبت کنید.' })
        return
      }
      try {
        window.localStorage.setItem(
          'hz_prefill_items',
          JSON.stringify(s.items.map((i) => ({ productId: i.id, qty: i.suggestedQty })))
        )
        // single-supplier suggestion → wizard opens with that provider pre-selected
        if (s.allSameProvider && s.providerGroups[0]?.providerId) {
          window.localStorage.setItem('hz_prefill_provider', s.providerGroups[0].providerId!)
        }
      } catch {
        /* storage unavailable */
      }
      setEditing(null)
      setWizardOpen(true)
      const provHint =
        s.providerGroups.length === 1
          ? ` تأمین‌کننده: ${s.providerGroups[0].providerName}.`
          : ` ${toFaDigits(s.providerGroups.length)} تأمین‌کننده درگیر — گروه‌ها را جداگانه ارسال کنید.`
      toast({
        title: `سفارش هوشمند آماده شد — ${toFaDigits(s.items.length)} قلم`,
        description:
          'تعدادها بر پایه فروش ۱۴ روز اخیر پیشنهاد شده؛ بازبینی کنید و تأیید بزنید.' + provHint,
      })
    } catch (e) {
      toast({ title: 'خطا در دریافت پیشنهادها', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    }
  }

  const doAction = async (action: string, payload?: Record<string, unknown>, successMsg?: string) => {
    if (!detail) return
    setBusy(true)
    try {
      await api(`/api/orders/${detail.id}/status`, { body: { action, payload: payload ?? {} } })
      toast({ title: successMsg ?? 'انجام شد ✅' })
      await loadDetail(detail.id)
      await refresh()
    } catch (e) {
      toast({ title: 'خطا در انجام عملیات', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  // ---------- filtering + grouping ----------
  const filtered = React.useMemo(() => {
    let list = orders
    if (statusFilter !== 'ALL') list = list.filter((o) => o.status === statusFilter)
    if (search.trim()) {
      const q = search.trim()
      list = list.filter((o) => o.code.includes(q) || o.providerName.includes(q))
    }
    return list
  }, [orders, statusFilter, search])

  const groups = React.useMemo(() => {
    const todayIso = isoDay(new Date())
    const tomorrowIso = isoDay(addDays(new Date(), 1))
    const map = new Map<string, OrderRow[]>()
    for (const o of filtered) {
      const key = isoDay(o.receivingDate)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(o)
    }
    const keys = Array.from(map.keys())
    const past = keys.filter((k) => k < todayIso).sort((a, b) => (a < b ? 1 : -1))
    const middle = keys.filter((k) => k === todayIso)
    const future = keys.filter((k) => k > todayIso).sort()
    const ordered = [...past, ...middle, ...future]
    return ordered.map((k) => ({
      key: k,
      label: k === todayIso ? 'امروز' : k === tomorrowIso ? 'فردا' : formatJalaliFull(new Date(k)),
      past: k < todayIso,
      today: k === todayIso,
      orders: map.get(k)!,
    }))
  }, [filtered])

  const stats = React.useMemo(() => {
    const pending = orders.filter((o) => o.status === 'PENDING_APPROVAL').length
    const active = orders.filter((o) => ['APPROVED', 'SENT', 'RECEIVING'].includes(o.status))
    return {
      pending,
      activeCount: active.length,
      activeAmount: active.reduce((s, o) => s + o.finalAmount, 0),
    }
  }, [orders])

  return (
    <div className="space-y-4">
      <SectionHeader
        title="سفارش‌ها"
        subtitle="چرخه کامل خرید: ثبت، تأیید، ارسال، دریافت، انبار و حسابداری"
        icon={<Plus className="h-6 w-6" />}
        actions={
          canCreate && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="touch-target font-bold gap-1.5 border-[#3E7C59]/40 text-[#3E7C59] hover:bg-[#3E7C59]/10 hover:text-[#3E7C59]"
                onClick={orderSmart}
                title="پیشنهاد بر پایه سرعت فروش ۱۴ روز اخیر"
              >
                <Sparkles className="h-4 w-4" /> پیشنهاد هوشمند
              </Button>
              <Button
                className="touch-target font-bold"
                onClick={() => {
                  setEditing(null)
                  setWizardOpen(true)
                }}
              >
                <Plus className="h-4 w-4" /> سفارش جدید
              </Button>
            </div>
          )
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard title="در انتظار تأیید" value={toFaDigits(stats.pending)} color="#C9A227" icon={<TriangleAlert className="h-5 w-5" />} />
        <StatCard title="در مسیر تحویل" value={toFaDigits(stats.activeCount)} color="#3E7C59" icon={<Truck className="h-5 w-5" />} />
        <StatCard title="مبلغ در جریان" value={<><span className="num">{money(stats.activeAmount)}</span></>} hint="تومان" color="#8A6F3C" />
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو بر اساس کد سفارش یا تأمین‌کننده…"
            className="pr-9 touch-target bg-card"
            aria-label="جستجوی سفارش"
          />
        </div>
      </div>
      <ChipSelect options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />

      {loading ? (
        <LoadingBlock rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Plus />}
          title="سفارشی یافت نشد"
          description={canCreate ? 'با دکمه «سفارش جدید» اولین سفارش را ثبت کنید' : 'هنوز سفارشی در این فیلتر وجود ندارد'}
          action={canCreate && <Button className="touch-target" onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4" /> سفارش جدید</Button>}
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.key}>
              <div className={cn('flex items-center gap-2 mb-2 text-sm font-bold', g.past && 'text-[#B33A3A]')}>
                {g.past && <TriangleAlert className="h-4 w-4" />}
                <span>{g.past ? `عقب‌افتاده — ${g.label}` : g.label}</span>
                <span className="num text-xs text-muted-foreground">({toFaDigits(g.orders.length)} سفارش)</span>
                <span className="flex-1 h-px bg-border" aria-hidden />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {g.orders.map((o) => (
                  <OrderCard key={o.id} order={o} onOpen={() => setDetailId(o.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* wizard */}
      <NewOrderWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSaved={refresh}
        editOrder={editing as unknown as OrderDTO | null}
      />

      {/* detail dialog */}
      <Dialog open={Boolean(detailId)} onOpenChange={(v) => { if (!v) setDetailId(null) }}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[92vh] overflow-y-auto p-4 md:p-6 space-y-4">
          {detailLoading || !detail ? (
            <LoadingBlock rows={4} />
          ) : (
            <>
              <DialogHeader className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="num text-lg">{detail.code}</DialogTitle>
                  <StatusInfo status={detail.status} />
                  {isOverdueOrder(detail) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#B33A3A] text-white px-2.5 py-1 text-[11px] font-bold">
                      <TriangleAlert className="h-3.5 w-3.5" /> عقب‌افتاده
                    </span>
                  )}
                </div>
                <DialogDescription className="text-xs leading-5">
                  {detail.providerName}
                  {detail.companyName ? ` — ${detail.companyName}` : ''}
                  {' • '}
                  {detail.paymentType === 'CASH' ? '💵 نقدی' : '🧾 چکی'}
                  {' • دریافت: '}
                  <span className="num">{formatJalali(detail.receivingDate)}</span>
                  {' • ثبت: '}
                  {detail.createdByName || '—'}
                  {' در '}
                  <span className="num">{formatJalaliDateTime(detail.createdAt)}</span>
                </DialogDescription>
                <OrnateDivider className="mt-1" />
              </DialogHeader>

              {/* totals */}
              <div className="glow-border-static rounded-2xl p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div><p className="text-muted-foreground">جمع کالاها</p><Toman v={detail.totalAmount} className="mt-1 block" /></div>
                  <div><p className="text-muted-foreground">تخفیف</p><Toman v={detail.discount} className="mt-1 block" /></div>
                  <div><p className="text-muted-foreground">ارزش افزوده</p><Toman v={detail.vat} className="mt-1 block" /></div>
                  <div><p className="text-muted-foreground">{toFaDigits(detail.itemsCount)} قلم</p><p className="num mt-1">{detail.lockedAt ? `قفل: ${formatJalali(detail.lockedAt)}` : 'قفل نشده'}</p></div>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">مبلغ نهایی</p>
                  <p className="num text-2xl font-extrabold text-primary">{money(detail.finalAmount)} <span className="text-xs font-normal text-muted-foreground">تومان</span></p>
                </div>
                {detail.holooTotal ? (
                  <p className="text-[11px] text-muted-foreground mt-1">هولو: <span className="num">{money(detail.holooTotal)}</span> تومان</p>
                ) : null}
              </div>

              {/* corrections + notes */}
              {detail.correctionNote && (
                <div className="rounded-xl border border-[#D9832E]/40 bg-[#D9832E]/10 p-3 text-xs leading-5" role="note">
                  <span className="font-bold text-[#B07D2B]">اصلاحیه: </span>
                  {detail.correctionNote}
                </div>
              )}
              {detail.note && (
                <div className="rounded-xl border border-border bg-card p-3 text-xs leading-5">
                  <span className="font-bold">یادداشت: </span>
                  {detail.note}
                </div>
              )}

              <div>
                <p className="text-xs font-bold mb-2">اقلام سفارش</p>
                <OrderItemsTable items={detail.items} bundle={catalog} />
              </div>

              <div>
                <p className="text-xs font-bold mb-2">تاریخچه وضعیت</p>
                <StatusTimeline history={detail.history} />
              </div>

              {/* actions */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                {detail.status === 'PENDING_APPROVAL' && canApprove && (
                  <Button className="touch-target" disabled={busy} onClick={() => doAction('approve', {}, 'سفارش تأیید شد ✅')}>
                    <CheckCircle2 className="h-4 w-4" /> تأیید سفارش
                  </Button>
                )}
                {detail.status === 'PENDING_APPROVAL' && (detail.createdById === user?.id || user?.isManager) && (
                  <Button variant="outline" className="touch-target" onClick={() => { setEditing(detail); setDetailId(null); setWizardOpen(true) }}>
                    <Pencil className="h-4 w-4" /> ویرایش
                  </Button>
                )}
                {detail.status === 'APPROVED' && (detail.createdById === user?.id || user?.isManager) && (
                  <Button className="touch-target" disabled={busy} onClick={() => doAction('send', {}, 'به تأمین‌کننده ارسال شد 📤')}>
                    <Truck className="h-4 w-4" /> ارسال به تأمین‌کننده
                  </Button>
                )}
                {detail.status === 'APPROVED' && !detail.lockedAt && (detail.createdById === user?.id || user?.isManager) && (
                  <Button variant="outline" className="touch-target" onClick={() => { setEditing(detail); setDetailId(null); setWizardOpen(true) }}>
                    <Pencil className="h-4 w-4" /> ویرایش
                  </Button>
                )}
                {['SENT', 'RECEIVING'].includes(detail.status) && (isInventory || user?.roleKeys.includes('delivery')) && (
                  <Button
                    className="touch-target"
                    disabled={busy}
                    onClick={async () => {
                      await doAction('start_receiving', {}, 'فرآیند دریافت آغاز شد 📦')
                      setDetailId(null)
                      setSection('deliveries')
                    }}
                  >
                    <PackageCheck className="h-4 w-4" /> شروع دریافت
                  </Button>
                )}
                {detail.status === 'RECEIVED_BY_DELIVERY' && isInventory && (
                  <Button className="touch-target" onClick={() => setInvDialogOpen(true)}>
                    <PackageCheck className="h-4 w-4" /> تأیید انبار
                  </Button>
                )}
                {detail.status === 'CONFIRMED_BY_INVENTORY' && (
                  <Button className="touch-target" onClick={() => { setDetailId(null); setSection('accounting') }}>
                    <Calculator className="h-4 w-4" /> ثبت در حسابداری
                  </Button>
                )}
                {['CONFIRMED_BY_INVENTORY', 'DONE'].includes(detail.status) && isAccountant && (
                  <Button variant="outline" className="touch-target" onClick={() => window.open(`/api/orders/${detail.id}/export`, '_blank')}>
                    <FileSpreadsheet className="h-4 w-4" /> خروجی اکسل
                  </Button>
                )}
                <Button variant="outline" className="touch-target" onClick={() => printOrderSheet(detail)}>
                  <Printer className="h-4 w-4" /> چاپ برگه سفارش
                </Button>
                {user?.isManager && !['DONE', 'CANCELLED'].includes(detail.status) && (
                  <ConfirmButton variant="destructive" className="touch-target" onConfirm={() => setCancelOpen(true)}>
                    <Ban className="h-4 w-4" /> لغو سفارش
                  </ConfirmButton>
                )}
              </div>
              {detail.lockedAt && !['CANCELLED', 'DONE'].includes(detail.status) && (
                <p className="text-[11px] text-[#B07D2B]">سفارش قفل شده است؛ اصلاحات به‌صورت «اصلاحیه» از مسیر دریافت/انبار ثبت می‌شود.</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* inventory confirm (corrections) */}
      {detail && (
        <InventoryConfirmDialog
          open={invDialogOpen}
          onOpenChange={setInvDialogOpen}
          items={detail.items}
          busy={busy}
          onSubmit={async (patches, correctionNote) => {
            await doAction('confirm_inventory', { items: patches, correctionNote }, 'انبار تأیید شد — آماده ثبت در هولو ✅')
            setInvDialogOpen(false)
          }}
        />
      )}

      {/* cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">لغو سفارش</DialogTitle>
            <DialogDescription className="text-xs">دلیل لغو را برای تاریخچه وارد کنید.</DialogDescription>
          </DialogHeader>
          <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="دلیل لغو…" className="min-h-20" aria-label="دلیل لغو" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="touch-target" onClick={() => setCancelOpen(false)}>انصراف</Button>
            <Button
              variant="destructive"
              size="sm"
              className="touch-target"
              disabled={busy}
              onClick={async () => {
                await doAction('cancel', { reason: cancelReason }, 'سفارش لغو شد')
                setCancelOpen(false)
                setCancelReason('')
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} لغو قطعی
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- order card ----------
function OrderCard({ order, onOpen }: { order: OrderRow; onOpen: () => void }) {
  const overdue = isOverdueOrder(order)
  const info = orderStatusInfo(order.status)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'text-right rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md touch-target w-full',
        overdue ? 'border-[#B33A3A] ring-1 ring-[#B33A3A]/30' : 'border-border'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="num font-bold text-sm">{order.code}</span>
        <StatusBadge label={info.label} color={info.color} />
      </div>
      <p className="text-sm mt-1.5">{order.providerName}{order.companyName ? ` — ${order.companyName}` : ''}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
        <span>{toFaDigits(order.itemsCount)} قلم</span>
        <span className="num font-bold text-foreground">{money(order.finalAmount)} تومان</span>
        <span>📅 <span className="num">{formatJalali(order.receivingDate)}</span></span>
        <span>{order.paymentType === 'CASH' ? '💵 نقدی' : '🧾 چکی'}</span>
        {overdue && <span className="inline-flex items-center gap-1 text-[#B33A3A] font-bold"><TriangleAlert className="h-3.5 w-3.5" /> عقب‌افتاده</span>}
      </div>
    </button>
  )
}

function StatusInfo({ status }: { status: string }) {
  const info = orderStatusInfo(status)
  return <StatusBadge label={info.label} color={info.color} />
}

// ---------- inventory confirm dialog (اصلاحیه انبار) ----------
function InventoryConfirmDialog({
  open, onOpenChange, items, busy, onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  items: OrderItemDTO[]
  busy: boolean
  onSubmit: (patches: Record<string, unknown>[], correctionNote: string) => Promise<void>
}) {
  const [rows, setRows] = React.useState<Record<string, { itemStatus: string; correctedPrice: string; issue: string }>>({})
  const [note, setNote] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    const init: Record<string, { itemStatus: string; correctedPrice: string; issue: string }> = {}
    for (const it of items) {
      init[it.id] = {
        itemStatus: it.itemStatus === 'PENDING' ? 'OK' : it.itemStatus,
        correctedPrice: it.correctedPrice ? String(it.correctedPrice) : '',
        issue: it.issue ?? '',
      }
    }
    setRows(init)
    setNote('')
  }, [open, items])

  const setRow = (id: string, patch: Partial<{ itemStatus: string; correctedPrice: string; issue: string }>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">تأیید انبار و اصلاحیه اقلام</DialogTitle>
          <DialogDescription className="text-xs">
            وضعیت و قیمت اقلام را بازبینی کنید؛ تغییرات به‌عنوان اصلاحیه ثبت می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          {items.map((it) => {
            const row = rows[it.id]
            if (!row) return null
            return (
              <div key={it.id} className={cn('rounded-xl border p-3 bg-card', row.itemStatus === 'CORRECTED' && 'border-[#D9832E]/50 bg-[#D9832E]/10')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold">{it.name}</p>
                  <span className="text-xs num text-muted-foreground">سفارش: {toFaDigits(Math.round(it.qty))} × {money(it.unitPrice)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {ITEM_STATUSES.filter((s) => s.key !== 'PENDING').map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={row.itemStatus === s.key}
                      onClick={() => setRow(it.id, { itemStatus: s.key })}
                      className={cn('rounded-lg px-3 py-2 text-xs font-bold border touch-target', row.itemStatus === s.key ? 'text-white border-transparent' : 'bg-card')}
                      style={row.itemStatus === s.key ? { backgroundColor: s.color } : { borderColor: `${s.color}55` }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Input
                    value={row.correctedPrice}
                    onChange={(e) => setRow(it.id, { correctedPrice: e.target.value.replace(/[^\d.]/g, '') })}
                    placeholder="قیمت اصلاح‌شده (تومان)"
                    inputMode="numeric"
                    className="h-10 flex-1 min-w-36 num text-xs"
                    aria-label={`قیمت اصلاح‌شده ${it.name}`}
                  />
                  <Input
                    value={row.issue}
                    onChange={(e) => setRow(it.id, { issue: e.target.value })}
                    placeholder="توضیح مغایرت…"
                    className="h-10 flex-1 min-w-36 text-xs"
                    aria-label={`توضیح مغایرت ${it.name}`}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="یادداشت اصلاحیه (اختیاری)…" className="min-h-16" aria-label="یادداشت اصلاحیه" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" className="touch-target" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button
            size="sm"
            className="touch-target font-bold"
            disabled={busy}
            onClick={() =>
              onSubmit(
                Object.entries(rows).map(([id, r]) => ({
                  id,
                  itemStatus: r.itemStatus,
                  correctedPrice: r.correctedPrice ? Number(r.correctedPrice) : undefined,
                  issue: r.issue || undefined,
                })),
                note
              )
            }
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} تأیید انبار
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
