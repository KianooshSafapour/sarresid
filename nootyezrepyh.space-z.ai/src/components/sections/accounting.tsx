'use client'

import * as React from 'react'
import { api, ClientUser } from '@/lib/api-client'
import { GlowCard, SectionHeader, EmptyState, Money, MarginPill, OrnamentDivider } from '@/components/zeytoon-ui'
import { formatMoney, toFaDigits, toEnDigits, todayJalali, formatJalali, formatJalaliDateTime, diffDaysJalali } from '@/lib/jalali'
import { canUser, PERMISSIONS, CHEQUE_STATUSES } from '@/lib/constants'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import {
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  Calculator, FileSpreadsheet, CheckCheck, Banknote, Loader2, Pencil, X, ReceiptText,
  TrendingUp, TrendingDown, Landmark, CalendarClock, Wallet, PackageCheck, Download, ShoppingBasket,
  FileArchive, FileDown, PlugZap, Copy, CheckCircle2, Signal, Settings2, Radio,
} from 'lucide-react'

// ---------- export archive ----------
interface ExportArchiveItem {
  id: string
  kind: string
  kindLabel: string
  kindIcon: string
  label: string
  rows: number
  userName: string
  userColor: string
  userExists: boolean
  at: string
  atJalali: string
}

function ExportsArchiveTab() {
  const { toast } = useToast()
  const [items, setItems] = React.useState<ExportArchiveItem[] | null>(null)
  const [byKind, setByKind] = React.useState<Record<string, number>>({})
  const [kindFilter, setKindFilter] = React.useState<string>('ALL')

  const load = React.useCallback(() => {
    api.get<{ items: ExportArchiveItem[]; total: number; byKind: Record<string, number> }>('/api/exports')
      .then((d) => {
        setItems(d.items)
        setByKind(d.byKind || {})
      })
      .catch((e) => toast({ title: 'خطا', description: e.message, variant: 'destructive' }))
  }, [toast])

  React.useEffect(() => { load() }, [load])

  if (!items) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>
  }

  const kinds = Object.keys(byKind)
  const shown = kindFilter === 'ALL' ? items : items.filter((i) => i.kind === kindFilter)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GlowCard className="p-4">
          <div className="flex items-center gap-3">
            <span className="size-10 rounded-xl bg-gold/10 text-gold grid place-items-center shrink-0"><FileArchive className="size-5" /></span>
            <div>
              <div className="text-xl font-black tabular-nums">{toFaDigits(items.length)}</div>
              <div className="text-[11px] text-muted-foreground">خروجی ثبت‌شده (۶۰ آخر)</div>
            </div>
          </div>
        </GlowCard>
        {kinds.slice(0, 3).map((k) => (
          <GlowCard key={k} className="p-4">
            <div className="flex items-center gap-3">
              <span className="size-10 rounded-xl bg-olive/10 text-olive grid place-items-center shrink-0 text-lg" aria-hidden>{EXPORT_KIND_ICONS[k] || '📄'}</span>
              <div>
                <div className="text-xl font-black tabular-nums">{toFaDigits(byKind[k])}</div>
                <div className="text-[11px] text-muted-foreground truncate">{items.find((x) => x.kind === k)?.kindLabel || k}</div>
              </div>
            </div>
          </GlowCard>
        ))}
      </div>

      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setKindFilter('ALL')}
            className={cn('rounded-full px-3 py-1.5 text-xs font-bold border transition-all', kindFilter === 'ALL' ? 'bg-olive text-white border-olive shadow-sm' : 'bg-card border-border hover:border-olive/40')}
          >
            همه ({toFaDigits(items.length)})
          </button>
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={cn('rounded-full px-3 py-1.5 text-xs font-bold border transition-all', kindFilter === k ? 'bg-olive text-white border-olive shadow-sm' : 'bg-card border-border hover:border-olive/40')}
            >
              {EXPORT_KIND_ICONS[k] || '📄'} {items.find((x) => x.kind === k)?.kindLabel || k} ({toFaDigits(byKind[k])})
            </button>
          ))}
        </div>
      )}

      <GlowCard className="p-4">
        {shown.length === 0 ? (
          <EmptyState
            icon="🗃️"
            title="هنوز خروجی‌ای ثبت نشده"
            description="هر فایل اکسلی که برای هلو بگیری، همین‌جا با تاریخ و نام گیرنده ثبت می‌شود تا هیچ فایلی گم نشود."
          />
        ) : (
          <div className="relative">
            {/* timeline spine */}
            <div className="absolute top-2 bottom-2 right-[22px] w-px bg-gradient-to-b from-gold/50 via-gold/20 to-transparent" aria-hidden />
            <div className="space-y-1">
              {shown.map((e, i) => (
                <div
                  key={e.id}
                  className="relative flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-accent/50 transition-colors animate-in fade-in slide-in-from-bottom-1 duration-300"
                  style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                >
                  <span
                    className={cn('relative z-10 size-6 rounded-full grid place-items-center text-[11px] shrink-0 ring-4 ring-card', e.kind === 'ORDER_XLSX' ? 'bg-gold/15' : 'bg-olive/15')}
                    aria-hidden
                  >
                    {e.kindIcon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{e.label}</div>
                    <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2">
                      <span>{e.kindLabel}</span>
                      <span className="text-border">•</span>
                      <span className="tabular-nums">{toFaDigits(e.rows)} ردیف</span>
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="size-2 rounded-full" style={{ background: e.userExists ? e.userColor : '#c9c4b4' }} aria-hidden />
                      <span className={cn('text-xs font-bold', !e.userExists && 'text-muted-foreground/60 line-through')}>
                        {e.userExists ? e.userName : 'کاربر حذف‌شده'}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">{e.atJalali}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlowCard>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
        <FileDown className="size-3.5" />
        آرشیو به‌صورت خودکار پر می‌شود — آخرین {toFaDigits(60)} خروجی نگه داشته می‌شود.
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs mr-auto" onClick={load}>
          <Loader2 className="size-3 hidden" />
          به‌روزرسانی آرشیو
        </Button>
      </div>
    </div>
  )
}

const EXPORT_KIND_ICONS: Record<string, string> = {
  ORDER_XLSX: '📊',
  STOCK_XLSX: '📦',
  STRESS_CSV: '🧪',
}

// ---------- types ----------
interface AccItem {
  id: string
  productName: string
  holooName: string | null
  barcode: string | null
  quantity: number
  unitPrice: number
  sellPrice: number | null
  printedPrice: number | null
  discount: number
  lineTotal: number
  receivedQty: number | null
  status: string
}

interface AccOrder {
  id: string
  number: number
  status: string
  deliveryDate: string
  paymentType: string
  totalAmount: number
  discount: number
  tax: number
  vat: number
  finalAmount: number
  exportedAt: string | null
  receivedAt: string | null
  inspectedAt: string | null
  doneAt: string | null
  supplier: { name: string; phone: string | null; paymentType: string }
  items: AccItem[]
}

interface AccPayment {
  id: string
  amount: number
  method: string
  orderId: string | null
  orderNumber: number | null
  receiptNo: string | null
  posReceipt: string | null
  note: string | null
  creatorName: string
  createdAt: string
}

interface AccCheque {
  id: string
  number: string | null
  amount: number
  dueDate: string
  status: string
  payeeName: string | null
  orderNumber: number | null
}

interface AccData {
  queue: AccOrder[]
  inHoloo: AccOrder[]
  recentDone: AccOrder[]
  payments: AccPayment[]
  spendByDay: Record<string, number>
  spendBySupplier: Record<string, number>
  thisMonthSpend: number
  lastMonthSpend: number
  processedCount: number
  receivedThisMonth: number
  cheques: AccCheque[]
}

const PAY_TYPE: Record<string, string> = {
  CASH_ON_DELIVERY: 'نقدی هنگام تحویل',
  CHEQUE: 'چکی',
}

const METHOD_LABEL: Record<string, string> = { CASH: 'نقد', CARD: 'کارت', CHEQUE: 'چک' }

const PALETTE = ['#5a7d4f', '#b8860b', '#a35d3f', '#2f6d5a', '#7d4f6d', '#6d6a2f', '#4f6d7d', '#8a6d1f']

function num(s: string): number {
  const v = parseFloat(toEnDigits(String(s)).replace(/[^\d.-]/g, ''))
  return isNaN(v) ? 0 : v
}

function marginOf(it: AccItem): number | null {
  const cost = it.printedPrice && it.printedPrice > 0 ? it.printedPrice : it.unitPrice
  const sell = it.sellPrice
  if (!sell || !cost || cost <= 0) return null
  return ((sell - cost) / cost) * 100
}

// ============================================================
export function AccountingSection({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const [data, setData] = React.useState<AccData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [paymentOrder, setPaymentOrder] = React.useState<AccOrder | null>(null)
  const [confirmDone, setConfirmDone] = React.useState<AccOrder | null>(null)
  const [syncOrder, setSyncOrder] = React.useState<AccOrder | null>(null)

  const allowed = canUser(user.roles, PERMISSIONS.ACCOUNTING)

  const load = React.useCallback(() => {
    setLoading(true)
    api.get<AccData>('/api/accounting')
      .then(setData)
      .catch((e) => toast({ title: 'خطا', description: e.message, variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [toast])

  React.useEffect(() => {
    if (allowed) load()
    else setLoading(false)
  }, [allowed, load])

  if (!allowed) {
    return (
      <div>
        <SectionHeader title="حسابداری" />
        <EmptyState icon="🔒" title="دسترسی ندارید" description="این بخش مخصوص حسابدار ارشد است." />
      </div>
    )
  }

  async function downloadXlsx(o: AccOrder) {
    try {
      const res = await fetch(`/api/orders/${o.id}/export-xlsx`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'خطا در تولید فایل')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `order-${o.number}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: 'فایل اکسل آماده است 📊', description: `فایل سفارش ${toFaDigits(o.number)} دانلود شد — برای هلو واردش کن.` })
      load()
    } catch (e) {
      toast({ title: 'دریافت فایل ناموفق بود', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const allActiveOrders = [...(data?.queue || []), ...(data?.inHoloo || []), ...(data?.recentDone || [])]

  return (
    <div className="space-y-5">
      <SectionHeader
        title="حسابداری و ثبت در هلو"
        subtitle="سرکار خانم درویشی، سفارش‌های کنترل‌شده را برای هلو آماده کن 💼"
        actions={
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
            به‌روزرسانی
          </Button>
        }
      />

      <Tabs defaultValue="holoo" dir="rtl">
        <TabsList className="grid w-full max-w-2xl grid-cols-4 h-auto min-h-11 gap-0.5 p-1 [&>button]:text-[10px] sm:[&>button]:text-sm [&>button]:px-1 [&>button]:gap-1 [&>button]:leading-tight">
          <TabsTrigger value="holoo" className="gap-1.5"><FileSpreadsheet className="size-4 shrink-0" /> ثبت در هلو</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5"><Wallet className="size-4 shrink-0" /> پرداخت‌ها</TabsTrigger>
          <TabsTrigger value="overview" className="gap-1.5"><TrendingUp className="size-4 shrink-0" /> نمای مالی</TabsTrigger>
          <TabsTrigger value="exports" className="gap-1.5"><FileArchive className="size-4 shrink-0" /> آرشیو خروجی‌ها</TabsTrigger>
        </TabsList>

        {/* ---------- Holoo queue ---------- */}
        <TabsContent value="holoo" className="space-y-6 mt-4">
          <HolooBridgeChip />
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>
          ) : (
            <>
              <HolooQueue
                title="در انتظار ثبت در هلو"
                subtitle="سفارش‌های کنترل‌شده توسط انبار — فایل اکسل را بگیر، قیمت‌ها را چک کن و ثبت کن"
                orders={data?.queue || []}
                onRefresh={load}
                onDownload={downloadXlsx}
                onSync={(o) => setSyncOrder(o)}
                onToHoloo={async (o) => {
                  try {
                    await api.post(`/api/orders/${o.id}/mark-done`, { stage: 'TO_HOLOO' })
                    toast({ title: 'به هلو رفت 🧾', description: `سفارش ${toFaDigits(o.number)} در مرحلهٔ ثبت در هلو است.` })
                    load()
                    setConfirmDone(o)
                  } catch (e) {
                    toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
                  }
                }}
                onPay={(o) => setPaymentOrder(o)}
                onDone={() => {}}
              />
              <HolooQueue
                title="در حال ثبت در هلو"
                subtitle="فقط یک تأیید نهایی مانده تا سفارش تکمیل شود"
                orders={data?.inHoloo || []}
                onRefresh={load}
                onDownload={downloadXlsx}
                onSync={(o) => setSyncOrder(o)}
                onToHoloo={() => {}}
                onPay={(o) => setPaymentOrder(o)}
                onDone={async (o) => {
                  try {
                    await api.post(`/api/orders/${o.id}/mark-done`, { stage: 'DONE' })
                    toast({ title: 'سفارش تکمیل شد 🎉', description: `سفارش ${toFaDigits(o.number)} با موفقیت نهایی شد.` })
                    load()
                  } catch (e) {
                    toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
                  }
                }}
              />
              {(data?.queue?.length || 0) + (data?.inHoloo?.length || 0) === 0 && (
                <GlowCard className="p-6">
                  <EmptyState
                    icon="🗂️"
                    title="صف ثبت در هلو خالی است"
                    description="وقتی سرپرست انبار سفارشی را کنترل کند، همین‌جا برای تو ظاهر می‌شود."
                  />
                </GlowCard>
              )}
            </>
          )}
        </TabsContent>

        {/* ---------- Payments ---------- */}
        <TabsContent value="payments" className="mt-4">
          <PaymentsTab data={data} loading={loading} onNew={() => setPaymentOrder(allActiveOrders[0] || null)} />
        </TabsContent>

        {/* ---------- Financial overview ---------- */}
        <TabsContent value="overview" className="mt-4">
          <OverviewTab data={data} loading={loading} />
        </TabsContent>

        {/* ---------- Export archive ---------- */}
        <TabsContent value="exports" className="mt-4">
          <ExportsArchiveTab />
        </TabsContent>
      </Tabs>

      {/* holoo bridge sync dialog */}
      <HolooSyncDialog
        order={syncOrder}
        onClose={() => setSyncOrder(null)}
        onSynced={() => {
          setSyncOrder(null)
          load()
        }}
      />

      {/* payment dialog */}
      {paymentOrder && (
        <PaymentDialog
          orders={allActiveOrders}
          initialOrder={paymentOrder}
          onClose={() => setPaymentOrder(null)}
          onSaved={() => {
            setPaymentOrder(null)
            toast({ title: 'پرداخت ثبت شد ✅', description: 'اطلاعات پرداخت در تاریخچهٔ سفارش ذخیره شد.' })
            load()
          }}
        />
      )}

      {/* confirm DONE dialog */}
      <AlertDialog open={!!confirmDone} onOpenChange={(v) => !v && setConfirmDone(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ثبت شد و سفارش تکمیل است؟</AlertDialogTitle>
            <AlertDialogDescription>
              سفارش {confirmDone && toFaDigits(confirmDone.number)} ({confirmDone?.supplier.name}) با مبلغ{' '}
              <b className="text-foreground">{confirmDone && formatMoney(confirmDone.finalAmount)}</b> تومان در هلو ثبت شد.
              اگر همه‌چیز درست است، سفارش را تکمیل کن — بعد از تکمیل قابل تغییر نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>بعداً</AlertDialogCancel>
            <AlertDialogAction
              className="bg-olive hover:bg-olive/90"
              onClick={async () => {
                if (!confirmDone) return
                try {
                  await api.post(`/api/orders/${confirmDone.id}/mark-done`, { stage: 'DONE' })
                  toast({ title: 'سفارش تکمیل شد 🎉', description: `سفارش ${toFaDigits(confirmDone.number)} به پایان رسید.` })
                } catch (e) {
                  toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
                }
                setConfirmDone(null)
                load()
              }}
            >
              بله، تکمیل شود
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================================
// Holoo bridge (simulated) — status chip + sync dialog

interface HolooStatus {
  ok: boolean
  simulated: boolean
  mode: 'SIMULATED' | 'LIVE'
  endpoint: string | null
  latencyMs: number
  version: string
  lastPingAtJalali: string | null
  lastSyncAtJalali: string | null
  lastSyncRef: string | null
}

interface HolooConfigView {
  mode: 'SIMULATED' | 'LIVE'
  endpoint: string
  hasKey: boolean
  maskedKey: string | null
  updatedBy: string | null
  updatedAtJalali: string | null
  canEdit: boolean
}

function HolooConfigDialog({ open, onOpenChange, onSaved }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [cfg, setCfg] = React.useState<HolooConfigView | null>(null)
  const [mode, setMode] = React.useState<'SIMULATED' | 'LIVE'>('SIMULATED')
  const [endpoint, setEndpoint] = React.useState('')
  const [apiKey, setApiKey] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setApiKey('')
    api.get<HolooConfigView>('/api/accounting/holoo-config')
      .then((c) => {
        setCfg(c)
        setMode(c.mode)
        setEndpoint(c.endpoint || '')
      })
      .catch((e) => toast({ title: 'خطا در دریافت پیکربندی', description: (e as Error).message, variant: 'destructive' }))
  }, [open, toast])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/api/accounting/holoo-config', {
        mode,
        endpoint,
        apiKey: apiKey.trim() ? apiKey.trim() : null, // null = keep existing key
      })
      toast({ title: 'پیکربندی پل هلو ذخیره شد ✅', description: mode === 'LIVE' ? 'پل در حالت زنده قرار گرفت.' : 'پل در حالت آزمایشی ماند.' })
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast({ title: 'خطا در ذخیره پیکربندی', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="size-8 rounded-xl bg-emerald-500/12 text-emerald-600 flex items-center justify-center"><Settings2 className="size-4" /></span>
            پیکربندی پل هلو
          </DialogTitle>
          <DialogDescription>اتصال سامانه به نرم‌افزار حسابداری هلو را مدیریت کنید.</DialogDescription>
        </DialogHeader>
        {!cfg ? (
          <div className="py-8 flex justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : !cfg.canEdit ? (
          <div className="rounded-2xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground leading-6">
            تنها مدیران سامانه (مدیر فروشگاه / مدیر عملیات / مدیر فناوری اطلاعات) مجاز به تغییر پیکربندی هستند.
            {cfg.updatedBy && <div className="mt-2">آخرین تغییر: <span className="font-bold text-foreground">{cfg.updatedBy}</span> — {cfg.updatedAtJalali}</div>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="حالت پل">
              {([
                { v: 'SIMULATED' as const, t: 'آزمایشی', d: 'شبیه‌سازی داخلی — بدون سرور واقعی' },
                { v: 'LIVE' as const, t: 'زنده', d: 'اتصال به سرور هلو سازمان' },
              ]).map((opt) => (
                <button
                  key={opt.v}
                  role="radio"
                  aria-checked={mode === opt.v}
                  onClick={() => setMode(opt.v)}
                  className={cn(
                    'rounded-2xl border p-3 text-right transition-all active:scale-[0.98]',
                    mode === opt.v
                      ? opt.v === 'LIVE' ? 'border-emerald-500/60 bg-emerald-500/[0.07] ring-2 ring-emerald-500/20' : 'border-olive/60 bg-olive/[0.07] ring-2 ring-olive/20'
                      : 'border-border bg-muted/30 hover:border-muted-foreground/30'
                  )}
                >
                  <div className="flex items-center gap-1.5 text-sm font-black">
                    {opt.v === 'LIVE' ? <Radio className="size-3.5 text-emerald-600" /> : <PlugZap className="size-3.5 text-olive" />}
                    {opt.t}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 leading-4">{opt.d}</div>
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground" htmlFor="holoo-endpoint">نشانی سرور هلو {mode === 'LIVE' && <span className="text-red-500">*</span>}</label>
              <Input
                id="holoo-endpoint"
                dir="ltr"
                placeholder="http://holoo.local:8080/api"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground" htmlFor="holoo-key">کلید API {cfg.hasKey && <span className="text-[10px] font-normal text-emerald-600">(ثبت‌شده: {cfg.maskedKey})</span>}</label>
              <Input
                id="holoo-key"
                dir="ltr"
                type="password"
                placeholder={cfg.hasKey ? 'برای حفظ کلید فعلی خالی بگذارید' : 'کلید دسترسی سرور هلو'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="h-9 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">کلید فقط در سرور ذخیره می‌شود و هرگز به مرورگر بازنگردانده نمی‌شود.</p>
            </div>
            {cfg.updatedBy && (
              <div className="text-[10px] text-muted-foreground">آخرین تغییر: <span className="font-bold">{cfg.updatedBy}</span> — {cfg.updatedAtJalali}</div>
            )}
            <Button
              className="w-full h-10 gap-1.5 bg-emerald-600 hover:bg-emerald-600/90 text-white"
              disabled={saving || (mode === 'LIVE' && !/^https?:\/\/.+/i.test(endpoint.trim()))}
              onClick={save}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              ذخیره پیکربندی
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function HolooBridgeChip() {
  const { toast } = useToast()
  const [status, setStatus] = React.useState<HolooStatus | null>(null)
  const [checking, setChecking] = React.useState(false)
  const [configOpen, setConfigOpen] = React.useState(false)

  const ping = React.useCallback(() => {
    setChecking(true)
    api.get<HolooStatus>('/api/accounting/holoo-status')
      .then(setStatus)
      .catch((e) => toast({ title: 'پل هلو پاسخ نداد', description: (e as Error).message, variant: 'destructive' }))
      .finally(() => setChecking(false))
  }, [toast])

  React.useEffect(() => { ping() }, [ping])

  const green = !!status?.ok
  const live = status?.mode === 'LIVE'
  return (
    <div className={cn(
      'flex flex-wrap items-center gap-2 rounded-2xl border px-3.5 py-2.5 transition-colors',
      live
        ? 'border-emerald-500/50 bg-emerald-500/[0.07] dark:bg-emerald-950/30'
        : 'border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/20'
    )}>
      <span className="relative flex size-3 items-center justify-center">
        {green && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={cn('relative size-2.5 rounded-full', green ? 'bg-emerald-500' : 'bg-red-400')} />
      </span>
      <PlugZap className="size-4 text-emerald-600" />
      <span className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300">پل هلو — {status ? 'متصل' : 'در حال بررسی…'}</span>
      {status && (
        <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 flex items-center gap-1">
          <Signal className="size-3" /> {toFaDigits(status.latencyMs)}ms • {status.version}
          {status.lastSyncRef && <span className="mr-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 font-bold">آخرین سند: {toFaDigits(status.lastSyncRef)}</span>}
        </span>
      )}
      <span
        className={cn(
          'text-[10px] rounded-md px-1.5 py-0.5 font-black',
          live ? 'bg-emerald-600 text-white shadow-sm' : 'bg-muted text-muted-foreground'
        )}
      >
        {live ? 'حالت زنده' : 'اتصال آزمایشی — آماده اتصال به سرور واقعی'}
      </span>
      <Button size="sm" variant="ghost" className={cn('h-7 text-[11px] gap-1', live && 'text-emerald-700 dark:text-emerald-300')} onClick={ping} disabled={checking}>
        {checking ? <Loader2 className="size-3 animate-spin" /> : <PlugZap className="size-3" />} تست اتصال
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1 text-muted-foreground" onClick={() => setConfigOpen(true)} aria-label="پیکربندی پل هلو">
        <Settings2 className="size-3" /> پیکربندی
      </Button>
      <HolooConfigDialog open={configOpen} onOpenChange={setConfigOpen} onSaved={ping} />
    </div>
  )
}

const HOLOO_STEPS = [
  'اتصال به سرور هلو…',
  'اعتبارسنجی اقلام و قیمت‌ها…',
  'ارسال سند حسابداری…',
  'دریافت شماره سند…',
]

function HolooSyncDialog({ order, onClose, onSynced }: {
  order: AccOrder | null
  onClose: () => void
  onSynced: () => void
}) {
  const { toast } = useToast()
  const [step, setStep] = React.useState(0)
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<{ holooRef: string } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!order) { setStep(0); setRunning(false); setResult(null); setError(null); setCopied(false) }
  }, [order])

  const start = async () => {
    if (!order) return
    setRunning(true)
    setError(null)
    setResult(null)
    // advance the visual steps while the request is in flight
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let s = 1; s < HOLOO_STEPS.length; s++) timers.push(setTimeout(() => setStep(s), s * 420))
    try {
      const res = await api.post<{ ok: boolean; holooRef: string }>(`/api/accounting/holoo-sync`, { orderId: order.id })
      timers.forEach(clearTimeout)
      setStep(HOLOO_STEPS.length)
      setResult({ holooRef: res.holooRef })
      toast({ title: 'سند در هلو ثبت شد ✅', description: `شماره سند: ${res.holooRef}` })
      setTimeout(() => onSynced(), 1600)
    } catch (e) {
      timers.forEach(clearTimeout)
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const copyRef = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.holooRef)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = result.holooRef
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Dialog open={!!order} onOpenChange={(v) => { if (!v && !running) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="size-9 rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300 flex items-center justify-center"><PlugZap className="size-5" /></span>
            ثبت سفارش {order && toFaDigits(order.number)} با پل هلو
          </DialogTitle>
          <DialogDescription>
            {order && <>سند «{order.supplier.name}» با {toFaDigits(order.items.length)} قلم به‌صورت آزمایشی به هلو ارسال می‌شود و سفارش تکمیل خواهد شد.</>}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30 p-4 text-center space-y-2">
            <CheckCircle2 className="size-10 text-emerald-600 mx-auto" />
            <div className="font-black text-emerald-700 dark:text-emerald-300">سند با موفقیت ثبت شد</div>
            <button onClick={copyRef} className="inline-flex items-center gap-2 rounded-xl bg-white dark:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700 px-4 py-2 text-lg font-black tracking-wider text-emerald-800 dark:text-emerald-200 hover:ring-2 hover:ring-emerald-400/50 transition-all" aria-label="کپی شماره سند">
              {toFaDigits(result.holooRef)}
              {copied ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Copy className="size-4 text-emerald-600/60" />}
            </button>
            <div className="text-[11px] text-muted-foreground">{copied ? 'کپی شد ✓' : 'برای کپی کلیک کنید'} — سفارش به «تکمیل‌شده» رفت</div>
          </div>
        ) : (
          <div className="space-y-2 py-1">
            {HOLOO_STEPS.map((label, i) => {
              const active = running && i === step
              const done = result !== null || (running && i < step) || (!running && step > i)
              return (
                <div key={i} className={cn(
                  'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-all',
                  done ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20' : active ? 'border-gold/40 bg-gold/8' : 'border-border bg-muted/30 opacity-60'
                )}>
                  <span className={cn(
                    'size-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0',
                    done ? 'bg-emerald-500 text-white' : active ? 'bg-gold text-black' : 'bg-muted text-muted-foreground'
                  )}>
                    {done ? '✓' : active ? <Loader2 className="size-3.5 animate-spin" /> : toFaDigits(i + 1)}
                  </span>
                  <span className="font-bold text-xs">{label}</span>
                </div>
              )
            })}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs font-bold text-red-600">
                خطا: {error}
              </div>
            )}
          </div>
        )}

        {!result && (
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 h-11" disabled={running} onClick={onClose}>انصراف</Button>
            <Button className="flex-[2] h-11 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={running} onClick={start}>
              {running ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
              {running ? 'در حال ارسال…' : 'ارسال به هلو'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
function HolooQueue({
  title, subtitle, orders, onRefresh, onDownload, onToHoloo, onPay, onDone, onSync,
}: {
  title: string
  subtitle: string
  orders: AccOrder[]
  onRefresh: () => void
  onDownload: (o: AccOrder) => void
  onToHoloo: (o: AccOrder) => void
  onPay: (o: AccOrder) => void
  onDone: (o: AccOrder) => void
  onSync?: (o: AccOrder) => void
}) {
  if (orders.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 font-bold">
        <FileSpreadsheet className="size-4 text-gold" /> {title}
        <span className="text-xs font-medium text-muted-foreground">— {subtitle}</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {orders.map((o) => <HolooOrderCard key={o.id} order={o} onRefresh={onRefresh} onDownload={onDownload} onToHoloo={onToHoloo} onPay={onPay} onDone={onDone} onSync={onSync} />)}
      </div>
    </div>
  )
}

// ============================================================
function HolooOrderCard({
  order: o, onRefresh, onDownload, onToHoloo, onPay, onDone, onSync,
}: {
  order: AccOrder
  onRefresh: () => void
  onDownload: (o: AccOrder) => void
  onToHoloo: (o: AccOrder) => void
  onPay: (o: AccOrder) => void
  onDone: (o: AccOrder) => void
  onSync?: (o: AccOrder) => void
}) {
  const { toast } = useToast()
  const [savingId, setSavingId] = React.useState<string | null>(null)
  const [editId, setEditId] = React.useState<string | null>(null)
  const [editPrice, setEditPrice] = React.useState('')
  const [editSell, setEditSell] = React.useState('')

  function startEdit(it: AccItem) {
    setEditId(it.id)
    setEditPrice(it.printedPrice ? String(it.printedPrice) : '')
    setEditSell(it.sellPrice ? String(it.sellPrice) : '')
  }

  async function saveEdit(it: AccItem) {
    setSavingId(it.id)
    try {
      await api.post(`/api/orders/${o.id}/inspect`, {
        allowPriceFix: true,
        corrections: [{ itemId: it.id, printedPrice: num(editPrice) || undefined, sellPrice: num(editSell) || undefined }],
      })
      toast({ title: 'قیمت اصلاح شد ✏️', description: `قیمت‌های «${it.productName}» به‌روز شد و حاشیه سود دوباره حساب شد.` })
      setEditId(null)
      onRefresh()
    } catch (e) {
      toast({ title: 'اصلاح قیمت ناموفق بود', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSavingId(null)
    }
  }

  const isHoloo = o.status === 'TO_HOLOO'

  return (
    <GlowCard className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-black">سفارش {toFaDigits(o.number)}</span>
            <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-olive">
              <Banknote className="size-3" /> {PAY_TYPE[o.paymentType] || o.paymentType}
            </span>
            {o.exportedAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold">
                <Download className="size-3" /> اکسل گرفته شده
              </span>
            )}
          </div>
          <div className="text-sm font-bold mt-1">{o.supplier.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {toFaDigits(o.items.length)} قلم • کنترل شده در {formatJalali(o.inspectedAt)}
          </div>
        </div>
        <div className="text-left rounded-xl bg-accent/60 px-3 py-2">
          <div className="text-base font-black tabular-nums text-olive"><Money value={o.finalAmount} /></div>
          <div className="text-[11px] text-muted-foreground">مبلغ نهایی (با مالیات و ارزش افزوده)</div>
        </div>
      </div>

      <OrnamentDivider />

      {/* items preview with margin check */}
      <div className="max-h-64 overflow-y-auto rounded-xl border bg-background/60 divide-y">
        {o.items.map((it) => {
          const margin = marginOf(it)
          const cost = it.printedPrice && it.printedPrice > 0 ? it.printedPrice : it.unitPrice
          const lowMargin = margin !== null && margin < 10
          return (
            <div key={it.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm', lowMargin && 'bg-red-50/50')}>
              <div className="min-w-0 flex-1">
                <div className="font-bold truncate">{it.productName}</div>
                <div className="text-[11px] text-muted-foreground">
                  {toFaDigits(it.receivedQty ?? it.quantity)} × {formatMoney(cost)} {it.discount ? `− تخفیف ${formatMoney(it.discount)}` : ''}
                </div>
              </div>
              {editId === it.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block">قیمت چاپ‌شده</label>
                    <Input value={toFaDigits(editPrice)} onChange={(e) => setEditPrice(e.target.value)} placeholder={formatMoney(it.unitPrice)} inputMode="numeric" className="h-9 w-32 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block">قیمت فروش</label>
                    <Input value={toFaDigits(editSell)} onChange={(e) => setEditSell(e.target.value)} placeholder="قیمت فروش جدید" inputMode="numeric" className="h-9 w-32 text-xs" />
                  </div>
                  <Button size="sm" className="h-9 bg-olive hover:bg-olive/90" disabled={savingId === it.id} onClick={() => saveEdit(it)}>
                    {savingId === it.id ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />} ذخیره
                  </Button>
                  <Button size="sm" variant="ghost" className="h-9" onClick={() => setEditId(null)}>
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {margin !== null ? <MarginPill margin={margin} /> : <span className="text-xs text-muted-foreground">حاشیه: —</span>}
                  <button
                    onClick={() => startEdit(it)}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold hover:bg-accent"
                    aria-label={`اصلاح قیمت ${it.productName}`}
                  >
                    <Pencil className="size-3" /> اصلاح قیمت
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* totals row */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="rounded-lg bg-accent/50 px-2.5 py-1.5"><span className="text-muted-foreground">اقلام: </span><b className="tabular-nums">{formatMoney(o.totalAmount)}</b></div>
        <div className="rounded-lg bg-accent/50 px-2.5 py-1.5"><span className="text-muted-foreground">تخفیف: </span><b className="tabular-nums">{formatMoney(o.discount)}</b></div>
        <div className="rounded-lg bg-accent/50 px-2.5 py-1.5"><span className="text-muted-foreground">مالیات: </span><b className="tabular-nums">{formatMoney(o.tax)}</b></div>
        <div className="rounded-lg bg-accent/50 px-2.5 py-1.5"><span className="text-muted-foreground">ارزش افزوده: </span><b className="tabular-nums">{formatMoney(o.vat)}</b></div>
      </div>

      {/* actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" className="h-11 gap-1.5 border-gold/50 hover:bg-gold/10" onClick={() => onDownload(o)}>
          <FileSpreadsheet className="size-4 text-gold" /> دریافت فایل اکسل (XLSX) برای هلو
        </Button>
        {onSync && (
          <Button variant="outline" className="h-11 gap-1.5 border-emerald-300/70 hover:bg-emerald-50 text-emerald-700" onClick={() => onSync(o)}>
            <PlugZap className="size-4" /> ثبت با پل هلو
          </Button>
        )}
        {!isHoloo ? (
          <Button className="h-11 gap-1.5 bg-olive hover:bg-olive/90" onClick={() => onToHoloo(o)}>
            <CheckCheck className="size-4" /> ثبت در هلو
          </Button>
        ) : (
          <Button className="h-11 gap-1.5 bg-gold text-black hover:bg-gold/90" onClick={() => onDone(o)}>
            <PackageCheck className="size-4" /> تأیید تکمیل سفارش
          </Button>
        )}
        <Button variant="outline" className="h-11 gap-1.5" onClick={() => onPay(o)}>
          <Banknote className="size-4" /> ثبت پرداخت
        </Button>
      </div>
    </GlowCard>
  )
}

// ============================================================
function PaymentsTab({ data, loading, onNew }: { data: AccData | null; loading: boolean; onNew: () => void }) {
  if (loading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
  }
  const payments = data?.payments || []
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="h-11 gap-1.5 bg-olive hover:bg-olive/90" onClick={onNew}>
          <Banknote className="size-4" /> ثبت پرداخت جدید
        </Button>
      </div>
      {payments.length === 0 ? (
        <GlowCard className="p-6">
          <EmptyState icon="🧾" title="هنوز پرداختی ثبت نشده" description="اولین پرداخت نقدی یا کارتی را همین‌جا ثبت کن." />
        </GlowCard>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {payments.map((p) => (
            <GlowCard key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="text-base font-black tabular-nums text-olive"><Money value={p.amount} /></div>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-bold',
                  p.method === 'CASH' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : p.method === 'CARD' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-accent text-olive border border-olive/30'
                )}>
                  {METHOD_LABEL[p.method] || p.method}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                {p.orderNumber !== null && <div>سفارش: {toFaDigits(p.orderNumber)}</div>}
                {p.receiptNo && <div>رسید: {toFaDigits(p.receiptNo)}</div>}
                {p.posReceipt && <div>رسید POS: {toFaDigits(p.posReceipt)}</div>}
                {p.note && <div className="text-foreground">{p.note}</div>}
                <div className="pt-1 border-t mt-1">
                  {formatJalaliDateTime(p.createdAt)} {p.creatorName && `— ${p.creatorName}`}
                </div>
              </div>
            </GlowCard>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
function PaymentDialog({
  orders, initialOrder, onClose, onSaved,
}: {
  orders: AccOrder[]
  initialOrder: AccOrder | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [orderId, setOrderId] = React.useState(initialOrder?.id || 'none')
  const [amount, setAmount] = React.useState(initialOrder ? String(initialOrder.finalAmount) : '')
  const [method, setMethod] = React.useState('CASH')
  const [receiptNo, setReceiptNo] = React.useState('')
  const [posReceipt, setPosReceipt] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  function pickOrder(v: string) {
    setOrderId(v)
    const o = orders.find((x) => x.id === v)
    if (o) setAmount(String(o.finalAmount))
  }

  async function submit() {
    if (num(amount) <= 0) {
      toast({ title: 'مبلغ را وارد کن', description: 'مبلغ پرداخت باید بزرگ‌تر از صفر باشد.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api.post('/api/accounting', {
        orderId: orderId !== 'none' ? orderId : undefined,
        amount: num(amount),
        method,
        receiptNo: receiptNo || undefined,
        posReceipt: posReceipt || undefined,
        note: note || undefined,
      })
      onSaved()
    } catch (e) {
      toast({ title: 'ثبت پرداخت ناموفق بود', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Banknote className="size-5 text-gold" /> ثبت پرداخت
          </DialogTitle>
          <DialogDescription>مبلغ، روش پرداخت و شماره رسید را وارد کن — اگر به سفارش وصل شود، در تاریخچه‌اش هم ثبت می‌شود.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">سفارش (اختیاری)</label>
            <Select value={orderId} onValueChange={pickOrder}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="none">پرداخت عمومی (بدون سفارش)</SelectItem>
                {orders.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    سفارش {o.number} — {o.supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">مبلغ (تومان)</label>
            <Input value={amount ? toFaDigits(amount) : ''} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="h-11 font-bold text-lg" placeholder="مثلاً ۱۲۵۰۰۰۰۰" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">روش پرداخت</label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">نقد</SelectItem>
                  <SelectItem value="CARD">کارت</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">شماره رسید</label>
              <Input value={receiptNo ? toFaDigits(receiptNo) : ''} onChange={(e) => setReceiptNo(e.target.value)} className="h-11" placeholder="اختیاری" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">شماره رسید POS</label>
            <Input value={posReceipt ? toFaDigits(posReceipt) : ''} onChange={(e) => setPosReceipt(e.target.value)} className="h-11" placeholder="اختیاری" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">یادداشت</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-11" placeholder="اختیاری" />
          </div>
          <Button onClick={submit} disabled={saving} className="w-full h-12 bg-olive hover:bg-olive/90 gap-2 text-base">
            {saving ? <Loader2 className="size-5 animate-spin" /> : <Banknote className="size-5" />}
            ثبت پرداخت
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
function OverviewTab({ data, loading }: { data: AccData | null; loading: boolean }) {
  const today = todayJalali()
  const spendSeries = React.useMemo(() => {
    if (!data) return []
    return Object.entries(data.spendByDay).map(([k, v]) => ({
      day: toFaDigits(k.slice(5)),
      'خرید (میلیون)': Math.round(v / 100000) / 10,
    }))
  }, [data])

  const supplierPie = React.useMemo(() => {
    if (!data) return []
    return Object.entries(data.spendBySupplier)
      .filter(([, v]) => v > 0)
      .map(([name, value], i) => ({ name, value: Math.round(value / 1000000), fill: PALETTE[i % PALETTE.length] }))
  }, [data])

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    )
  }

  const changePct = data.lastMonthSpend > 0 ? ((data.thisMonthSpend - data.lastMonthSpend) / data.lastMonthSpend) * 100 : null

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GlowCard className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><ShoppingBasket className="size-3.5 text-olive" /> خرید این ماه</div>
          <div className="text-lg font-black mt-1.5 tabular-nums"><Money value={data.thisMonthSpend} /></div>
        </GlowCard>
        <GlowCard className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><ShoppingBasket className="size-3.5 text-olive" /> ماه قبل</div>
          <div className="text-lg font-black mt-1.5 tabular-nums"><Money value={data.lastMonthSpend} /></div>
        </GlowCard>
        <GlowCard className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            {changePct === null ? <Wallet className="size-3.5 text-olive" /> : changePct >= 0 ? <TrendingUp className="size-3.5 text-red-600" /> : <TrendingDown className="size-3.5 text-emerald-600" />}
            تغییر نسبت به ماه قبل
          </div>
          <div className={cn('text-lg font-black mt-1.5 tabular-nums', changePct === null ? 'text-muted-foreground' : changePct >= 0 ? 'text-red-600' : 'text-emerald-700')}>
            {changePct === null ? '—' : `٪${toFaDigits(Math.abs(changePct).toFixed(1))}`}
          </div>
        </GlowCard>
        <GlowCard className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><PackageCheck className="size-3.5 text-olive" /> سفارشات پردازش‌شده</div>
          <div className="text-lg font-black mt-1.5">{toFaDigits(data.processedCount)} <span className="text-xs font-medium text-muted-foreground">تکمیل‌شده</span></div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{toFaDigits(data.receivedThisMonth)} سفارش این ماه دریافت شده</div>
        </GlowCard>
      </div>

      {/* charts */}
      <div className="grid gap-4 xl:grid-cols-5">
        <GlowCard className="p-4 sm:p-5 xl:col-span-3">
          <div className="font-bold text-sm mb-3 flex items-center gap-2"><TrendingUp className="size-4 text-gold" /> روند خرید ۳۰ روز اخیر (میلیون تومان)</div>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spendSeries} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5a7d4f" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#5a7d4f" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#00000018" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={4} />
                <YAxis tick={{ fontSize: 10 }} width={36} />
                <Tooltip
                  contentStyle={{ direction: 'rtl', fontFamily: 'inherit', borderRadius: 12, border: '1px solid #b8860b55' }}
                  formatter={(v) => [`${toFaDigits(Number(v))} میلیون تومان`, 'خرید']}
                />
                <Area type="monotone" dataKey="خرید (میلیون)" stroke="#5a7d4f" strokeWidth={2.5} fill="url(#spendGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlowCard>

        <GlowCard className="p-4 sm:p-5 xl:col-span-2">
          <div className="font-bold text-sm mb-3 flex items-center gap-2"><Landmark className="size-4 text-gold" /> خرید به تفکیک تأمین‌کننده</div>
          {supplierPie.length === 0 ? (
            <EmptyState title="هنوز خریدی ثبت نشده" />
          ) : (
            <>
              <div className="h-44" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={supplierPie} dataKey="value" nameKey="name" innerRadius={38} outerRadius={70} paddingAngle={2}>
                      {supplierPie.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ direction: 'rtl', fontFamily: 'inherit', borderRadius: 12, border: '1px solid #b8860b55' }}
                      formatter={(v) => [`${toFaDigits(Number(v))} میلیون تومان`, 'خرید']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
                {supplierPie.map((s) => (
                  <span key={s.name} className="inline-flex items-center gap-1 text-[11px]">
                    <span className="size-2 rounded-full" style={{ background: s.fill }} /> {s.name}
                  </span>
                ))}
              </div>
            </>
          )}
        </GlowCard>
      </div>

      {/* upcoming cheques */}
      <GlowCard className="p-4 sm:p-5">
        <div className="font-bold text-sm mb-3 flex items-center gap-2">
          <CalendarClock className="size-4 text-gold" /> چک‌های پیش‌رو
          <span className="text-xs font-medium text-muted-foreground">— مرتب‌شده بر اساس موعد (تقویم شمسی)</span>
        </div>
        {data.cheques.length === 0 ? (
          <EmptyState icon="🗓️" title="چک بازی باقی نمانده" description="همه چک‌ها پرداخت یا بسته شده‌اند." />
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y rounded-xl border">
            {data.cheques.map((c) => {
              const days = diffDaysJalali(c.dueDate, today)
              const overdue = days < 0
              const soon = days >= 0 && days <= 7
              const st = CHEQUE_STATUSES[c.status]
              return (
                <div
                  key={c.id}
                  className={cn(
                    'flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm',
                    overdue && 'bg-red-50/70',
                    soon && !overdue && 'bg-amber-50/60'
                  )}
                >
                  <span className={cn(
                    'font-black tabular-nums min-w-28',
                    overdue ? 'text-red-700' : soon ? 'text-amber-700' : 'text-olive'
                  )}>
                    <Money value={c.amount} />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    موعد: <b className={cn(overdue && 'text-red-600', soon && !overdue && 'text-amber-700', !overdue && !soon && 'text-foreground')}>{toFaDigits(c.dueDate)}</b>
                    <span className={cn('ms-1 font-bold', overdue ? 'text-red-600' : soon ? 'text-amber-600' : 'text-muted-foreground')}>
                      {overdue ? `(موعد گذشته — ${toFaDigits(-days)} روز)` : `(${toFaDigits(days)} روز مانده)`}
                    </span>
                  </span>
                  <span className="text-xs">{c.payeeName || '—'}</span>
                  {c.orderNumber !== null && <span className="text-[11px] text-muted-foreground">سفارش {toFaDigits(c.orderNumber)}</span>}
                  {st && <span className="ms-auto rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: st.color }}>{st.label}</span>}
                </div>
              )
            })}
          </div>
        )}
      </GlowCard>
    </div>
  )
}
