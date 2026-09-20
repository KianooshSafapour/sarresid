'use client'
import * as React from 'react'
import { toast } from 'sonner'
import {
  Warehouse, ClipboardList, ShoppingBag, PackageMinus, Plus, CheckCircle2, Send, X,
  Search, PackagePlus, Info, Wand2, TrendingDown, Sparkles, PackageSearch, BarChart3,
  Tag, RefreshCw, ChevronUp, CalendarClock,
} from 'lucide-react'
import { api } from '@/lib/api'
import { fmtJalali, fmtJalaliTime, toFaDigits } from '@/lib/jalali'
import { cn } from '@/lib/utils'
import { hasRole, type PUser, type ProductT } from '@/lib/types'
import {
  Card, SectionHeader, Badge, StockBadge, stockDot, Field, inputCls, PrimaryButton, GoldButton,
  GhostButton, DangerButton, EmptyState, Modal, Tabs, Avatar, TimeAgo, ProductImage, Spinner,
} from './kit'
import { SkeletonBlock, WarehouseRequestsSkeleton, CustomerAsksSkeleton, LowStockListSkeleton } from './Skeletons'
import { LowStockDraftModal } from './LowStockDraft'

/* ---------- local types ---------- */
type WRequest = {
  id: number
  productId: number
  qty: number
  requestedById: number
  status: string // OPEN | PREPARED | RECEIVED | CANCELLED
  note: string | null
  createdAt: string
  preparedAt: string | null
  product?: { id: number; name: string; sellPrice: number; stock: number } | null
  requestedBy?: { id: number; name: string } | null
}
type CRequest = {
  id: number
  name: string
  barcode: string | null
  count: number
  note: string | null
  requestedById: number
  createdAt: string
  updatedAt: string
  requestedBy?: { id: number; name: string } | null
}

/* ---------- shrinkage ledger (Task 12-b: دفتر نزولات و ضایعات) ---------- */
type ShrinkReason = 'SPOILAGE' | 'EXPIRED' | 'DAMAGED' | 'THEFT' | 'OTHER'
type ShrinkRow = {
  id: number
  productId: number | null
  name: string
  qty: number
  unitCost: number
  reason: ShrinkReason
  note: string | null
  reportedById: number
  createdAt: string
  reporter?: { id: number; name: string } | null
}
type ShrinkSummary = {
  count: number
  totalValue: number
  byReason: Record<ShrinkReason, number>
  ratioPct: number | null
}
type ShrinkRes = { rows: ShrinkRow[]; summary: ShrinkSummary; days: number }

/* ---------- smart inventory insights (Task 12-b: تحلیل هوشمند انبار) ---------- */
type AbcClassT = { class: 'A' | 'B' | 'C'; count: number; revenueShare: number }
type ReorderItemT = {
  productId: number
  name: string
  stock: number
  minStock: number
  avgDailyDemand: number
  suggestQty: number
  supplierName: string | null
}
type SlowItemT = { productId: number; name: string; stock: number; stockValue: number; sellPrice: number }
type ExpiringItemT = {
  productId: number; name: string; qty: number; receivedAt: string
  expiryDate: string; daysLeft: number; stockValue: number; suggestMarkdown: boolean
}
type InsightsRes = {
  generatedAt: string
  demandSource: 'SALES' | 'ORDERITEMS'
  counts: { A: number; B: number; C: number; reorder: number; slow: number; expiring: number }
  abc: { classes: AbcClassT[]; topA: string[] }
  reorder: ReorderItemT[]
  slow: SlowItemT[]
  expiring?: ExpiringItemT[]
}

/** reason chips — color-coded per spec: SPOILAGE amber, EXPIRED rose, DAMAGED slate, THEFT rose-strong, OTHER neutral */
const SHRINK_REASONS: { key: ShrinkReason; fa: string; chip: string; dot: string }[] = [
  { key: 'SPOILAGE', fa: 'فاسدشدن', chip: 'border-amber-200 bg-amber-50 text-amber-800', dot: '#F59E0B' },
  { key: 'EXPIRED', fa: 'انقضا', chip: 'border-rose-200 bg-rose-50 text-rose-700', dot: '#FB7185' },
  { key: 'DAMAGED', fa: 'آسیب/شکست', chip: 'border-slate-200 bg-slate-100 text-slate-700', dot: '#64748B' },
  { key: 'THEFT', fa: 'سرقت', chip: 'border-red-300 bg-red-100 text-red-800', dot: '#B91C1C' },
  { key: 'OTHER', fa: 'سایر', chip: 'border-stone-200 bg-stone-100 text-stone-600', dot: '#A8A29E' },
]
const REASON_MAP: Record<string, { fa: string; chip: string; dot: string }> =
  Object.fromEntries(SHRINK_REASONS.map((r) => [r.key, r]))

/** Persian-digit money/number formatting (12-b convention: fa digits everywhere) */
const faNum = (n: number) => toFaDigits(new Intl.NumberFormat('en-US').format(Math.round(n)))
const faMoney = (n: number) => `${faNum(n)} تومان`

const AVATAR_COLORS = ['#3E6B4A', '#B8860B', '#8B5CF6', '#0F766E', '#BE185D', '#C2410C', '#4D7C0F', '#6D28D9']
const colorFor = (id: number) => AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length]

const WR_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'در انتظار آماده‌سازی', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  PREPARED: { label: 'آماده شد', cls: 'border-violet-200 bg-violet-50 text-violet-800' },
  RECEIVED: { label: 'دریافت شد', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  CANCELLED: { label: 'لغو شد', cls: 'border-stone-200 bg-stone-100 text-stone-600' },
}

export default function WarehouseSection({ user }: { user: PUser }) {
  const isSupervisor = hasRole(user, 'INVENTORY_SUPERVISOR')
  const isMerch = hasRole(user, 'MERCHANDISER')
  const canCreateOrders =
    hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'PRODUCT_MANAGER') ||
    hasRole(user, 'OPERATION_MANAGER') || hasRole(user, 'IT_ADMIN')

  /* role gates for the research-backed tabs (mirror the API gates exactly) */
  const isPm = hasRole(user, 'PRODUCT_MANAGER')
  const isMgmt =
    hasRole(user, 'OWNER') || hasRole(user, 'GENERAL_MANAGER') ||
    hasRole(user, 'OPERATION_MANAGER') || hasRole(user, 'IT_ADMIN')
  const canViewShrink = isSupervisor || isPm || isMgmt
  const canReportShrink = canViewShrink || hasRole(user, 'DELIVERY_RECEIVER')
  const canViewInsights = canViewShrink

  const [tab, setTab] = React.useState('requests')
  const [loading, setLoading] = React.useState(true)
  const [draftOpen, setDraftOpen] = React.useState(false)

  /* ---------- data ---------- */
  const [requests, setRequests] = React.useState<WRequest[]>([])
  const [asks, setAsks] = React.useState<CRequest[]>([])
  const [lowProducts, setLowProducts] = React.useState<ProductT[]>([])

  const loadRequests = React.useCallback(async () => {
    try {
      const res = await api.get<{ requests: WRequest[] }>('/api/warehouse-requests')
      setRequests(res.requests ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت درخواست‌های انبار')
    }
  }, [])

  const loadAsks = React.useCallback(async () => {
    try {
      const res = await api.get<{ requests: CRequest[] }>('/api/customer-requests')
      setAsks(res.requests ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت درخواست مشتریان')
    }
  }, [])

  const loadLow = React.useCallback(async () => {
    try {
      const res = await api.get<{ products: ProductT[] }>('/api/products?low=1&limit=500')
      setLowProducts(res.products ?? [])
      setQtyReq(Object.fromEntries((res.products ?? []).map((p) => [p.id, String(Math.max(1, Math.ceil(p.minStock)))])))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت کمبود موجودی')
    }
  }, [])

  React.useEffect(() => {
    void (async () => {
      setLoading(true)
      await Promise.all([loadRequests(), loadAsks(), loadLow()])
      setLoading(false)
    })()
  }, [loadRequests, loadAsks, loadLow])

  /* ---------- request actions ---------- */
  const [busyId, setBusyId] = React.useState<number | null>(null)

  const actRequest = async (r: WRequest, action: 'prepare' | 'receive' | 'cancel') => {
    setBusyId(r.id)
    try {
      await api.patch('/api/warehouse-requests', { id: r.id, action, userId: user.id })
      if (action === 'prepare') toast.success('درخواست آماده شد — به درخواست‌دهنده اطلاع داده شد')
      if (action === 'receive') toast.success('دریافت ثبت شد و موجودی کالا بروزرسانی شد')
      if (action === 'cancel') toast.info('درخواست لغو شد')
      void loadRequests()
      if (action === 'receive') void loadLow()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ثبت عملیات')
    } finally {
      setBusyId(null)
    }
  }

  /* ---------- new warehouse request (modal) ---------- */
  const [newOpen, setNewOpen] = React.useState(false)
  const [allProducts, setAllProducts] = React.useState<ProductT[]>([])
  const [prodQ, setProdQ] = React.useState('')
  const [picked, setPicked] = React.useState<ProductT | null>(null)
  const [newQty, setNewQty] = React.useState('1')
  const [newNote, setNewNote] = React.useState('')
  const [creating, setCreating] = React.useState(false)

  const ensureAllProducts = React.useCallback(async () => {
    if (allProducts.length > 0) return
    try {
      const res = await api.get<{ products: ProductT[] }>('/api/products?limit=500')
      setAllProducts(res.products ?? [])
    } catch {
      toast.error('خطا در دریافت فهرست کالاها')
    }
  }, [allProducts.length])

  const openNew = async () => {
    setPicked(null); setProdQ(''); setNewQty('1'); setNewNote('')
    setNewOpen(true)
    void ensureAllProducts()
  }

  const submitRequest = async () => {
    if (!picked) { toast.error('کالا را انتخاب کنید'); return }
    const qty = Number(newQty)
    if (!Number.isFinite(qty) || qty <= 0) { toast.error('تعداد باید بزرگ‌تر از صفر باشد'); return }
    setCreating(true)
    try {
      await api.post('/api/warehouse-requests', {
        productId: picked.id, qty, requestedById: user.id, note: newNote.trim() || null,
      })
      toast.success('درخواست انبار ثبت شد — انباردار مطلع شد')
      setNewOpen(false)
      void loadRequests()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ثبت درخواست')
    } finally {
      setCreating(false)
    }
  }

  const filteredPick = prodQ.trim()
    ? allProducts.filter((p) =>
        p.name.toLowerCase().includes(prodQ.trim().toLowerCase()) ||
        (p.nameFa ?? '').includes(prodQ.trim()) ||
        (p.barcode ?? '').includes(prodQ.trim())
      ).slice(0, 50)
    : allProducts.slice(0, 50)

  /* ---------- customer asks ---------- */
  const [askOpen, setAskOpen] = React.useState(false)
  const [askName, setAskName] = React.useState('')
  const [askNote, setAskNote] = React.useState('')
  const [savingAsk, setSavingAsk] = React.useState(false)
  const [plusOneId, setPlusOneId] = React.useState<number | null>(null)

  const submitAsk = async () => {
    if (!askName.trim()) { toast.error('نام کالا را بنویسید'); return }
    setSavingAsk(true)
    try {
      const res = await api.post<{ duplicate: boolean }>('/api/customer-requests', {
        name: askName.trim(), note: askNote.trim() || null, requestedById: user.id,
      })
      toast.success(res.duplicate ? 'این کالا قبلاً ثبت شده بود — شمارش +۱ شد' : 'درخواست مشتری ثبت شد (+۱ امتیاز)')
      setAskOpen(false); setAskName(''); setAskNote('')
      void loadAsks()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ثبت درخواست')
    } finally {
      setSavingAsk(false)
    }
  }

  const plusOne = async (r: CRequest) => {
    setPlusOneId(r.id)
    try {
      const res = await api.post<{ duplicate: boolean }>('/api/customer-requests', { name: r.name, requestedById: user.id })
      toast.success(res.duplicate ? `«${r.name}» — شمارش بروزرسانی شد` : 'ثبت شد')
      void loadAsks()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ثبت')
    } finally {
      setPlusOneId(null)
    }
  }

  /* ---------- lowstock quick request ---------- */
  const [qtyReq, setQtyReq] = React.useState<Record<number, string>>({})
  const [lowBusy, setLowBusy] = React.useState<number | null>(null)

  const quickRequest = async (p: ProductT) => {
    const qty = Number(qtyReq[p.id]) || Math.max(1, Math.ceil(p.minStock))
    if (qty <= 0) { toast.error('تعداد نامعتبر است'); return }
    setLowBusy(p.id)
    try {
      await api.post('/api/warehouse-requests', { productId: p.id, qty, requestedById: user.id, note: 'درخواست سریع از بخش کمبود موجودی' })
      toast.success(`درخواست ${p.name} از انبار ثبت شد`)
      void loadRequests()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ثبت درخواست')
    } finally {
      setLowBusy(null)
    }
  }

  /* ---------- shrinkage ledger (Task 12-b: دفتر نزولات و ضایعات) ---------- */
  const [shDays, setShDays] = React.useState(30)
  const [shData, setShData] = React.useState<ShrinkRes | null>(null)
  const [shLoading, setShLoading] = React.useState(false)
  const [shLoaded, setShLoaded] = React.useState(false)
  const [shForbidden, setShForbidden] = React.useState(false)
  const [shFormOpen, setShFormOpen] = React.useState(false)
  const [shProdQ, setShProdQ] = React.useState('')
  const [shPicked, setShPicked] = React.useState<ProductT | null>(null)
  const [shQty, setShQty] = React.useState('1')
  const [shCost, setShCost] = React.useState('')
  const [shReason, setShReason] = React.useState<ShrinkReason>('SPOILAGE')
  const [shNote, setShNote] = React.useState('')
  const [shSaving, setShSaving] = React.useState(false)

  const loadShrinkage = React.useCallback(async (days?: number) => {
    const d = days ?? shDays
    setShLoading(true)
    try {
      const res = await api.get<ShrinkRes>(`/api/shrinkage?userId=${user.id}&days=${d}`)
      setShData(res)
      setShForbidden(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('مجاز') || /403/.test(msg)) setShForbidden(true)
      else toast.error(msg || 'خطا در دریافت دفتر نزولات')
    } finally {
      setShLoading(false)
      setShLoaded(true)
    }
  }, [shDays, user.id])

  const submitShrink = async () => {
    if (!shPicked) { toast.error('کالا را انتخاب کنید'); return }
    const qty = Number(shQty)
    if (!Number.isFinite(qty) || qty <= 0) { toast.error('تعداد باید بزرگ‌تر از صفر باشد'); return }
    setShSaving(true)
    try {
      const body: Record<string, unknown> = {
        userId: user.id, productId: shPicked.id, name: shPicked.name, qty, reason: shReason,
        note: shNote.trim() || null,
      }
      const cost = Number(shCost)
      if (shCost.trim() !== '' && Number.isFinite(cost) && cost >= 0) body.unitCost = cost
      const res = await api.post<{ clamped: boolean }>('/api/shrinkage', body)
      if (res.clamped) toast.warning('نزولی ثبت شد — تعداد بیشتر از موجودی بود و موجودی کالا صفر شد')
      else toast.success('نزولی ثبت شد — موجودی کالا اصلاح شد')
      setShFormOpen(false); setShPicked(null); setShProdQ(''); setShQty('1'); setShCost(''); setShNote(''); setShReason('SPOILAGE')
      void loadShrinkage()
      void loadLow()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ثبت نزولی')
    } finally {
      setShSaving(false)
    }
  }

  const unitById = React.useMemo(() => new Map(allProducts.map((p) => [p.id, p.unit])), [allProducts])
  const filteredSh = shProdQ.trim()
    ? allProducts.filter((p) =>
        p.name.toLowerCase().includes(shProdQ.trim().toLowerCase()) ||
        (p.nameFa ?? '').includes(shProdQ.trim()) ||
        (p.barcode ?? '').includes(shProdQ.trim())
      ).slice(0, 30)
    : []

  /* ---------- smart inventory insights (Task 12-b: تحلیل هوشمند انبار) ---------- */
  const [insData, setInsData] = React.useState<InsightsRes | null>(null)
  const [insLoading, setInsLoading] = React.useState(false)
  const [insLoaded, setInsLoaded] = React.useState(false)
  const [insForbidden, setInsForbidden] = React.useState(false)

  const loadInsights = React.useCallback(async () => {
    setInsLoading(true)
    try {
      const res = await api.get<InsightsRes>(`/api/insights?userId=${user.id}`)
      setInsData(res)
      setInsForbidden(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('مجاز') || /403/.test(msg)) setInsForbidden(true)
      else toast.error(msg || 'خطا در دریافت تحلیل هوشمند انبار')
    } finally {
      setInsLoading(false)
      setInsLoaded(true)
    }
  }, [user.id])

  /* lazy-load the research-backed tabs on first open */
  React.useEffect(() => {
    if (tab === 'shrinkage' && canReportShrink && !shLoaded && !shLoading) {
      void loadShrinkage()
      void ensureAllProducts()
    }
    if (tab === 'insights' && canViewInsights && !insLoaded && !insLoading) {
      void loadInsights()
    }
  }, [tab, canReportShrink, canViewInsights, shLoaded, shLoading, insLoaded, insLoading, loadShrinkage, loadInsights, ensureAllProducts])

  /* ---------- render ---------- */
  return (
    <div>
      <SectionHeader
        title="انبار | Warehouse"
        subtitle="درخواست برداشت از انبار، درخواست مشتریان و کمبود موجودی"
        icon={<Warehouse className="h-5 w-5" />}
        actions={
          <PrimaryButton onClick={() => void openNew()} className="min-h-[44px]">
            <Plus className="h-4 w-4" /> درخواست جدید از انبار
          </PrimaryButton>
        }
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'requests', label: 'درخواست‌های انبار', icon: <ClipboardList className="h-4 w-4" /> },
          { key: 'customer-asks', label: 'درخواست مشتریان', icon: <ShoppingBag className="h-4 w-4" /> },
          { key: 'lowstock', label: 'کمبود موجودی', icon: <PackageMinus className="h-4 w-4" /> },
          ...(canReportShrink
            ? [{ key: 'shrinkage', label: 'دفتر نزولات و ضایعات', icon: <TrendingDown className="h-4 w-4" /> }]
            : []),
          ...(canViewInsights
            ? [{ key: 'insights', label: 'تحلیل هوشمند انبار', icon: <Sparkles className="h-4 w-4" /> }]
            : []),
        ]}
      />

      {loading ? (
        tab === 'requests' ? (
          <WarehouseRequestsSkeleton />
        ) : tab === 'customer-asks' ? (
          <CustomerAsksSkeleton />
        ) : (
          <LowStockListSkeleton />
        )
      ) : null}

      {!loading && tab === 'requests' && (
        <div className="max-h-[68vh] space-y-3 overflow-y-auto pz-scroll pl-1">
          {requests.length === 0 ? (
            <EmptyState icon={<ClipboardList className="h-10 w-10" />} title="درخواستی ثبت نشده" hint="با دکمه «درخواست جدید از انبار» اولین درخواست را ثبت کنید." />
          ) : (
            requests.map((r) => {
              const st = WR_STATUS[r.status] ?? { label: r.status, cls: 'border-stone-200 bg-stone-100 text-stone-600' }
              const canPrepare = isSupervisor && r.status === 'OPEN'
              const canReceive = isMerch && r.status === 'PREPARED'
              const canCancel = r.requestedById === user.id && r.status === 'OPEN'
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-[#253A2A]" title={r.product?.name ?? ''}>
                        {r.product?.name ?? `کالا #${toFaDigits(r.productId)}`}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6B7A66]">
                        <Badge className="border-[#E4DCC8] bg-white text-[#4A5A44]">
                          تعداد: <b className="text-sm">{toFaDigits(Math.floor(r.qty))}</b>
                        </Badge>
                        <TimeAgo iso={r.createdAt} />
                      </div>
                    </div>
                    <Badge className={st.cls}>{st.label}</Badge>
                  </div>
                  {r.note && <p className="mt-2 rounded-lg bg-[#FBF9F3] px-3 py-1.5 text-xs leading-5 text-[#6B5B2A]">{r.note}</p>}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#EFEAD8] pt-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={r.requestedBy?.name ?? '؟'} color={colorFor(r.requestedById)} size={28} />
                      <span className="text-xs font-medium text-[#4A5A44]">{r.requestedBy?.name ?? 'کاربر'}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canPrepare && (
                        <PrimaryButton onClick={() => void actRequest(r, 'prepare')} disabled={busyId === r.id} className="min-h-[44px]">
                          {busyId === r.id ? <Spinner /> : <CheckCircle2 className="h-4 w-4" />} آماده شد
                        </PrimaryButton>
                      )}
                      {canReceive && (
                        <PrimaryButton onClick={() => void actRequest(r, 'receive')} disabled={busyId === r.id} className="min-h-[44px]">
                          {busyId === r.id ? <Spinner /> : <Send className="h-4 w-4" />} دریافت کردم
                        </PrimaryButton>
                      )}
                      {canCancel && (
                        <DangerButton onClick={() => void actRequest(r, 'cancel')} disabled={busyId === r.id} className="min-h-[44px]">
                          <X className="h-4 w-4" /> لغو
                        </DangerButton>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })
          )}
        </div>
      )}

      {!loading && tab === 'customer-asks' && (
        <div className="space-y-3">
          <Card className="flex items-start gap-3 border-[#C8D8C0] bg-gradient-to-l from-[#F3F7EF] to-[#FBF9F3] p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#3E6B4A]" />
            <p className="text-sm leading-6 text-[#33402F]">
              هر محصولی که مشتری خواست و نداشتیم اینجا ثبت می‌شود تا مدیریت سفارش بدهد.
            </p>
          </Card>

          <div className="flex justify-end">
            <GoldButton onClick={() => { setAskName(''); setAskNote(''); setAskOpen(true) }} className="min-h-[44px]">
              <Plus className="h-4 w-4" /> ثبت درخواست جدید مشتری
            </GoldButton>
          </div>

          {asks.length === 0 ? (
            <EmptyState icon={<ShoppingBag className="h-10 w-10" />} title="هنوز درخواستی از مشتری‌ها ثبت نشده" hint="وقتی مشتری کالایی خواست که نداشتیم، همین‌جا ثبتش کنید." />
          ) : (
            <div className="max-h-[62vh] overflow-y-auto pz-scroll pl-1">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {asks.map((r) => (
                  <Card key={r.id} className="flex flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-base font-bold leading-7 text-[#253A2A]">{r.name}</div>
                      <Badge className={r.count >= 3 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-[#E4DCC8] bg-white text-[#4A5A44]'}>
                        ×{toFaDigits(r.count)} بار پرسیده شده
                      </Badge>
                    </div>
                    {r.note && <p className="mt-1.5 text-xs leading-5 text-[#6B7A66]">{r.note}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <Avatar name={r.requestedBy?.name ?? '؟'} color={colorFor(r.requestedById)} size={24} />
                      <span className="text-xs text-[#4A5A44]">{r.requestedBy?.name ?? 'کاربر'}</span>
                      <span className="text-[10px] text-[#B8B29A]">·</span>
                      <TimeAgo iso={r.updatedAt} />
                    </div>
                    <div className="mt-3 border-t border-[#EFEAD8] pt-3">
                      <PrimaryButton onClick={() => void plusOne(r)} disabled={plusOneId === r.id} className="w-full min-h-[44px]">
                        {plusOneId === r.id ? <Spinner /> : <Plus className="h-4 w-4" />} مشتری دیگری هم پرسید +۱
                      </PrimaryButton>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'lowstock' && (
        <div className="max-h-[68vh] space-y-3 overflow-y-auto pz-scroll pl-1">
          {lowProducts.length > 0 && canCreateOrders && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#EAD9A8] bg-gradient-to-l from-[#FBF6E8] to-[#FDFBF3] px-4 py-3">
              <div className="text-sm font-bold leading-6 text-[#6B5B2A]">
                {toFaDigits(lowProducts.length)} کالا زیر حداقل موجودی — می‌توانید برای همه تأمین‌کنندگان یک‌جا پیش‌نویس سفارش بسازید
              </div>
              <GoldButton className="min-h-[44px]" onClick={() => setDraftOpen(true)}>
                <Wand2 className="h-4 w-4" /> سفارش خودکار از کمبودها
              </GoldButton>
            </div>
          )}
          {lowProducts.length === 0 ? (
            <EmptyState icon={<PackageMinus className="h-10 w-10" />} title="کمبود موجودی نداریم 🎉" hint="همه کالاها بالای حداقل موجودی هستند." />
          ) : (
            lowProducts.map((p) => (
              <Card key={p.id} className="flex flex-wrap items-center gap-3 p-3.5">
                <ProductImage src={p.imageUrl} name={p.name} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-[#253A2A]" title={p.name}>{p.name}</div>
                  {p.nameFa && <div className="truncate text-xs text-[#6B7A66]">{p.nameFa}</div>}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StockBadge stock={p.stock} minStock={p.minStock} />
                    <span className={`text-xs font-bold tabular-nums ${stockDot(p.stock, p.minStock)}`}>
                      {toFaDigits(Math.floor(p.stock))} از حداقل {toFaDigits(Math.floor(p.minStock))}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={qtyReq[p.id] ?? ''}
                    onChange={(e) => setQtyReq((m) => ({ ...m, [p.id]: e.target.value }))}
                    className={`${inputCls} w-20 min-h-[44px] px-2 text-center tabular-nums`}
                    aria-label={`تعداد درخواست برای ${p.name}`}
                    title="تعداد درخواست"
                  />
                  <GhostButton onClick={() => void quickRequest(p)} disabled={lowBusy === p.id} className="min-h-[44px] shrink-0">
                    {lowBusy === p.id ? <Spinner /> : <PackagePlus className="h-4 w-4" />} درخواست از انبار
                  </GhostButton>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {!loading && tab === 'shrinkage' && canReportShrink && (
        <div className="space-y-3">
          {shLoading && !shData ? <ShrinkageSkeleton /> : null}

          {!shLoading && shForbidden && (
            <Card className="flex items-start gap-3 border-[#EAD9A8] bg-gradient-to-l from-[#FBF6E8] to-[#FDFBF3] p-4">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#8A6508]" />
              <p className="text-sm leading-6 text-[#6B5B2A]">
                ثبت نزولی برای شما مجاز است، اما مشاهدهٔ فهرست و آمار دفتر نزولات برای نقش شما باز نیست.
              </p>
            </Card>
          )}

          {shData && !shForbidden && (
            <Card className="p-4">
              {/* summary strip */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8A9884]">
                    ارزش نزولات {toFaDigits(shData.days)} روز اخیر | Shrinkage value
                  </div>
                  <div className="mt-0.5 text-xl font-bold tabular-nums text-[#253A2A]">{faMoney(shData.summary.totalValue)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-[#E4DCC8] bg-white text-[#4A5A44]">
                    تعداد موارد: <b className="text-sm">{toFaDigits(shData.summary.count)}</b>
                  </Badge>
                  {shData.summary.ratioPct != null ? (
                    <span title="نسبت نزولات به فروش همین بازه — معیار علمی سوپرمارکت ۱ تا ۳ درصد فروش است (ECR Loss)">
                      <Badge
                        className={
                          shData.summary.ratioPct > 2
                            ? 'border-[#EAD9A8] bg-[#FBF6E8] text-[#8A6508]'
                            : 'border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]'
                        }
                      >
                        {shData.summary.ratioPct > 2 ? 'بالای معیار علمی' : 'در محدوده سالم'} — {toFaDigits(shData.summary.ratioPct)}٪
                      </Badge>
                    </span>
                  ) : (
                    <span title="در این بازه فروش ثبت‌شده‌ای نیست — محاسبه نسبت ممکن نیست">
                      <Badge className="border-stone-200 bg-stone-100 text-stone-600">نسبت به فروش: —</Badge>
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5" role="group" aria-label="بازه زمانی دفتر نزولات">
                  {[7, 30, 90].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => { setShDays(d); void loadShrinkage(d) }}
                      aria-pressed={shDays === d}
                      className={cn(
                        'min-h-[44px] rounded-xl border px-3 text-xs font-semibold transition',
                        shDays === d
                          ? 'border-[#B8860B] bg-[#FBF6E8] text-[#8A6508] shadow-sm'
                          : 'border-[#D8D2BC] bg-white text-[#6B7A66] hover:bg-[#F3F7EF]'
                      )}
                    >
                      {toFaDigits(d)} روز
                    </button>
                  ))}
                </div>
              </div>

              {/* byReason mini-bar + legend (proportional pure divs) */}
              {shData.summary.count > 0 && (() => {
                const parts = SHRINK_REASONS.map((r) => ({ ...r, value: shData.summary.byReason[r.key] ?? 0 }))
                const tot = parts.reduce((a, x) => a + x.value, 0)
                return (
                  <div className="mt-4 border-t border-[#EFEAD8] pt-3">
                    <div
                      className="flex h-2.5 overflow-hidden rounded-full bg-[#F1EDE0]"
                      role="img"
                      aria-label="سهم علت‌های نزول از ارزش کل"
                    >
                      {tot > 0 && parts.filter((x) => x.value > 0).map((x) => (
                        <div
                          key={x.key}
                          style={{ width: `${(x.value / tot) * 100}%`, backgroundColor: x.dot }}
                          title={`${x.fa}: ${faMoney(x.value)}`}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {parts.map((x) => (
                        <Badge key={x.key} className={x.value > 0 ? x.chip : 'border-stone-200 bg-white text-stone-400'}>
                          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: x.dot }} />
                          {x.fa}: {faMoney(x.value)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </Card>
          )}

          {/* report form (collapsible) */}
          <div className="flex justify-end">
            <GoldButton
              onClick={() => setShFormOpen((v) => !v)}
              aria-expanded={shFormOpen}
              aria-controls="shrink-form"
              className="min-h-[44px]"
            >
              {shFormOpen ? <ChevronUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              ثبت نزولی جدید
            </GoldButton>
          </div>

          {shFormOpen && (
            <Card className="p-4" id="shrink-form">
              <div className="space-y-3">
                <Field label="کالا" required hint="جستجو با نام انگلیسی، فارسی یا بارکد">
                  {shPicked ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-[#5F8F55] bg-[#F3F7EF] px-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate font-semibold text-[#3E6B4A]">
                        {shPicked.name}{shPicked.nameFa ? ` — ${shPicked.nameFa}` : ''}
                      </span>
                      <button type="button" onClick={() => setShPicked(null)} className="rounded-full p-1 text-[#6B7A66] hover:bg-white" aria-label="حذف انتخاب">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8A28C]" />
                        <input
                          value={shProdQ}
                          onChange={(e) => setShProdQ(e.target.value)}
                          className={`${inputCls} min-h-[44px] pr-9`}
                          placeholder="جستجوی کالا…"
                          aria-label="جستجوی کالا برای ثبت نزولی"
                        />
                      </div>
                      {shProdQ.trim() !== '' && (
                        <div className="mt-2 max-h-44 divide-y divide-[#EFEAD8] overflow-y-auto rounded-xl border border-[#E4DCC8] bg-white pz-scroll">
                          {filteredSh.length === 0 && <div className="p-3 text-xs text-[#8A9884]">کالایی پیدا نشد</div>}
                          {filteredSh.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { setShPicked(p); setShProdQ(''); setShCost(p.buyPrice > 0 ? String(p.buyPrice) : '') }}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-right text-sm transition hover:bg-[#F3F7EF]"
                            >
                              <span className="min-w-0 truncate font-medium text-[#33402F]">{p.name}</span>
                              <span className={`shrink-0 text-xs tabular-nums ${stockDot(p.stock, p.minStock)}`}>موجودی {toFaDigits(Math.floor(p.stock))}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="تعداد" required>
                    <input type="number" min={0.5} step="any" value={shQty} onChange={(e) => setShQty(e.target.value)} className={`${inputCls} min-h-[44px]`} dir="ltr" />
                  </Field>
                  <Field label="قیمت واحد (تومان)" hint="خالی بماند تا از قیمت خرید کالا پر شود">
                    <input
                      type="number" min={0} step="any" value={shCost} onChange={(e) => setShCost(e.target.value)}
                      className={`${inputCls} min-h-[44px]`} dir="ltr" placeholder={shPicked ? String(shPicked.buyPrice) : 'پیش‌فرض'}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="علت نزول" required>
                    <select value={shReason} onChange={(e) => setShReason(e.target.value as ShrinkReason)} className={`${inputCls} min-h-[44px]`} aria-label="علت نزول">
                      {SHRINK_REASONS.map((r) => (
                        <option key={r.key} value={r.key}>{r.fa}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="یادداشت">
                    <input value={shNote} onChange={(e) => setShNote(e.target.value)} className={`${inputCls} min-h-[44px]`} placeholder="مثلاً آسیب در حمل، انقضای زنجیره سرد…" />
                  </Field>
                </div>
                <div className="flex justify-end gap-2 border-t border-[#EFEAD8] pt-3">
                  <GhostButton onClick={() => setShFormOpen(false)} className="min-h-[44px]">انصراف</GhostButton>
                  <PrimaryButton onClick={() => void submitShrink()} disabled={shSaving} className="min-h-[44px]">
                    {shSaving ? <Spinner /> : <TrendingDown className="h-4 w-4" />} ثبت نزولی
                  </PrimaryButton>
                </div>
              </div>
            </Card>
          )}

          {/* recent list — latest 10 */}
          {shData && !shForbidden && (
            shData.rows.length === 0 ? (
              <EmptyState
                icon={<span className="text-4xl">🌱</span>}
                title="هنوز نزولی ثبت نشده — عالی!"
                hint="وقتی کالا فاسد، منقضی، آسیب‌دیده یا مفقود می‌شود، از دکمهٔ «ثبت نزولی جدید» همین‌جا ثبتش کنید."
              />
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto pz-scroll pl-1">
                {shData.rows.slice(0, 10).map((r) => {
                  const meta = REASON_MAP[r.reason]
                  const unit = r.productId ? unitById.get(r.productId) : undefined
                  return (
                    <Card key={r.id} className="p-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-[#253A2A]" title={r.name}>{r.name}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6B7A66]">
                            <Badge className={meta?.chip ?? 'border-stone-200 bg-stone-100 text-stone-600'}>{meta?.fa ?? r.reason}</Badge>
                            <span className="tabular-nums">{toFaDigits(r.qty)}{unit ? ` ${unit}` : ''} × {faNum(r.unitCost)}</span>
                            {r.note && <span className="truncate">— {r.note}</span>}
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-bold tabular-nums text-[#8A6508]">{faMoney(r.qty * r.unitCost)}</div>
                          <div className="mt-1 flex items-center justify-end gap-2">
                            <Avatar name={r.reporter?.name ?? '؟'} color={colorFor(r.reportedById)} size={22} />
                            <span className="text-xs font-medium text-[#4A5A44]">{r.reporter?.name ?? '—'}</span>
                            <TimeAgo iso={r.createdAt} />
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )
          )}
        </div>
      )}

      {!loading && tab === 'insights' && canViewInsights && (
        <div className="space-y-3">
          {insLoading && !insData ? <InsightsSkeleton /> : null}

          {!insLoading && insForbidden && (
            <Card className="flex items-start gap-3 border-rose-200 bg-rose-50/60 p-4">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <p className="text-sm leading-6 text-rose-700">مشاهدهٔ تحلیل هوشمند انبار برای نقش شما مجاز نیست.</p>
            </Card>
          )}

          {insData && !insForbidden && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#8A9884]">
                <span>
                  تولید شده: {fmtJalaliTime(insData.generatedAt)} · منبع داده: {insData.demandSource === 'SALES' ? 'ثبت فروش' : 'اقلام سفارش‌ها'}
                </span>
                <GhostButton onClick={() => void loadInsights()} disabled={insLoading} className="min-h-[44px]">
                  {insLoading ? <Spinner /> : <RefreshCw className="h-4 w-4" />} بروزرسانی
                </GhostButton>
              </div>

              {/* ABC classification */}
              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 shrink-0 text-[#3E6B4A]" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#253A2A]">
                      طبقه‌بندی ABC <span className="text-xs font-normal text-[#8A9884]">| ABC classification</span>
                    </div>
                    <div className="text-xs text-[#6B7A66]">کالاها بر اساس سهم فروش — A تا ۸۰٪، B تا ۹۵٪، C بقیه (پارتو)</div>
                  </div>
                </div>
                {insData.abc.classes.every((c) => c.count === 0) ? (
                  <p className="mt-3 rounded-xl bg-[#FBF9F3] px-3 py-2 text-xs text-[#8A9884]">هنوز داده فروش کافی برای طبقه‌بندی نیست.</p>
                ) : (
                  <>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {insData.abc.classes.map((c) => (
                        <div
                          key={c.class}
                          className={cn(
                            'rounded-xl border px-3 py-2.5',
                            c.class === 'A'
                              ? 'border-[#EAD9A8] bg-gradient-to-l from-[#FBF6E8] to-[#FDF8EC] text-[#8A6508]'
                              : c.class === 'B'
                                ? 'border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]'
                                : 'border-stone-200 bg-stone-50 text-stone-600'
                          )}
                        >
                          <div className="text-xs font-semibold opacity-80">کلاس {c.class}</div>
                          <div className="text-lg font-bold tabular-nums">{toFaDigits(c.count)} کالا · {toFaDigits(c.revenueShare)}٪ فروش</div>
                        </div>
                      ))}
                    </div>
                    {insData.abc.topA.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-semibold text-[#4A5A44]">کالاهای کلیدی دسته A:</div>
                        <ul className="mt-1 space-y-1">
                          {insData.abc.topA.map((n, i) => (
                            <li key={n} className="flex items-center gap-2 text-xs text-[#33402F]">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FBF6E8] text-[10px] font-bold text-[#8A6508]">{toFaDigits(i + 1)}</span>
                              <span className="truncate">{n}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </Card>

              {/* reorder suggestions */}
              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <PackageSearch className="h-5 w-5 shrink-0 text-[#3E6B4A]" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#253A2A]">
                        پیشنهاد سفارش مجدد <span className="text-xs font-normal text-[#8A9884]">| Reorder suggestions</span>
                      </div>
                      <div className="text-xs text-[#6B7A66]">نقطهٔ سفارش = مصرف روزانه × ۳ روز مهلت تأمین + حداقل موجودی</div>
                    </div>
                  </div>
                  {canCreateOrders && insData.reorder.length > 0 && (
                    <GoldButton onClick={() => setDraftOpen(true)} className="min-h-[44px]">
                      <Wand2 className="h-4 w-4" /> سفارش پیش‌نویس
                    </GoldButton>
                  )}
                </div>
                {insData.reorder.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-[#F3F7EF] px-3 py-2 text-xs text-[#3E6B4A]">موجودی انبار سالم است — فعلاً سفارشی لازم نیست.</p>
                ) : (
                  <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pz-scroll pl-1">
                    {insData.reorder.map((r) => {
                      const pct = Math.min(100, Math.max(4, Math.round((r.stock / Math.max(1, r.minStock)) * 100)))
                      return (
                        <div key={r.productId} className="rounded-xl border border-[#EFEAD8] bg-[#FBF9F3]/60 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold text-[#253A2A]" title={r.name}>{r.name}</div>
                              <div className="mt-0.5 text-xs tabular-nums text-[#6B7A66]">
                                موجودی {toFaDigits(r.stock)} از حداقل {toFaDigits(r.minStock)}
                                {r.supplierName ? ` · ${r.supplierName}` : ''}
                                {r.avgDailyDemand > 0 ? ` · مصرف روزانه ~${toFaDigits(r.avgDailyDemand)}` : ''}
                              </div>
                            </div>
                            <Badge className="border-[#EAD9A8] bg-[#FBF6E8] text-[#8A6508]">
                              پیشنهاد سفارش: <b className="text-sm">{toFaDigits(r.suggestQty)}</b>
                            </Badge>
                          </div>
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F1EDE0]" aria-hidden>
                            <div
                              className={cn('h-full rounded-full', pct < 50 ? 'bg-red-500' : pct < 100 ? 'bg-amber-500' : 'bg-emerald-500')}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {insData.reorder.length > 0 && canCreateOrders && (
                  <p className="mt-2 text-[11px] text-[#8A9884]">«سفارش پیش‌نویس» از فهرست کمبود موجودی فعلی، پیش‌نویس گروه‌بندی‌شده بر اساس تأمین‌کننده می‌سازد.</p>
                )}
              </Card>

              {/* FEFO: expiring-soon batches (research: FEFO minimizes perishable loss — MDPI; expiration markdown — T&F) */}
              {insData.expiring && insData.expiring.length > 0 && (
                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-5 w-5 shrink-0 text-[#3E6B4A]" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#253A2A]">
                        در آستانه انقضا <span className="text-xs font-normal text-[#8A9884]">| Expiring soon (FEFO)</span>
                      </div>
                      <div className="text-xs text-[#6B7A66]">اول انقضا، اول خروج — کالاهایی که تا ۲۱ روز آینده تاریخ مصرف‌شان تمام می‌شود</div>
                    </div>
                  </div>
                  <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pz-scroll pl-1">
                    {insData.expiring.map((e) => (
                      <div key={e.productId} className={cn(
                        'rounded-xl border p-3',
                        e.daysLeft <= 3 ? 'border-rose-200 bg-rose-50/60' : 'border-[#EFEAD8] bg-[#FBF9F3]/60'
                      )}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-[#253A2A]" title={e.name}>{e.name}</div>
                            <div className="mt-0.5 text-xs tabular-nums text-[#6B7A66]">
                              موجودی {toFaDigits(e.qty)} · ارزش {faMoney(e.stockValue)} · انقضا: {fmtJalali(e.expiryDate)}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge className={cn(
                              e.daysLeft <= 3 ? 'border-rose-300 bg-rose-100 text-rose-800' : e.daysLeft <= 10 ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-[#E4DCC8] bg-[#F5F2E8] text-[#6B7A66]'
                            )}>
                              {e.daysLeft <= 0 ? `منقضی‌شده (${toFaDigits(Math.abs(e.daysLeft))} روز)` : `${toFaDigits(e.daysLeft)} روز مانده`}
                            </Badge>
                            {e.suggestMarkdown && (
                              <span title="قیمت‌گذاری بر پایه انقضا — پژوهش‌پشتیبانی‌شده">
                                <Badge className="border-amber-200 bg-amber-50 text-amber-800">قیمت ویژه بزن</Badge>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-[#8A9884]">بر پایه عمر مفید هر کالا و تاریخ آخرین دریافت ثبت‌شده — سیاست FEFO کمترین ضایعات را تولید می‌کند.</p>
                </Card>
              )}

              {/* slow movers / markdown candidates */}
              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <Tag className="h-5 w-5 shrink-0 text-[#3E6B4A]" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#253A2A]">
                      کندگرد و کاندید مارک‌داون <span className="text-xs font-normal text-[#8A9884]">| Slow movers & markdown</span>
                    </div>
                    <div className="text-xs text-[#6B7A66]">کالاهایی که ۶۰ روز فروش نداشته‌اند — سرمایهٔ راکد در قفسه</div>
                  </div>
                </div>
                {insData.slow.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-[#F3F7EF] px-3 py-2 text-xs text-[#3E6B4A]">کالای کندگردی نیست — چرخش موجودی سالم است.</p>
                ) : (
                  <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pz-scroll pl-1">
                    {insData.slow.map((s) => (
                      <div key={s.productId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#EFEAD8] bg-[#FBF9F3]/60 p-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-[#253A2A]" title={s.name}>{s.name}</div>
                          <div className="mt-0.5 text-xs tabular-nums text-[#6B7A66]">
                            موجودی {toFaDigits(s.stock)} · ارزش {faMoney(s.stockValue)} · قیمت فروش {faMoney(s.sellPrice)}
                          </div>
                        </div>
                        <span title="کاندید مارک‌داون (قیمت فروش ویژه)">
                          <Badge className="border-amber-200 bg-amber-50 text-amber-800">قیمت ویژه بزن</Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* ---------- new warehouse request modal ---------- */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="درخواست جدید از انبار">
        <div className="space-y-3">
          <Field label="کالا" required>
            {picked ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[#5F8F55] bg-[#F3F7EF] px-3 py-2.5 text-sm">
                <span className="font-semibold text-[#3E6B4A]">{picked.name}{picked.nameFa ? ` — ${picked.nameFa}` : ''}</span>
                <button type="button" onClick={() => setPicked(null)} className="rounded-full p-1 text-[#6B7A66] hover:bg-white" aria-label="حذف انتخاب">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8A28C]" />
                  <input
                    value={prodQ}
                    onChange={(e) => setProdQ(e.target.value)}
                    className={`${inputCls} min-h-[44px] pr-9`}
                    placeholder="جستجوی کالا…"
                    autoFocus
                  />
                </div>
                <div className="mt-2 max-h-48 divide-y divide-[#EFEAD8] overflow-y-auto rounded-xl border border-[#E4DCC8] bg-white pz-scroll">
                  {filteredPick.length === 0 && <div className="p-3 text-xs text-[#8A9884]">کالایی پیدا نشد</div>}
                  {filteredPick.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setPicked(p); setProdQ('') }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-right text-sm transition hover:bg-[#F3F7EF]"
                    >
                      <span className="min-w-0 truncate font-medium text-[#33402F]">{p.name}</span>
                      <span className={`shrink-0 text-xs tabular-nums ${stockDot(p.stock, p.minStock)}`}>موجودی {toFaDigits(Math.floor(p.stock))}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </Field>
          <Field label="تعداد" required>
            <input type="number" min={1} value={newQty} onChange={(e) => setNewQty(e.target.value)} className={inputCls} dir="ltr" />
          </Field>
          <Field label="یادداشت">
            <input value={newNote} onChange={(e) => setNewNote(e.target.value)} className={inputCls} placeholder="مثلاً برای قفسه ۳ لبنیات" />
          </Field>
          <div className="flex justify-end gap-2 border-t border-[#EFEAD8] pt-3">
            <GhostButton onClick={() => setNewOpen(false)} className="min-h-[44px]">انصراف</GhostButton>
            <PrimaryButton onClick={() => void submitRequest()} disabled={creating} className="min-h-[44px]">
              {creating ? <Spinner /> : <PackagePlus className="h-4 w-4" />} ثبت درخواست
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* ---------- low-stock auto-draft modal ---------- */}
      <LowStockDraftModal user={user} open={draftOpen} onClose={() => setDraftOpen(false)} />

      {/* ---------- new customer ask modal ---------- */}
      <Modal open={askOpen} onClose={() => setAskOpen(false)} title="درخواست مشتری">
        <div className="space-y-3">
          <Field label="نام کالایی که مشتری خواست" required>
            <input value={askName} onChange={(e) => setAskName(e.target.value)} className={inputCls} placeholder="مثلاً شیر بادام‌زمینی" autoFocus />
          </Field>
          <Field label="یادداشت">
            <input value={askNote} onChange={(e) => setAskNote(e.target.value)} className={inputCls} placeholder="مثلاً دو بار پرسیدند؛ برند دلخواه…" />
          </Field>
          <div className="flex justify-end gap-2 border-t border-[#EFEAD8] pt-3">
            <GhostButton onClick={() => setAskOpen(false)} className="min-h-[44px]">انصراف</GhostButton>
            <GoldButton onClick={() => void submitAsk()} disabled={savingAsk} className="min-h-[44px]">
              {savingAsk ? <Spinner /> : <Plus className="h-4 w-4" />} ثبت
            </GoldButton>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/* ---------- loading skeletons for the 12-b tabs (shimmer via .pz-skeleton) ---------- */

/** mirrors the shrinkage tab: summary strip card + form card + 3 row cards */
function ShrinkageSkeleton() {
  return (
    <div role="status" aria-label="در حال بارگذاری دفتر نزولات…" className="space-y-3">
      <div className="rounded-2xl border border-[#E4DCC8] bg-white/90 p-4">
        <SkeletonBlock className="h-3 w-44" />
        <SkeletonBlock className="mt-2 h-6 w-48" />
        <div className="mt-3 flex flex-wrap gap-2">
          <SkeletonBlock className="h-6 w-24 rounded-full" />
          <SkeletonBlock className="h-6 w-36 rounded-full" />
        </div>
        <SkeletonBlock className="mt-3 h-2.5 w-full rounded-full" />
      </div>
      <div className="flex justify-end">
        <SkeletonBlock className="h-11 w-40 rounded-xl" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-[#E4DCC8] bg-white/90 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-4 w-2/5" />
              <SkeletonBlock className="mt-2 h-3 w-1/3" />
            </div>
            <SkeletonBlock className="h-5 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** mirrors the insights tab: 3 panel cards with chip grids + row placeholders */
function InsightsSkeleton() {
  return (
    <div role="status" aria-label="در حال بارگذاری تحلیل هوشمند انبار…" className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-[#E4DCC8] bg-white/90 p-4">
          <SkeletonBlock className="h-4 w-1/3" />
          <SkeletonBlock className="mt-2 h-3 w-1/2" />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SkeletonBlock className="h-14 rounded-xl" />
            <SkeletonBlock className="h-14 rounded-xl" />
            <SkeletonBlock className="h-14 rounded-xl" />
          </div>
          <SkeletonBlock className="mt-3 h-11 w-full rounded-xl" />
        </div>
      ))}
    </div>
  )
}
