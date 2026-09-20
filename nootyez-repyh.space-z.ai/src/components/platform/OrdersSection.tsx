'use client'

/**
 * Hyper Zeytoon — Orders section (Task 5-a)
 * The core workflow module: order list with status filters, full order detail
 * (timeline, items, totals, corrections, role-aware actions) and a 3-step
 * New/Edit Order wizard (supplier → products → review) with product history.
 * APIs: /api/orders, /api/orders/[id], /api/suppliers, /api/products, /api/export/order/[id]
 */
import * as React from 'react'
import {
  Plus, Minus, X, Search, Clock, Phone, ArrowRight, Pencil, Send, Ban,
  ThumbsUp, ThumbsDown, StickyNote, FileDown, CheckCheck, Truck, ShoppingCart,
  Building2, PackageSearch, ClipboardCheck, CalendarDays, Printer,
} from 'lucide-react'
import { api, downloadFile } from '@/lib/api'
import { useApp } from '@/lib/store'
import { fmtJalali, fmtJalaliTime, fmtMoney, toFaDigits, todayISO, addDaysISO } from '@/lib/jalali'
import { hasRole, ORDER_STATUS_LABELS, type PUser, type OrderT, type OrderItemT, type OrderEventT, type ProductT, type SupplierT } from '@/lib/types'
import {
  Card, SectionHeader, Badge, StatusBadge, Field, inputCls, PrimaryButton, GoldButton, GhostButton,
  DangerButton, EmptyState, Loading, Spinner, Modal, Tabs, TableWrap, Th, Td, Money, TimeAgo,
  ProductImage, stockDot,
} from '@/components/platform/kit'
import { JalaliDateField } from '@/components/platform/JalaliCalendar'
import { OrdersGridSkeleton } from '@/components/platform/Skeletons'
import { code39Svg } from '@/lib/code39'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/* ================= Types (shapes confirmed against the API routes) ================= */

/** GET /api/orders — list items only include qty/deliveredQty/confirmedQty/unitCost (no productId). */
interface OrderListItem extends Omit<OrderT, 'items'> {
  items: Array<{ qty: number; deliveredQty: number | null; confirmedQty: number | null; unitCost: number }>
  _count?: { items: number }
}

/** GET /api/orders/[id] — full order with items(+product), events, supplier, cheques. */
interface OrderDetail extends OrderT {
  items: Array<OrderItemT & { product?: { id: number; name: string; barcode: string | null; imageUrl: string | null } }>
  events?: OrderEventT[]
  cheques?: unknown[]
}

interface WizItem {
  id?: number
  productId: number | null
  name: string
  nameFa?: string | null
  barcode: string | null
  qty: number
  unitCost: number
  sellPrice: number
  imageUrl?: string | null
}

/* ================= Local maps ================= */

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'نقدی | Cash',
  CHEQUE: 'چک | Cheque',
  MIXED: 'ترکیبی | Mixed',
}

const KIND_LABELS: Record<string, string> = {
  DISTRIBUTOR: 'پخش | Distributor',
  PRODUCER: 'تولیدکننده | Producer',
  IMPORTER: 'واردکننده | Importer',
  RETAIL: 'خرده‌فروشی | Retail',
  OTHER: 'سایر | Other',
}

const EVENT_ACTION_LABELS: Record<string, string> = {
  CREATED: 'ایجاد سفارش',
  UPDATED: 'ویرایش سفارش',
  SUBMITTED: 'ارسال برای تایید',
  APPROVED: 'تایید مدیر',
  REJECTED: 'رد سفارش',
  CORRECTION: 'اصلاحیه',
  CANCELLED: 'لغو سفارش',
  RECEIVED: 'دریافت کالا',
  CONFIRMED: 'تایید نهایی انبار',
  DONE: 'بستن در حسابداری',
  BARCODE_ADDED: 'ثبت بارکد',
}

const ITEM_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  OK: { label: 'سالم | OK', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MISSING: { label: 'ناقص | Missing', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  REJECTED: { label: 'مردود | Rejected', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  PENDING: { label: 'در انتظار | Pending', cls: 'bg-stone-100 text-stone-600 border-stone-200' },
}

const STATUS_TABS = [
  { key: 'ACTIVE', label: 'همه فعال | All active' },
  ...(['DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'CONFIRMED', 'DONE'] as const).map((k) => ({
    key: k,
    label: ORDER_STATUS_LABELS[k] ?? k,
  })),
]

const WIZARD_STEPS = [
  { n: 1, label: 'تأمین‌کننده | Supplier' },
  { n: 2, label: 'کالاها | Products' },
  { n: 3, label: 'بازبینی | Review' },
]

function validPayment(t: string | null | undefined): 'CASH' | 'CHEQUE' | 'MIXED' {
  return t === 'CASH' || t === 'MIXED' ? t : 'CHEQUE'
}

function fmtPaymentBadgeCls(pt: string): string {
  if (pt === 'CASH') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (pt === 'MIXED') return 'border-violet-200 bg-violet-50 text-violet-700'
  return 'border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]'
}

/* ================= Main component ================= */

export default function OrdersSection({ user }: { user: PUser }) {
  const focusOrderId = useApp((s) => s.focusOrderId)
  const newOrderSignal = useApp((s) => s.newOrderSignal)

  const [mode, setMode] = React.useState<'list' | 'detail' | 'new'>('list')
  const [selectedOrderId, setSelectedOrderId] = React.useState<number | null>(null)
  const [editOrder, setEditOrder] = React.useState<OrderDetail | null>(null)

  const [statusFilter, setStatusFilter] = React.useState('ACTIVE')
  const [orders, setOrders] = React.useState<OrderListItem[] | null>(null)
  const [listLoading, setListLoading] = React.useState(true)

  const canCreate =
    hasRole(user, 'GENERAL_MANAGER') ||
    hasRole(user, 'PRODUCT_MANAGER') ||
    hasRole(user, 'OPERATION_MANAGER') ||
    hasRole(user, 'IT_ADMIN')

  const loadOrders = React.useCallback(async (filter: string) => {
    setListLoading(true)
    try {
      const q = filter === 'ACTIVE' ? '?active=1' : `?status=${encodeURIComponent(filter)}`
      const d = await api.get<{ orders: OrderListItem[] }>(`/api/orders${q}`)
      setOrders(d.orders)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت سفارش‌ها')
      setOrders([])
    } finally {
      setListLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadOrders(statusFilter)
  }, [statusFilter, loadOrders])

  /* Focus a specific order (e.g. clicked from notifications/activity feed → store.openOrder) */
  React.useEffect(() => {
    if (focusOrderId == null) return
    setSelectedOrderId(focusOrderId)
    setMode('detail')
    useApp.setState({ focusOrderId: null }) // clear focus after consuming
  }, [focusOrderId])

  /* Watch newOrderSignal: external "New Order" requests open the wizard (skip persisted initial value) */
  const lastSignal = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (lastSignal.current === null) {
      lastSignal.current = newOrderSignal
      return
    }
    if (newOrderSignal !== lastSignal.current) {
      lastSignal.current = newOrderSignal
      if (newOrderSignal > 0) {
        setEditOrder(null)
        setMode('new')
      }
    }
  }, [newOrderSignal])

  const backToList = () => {
    setMode('list')
    setEditOrder(null)
    loadOrders(statusFilter)
  }

  return (
    <div className="text-right">
      {mode === 'list' && (
        <>
          <SectionHeader
            title="سفارش‌ها | Orders"
            subtitle={orders ? `${toFaDigits(orders.length)} سفارش در این نما` : 'مدیریت چرخه سفارش‌های خرید'}
            icon={<ShoppingCart size={22} />}
            actions={
              canCreate && (
                <PrimaryButton onClick={() => { setEditOrder(null); setMode('new') }} className="min-h-[44px]">
                  <Plus size={17} /> سفارش جدید | New Order
                </PrimaryButton>
              )
            }
          />

          <Tabs tabs={STATUS_TABS} active={statusFilter} onChange={setStatusFilter} />

          {listLoading && !orders ? (
            <OrdersGridSkeleton count={6} />
          ) : !orders || orders.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart size={30} />}
              title="سفارشی یافت نشد | No orders found"
              hint={canCreate ? 'با دکمه «سفارش جدید» اولین سفارش را ثبت کنید.' : 'در این وضعیت سفارشی ثبت نشده است.'}
            />
          ) : (
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
              {orders.map((o) => (
                <OrderListCard key={o.id} order={o} onOpen={() => { setSelectedOrderId(o.id); setMode('detail') }} />
              ))}
            </div>
          )}
        </>
      )}

      {mode === 'detail' && selectedOrderId != null && (
        <OrderDetailView
          key={selectedOrderId}
          id={selectedOrderId}
          user={user}
          onBack={backToList}
          onEdit={(order) => { setEditOrder(order); setMode('new') }}
        />
      )}

      {mode === 'new' && (
        <NewOrderWizard
          user={user}
          editOrder={editOrder}
          onClose={backToList}
          onSaved={backToList}
        />
      )}
    </div>
  )
}

/* ================= List card ================= */

function OrderListCard({ order: o, onOpen }: { order: OrderListItem; onOpen: () => void }) {
  const isOverdue = o.status === 'APPROVED' && !!o.receivingDate && o.receivingDate.slice(0, 10) < todayISO()
  const itemCount = o._count?.items ?? o.items?.length ?? 0
  const totalQty = (o.items ?? []).reduce((s, it) => s + (it.qty || 0), 0)
  const doneQty = (o.items ?? []).reduce((s, it) => s + (it.confirmedQty ?? it.deliveredQty ?? 0), 0)
  const pct = totalQty > 0 ? Math.min(100, Math.round((doneQty / totalQty) * 100)) : 0
  const cancelled = o.status === 'CANCELLED'

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex min-h-[44px] w-full flex-col gap-2.5 rounded-2xl border border-[#E4DCC8] bg-white/90 p-4 text-right shadow-[0_2px_14px_-4px_rgba(90,74,32,0.14)] transition-all',
        'hover:-translate-y-0.5 hover:border-[#93C572] hover:shadow-md active:translate-y-0',
        cancelled && 'opacity-60'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <span className="pz-barcode shrink-0 text-base font-extrabold tracking-wider text-[#253A2A]">{o.code}</span>
        <span className="min-w-0 max-w-full"><StatusBadge status={o.status} /></span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-bold text-[#3E6B4A]">{o.supplier?.name ?? '—'}</span>
        <Badge className={cn('shrink-0 text-[10px]', fmtPaymentBadgeCls(o.paymentType))}>
          {PAYMENT_LABELS[o.paymentType] ?? o.paymentType}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6B7A66]">
        <span className="flex items-center gap-1 tabular-nums">
          <CalendarDays size={13} /> دریافت: {fmtJalali(o.receivingDate)}
        </span>
        {isOverdue && <Badge className="border-rose-300 bg-red-100 font-bold text-red-700">معوق | Overdue</Badge>}
        <span className="tabular-nums">{toFaDigits(itemCount)} قلم | items</span>
      </div>

      {pct > 0 && (
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EFEAD8]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#93C572] to-[#3E6B4A] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-[10px] font-semibold text-[#8A9884]">تحویل/تایید {toFaDigits(pct)}٪</div>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#EFEAD8] pt-2.5">
        <Money value={o.total} className="text-sm font-extrabold text-[#8A6508]" />
        <TimeAgo iso={o.createdAt} />
      </div>
    </button>
  )
}

/* ================= Detail view ================= */

function OrderDetailView({ id, user, onBack, onEdit }: {
  id: number
  user: PUser
  onBack: () => void
  onEdit: (order: OrderDetail) => void
}) {
  const setView = useApp((s) => s.setView)
  const [order, setOrder] = React.useState<OrderDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [corrOpen, setCorrOpen] = React.useState(false)
  const [corrText, setCorrText] = React.useState('')
  const [printOpen, setPrintOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setOrder(await api.get<OrderDetail>(`/api/orders/${id}`))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت سفارش')
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => { load() }, [load])

  const act = async (body: Record<string, unknown>, successMsg: string) => {
    setBusy(String(body.action))
    try {
      const fresh = await api.patch<OrderDetail>(`/api/orders/${id}`, { userId: user.id, ...body })
      setOrder(fresh)
      toast.success(successMsg)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'عملیات ناموفق بود')
    } finally {
      setBusy(null)
    }
  }

  /* ---------- role flags ---------- */
  const isCreator = order?.createdById === user.id
  const isGM = hasRole(user, 'GENERAL_MANAGER')
  const isPM = hasRole(user, 'PRODUCT_MANAGER')
  const isOM = hasRole(user, 'OPERATION_MANAGER')
  const isIT = hasRole(user, 'IT_ADMIN')
  const isAcc = hasRole(user, 'ACCOUNTANT')
  const isInv = hasRole(user, 'INVENTORY_SUPERVISOR')

  if (loading && !order) {
    return (
      <div>
        <GhostButton onClick={onBack} className="mb-4 min-h-[44px]"><ArrowRight size={16} /> بازگشت | Back</GhostButton>
        <Loading label="در حال دریافت سفارش…" />
      </div>
    )
  }
  if (!order) {
    return (
      <div>
        <GhostButton onClick={onBack} className="mb-4 min-h-[44px]"><ArrowRight size={16} /> بازگشت | Back</GhostButton>
        <EmptyState title="سفارش یافت نشد | Order not found" />
      </div>
    )
  }

  const st = order.status
  const canEdit = (st === 'DRAFT' || st === 'SUBMITTED') && (isCreator || isGM || isPM || isOM || isIT)
  const canSubmit = st === 'DRAFT' && (isCreator || isGM || isPM || isOM || isIT)
  const canCancel = ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(st) && (isCreator || isGM || isPM || isOM || isIT)
  const canCorrect = ['APPROVED', 'RECEIVED', 'CONFIRMED'].includes(st) && (isGM || isPM || isOM)
  const canExportDone = st === 'CONFIRMED' && isAcc
  const canGoDeliveries = st === 'RECEIVED' && isInv
  const canApprove = st === 'SUBMITTED' && isGM

  const isOverdue = st === 'APPROVED' && !!order.receivingDate && order.receivingDate.slice(0, 10) < todayISO()
  const showDelivered = order.items.some((it) => it.deliveredQty != null)
  const showConfirmed = order.items.some((it) => it.confirmedQty != null)
  const lineTotal = (it: OrderItemT) => (it.finalCost ?? it.unitCost) * (it.confirmedQty ?? it.deliveredQty ?? it.qty)
  const vatPct = order.subtotal > 0 ? Math.round((order.vat / order.subtotal) * 100) : 9

  return (
    <div className="space-y-4 text-right">
      <div className="flex flex-wrap items-center gap-2">
        <GhostButton onClick={onBack} className="min-h-[44px]"><ArrowRight size={16} /> بازگشت | Back</GhostButton>
        {canGoDeliveries && (
          <GhostButton onClick={() => setView('deliveries')} className="min-h-[44px]">
            <Truck size={16} /> دریافت‌ها | Deliveries
          </GhostButton>
        )}
        <GhostButton onClick={() => { setPrintOpen(true); setTimeout(() => window.print(), 120) }} className="min-h-[44px]">
          <Printer size={16} /> چاپ سفارش | Print PO
        </GhostButton>
      </div>

      {/* ---------- Header ---------- */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pz-barcode text-xl font-extrabold tracking-wider text-[#253A2A] sm:text-2xl">{order.code}</span>
          <StatusBadge status={order.status} />
          <Badge className={fmtPaymentBadgeCls(order.paymentType)}>{PAYMENT_LABELS[order.paymentType] ?? order.paymentType}</Badge>
          {isOverdue && <Badge className="border-rose-300 bg-red-100 font-bold text-red-700">معوق | Overdue</Badge>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B7A66] sm:text-sm">
          <span>تأمین‌کننده: <span className="font-bold text-[#3E6B4A]">{order.supplier?.name ?? '—'}</span></span>
          <span className="flex items-center gap-1 tabular-nums">
            <CalendarDays size={13} /> تاریخ دریافت: <span className="font-semibold">{fmtJalali(order.receivingDate)}</span>
          </span>
          <span>ثبت: <TimeAgo iso={order.createdAt} /></span>
        </div>
        {order.note && (
          <div className="mt-3 rounded-xl border border-[#EFEAD8] bg-[#FBF9F3] p-2.5 text-xs leading-5 text-[#6B7A66]">
            <span className="font-bold text-[#4A5A44]">یادداشت: </span>
            <span className="whitespace-pre-line">{order.note}</span>
          </div>
        )}
      </Card>

      {/* ---------- Actions ---------- */}
      {(canEdit || canSubmit || canCancel || canCorrect || canExportDone || canApprove) && (
        <Card className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
          {canEdit && (
            <GhostButton onClick={() => onEdit(order)} disabled={busy !== null} className="min-h-[44px]">
              <Pencil size={15} /> ویرایش | Edit
            </GhostButton>
          )}
          {canSubmit && (
            <PrimaryButton onClick={() => act({ action: 'submit' }, 'سفارش برای تایید ارسال شد')} disabled={busy !== null} className="min-h-[44px]">
              {busy === 'submit' ? <Spinner /> : <Send size={15} />} ارسال برای تایید | Submit
            </PrimaryButton>
          )}
          {canApprove && (
            <PrimaryButton onClick={() => act({ action: 'approve' }, 'سفارش تایید شد')} disabled={busy !== null} className="min-h-[44px]">
              {busy === 'approve' ? <Spinner /> : <ThumbsUp size={15} />} تایید سفارش | Approve
            </PrimaryButton>
          )}
          {canApprove && (
            <DangerButton
              onClick={() => {
                const reason = window.prompt('دلیل رد سفارش | Reason for rejection:')
                if (reason === null) return
                act({ action: 'reject', reason }, 'سفارش رد شد و به پیش‌نویس بازگشت')
              }}
              disabled={busy !== null}
              className="min-h-[44px]"
            >
              {busy === 'reject' ? <Spinner /> : <ThumbsDown size={15} />} رد سفارش | Reject
            </DangerButton>
          )}
          {canCorrect && (
            <GhostButton onClick={() => { setCorrText(''); setCorrOpen(true) }} disabled={busy !== null} className="min-h-[44px]">
              <StickyNote size={15} /> افزودن اصلاحیه | Correction
            </GhostButton>
          )}
          {canExportDone && (
            <GoldButton
              onClick={async () => {
                try {
                  await downloadFile(`/api/export/order/${order.id}?userId=${user.id}`, `${order.code}.xls`)
                  toast.success('خروجی Holoo دانلود شد | Excel exported')
                } catch {
                  toast.error('دانلود خروجی ناموفق بود')
                }
              }}
              className="min-h-[44px]"
            >
              <FileDown size={15} /> خروجی Holoo (Excel)
            </GoldButton>
          )}
          {canExportDone && (
            <PrimaryButton
              onClick={() => act({ action: 'done' }, 'سفارش بسته شد (+۵ امتیاز) | Order done')}
              disabled={busy !== null}
              className="min-h-[44px]"
            >
              {busy === 'done' ? <Spinner /> : <CheckCheck size={15} />} ثبت نهایی / بستن سفارش
            </PrimaryButton>
          )}
          {canCancel && (
            <DangerButton
              onClick={() => {
                if (!window.confirm('سفارش لغو شود؟ این عمل قابل بازگشت نیست | Cancel this order?')) return
                act({ action: 'cancel' }, 'سفارش لغو شد')
              }}
              disabled={busy !== null}
              className="min-h-[44px]"
            >
              {busy === 'cancel' ? <Spinner /> : <Ban size={15} />} لغو سفارش | Cancel
            </DangerButton>
          )}
        </Card>
      )}

      {/* ---------- Corrections panel ---------- */}
      {order.correction && (
        <div className="rounded-2xl border border-amber-300 bg-gradient-to-l from-amber-50 to-[#FBF3DC] p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-bold text-[#8A6508]">
            <StickyNote size={16} /> اصلاحات | Corrections
          </div>
          <div className="whitespace-pre-line text-xs leading-6 text-[#7A5C2E]">{order.correction}</div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---------- Items table ---------- */}
        <div className="lg:col-span-2">
          <TableWrap>
            <thead>
              <tr>
                <Th>کالا | Item</Th>
                <Th>بارکد | Barcode</Th>
                <Th className="text-center">تعداد | Qty</Th>
                {showDelivered && <Th className="text-center">تحویل | Delivered</Th>}
                {showConfirmed && <Th className="text-center">تایید انبار | Confirmed</Th>}
                <Th>قیمت واحد | Unit cost</Th>
                <Th>قیمت فروش | Sell price</Th>
                <Th>جمع ردیف | Line total</Th>
                <Th>وضعیت | Status</Th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => {
                const sm = ITEM_STATUS_MAP[it.status] ?? ITEM_STATUS_MAP.PENDING
                return (
                  <tr key={it.id} className="transition hover:bg-[#FBF9F3]">
                    <Td>
                      <div className="font-semibold text-[#253A2A]">{it.product?.name ?? it.name}</div>
                      {it.product?.name && it.name !== it.product.name && (
                        <div className="text-[11px] text-[#8A9884]">{it.name}</div>
                      )}
                    </Td>
                    <Td><span className="pz-barcode text-xs text-[#6B7A66]">{it.barcode ?? '—'}</span></Td>
                    <Td className="text-center font-bold tabular-nums">{toFaDigits(it.qty)}</Td>
                    {showDelivered && <Td className="text-center tabular-nums">{it.deliveredQty != null ? toFaDigits(it.deliveredQty) : '—'}</Td>}
                    {showConfirmed && <Td className="text-center tabular-nums">{it.confirmedQty != null ? toFaDigits(it.confirmedQty) : '—'}</Td>}
                    <Td><Money value={it.finalCost ?? it.unitCost} /></Td>
                    <Td><Money value={it.sellPrice} /></Td>
                    <Td><Money value={lineTotal(it)} className="font-bold" /></Td>
                    <Td><Badge className={sm.cls}>{sm.label}</Badge></Td>
                  </tr>
                )
              })}
              {order.items.length === 0 && (
                <tr><Td className="py-6 text-center text-[#8A9884]">قلمی ثبت نشده | No items</Td></tr>
              )}
            </tbody>
          </TableWrap>

          {/* ---------- Totals ---------- */}
          <Card className="mt-4 p-4">
            <h3 className="mb-3 text-sm font-bold text-[#253A2A]">جمع‌بندی مالی | Totals</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[#6B7A66]">جمع اقلام | Subtotal</span>
                <Money value={order.subtotal} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6B7A66]">مالیات بر ارزش افزوده ({toFaDigits(vatPct)}٪) | VAT</span>
                <Money value={order.vat} />
              </div>
              {order.discount > 0 && (
                <div className="flex items-center justify-between text-rose-700">
                  <span>تخفیف | Discount</span>
                  <Money value={-order.discount} />
                </div>
              )}
              <div className="flex items-center justify-between border-t border-[#EFEAD8] pt-2.5">
                <span className="font-bold text-[#253A2A]">مبلغ نهایی | Total</span>
                <Money value={order.total} className="text-base font-extrabold text-[#8A6508]" />
              </div>
            </div>
          </Card>
        </div>

        {/* ---------- Timeline ---------- */}
        <Card className="p-4 lg:col-span-1">
          <h3 className="mb-4 text-sm font-bold text-[#253A2A]">رویدادهای سفارش | Timeline</h3>
          {(order.events ?? []).length === 0 ? (
            <EmptyState title="رویدادی ثبت نشده" />
          ) : (
            <ol className="relative space-y-4 border-r-2 border-[#E4DCC8] pr-5">
              {(order.events ?? []).map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -right-[28px] top-1 h-3 w-3 rounded-full border-2 border-white bg-[#5F8F55] shadow" />
                  <div className="text-sm font-bold text-[#33402F]">{EVENT_ACTION_LABELS[ev.action] ?? ev.action}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#6B7A66]">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: '#93C572' }} />
                    {ev.userName}
                  </div>
                  {ev.detail && <div className="mt-0.5 text-xs leading-5 text-[#8A9884]">{ev.detail}</div>}
                  <div className="mt-1 text-[11px] tabular-nums text-[#A8A28C]">{fmtJalaliTime(ev.createdAt)}</div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* ---------- Correction modal ---------- */}
      <Modal open={corrOpen} onClose={() => setCorrOpen(false)} title="افزودن اصلاحیه | Add correction">
        <Field label="متن اصلاحیه | Correction text" required>
          <textarea
            className={inputCls}
            rows={4}
            value={corrText}
            onChange={(e) => setCorrText(e.target.value)}
            placeholder="مثلاً: تعداد قلم دوم بر اساس فاکتور اصلاح شود…"
          />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <GhostButton onClick={() => setCorrOpen(false)} className="min-h-[44px]">انصراف | Cancel</GhostButton>
          <PrimaryButton
            disabled={!corrText.trim() || busy !== null}
            onClick={async () => {
              await act({ action: 'correct', correction: corrText.trim() }, 'اصلاحیه ثبت شد')
              setCorrOpen(false)
            }}
            className="min-h-[44px]"
          >
            {busy === 'correct' ? <Spinner /> : <StickyNote size={15} />} ثبت اصلاحیه
          </PrimaryButton>
        </div>
      </Modal>

      {/* ---------- Print sheet (visible only when printing) ---------- */}
      {printOpen && (
        <div className="pz-print-only" dir="rtl">
          <div style={{ fontFamily: 'inherit', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #3E6B4A', paddingBottom: 10, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>هایپر زیتون — Hyper Zeytoon</div>
                <div style={{ fontSize: 11, color: '#555' }}>سفارش خرید | Purchase Order</div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>{order.code}</div>
                <div style={{ fontSize: 11, color: '#555' }}>{fmtJalaliTime(new Date())}</div>
              </div>
            </div>
            <table style={{ width: '100%', fontSize: 12, marginBottom: 12 }}>
              <tbody>
                <tr>
                  <td style={{ padding: '3px 0' }}><b>تأمین‌کننده:</b> {order.supplier?.name ?? '—'}</td>
                  <td style={{ padding: '3px 0' }}><b>تاریخ دریافت:</b> {fmtJalali(order.receivingDate)}</td>
                  <td style={{ padding: '3px 0' }}><b>نوع پرداخت:</b> {PAYMENT_LABELS[order.paymentType]?.split('|')[0].trim() ?? order.paymentType}</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 0' }}><b>وضعیت:</b> {ORDER_STATUS_LABELS[order.status]?.split('|')[0].trim() ?? order.status}</td>
                  <td style={{ padding: '3px 0' }}><b>تاریخ ثبت:</b> {fmtJalali(order.createdAt)}</td>
                  <td style={{ padding: '3px 0', fontWeight: 700 }}><b>شماره سفارش:</b> <span className="pz-barcode">{order.code}</span></td>
                </tr>
              </tbody>
            </table>
            {/* Code39 barcode of the order code — scanned for quick delivery check-in */}
            <div style={{ margin: '10px 0 12px', width: '58%' }}>
              <div
                data-code39
                data-code39-value={order.code}
                dangerouslySetInnerHTML={{ __html: code39Svg(order.code, { height: 46, responsive: true }) }}
              />
              <div style={{ marginTop: 3, fontSize: 10, color: '#555' }}>
                اسکن بارکد برای ثبت دریافت سریع کالا | Scan for quick delivery receipt
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#F0EDE0' }}>
                  <th style={{ border: '1px solid #999', padding: 5, textAlign: 'right' }}>کالا</th>
                  <th style={{ border: '1px solid #999', padding: 5 }}>بارکد</th>
                  <th style={{ border: '1px solid #999', padding: 5 }}>تعداد</th>
                  <th style={{ border: '1px solid #999', padding: 5 }}>فی (تومان)</th>
                  <th style={{ border: '1px solid #999', padding: 5 }}>جمع (تومان)</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it, i) => (
                  <tr key={it.id}>
                    <td style={{ border: '1px solid #999', padding: 5 }}>{toFaDigits(i + 1)} — {it.name}</td>
                    <td style={{ border: '1px solid #999', padding: 5, direction: 'ltr', textAlign: 'center' }}>{it.barcode ?? '—'}</td>
                    <td style={{ border: '1px solid #999', padding: 5, textAlign: 'center' }}>{toFaDigits(it.qty)}</td>
                    <td style={{ border: '1px solid #999', padding: 5, textAlign: 'center' }}>{fmtMoney(it.finalCost ?? it.unitCost)}</td>
                    <td style={{ border: '1px solid #999', padding: 5, textAlign: 'center' }}>{fmtMoney((it.finalCost ?? it.unitCost) * it.qty)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#F7F4E8', fontWeight: 700 }}>
                  <td colSpan={4} style={{ border: '1px solid #999', padding: 5, textAlign: 'left' }}>جمع اقلام</td>
                  <td style={{ border: '1px solid #999', padding: 5, textAlign: 'center' }}>{fmtMoney(order.subtotal || order.total)}</td>
                </tr>
                {order.vat > 0 && (
                  <tr>
                    <td colSpan={4} style={{ border: '1px solid #999', padding: 5, textAlign: 'left' }}>
                      مالیات بر ارزش افزوده{order.subtotal > 0 ? ` (${toFaDigits(Math.round((order.vat / order.subtotal) * 100))}٪)` : ''}
                    </td>
                    <td style={{ border: '1px solid #999', padding: 5, textAlign: 'center' }}>{fmtMoney(order.vat)}</td>
                  </tr>
                )}
                {order.discount > 0 && (
                  <tr>
                    <td colSpan={4} style={{ border: '1px solid #999', padding: 5, textAlign: 'left' }}>تخفیف</td>
                    <td style={{ border: '1px solid #999', padding: 5, textAlign: 'center' }}>{fmtMoney(order.discount)}</td>
                  </tr>
                )}
                <tr style={{ background: '#EFEAD8', fontWeight: 900 }}>
                  <td colSpan={4} style={{ border: '1px solid #999', padding: 5, textAlign: 'left' }}>مبلغ نهایی | Grand total</td>
                  <td style={{ border: '1px solid #999', padding: 5, textAlign: 'center' }}>{fmtMoney(order.total)}</td>
                </tr>
              </tbody>
            </table>
            {order.note && <div style={{ marginTop: 10, fontSize: 11 }}><b>یادداشت:</b> {order.note}</div>}
            {order.correction && <div style={{ marginTop: 6, fontSize: 11, color: '#8A6508' }}><b>اصلاحات:</b> {order.correction}</div>}
            <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span>مهر و امضای تأمین‌کننده: ....................</span>
              <span>تأیید مدیریت: ....................</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================= New / Edit order wizard ================= */

function NewOrderWizard({ user, editOrder, onClose, onSaved }: {
  user: PUser
  editOrder: OrderDetail | null
  onClose: () => void
  onSaved: () => void
}) {
  const [suppliers, setSuppliers] = React.useState<SupplierT[] | null>(null)
  const [products, setProducts] = React.useState<ProductT[] | null>(null)
  const [step, setStep] = React.useState(1)
  const [supplierId, setSupplierId] = React.useState<number | null>(editOrder?.supplierId ?? null)
  const [supSearch, setSupSearch] = React.useState('')
  const [prodSearch, setProdSearch] = React.useState('')
  const [items, setItems] = React.useState<WizItem[]>(
    editOrder
      ? editOrder.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          name: it.name,
          nameFa: it.product?.name ?? null,
          barcode: it.barcode,
          qty: it.qty,
          unitCost: it.unitCost,
          sellPrice: it.sellPrice,
          imageUrl: it.product?.imageUrl ?? null,
        }))
      : []
  )
  const [receivingDate, setReceivingDate] = React.useState<string>(
    editOrder?.receivingDate ? editOrder.receivingDate.slice(0, 10) : addDaysISO(todayISO(), 1)
  )
  const [paymentType, setPaymentType] = React.useState<string>(editOrder?.paymentType ?? 'CHEQUE')
  const [note, setNote] = React.useState(editOrder?.note ?? '')
  const [saving, setSaving] = React.useState(false)
  const [historyProduct, setHistoryProduct] = React.useState<ProductT | null>(null)

  /* Fetch suppliers + products once per wizard open */
  React.useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const [s, p] = await Promise.all([
          api.get<{ suppliers: SupplierT[] }>('/api/suppliers'),
          api.get<{ products: ProductT[] }>('/api/products?limit=500'),
        ])
        if (!on) return
        setSuppliers(s.suppliers)
        setProducts(p.products)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'خطا در دریافت داده‌های سفارش')
      }
    })()
    return () => { on = false }
  }, [])

  const supplier = suppliers?.find((s) => s.id === supplierId) ?? null
  const subtotal = items.reduce((s, it) => s + it.qty * it.unitCost, 0)
  const vat = Math.round(subtotal * 0.09)
  const total = subtotal + vat

  /* ----- product quantity helpers ----- */
  const qtyOf = (pid: number) => items.find((it) => it.productId === pid)?.qty ?? 0
  const changeQty = (p: ProductT, delta: number) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.productId === p.id)
      if (idx === -1) {
        if (delta <= 0) return prev
        return [
          ...prev,
          {
            productId: p.id,
            name: p.name,
            nameFa: p.nameFa,
            barcode: p.barcode,
            qty: delta,
            unitCost: p.buyPrice,
            sellPrice: p.sellPrice,
            imageUrl: p.imageUrl,
          },
        ]
      }
      const next = [...prev]
      const q = next[idx].qty + delta
      if (q <= 0) next.splice(idx, 1)
      else next[idx] = { ...next[idx], qty: q }
      return next
    })
  }

  /* ----- filtering ----- */
  const q = prodSearch.trim().toLowerCase()
  const matchP = (p: ProductT) =>
    !q || [p.name, p.nameFa, p.barcode].some((v) => (v ?? '').toLowerCase().includes(q))
  const supProducts = (products ?? []).filter((p) => p.supplierId === supplierId && matchP(p))
  const otherProducts = (products ?? []).filter((p) => p.supplierId !== supplierId && matchP(p))

  const sq = supSearch.trim().toLowerCase()
  const filteredSuppliers = (suppliers ?? []).filter((s) => !sq || [s.name, s.kind, s.phone].some((v) => (v ?? '').toLowerCase().includes(sq)))

  /* ----- save ----- */
  const save = async (status: 'DRAFT' | 'SUBMITTED') => {
    if (!supplierId) { toast.error('ابتدا تأمین‌کننده را انتخاب کنید'); setStep(1); return }
    if (items.length === 0) { toast.error('حداقل یک کالا به سفارش اضافه کنید'); setStep(2); return }
    if (!receivingDate) { toast.error('تاریخ دریافت را انتخاب کنید'); return }
    setSaving(true)
    try {
      const payload = items.map((it) => ({
        ...(it.id ? { id: it.id } : {}),
        productId: it.productId,
        name: it.name,
        barcode: it.barcode,
        qty: it.qty,
        unitCost: it.unitCost,
        sellPrice: it.sellPrice,
      }))
      if (editOrder) {
        await api.patch(`/api/orders/${editOrder.id}`, {
          action: 'update',
          userId: user.id,
          items: payload,
          note: note.trim() || null,
          receivingDate,
          paymentType,
        })
        const shouldSubmit = status === 'SUBMITTED' && editOrder.status === 'DRAFT'
        if (shouldSubmit) {
          await api.patch(`/api/orders/${editOrder.id}`, { action: 'submit', userId: user.id })
        }
        toast.success(shouldSubmit ? 'سفارش ویرایش و برای تایید ارسال شد | Updated & submitted' : 'تغییرات سفارش ذخیره شد | Changes saved')
      } else {
        await api.post('/api/orders', {
          supplierId,
          createdById: user.id,
          receivingDate,
          paymentType,
          note: note.trim() || undefined,
          status,
          items: payload,
        })
        toast.success(status === 'SUBMITTED' ? 'سفارش ثبت و برای تایید ارسال شد | Submitted for approval' : 'پیش‌نویس سفارش ذخیره شد | Draft saved')
      }
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ذخیره سفارش ناموفق بود')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#FBF9F3]">
      {/* ---------- Sticky header ---------- */}
      <header className="z-10 border-b border-[#2F4A36] bg-gradient-to-l from-[#2F4A36] to-[#3E6B4A] px-4 py-3 text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShoppingCart size={20} />
            <h2 className="text-base font-extrabold sm:text-lg">
              {editOrder ? `ویرایش سفارش ${editOrder.code} | Edit Order` : 'سفارش جدید | New Order'}
            </h2>
          </div>

          {/* step indicator (desktop) */}
          <div className="hidden items-center gap-1 md:flex">
            {WIZARD_STEPS.map((s, i) => (
              <React.Fragment key={s.n}>
                <button
                  type="button"
                  onClick={() => { if (s.n < step) setStep(s.n) }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all',
                    step === s.n ? 'bg-[#DAA520] text-[#3A2E05] shadow' : s.n < step ? 'bg-white/20 text-white hover:bg-white/30' : 'text-white/50'
                  )}
                >
                  <span className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                    step === s.n ? 'bg-white/30' : 'bg-white/10'
                  )}>
                    {toFaDigits(s.n)}
                  </span>
                  {s.label}
                </button>
                {i < WIZARD_STEPS.length - 1 && <span className="h-px w-4 bg-white/30" />}
              </React.Fragment>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="بستن | Close"
            className="rounded-full p-2.5 transition hover:bg-white/15"
          >
            <X size={20} />
          </button>
        </div>

        {/* step indicator (mobile) */}
        <div className="mx-auto mt-2 flex max-w-6xl items-center gap-2 md:hidden">
          {WIZARD_STEPS.map((s, i) => (
            <React.Fragment key={s.n}>
              <span className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                step === s.n ? 'bg-[#DAA520] text-[#3A2E05]' : s.n < step ? 'bg-white/25 text-white' : 'bg-white/10 text-white/50'
              )}>
                {toFaDigits(s.n)}
              </span>
              {i < WIZARD_STEPS.length - 1 && <span className={cn('h-0.5 flex-1 rounded', s.n < step ? 'bg-[#DAA520]' : 'bg-white/20')} />}
            </React.Fragment>
          ))}
          <span className="shrink-0 text-[11px] font-bold text-white/80">{WIZARD_STEPS[step - 1].label}</span>
        </div>
      </header>

      {/* ---------- Body ---------- */}
      <div className="flex-1 overflow-y-auto pz-scroll">
        <div className="mx-auto max-w-6xl p-4 pb-8">

          {/* ============ STEP 1 — supplier ============ */}
          {step === 1 && (
            <div>
              <StepTitle icon={<Building2 size={18} />} title="انتخاب تأمین‌کننده | Choose supplier" sub="گام ۱ از ۳ — تأمین‌کننده سفارش را انتخاب کنید" />
              <div className="relative mb-4">
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A8A28C]" />
                <input
                  className={cn(inputCls, 'min-h-[44px] pr-9')}
                  placeholder="جستجوی نام تأمین‌کننده… | Search suppliers"
                  value={supSearch}
                  onChange={(e) => setSupSearch(e.target.value)}
                />
              </div>
              {!suppliers ? (
                <Loading label="در حال دریافت تأمین‌کنندگان…" />
              ) : filteredSuppliers.length === 0 ? (
                <EmptyState title="تأمین‌کننده‌ای یافت نشد" hint="عبارت جستجو را تغییر دهید." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filteredSuppliers.map((s) => {
                    const selected = s.id === supplierId
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSupplierId(s.id)
                          if (!editOrder) setPaymentType(validPayment(s.paymentTerms))
                        }}
                        className={cn(
                          'flex min-h-[44px] w-full flex-col gap-2 rounded-2xl border p-4 text-right transition-all',
                          selected
                            ? 'border-[#3E6B4A] bg-[#F3F7EF] shadow-md ring-2 ring-[#93C572]/50'
                            : 'border-[#E4DCC8] bg-white hover:border-[#93C572] hover:shadow-sm'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-extrabold text-[#253A2A]">{s.name}</span>
                          <Badge className="border-[#D8E2D0] bg-[#F3F7EF] text-[10px] text-[#3E6B4A]">
                            {KIND_LABELS[s.kind] ?? s.kind}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className={cn('text-[10px]', fmtPaymentBadgeCls(s.paymentTerms))}>
                            {PAYMENT_LABELS[s.paymentTerms] ?? s.paymentTerms}
                          </Badge>
                          {s.paymentTerms === 'CHEQUE' && s.chequeDays > 0 && (
                            <span className="rounded-full bg-[#FBF3DC] px-2 py-0.5 text-[10px] font-bold text-[#8A6508]">
                              چک {toFaDigits(s.chequeDays)} روزه
                            </span>
                          )}
                          {typeof s._count?.products === 'number' && (
                            <span className="rounded-full bg-[#F5F2E8] px-2 py-0.5 text-[10px] font-semibold text-[#6B7A66]">
                              {toFaDigits(s._count.products)} کالا
                            </span>
                          )}
                        </div>
                        {s.phone && (
                          <span className="flex items-center gap-1 text-xs tabular-nums text-[#6B7A66]">
                            <Phone size={12} /> {toFaDigits(s.phone)}
                          </span>
                        )}
                        {s.companies && s.companies.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {s.companies.map((c) => (
                              <span key={c.company.id} className="rounded-md bg-[#F5F2E8] px-1.5 py-0.5 text-[10px] text-[#6B7A66]">
                                {c.company.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ============ STEP 2 — products ============ */}
          {step === 2 && (
            <div>
              <StepTitle
                icon={<PackageSearch size={18} />}
                title="انتخاب کالاها | Pick products"
                sub={`گام ۲ از ۳ — کالاهای ${supplier?.name ?? 'تأمین‌کننده'} در بالای فهرست هستند`}
              />
              <div className="sticky top-0 z-10 -mx-4 mb-4 bg-[#FBF9F3]/95 px-4 py-2 backdrop-blur">
                <div className="relative">
                  <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A8A28C]" />
                  <input
                    className={cn(inputCls, 'min-h-[44px] pr-9')}
                    placeholder="جستجوی نام یا بارکد کالا… | Search products"
                    value={prodSearch}
                    onChange={(e) => setProdSearch(e.target.value)}
                  />
                </div>
              </div>

              {!products ? (
                <Loading label="در حال دریافت کالاها…" />
              ) : (
                <>
                  <SectionLabel>کالاهای این تأمین‌کننده | This supplier ({toFaDigits(supProducts.length)})</SectionLabel>
                  {supProducts.length === 0 ? (
                    <EmptyState title="کالایی برای این تأمین‌کننده یافت نشد" hint="می‌توانید از کالاهای سایر تأمین‌کننده‌ها در ادامه استفاده کنید." />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {supProducts.map((p) => (
                        <ProductPickCard key={p.id} product={p} qty={qtyOf(p.id)} onDelta={(d) => changeQty(p, d)} onHistory={() => setHistoryProduct(p)} />
                      ))}
                    </div>
                  )}

                  <div className="my-5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-[#E4DCC8]" />
                    <span className="text-xs font-bold text-[#8A9884]">سایر تأمین‌کننده‌ها | Other suppliers ({toFaDigits(otherProducts.length)})</span>
                    <span className="h-px flex-1 bg-[#E4DCC8]" />
                  </div>

                  {otherProducts.length === 0 ? (
                    <EmptyState title="کالای دیگری یافت نشد" />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {otherProducts.map((p) => (
                        <ProductPickCard key={p.id} product={p} qty={qtyOf(p.id)} onDelta={(d) => changeQty(p, d)} onHistory={() => setHistoryProduct(p)} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ============ STEP 3 — review ============ */}
          {step === 3 && (
            <div className="space-y-4">
              <StepTitle icon={<ClipboardCheck size={18} />} title="بازبینی و ثبت | Review & submit" sub="گام ۳ از ۳ — اطلاعات نهایی سفارش را بررسی کنید" />

              <Card className="p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <JalaliDateField
                    label="تاریخ دریافت کالا | Receiving date"
                    value={receivingDate}
                    onChange={setReceivingDate}
                    minDate={todayISO()}
                  />
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-[#4A5A44]">نوع پرداخت | Payment type</span>
                    <div className="flex gap-2">
                      {(['CASH', 'CHEQUE', 'MIXED'] as const).map((pt) => (
                        <button
                          key={pt}
                          type="button"
                          onClick={() => setPaymentType(pt)}
                          className={cn(
                            'min-h-[44px] flex-1 rounded-xl border px-2 py-2.5 text-xs font-bold transition-all sm:text-sm',
                            paymentType === pt
                              ? 'border-[#3E6B4A] bg-gradient-to-b from-[#4A7A52] to-[#3A6242] text-white shadow-md'
                              : 'border-[#D8D2BC] bg-white text-[#4A5A44] hover:border-[#5F8F55]'
                          )}
                        >
                          {PAYMENT_LABELS[pt]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <Field label="یادداشت سفارش | Note">
                    <textarea
                      className={inputCls}
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="توضیحات برای مدیر/انبار…"
                    />
                  </Field>
                </div>
              </Card>

              {/* items summary */}
              <Card className="p-4">
                <h3 className="mb-3 flex items-center justify-between gap-2 text-sm font-bold text-[#253A2A]">
                  اقلام سفارش | Order items
                  <Badge className="border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]">{toFaDigits(items.length)} قلم</Badge>
                </h3>
                {items.length === 0 ? (
                  <EmptyState title="کالایی انتخاب نشده" hint="به گام قبل بازگردید و کالا اضافه کنید." />
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto pz-scroll pl-1">
                    {items.map((it) => (
                      <div key={`${it.productId ?? it.name}-${it.id ?? 'new'}`} className="flex items-center gap-3 rounded-xl border border-[#EFEAD8] bg-white p-2.5">
                        <ProductImage src={it.imageUrl} name={it.name} size={44} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-[#253A2A]">{it.nameFa || it.name}</div>
                          <div className="pz-barcode text-[11px] text-[#8A9884]">{it.barcode ?? '—'}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button type="button" onClick={() => setItems((prev) => prev.map((x) => x === it ? { ...x, qty: Math.max(1, x.qty - 1) } : x))} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D8D2BC] bg-white text-[#4A5A44] transition hover:border-rose-300 hover:text-rose-600" aria-label="کاهش">
                            <Minus size={15} />
                          </button>
                          <span className="min-w-[40px] rounded-lg bg-[#F5F2E8] py-1.5 text-center text-sm font-bold tabular-nums text-[#253A2A]">
                            {toFaDigits(it.qty)}
                          </span>
                          <button type="button" onClick={() => setItems((prev) => prev.map((x) => x === it ? { ...x, qty: x.qty + 1 } : x))} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D8D2BC] bg-white text-[#4A5A44] transition hover:border-[#5F8F55] hover:text-[#3E6B4A]" aria-label="افزایش">
                            <Plus size={15} />
                          </button>
                        </div>
                        <Money value={it.qty * it.unitCost} className="hidden w-32 shrink-0 text-left text-sm font-bold text-[#8A6508] sm:block" />
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* totals */}
              <Card className="bg-gradient-to-br from-[#F3F7EF] to-[#FBF9F3] p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B7A66]">جمع اقلام | Subtotal</span>
                    <Money value={subtotal} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B7A66]">مالیات بر ارزش افزوده (۹٪) | VAT 9%</span>
                    <Money value={vat} />
                  </div>
                  <div className="flex items-center justify-between border-t border-[#D8E2D0] pt-2.5">
                    <span className="font-bold text-[#253A2A]">مبلغ نهایی | Total</span>
                    <Money value={total} className="text-base font-extrabold text-[#8A6508]" />
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Sticky footer ---------- */}
      <footer className="z-10 border-t border-[#E4DCC8] bg-white/95 px-4 py-3 shadow-[0_-4px_14px_-6px_rgba(90,74,32,0.2)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <div>
            {step > 1 && (
              <GhostButton onClick={() => setStep(step - 1)} className="min-h-[44px]">→ مرحله قبل | Back</GhostButton>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {step === 1 && (
              <PrimaryButton
                onClick={() => { if (supplierId) setStep(2); else toast.error('ابتدا تأمین‌کننده را انتخاب کنید') }}
                className="min-h-[44px]"
              >
                ادامه: انتخاب کالا | Next
              </PrimaryButton>
            )}
            {step === 2 && (
              <>
                <Badge className="min-h-[32px] border-[#C8D8C0] bg-[#F3F7EF] px-3 text-[#3E6B4A]">
                  {toFaDigits(items.length)} کالا انتخاب شد
                </Badge>
                <PrimaryButton
                  onClick={() => { if (items.length > 0) setStep(3); else toast.error('حداقل یک کالا اضافه کنید') }}
                  className="min-h-[44px]"
                >
                  بازبینی سفارش | Review
                </PrimaryButton>
              </>
            )}
            {step === 3 && (
              <>
                {(!editOrder || editOrder.status === 'DRAFT') && (
                  <GhostButton onClick={() => save('DRAFT')} disabled={saving} className="min-h-[44px]">
                    {saving ? <Spinner /> : <Pencil size={15} />} ذخیره پیش‌نویس | Save Draft
                  </GhostButton>
                )}
                <PrimaryButton onClick={() => save('SUBMITTED')} disabled={saving} className="min-h-[44px]">
                  {saving ? <Spinner /> : <Send size={15} />}
                  {editOrder?.status === 'SUBMITTED' ? 'ذخیره تغییرات | Save changes' : 'ثبت و ارسال برای تایید | Submit'}
                </PrimaryButton>
              </>
            )}
          </div>
        </div>
      </footer>

      {/* product history modal */}
      <ProductHistoryModal
        open={historyProduct !== null}
        product={historyProduct}
        fallbackSupplierId={supplierId}
        onClose={() => setHistoryProduct(null)}
      />
    </div>
  )
}

/* ================= Step 2 product card ================= */

function ProductPickCard({ product: p, qty, onDelta, onHistory }: {
  product: ProductT
  qty: number
  onDelta: (delta: number) => void
  onHistory: () => void
}) {
  return (
    <div className={cn(
      'rounded-2xl border bg-white p-3 shadow-sm transition-all',
      qty > 0 ? 'border-[#3E6B4A] ring-2 ring-[#93C572]/40' : 'border-[#E4DCC8]'
    )}>
      <div className="flex gap-3">
        <ProductImage src={p.imageUrl} name={p.name} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-[#253A2A]">{p.nameFa || p.name}</div>
              <div className="truncate text-[11px] text-[#8A9884]">{p.name}</div>
            </div>
            <button
              type="button"
              onClick={onHistory}
              aria-label="تاریخچه این کالا | Product history"
              title="تاریخچه این کالا | Product history"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D8D2BC] bg-white/80 text-[#4A5A44] transition-all hover:border-[#5F8F55] hover:bg-[#F3F7EF] active:scale-[0.98]"
            >
              <Clock size={16} />
            </button>
          </div>
          <div className="pz-barcode mt-0.5 text-[11px] text-[#6B7A66]">{p.barcode ?? '—'}</div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-xs">
            <span className="font-bold text-[#8A6508]">{fmtMoney(p.sellPrice)}</span>
            <span className={cn('font-bold tabular-nums', stockDot(p.stock, p.minStock))}>
              {toFaDigits(p.stock)} {p.unit || 'عدد'} باقی‌مانده
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[#EFEAD8] pt-3">
        <span className="text-[11px] font-semibold text-[#8A9884]">تعداد سفارش | Qty</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDelta(-1)}
            disabled={qty === 0}
            aria-label="کاهش تعداد"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D8D2BC] bg-white text-[#4A5A44] transition hover:border-rose-300 hover:text-rose-600 active:scale-[0.95] disabled:opacity-40"
          >
            <Minus size={16} />
          </button>
          <span className={cn(
            'min-w-[44px] rounded-lg py-1.5 text-center text-sm font-bold tabular-nums',
            qty > 0 ? 'bg-[#3E6B4A] text-white shadow' : 'bg-[#F5F2E8] text-[#A8A28C]'
          )}>
            {toFaDigits(qty)}
          </span>
          <button
            type="button"
            onClick={() => onDelta(1)}
            aria-label="افزایش تعداد"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A] transition hover:bg-[#E7EFE2] active:scale-[0.95]"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================= Product history modal ================= */

function ProductHistoryModal({ open, product, fallbackSupplierId, onClose }: {
  open: boolean
  product: ProductT | null
  fallbackSupplierId: number | null
  onClose: () => void
}) {
  const [orders, setOrders] = React.useState<OrderListItem[] | null>(null)

  React.useEffect(() => {
    if (!open) return
    let on = true
    setOrders(null)
    api.get<{ orders: OrderListItem[] }>('/api/orders?active=1')
      .then((d) => { if (on) setOrders(d.orders) })
      .catch(() => { if (on) setOrders([]) })
    return () => { on = false }
  }, [open, product?.id])

  /* NOTE: the orders LIST endpoint does not include items[].productId, so per the
     agreed contract we fall back to showing the past orders of the product's supplier. */
  const sid = product?.supplierId ?? fallbackSupplierId
  const past = (orders ?? []).filter((o) => sid != null && o.supplierId === sid)

  return (
    <Modal open={open} onClose={onClose} title={`تاریخچه این کالا | Product history — ${(product?.nameFa || product?.name) ?? ''}`} wide>
      {!orders ? (
        <Loading label="در حال دریافت سابقه…" />
      ) : past.length === 0 ? (
        <EmptyState icon={<Clock size={28} />} title="سابقه‌ای نیست | No history" hint="سفارش فعالی برای تأمین‌کننده این کالا وجود ندارد." />
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pz-scroll pl-1">
          {past.map((o) => (
            <div key={o.id} className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-[#E4DCC8] bg-white px-3 py-2.5">
              <div className="min-w-0">
                <div className="pz-barcode text-sm font-extrabold text-[#253A2A]">{o.code}</div>
                <div className="mt-0.5 text-[11px] tabular-nums text-[#8A9884]">دریافت: {fmtJalali(o.receivingDate)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-md bg-[#F5F2E8] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[#6B7A66]">
                  {toFaDigits(o._count?.items ?? o.items.length)} قلم
                </span>
                <StatusBadge status={o.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

/* ================= Tiny shared bits ================= */

function StepTitle({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3E6B4A] to-[#5F8F55] text-white shadow-md">
        {icon}
      </div>
      <div>
        <h3 className="text-base font-extrabold text-[#253A2A]">{title}</h3>
        <p className="text-xs text-[#6B7A66]">{sub}</p>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-xs font-extrabold text-[#4A5A44]">{children}</div>
}
