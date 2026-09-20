'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import {
  SectionHeader, StatCard, EmptyState, LoadingBlock, StatusBadge, ChipSelect,
  OrnateDivider, AnimatedCount, ConfirmButton,
} from '@/components/platform/ui/shared'
import { BarcodeInput } from '@/components/platform/ui/barcode-input'
import { money, moneyCompact, toFaDigits, formatJalaliDateTime, formatJalaliFull, timeAgo } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  ClipboardList, Play, PackageCheck, AlertTriangle, TrendingDown, TrendingUp, Search,
  FileSpreadsheet, Loader2, CheckCircle2, Ban, ScanLine, ListFilter, History, Minus, Plus,
  ShoppingCart, Printer, LayoutGrid,
} from 'lucide-react'

// ---------- types ----------
// scope label helper — CATEGORY = product category, SECTION = planogram shelf-section
function scopeLabel(s: { scope: string; category?: string | null }) {
  if (s.scope === 'CATEGORY') return `دسته «${s.category}»`
  if (s.scope === 'SECTION') return `بخش «${s.category}»`
  return 'همه محصولات'
}

interface SessionRow {
  id: string
  code: string
  status: 'IN_PROGRESS' | 'COMMITTED' | 'CANCELLED' | string
  scope: 'ALL' | 'CATEGORY' | string
  category?: string | null
  note?: string | null
  createdByName: string
  createdAt: string
  committedAt?: string | null
  committedByName?: string | null
  totalItems: number
  countedItems: number
  diffItems: number
  diffValue: number
}

interface CountItem {
  id: string
  productId: string
  name: string
  altName?: string | null
  unit: string
  category: string
  brand?: string | null
  image?: string | null
  buyPrice: number
  currentStock: number
  systemStock: number
  countedQty: number | null
  countedAt?: string | null
  countedByName?: string | null
  note?: string | null
  barcodes: string[]
}

interface DetailData {
  session: Omit<SessionRow, 'totalItems' | 'countedItems' | 'diffItems' | 'diffValue'>
  items: CountItem[]
  stats: {
    totalItems: number
    countedItems: number
    diffItems: number
    diffValue: number
    shortageValue: number
    surplusValue: number
  }
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  IN_PROGRESS: { label: 'در جریان', color: '#B07D2B' },
  COMMITTED: { label: 'بسته‌شده', color: '#3E7C59' },
  CANCELLED: { label: 'لغوشده', color: '#8A8A8A' },
}

type FilterKey = 'all' | 'uncounted' | 'diff' | 'counted'
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'همه اقلام' },
  { key: 'uncounted', label: 'بدون شمارش' },
  { key: 'diff', label: 'مغایرت‌دار' },
  { key: 'counted', label: 'شمرده‌شده' },
]

// ---------- printable count result voucher (سند نتیجه جرد) ----------
type ToastFn = (opts: { title: string; variant?: 'destructive' }) => void
function printCountResultVoucher(data: DetailData, stats: DetailData['stats'], toast: ToastFn) {
  const s = data.session
  const diffs = data.items.filter((i) => i.countedQty !== null && i.countedQty !== i.systemStock)
  const untouched = data.items.filter((i) => i.countedQty === null)
  const metaCell = (label: string, value: string) =>
    `<div><b>${label}</b><span class="mono">${value}</span></div>`
  const diffRow = (i: CountItem) => {
    const diff = i.countedQty! - i.systemStock
    const val = Math.round(diff * i.buyPrice)
    const color = diff < 0 ? '#B33A3A' : '#8A6F3C'
    return `<tr>
      <td>${i.name}${i.unit ? ` <small>(${i.unit})</small>` : ''}</td>
      <td class="num">${toFaDigits(i.systemStock)}</td>
      <td class="num">${toFaDigits(i.countedQty!)}</td>
      <td class="num" style="color:${color};font-weight:800">${diff > 0 ? '+' : ''}${toFaDigits(diff)}</td>
      <td class="num" style="color:${color}">${val > 0 ? '+' : ''}${money(val)}</td>
    </tr>`
  }
  const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8">
  <title>سند نتیجه جرد ${s.code}</title>
  <style>
    @page { size: A4; margin: 13mm; }
    * { box-sizing: border-box; font-family: Vazirmatn, Tahoma, sans-serif; }
    body { margin: 0; color: #1d2a22; }
    .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px double #C9A227; padding-bottom: 12px; }
    .brand { font-size: 20px; font-weight: 900; color: #2c5443; }
    .brand small { display: block; font-size: 10px; font-weight: 400; color: #7d8a80; }
    .title { font-size: 15px; font-weight: 800; color: #8A6F3C; letter-spacing: 1px; }
    .vdate { font-size: 11px; color: #7d8a80; margin-top: 3px; }
    .orn { text-align: center; color: #C9A227; font-size: 11px; letter-spacing: 6px; margin-top: 10px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 14px; font-size: 12px; }
    .meta div { border: 1px solid #d8d2c2; border-radius: 8px; padding: 6px 9px; background: #fbf9f2; }
    .meta b { color: #7d8a80; font-weight: 500; font-size: 10px; display: block; margin-bottom: 2px; }
    .sums { margin-top: 14px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .sum { border-radius: 10px; padding: 9px 12px; border: 1px solid #d8d2c2; background: #fbf9f2; }
    .sum .l { font-size: 10px; color: #7d8a80; }
    .sum .v { font-size: 17px; font-weight: 900; margin-top: 3px; font-variant-numeric: tabular-nums; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 11.5px; }
    thead th { background: #2c5443; color: #fff; padding: 7px 8px; text-align: right; font-weight: 700; }
    thead th:first-child { border-radius: 0 8px 8px 0; }
    thead th:last-child { border-radius: 8px 0 0 8px; }
    tbody td { padding: 6px 8px; border-bottom: 1px solid #eee7d6; }
    tbody tr:nth-child(even) { background: #faf7ee; }
    td.num, th.num { text-align: center; font-variant-numeric: tabular-nums; }
    .sec { margin-top: 16px; font-size: 13px; font-weight: 800; color: #2c5443; display: flex; align-items: center; gap: 8px; }
    .sec::after { content: ''; flex: 1; height: 1px; background: #e0d8c4; }
    .note { margin-top: 10px; font-size: 10.5px; color: #7d8a80; background: #fdf6e3; border: 1px solid #e6d9a8; border-radius: 8px; padding: 6px 10px; }
    .sign { margin-top: 38px; display: flex; justify-content: space-between; font-size: 12px; }
    .sign div { width: 30%; text-align: center; }
    .sign .line { margin-top: 30px; border-top: 1px dashed #9aa396; padding-top: 5px; color: #7d8a80; }
    .foot { margin-top: 26px; font-size: 9px; color: #9aa396; text-align: center; border-top: 1px solid #e4dcc9; padding-top: 6px; }
  </style></head><body>
  <div class="head">
    <div class="brand">هایپر زیتون <small>کرمان — سند اصلاح موجودی انبار</small></div>
    <div style="text-align:left">
      <div class="title">سند نتیجه جرد انبار</div>
      <div class="vdate mono">تاریخ سند: ${formatJalaliFull(new Date())}</div>
    </div>
  </div>
  <div class="orn">◆ ─── ✦ ─── ◆</div>
  <div class="meta">
    ${metaCell('کد جلسه جرد', s.code)}
    ${metaCell('دامنه', scopeLabel(s))}
    ${metaCell('جاردها', s.createdByName)}
    ${metaCell('شروع جلسه', formatJalaliDateTime(s.createdAt))}
    ${metaCell('بستن و اصلاح', s.committedAt ? formatJalaliDateTime(s.committedAt) : '—')}
    ${metaCell('تأیید نهایی', s.committedByName ?? '—')}
  </div>
  <div class="sums">
    <div class="sum"><div class="l">اقلام دامنه</div><div class="v">${toFaDigits(stats.totalItems)} قلم</div></div>
    <div class="sum"><div class="l">شمرده‌شده</div><div class="v" style="color:#2c5443">${toFaDigits(stats.countedItems)} قلم</div></div>
    <div class="sum"><div class="l">مغایرت‌ها</div><div class="v" style="color:#8A6F3C">${toFaDigits(stats.diffItems)} قلم</div></div>
    <div class="sum"><div class="l">کسری (ارزش خرید)</div><div class="v" style="color:#B33A3A">${money(stats.shortageValue)}</div></div>
    <div class="sum"><div class="l">مازاد (ارزش خرید)</div><div class="v" style="color:#8A6F3C">${money(stats.surplusValue)}</div></div>
    <div class="sum" style="border-color:#C9A227;background:#fdf6e3"><div class="l">اثر ارزشی خالص</div><div class="v" style="color:#8A6F3C">${money(stats.diffValue)}</div></div>
  </div>
  ${diffs.length ? `
    <div class="sec">ردیف‌های مغایرت‌دار (${toFaDigits(diffs.length)} قلم)</div>
    <table>
      <thead><tr><th>کالا</th><th class="num">موجودی سیستم</th><th class="num">شمارش فیزیکی</th><th class="num">مغایرت</th><th class="num">اثر ارزشی (تومان)</th></tr></thead>
      <tbody>${diffs.map(diffRow).join('')}</tbody>
    </table>` : '<div class="note">هیچ مغایرتی ثبت نشد — شمارش فیزیکی با موجودی سیستم انطباق کامل داشت.</div>'}
  ${untouched.length ? `
    <div class="sec">اقلام بدون شمارش (دست‌نخورده)</div>
    <div class="note">${untouched.map((i) => i.name).join(' • ')}</div>` : ''}
  <div class="sign">
    <div><div class="line">جاردار — تنظیم‌کننده</div></div>
    <div><div class="line">انباردار / مسئول قفسه</div></div>
    <div><div class="line">امضای مدیریت</div></div>
  </div>
  <div class="foot">هایپر زیتون — پلتفرم مدیریت یکپارچه • این سند همزمان با اصلاح موجودی در سامانه تولید شده است</div>
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


export function StockCount() {
  const { toast } = useToast()
  const user = useApp((s) => s.user)
  const canCount = !!user && (user.isManager || user.roleKeys.includes('inventory'))

  const [sessions, setSessions] = React.useState<SessionRow[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [startOpen, setStartOpen] = React.useState(false)
  const [prefill, setPrefill] = React.useState<{ scope: 'CATEGORY' | 'SECTION'; category: string } | null>(null)
  const [detailId, setDetailId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<{ sessions: SessionRow[] }>('/api/stock-counts')
      setSessions(d.sessions)
    } catch (e) {
      toast({ title: 'خطا در دریافت جاردها', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    if (canCount) load()
    else setLoading(false)
  }, [canCount, load])

  // planogram hand-off: «جرد بخش …» writes hz_prefill_count → we open the start
  // dialog pre-scoped to that shop section (guarded against open sessions)
  React.useEffect(() => {
    if (!canCount || loading || !sessions) return
    let raw: string | null = null
    try {
      raw = window.localStorage.getItem('hz_prefill_count')
    } catch {
      return
    }
    if (!raw) return
    try {
      window.localStorage.removeItem('hz_prefill_count')
    } catch {
      /* ignore */
    }
    try {
      const parsed = JSON.parse(raw) as { scope?: string; category?: string }
      if ((parsed.scope !== 'SECTION' && parsed.scope !== 'CATEGORY') || !parsed.category) return
      const openSession = sessions.find((s) => s.status === 'IN_PROGRESS')
      if (openSession) {
        toast({
          title: 'جلسه جرد بازی در جریان است',
          description: `ابتدا جلسه ${openSession.code} را ببندید یا لغو کنید، بعد جرد بخش را شروع کنید.`,
          variant: 'destructive',
        })
        return
      }
      setPrefill({ scope: parsed.scope, category: parsed.category })
      setStartOpen(true)
    } catch {
      /* malformed payload — ignore */
    }
  }, [canCount, loading, sessions, toast])

  if (!canCount) {
    return (
      <EmptyState
        icon={<ClipboardList className="h-10 w-10" />}
        title="جرد انبار"
        description="این بخش برای تیم انبار و مدیریت فعال است."
      />
    )
  }

  const open = sessions?.filter((s) => s.status === 'IN_PROGRESS') ?? []
  const lastCommitted = sessions?.find((s) => s.status === 'COMMITTED')
  const totalDiffs = sessions?.reduce((n, s) => n + (s.status === 'COMMITTED' ? s.diffItems : 0), 0) ?? 0

  return (
    <div>
      <SectionHeader
        title="جرد انبار"
        subtitle="شمارش واقعی موجودی، مقایسه با سیستم و اصلاح اختلاف‌ها — همه‌چیز با ثبت زمان و شمارش‌گر"
        icon={<ClipboardList className="h-6 w-6" />}
        actions={
          <Button
            onClick={() => setStartOpen(true)}
            disabled={open.length > 0}
            className="gap-2 gold-underline"
          >
            <Play className="h-4 w-4" />
            شروع جرد جدید
          </Button>
        }
      />

      {/* stats strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 stagger-item">
        <StatCard title="جلسه باز" value={<AnimatedCount value={open.length} />} hint={open[0]?.code ?? 'جرد فعالی در جریان نیست'} icon={<ClipboardList className="h-5 w-5" />} color="#B07D2B" />
        <StatCard title="اقلام جلسه باز" value={open[0] ? <AnimatedCount value={open[0].totalItems} /> : '—'} hint={open[0] ? `${toFaDigits(open[0].countedItems)} شمرده شده` : 'یک جلسه شروع کنید'} icon={<PackageCheck className="h-5 w-5" />} color="#3E7C59" />
        <StatCard title="مغایرت آخرین جرد" value={lastCommitted ? <AnimatedCount value={lastCommitted.diffItems} /> : '—'} hint={lastCommitted ? `اثر ارزشی ${moneyCompact(lastCommitted.diffValue)} تومان` : 'هنوز جردی بسته نشده'} icon={<AlertTriangle className="h-5 w-5" />} color="#B33A3A" />
        <StatCard title="جلسات بسته‌شده" value={<AnimatedCount value={sessions?.filter((s) => s.status === 'COMMITTED').length ?? 0} />} hint={`${toFaDigits(totalDiffs)} قلم اصلاح‌شده تاکنون`} icon={<History className="h-5 w-5" />} color="#5E8C61" />
      </div>

      {loading ? (
        <LoadingBlock rows={4} />
      ) : !sessions?.length ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title="هنوز جلسه جردی ثبت نشده"
          description="جرد دوره‌ای انبار تضمین می‌کند موجودی سیستم با قفسه‌ها یکی باشد. با «شروع جرد جدید» همه اقلام با موجودی لحظه‌ای اسنپ‌شات می‌شوند."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {sessions.map((s, idx) => {
            const meta = STATUS_META[s.status] ?? STATUS_META.IN_PROGRESS
            const pct = s.totalItems ? Math.round((s.countedItems / s.totalItems) * 100) : 0
            const openCount = s.status === 'IN_PROGRESS'
            return (
              <button
                key={s.id}
                onClick={() => setDetailId(s.id)}
                style={{ animationDelay: `${Math.min(idx * 70, 420)}ms` }}
                className={cn(
                  'stagger-item group relative text-right rounded-2xl border bg-card p-4 sm:p-5 card-hover transition-all outline-none overflow-hidden focus-visible:ring-2 focus-visible:ring-ring/50',
                  openCount ? 'border-[#C9A227]/40' : 'border-border'
                )}
              >
                {/* status hairline */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-x-0 top-0 h-[3px]',
                    openCount && 'bg-gradient-to-l from-[#C9A227] via-[#C9A227]/50 to-transparent',
                    s.status === 'COMMITTED' && 'bg-gradient-to-l from-[#3E7C59] via-[#3E7C59]/40 to-transparent',
                    s.status === 'CANCELLED' && 'bg-gradient-to-l from-muted-foreground/40 to-transparent'
                  )}
                />
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-bold num text-sm">{s.code}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {scopeLabel(s)} — {toFaDigits(s.totalItems)} قلم
                    </div>
                  </div>
                  <StatusBadge label={meta.label} color={meta.color} />
                </div>

                {openCount && (
                  <div className="mb-3">
                    <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                      <span>پیشرفت شمارش</span>
                      <span className="num font-bold text-foreground">{toFaDigits(pct)}٪</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#3E7C59]" aria-hidden />
                    جاردها: <b className="text-foreground num">{s.createdByName}</b>
                  </span>
                  <span>{timeAgo(s.createdAt)}</span>
                  {openCount && (
                    <span className="text-[#B07D2B] font-bold">
                      {toFaDigits(s.diffItems)} مغایرت تاکنون
                    </span>
                  )}
                  {s.status === 'COMMITTED' && s.committedAt && (
                    <span className="text-[#3E7C59]">بسته: {formatJalaliDateTime(s.committedAt)}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {startOpen && (
        <StartDialog
          open={startOpen}
          onOpenChange={setStartOpen}
          initialScope={prefill?.scope}
          initialCategory={prefill?.category}
          onStarted={async (id) => {
            setStartOpen(false)
            setPrefill(null)
            await load()
            setDetailId(id)
            toast({ title: 'جلسه جرد آغاز شد', description: 'اقلام با موجودی لحظه‌ای ثبت شدند — اسکنر بارکد آماده است' })
          }}
        />
      )}

      {detailId && (
        <DetailDialog
          id={detailId}
          onClose={async () => {
            setDetailId(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

// ================= Start dialog =================
function StartDialog({
  open, onOpenChange, onStarted, initialScope, initialCategory,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onStarted: (id: string) => void
  initialScope?: 'CATEGORY' | 'SECTION'
  initialCategory?: string
}) {
  const { toast } = useToast()
  const [scope, setScope] = React.useState<'ALL' | 'CATEGORY' | 'SECTION'>(initialScope ?? 'ALL')
  const [category, setCategory] = React.useState<string>(initialCategory ?? '')
  const [note, setNote] = React.useState('')
  const [categories, setCategories] = React.useState<string[]>([])
  const [sections, setSections] = React.useState<{ name: string; shelfCount: number; productCount: number }[]>([])
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    api<{ categories: string[] }>('/api/products?limit=1')
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => setCategories([]))
    api<{ shelves: { section: string; product: { id: string } | null }[] }>('/api/planogram')
      .then((d) => {
        const m = new Map<string, { shelves: number; products: Set<string> }>()
        for (const sh of d.shelves ?? []) {
          const rec = m.get(sh.section) ?? { shelves: 0, products: new Set<string>() }
          rec.shelves++
          if (sh.product?.id) rec.products.add(sh.product.id)
          m.set(sh.section, rec)
        }
        setSections(
          [...m.entries()]
            .map(([name, rec]) => ({ name, shelfCount: rec.shelves, productCount: rec.products.size }))
            .sort((a, b) => a.name.localeCompare(b.name, 'fa'))
        )
      })
      .catch(() => setSections([]))
  }, [open])

  const start = async () => {
    setBusy(true)
    try {
      const res = await api<{ id: string; code: string; totalItems: number }>('/api/stock-counts', {
        method: 'POST',
        body: { scope, category: scope === 'ALL' ? undefined : category, note },
      })
      onStarted(res.id)
    } catch (e) {
      toast({ title: 'خطا در شروع جرد', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-4 w-4 text-[#C9A227]" />
            شروع جلسه جرد
          </DialogTitle>
          <DialogDescription>
            موجودی لحظه‌ای همه اقلام محدوده انتخابی به‌عنوان مبنای مقایسه ثبت می‌شود.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {initialScope && initialCategory && (
            <div className="flex items-center gap-1.5 rounded-xl border border-[#C9A227]/40 bg-[#C9A227]/10 px-3 py-2 text-[11px] font-bold text-[#8A6F3C] dark:text-[#e3c765]">
              <LayoutGrid className="h-3.5 w-3.5 shrink-0" aria-hidden />
              محدوده از «چیدمان قفسه» آمده — {initialScope === 'SECTION' ? 'بخش' : 'دسته'} «{initialCategory}»
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1.5 block">محدوده جرد</label>
            <ChipSelect
              options={[
                { key: 'ALL' as const, label: 'همه محصولات' },
                { key: 'CATEGORY' as const, label: 'یک دسته خاص' },
                { key: 'SECTION' as const, label: 'یک بخش از فروشگاه' },
              ]}
              value={scope}
              onChange={(v) => {
                setScope(v)
                setCategory('')
              }}
            />
          </div>

          {scope !== 'ALL' && (
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1.5 block">
                {scope === 'CATEGORY' ? 'دسته' : 'بخش فروشگاه (بر پایه پلانوگرام)'}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-10 rounded-xl border border-input bg-card px-3 text-sm"
              >
                <option value="">{scope === 'CATEGORY' ? 'انتخاب دسته…' : 'انتخاب بخش…'}</option>
                {scope === 'CATEGORY'
                  ? categories.map((c) => <option key={c} value={c}>{c}</option>)
                  : sections.map((sec) => (
                      <option key={sec.name} value={sec.name}>
                        {sec.name} — {toFaDigits(sec.productCount)} قلم روی {toFaDigits(sec.shelfCount)} قفسه
                      </option>
                    ))}
              </select>
              {scope === 'SECTION' && sections.length === 0 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  هنوز قفسه‌ای در پلانوگرام ثبت نشده — از بخش «چیدمان قفسه» قفسه‌ها را بچینید.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1.5 block">توضیح (اختیاری)</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="مثلاً: جرد پایان فصل تابستان — هماهنگی با آقای محمودی"
            />
          </div>

          <OrnateDivider />

          <Button onClick={start} disabled={busy || (scope !== 'ALL' && !category)} className="w-full gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            شروع جرد
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ================= Detail dialog (the counting workspace) =================
function DetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useToast()
  const user = useApp((s) => s.user)
  const setSection = useApp((s) => s.setSection)
  const [data, setData] = React.useState<DetailData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState<FilterKey>('all')
  const [search, setSearch] = React.useState('')
  const [edits, setEdits] = React.useState<Record<string, number>>({}) // productId -> staged qty
  const [savingRows, setSavingRows] = React.useState<Set<string>>(new Set())
  const [scanFlash, setScanFlash] = React.useState<string | null>(null)
  const [commitOpen, setCommitOpen] = React.useState(false)
  const [commitBusy, setCommitBusy] = React.useState(false)
  const [wedgeBuf, setWedgeBuf] = React.useState('') // keyboard-wedge visual state
  const wedgeRef = React.useRef({ buf: '', timer: null as ReturnType<typeof setTimeout> | null })
  const rowRefs = React.useRef<Record<string, HTMLDivElement | null>>({})

  const load = React.useCallback(async () => {
    try {
      const d = await api<DetailData>(`/api/stock-counts/${id}`)
      setData(d)
      setEdits({})
    } catch (e) {
      toast({ title: 'خطا در دریافت جلسه جرد', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [id, toast])

  React.useEffect(() => {
    load()
  }, [load])

  const isInProgress = data?.session.status === 'IN_PROGRESS'

  // ---------- stats derived live from items (survives optimistic updates) ----------
  const stats = React.useMemo(() => {
    const items = data?.items ?? []
    const counted = items.filter((i) => i.countedQty !== null)
    const diffs = counted.filter((i) => i.countedQty !== i.systemStock)
    let shortageValue = 0
    let surplusValue = 0
    for (const i of diffs) {
      const v = (i.countedQty! - i.systemStock) * i.buyPrice
      if (v < 0) shortageValue += -v
      else surplusValue += v
    }
    return {
      totalItems: items.length,
      countedItems: counted.length,
      diffItems: diffs.length,
      diffValue: Math.round(surplusValue - shortageValue),
      shortageValue: Math.round(shortageValue),
      surplusValue: Math.round(surplusValue),
    }
  }, [data?.items])

  // ---------- save one row ----------
  const saveRow = React.useCallback(
    async (item: CountItem, qty: number) => {
      if (!isInProgress) return
      setSavingRows((s) => new Set(s).add(item.productId))
      try {
        await api(`/api/stock-counts/${id}`, {
          method: 'POST',
          body: { action: 'count', productId: item.productId, countedQty: qty },
        })
        setEdits((e) => {
          const rest = { ...e }
          delete rest[item.productId]
          return rest
        })
        setData((d) => {
          if (!d) return d
          return {
            ...d,
            items: d.items.map((it) =>
              it.productId === item.productId
                ? { ...it, countedQty: qty, countedAt: new Date().toISOString(), countedByName: user?.name ?? '' }
                : it
            ),
          }
        })
      } catch (e) {
        toast({ title: 'خطا در ثبت شمارش', description: (e as Error).message, variant: 'destructive' })
      } finally {
        setSavingRows((s) => {
          const n = new Set(s)
          n.delete(item.productId)
          return n
        })
      }
    },
    [id, isInProgress, toast, user?.name]
  )

  // ---------- barcode scan handler ----------
  const handleScan = React.useCallback(
    (code: string) => {
      if (!data) return
      const item = data.items.find((it) => it.barcodes.includes(code))
      if (!item) {
        toast({ title: 'بارکد شناخته نشد', description: `کد ${toFaDigits(code)} در محدوده این جلسه جرد نیست`, variant: 'destructive' })
        return
      }
      setFilter('all')
      setSearch('')
      // scroll + flash + focus its qty input
      requestAnimationFrame(() => {
        rowRefs.current[item.productId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      setScanFlash(item.productId)
      setTimeout(() => setScanFlash(null), 1800)
      const input = rowRefs.current[item.productId]?.querySelector('input[data-qty]') as HTMLInputElement | null
      input?.focus()
      input?.select()
    },
    [data, toast]
  )

  // ---------- global keyboard-wedge capture (digits typed while focus is outside inputs) ----------
  React.useEffect(() => {
    if (!isInProgress) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if (inField) return
      if (/^\d$/.test(e.key)) {
        const w = wedgeRef.current
        w.buf = (w.buf + e.key).slice(-32)
        setWedgeBuf(w.buf)
        if (w.timer) clearTimeout(w.timer)
        w.timer = setTimeout(() => {
          w.buf = ''
          setWedgeBuf('')
        }, 4000)
      } else if (e.key === 'Enter' && wedgeRef.current.buf.length >= 4) {
        const code = wedgeRef.current.buf
        wedgeRef.current.buf = ''
        setWedgeBuf('')
        handleScan(code)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isInProgress, handleScan])

  // ---------- commit ----------
  const commit = async () => {
    setCommitBusy(true)
    try {
      const res = await api<{ adjusted: number; counted: number; shortage: number; surplus: number; netValue: number }>(
        `/api/stock-counts/${id}`,
        { method: 'POST', body: { action: 'commit' } }
      )
      toast({
        title: 'جرد بسته و موجودی اصلاح شد',
        description: `${toFaDigits(res.counted)} قلم شمرده — ${toFaDigits(res.shortage)} کسری / ${toFaDigits(res.surplus)} مازاد اصلاح شد (اثر ${moneyCompact(res.netValue)} تومان)`,
      })
      setCommitOpen(false)
      await load()
    } catch (e) {
      toast({ title: 'خطا در بستن جرد', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setCommitBusy(false)
    }
  }

  const cancel = async () => {
    try {
      await api(`/api/stock-counts/${id}`, { method: 'POST', body: { action: 'cancel' } })
      toast({ title: 'جلسه جرد لغو شد' })
      onClose()
    } catch (e) {
      toast({ title: 'خطا در لغو', description: (e as Error).message, variant: 'destructive' })
    }
  }

  // ---------- reorder replacements for shortage items (count → order loop) ----------
  const shortageItems = (data?.items ?? []).filter(
    (it) => it.countedQty !== null && it.countedQty < it.systemStock
  )
  const reorderShortages = () => {
    if (!shortageItems.length) return
    const rows = shortageItems.map((it) => ({
      productId: it.productId,
      qty: Math.max(1, it.systemStock - it.countedQty!), // replace exactly what went missing
    }))
    try {
      window.localStorage.setItem('hz_prefill_items', JSON.stringify(rows))
    } catch {
      /* ignore */
    }
    toast({
      title: 'آماده سفارش جایگزین',
      description: `${toFaDigits(rows.length)} قلم کسری به پیش‌نویس سفارش اضافه شد — تأمین‌کننده را انتخاب کنید`,
    })
    onClose()
    setSection('orders')
  }

  if (loading || !data) {
    return (
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>جلسه جرد</DialogTitle>
            <DialogDescription>در حال دریافت اقلام…</DialogDescription>
          </DialogHeader>
          <LoadingBlock rows={5} />
        </DialogContent>
      </Dialog>
    )
  }

  const s = data.session
  const meta = STATUS_META[s.status] ?? STATUS_META.IN_PROGRESS
  const pct = stats.totalItems ? Math.round((stats.countedItems / stats.totalItems) * 100) : 0

  const filtered = data.items.filter((it) => {
    if (filter === 'uncounted' && it.countedQty !== null) return false
    if (filter === 'counted' && it.countedQty === null) return false
    if (filter === 'diff' && (it.countedQty === null || it.countedQty === it.systemStock)) return false
    if (search) {
      const q = search.trim()
      const hay = `${it.name} ${it.altName ?? ''} ${it.brand ?? ''} ${it.barcodes.join(' ')}`
      if (!hay.includes(q)) return false
    }
    return true
  })

  const diffOf = (it: CountItem) => {
    const qty = edits[it.productId] ?? it.countedQty
    if (qty === null || qty === undefined) return null
    return qty - it.systemStock
  }

  const openDiffCount = data.items.filter((it) => it.countedQty !== null && it.countedQty !== it.systemStock).length

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] flex flex-col">
        <DialogHeader className="pb-1">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#C9A227]" />
            <span className="num">{s.code}</span>
            <StatusBadge label={meta.label} color={meta.color} />
            {(s.scope === 'CATEGORY' || s.scope === 'SECTION') && (
              <span className="text-xs font-normal text-muted-foreground">
                {s.scope === 'CATEGORY' ? 'دسته' : 'بخش'} «{s.category}»
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {isInProgress
              ? 'تعداد واقعی را وارد کنید — با Enter یا خروج از فیلد ثبت می‌شود. اسکنر بارکد فعال است.'
              : `باز شده توسط ${s.createdByName} در ${formatJalaliDateTime(s.createdAt)}${s.committedAt ? ` — بسته توسط ${s.committedByName} در ${formatJalaliDateTime(s.committedAt)}` : ''}`}
          </DialogDescription>
        </DialogHeader>
        <OrnateDivider className="mb-2" />

        {/* progress + stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] text-muted-foreground mb-1">پیشرفت شمارش</div>
            <div className="text-lg font-black num">{toFaDigits(pct)}٪</div>
            <Progress value={pct} className="h-1.5 mt-2" />
            <div className="text-[10px] text-muted-foreground mt-1 num">{toFaDigits(stats.countedItems)} از {toFaDigits(stats.totalItems)} قلم</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] text-muted-foreground mb-1">مغایرت‌ها</div>
            <div className={cn('text-lg font-black num', openDiffCount > 0 ? 'text-[#B33A3A]' : 'text-[#3E7C59]')}>
              {toFaDigits(openDiffCount)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">قلم اختلاف‌دار</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] text-muted-foreground mb-1 inline-flex items-center gap-1"><TrendingDown className="h-3 w-3 text-[#B33A3A]" /> کسری</div>
            <div className="text-sm font-black num text-[#B33A3A]">{moneyCompact(stats.shortageValue)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">تومان اثر کسری</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] text-muted-foreground mb-1 inline-flex items-center gap-1"><TrendingUp className="h-3 w-3 text-[#3E7C59]" /> مازاد</div>
            <div className="text-sm font-black num text-[#3E7C59]">{moneyCompact(stats.surplusValue)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">تومان اثر مازاد</div>
          </div>
        </div>

        {isInProgress ? (
          <>
            {/* scanner bar */}
            <div className="flex items-center gap-2 mb-3">
              <BarcodeInput onScan={handleScan} autoFocus className="flex-1" placeholder="بارکد را اسکن کنید تا ردیفش پیدا شود…" />
              <div
                className={cn(
                  'hidden sm:flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-bold transition-colors',
                  wedgeBuf ? 'border-[#3E7C59] bg-[#3E7C59]/10 text-[#3E7C59]' : 'border-border text-muted-foreground'
                )}
                aria-live="polite"
              >
                <ScanLine className={cn('h-3.5 w-3.5', wedgeBuf && 'animate-pulse')} />
                {wedgeBuf ? 'دریافت بارکد…' : 'اسکنر آماده'}
              </div>
            </div>

            {/* filters */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <ChipSelect options={FILTERS} value={filter} onChange={(v) => setFilter(v)} />
              <div className="relative flex-1 min-w-36">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجوی نام/بارکد…" className="h-9 pr-9 text-xs" />
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <ChipSelect options={FILTERS} value={filter} onChange={(v) => setFilter(v)} />
            <div className="relative flex-1 min-w-36">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو…" className="h-9 pr-9 text-xs" />
            </div>
            {data.session.status === 'COMMITTED' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => printCountResultVoucher(data, stats, toast)}
                className="gap-1.5 border-[#C9A227]/40 bg-[#C9A227]/10 text-[#8a6f1c] hover:bg-[#C9A227]/20 hover:text-[#8a6f1c] dark:text-[#e3c765] text-xs font-bold h-9"
                title="سند A4 نتیجه جرد با جدول مغایرت‌ها و امضاها"
              >
                <Printer className="h-4 w-4" />
                چاپ سند نتیجه
              </Button>
            )}
            <a
              href={`/api/stock-counts/${id}/export`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#C9A227]/40 bg-[#C9A227]/10 px-3 py-2 text-xs font-bold text-[#8a6f1c] hover:bg-[#C9A227]/20 transition-colors dark:text-[#e3c765]"
            >
              <FileSpreadsheet className="h-4 w-4" />
              خروجی اکسل نتیجه
            </a>
          </div>
        )}

        {/* items */}
        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-2 nice-scroll" role="list">
          {filtered.length === 0 ? (
            <EmptyState icon={<ListFilter className="h-8 w-8" />} title="ردیفی با این فیلتر نیست" description="فیلتر یا جستجو را تغییر دهید." />
          ) : (
            filtered.map((it) => {
              const diff = diffOf(it)
              const counted = it.countedQty !== null
              return (
                <div
                  key={it.productId}
                  role="listitem"
                  ref={(el) => { rowRefs.current[it.productId] = el }}
                  className={cn(
                    'rounded-xl border p-3 transition-all duration-500',
                    scanFlash === it.productId
                      ? 'border-[#3E7C59] bg-[#3E7C59]/10 ring-2 ring-[#3E7C59]/30'
                      : 'border-border bg-card',
                    !isInProgress && diff !== null && diff !== 0 && 'border-[#B33A3A]/30'
                  )}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    {/* product */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br from-[#3E7C59]/15 to-[#C9A227]/15 grid place-items-center text-xs font-black text-[#3E7C59] overflow-hidden">
                        {it.image ? (
                          <img src={it.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          it.name.slice(0, 2)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate">{it.name}</div>
                        <div className="text-[10px] text-muted-foreground num truncate">
                          {it.barcodes[0] ? toFaDigits(it.barcodes[0]) : '—'} — موجودی سیستم: {toFaDigits(it.systemStock)} {it.unit}
                        </div>
                      </div>
                    </div>

                    {/* qty input */}
                    {isInProgress ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline" size="icon" className="h-9 w-9"
                          disabled={savingRows.has(it.productId)}
                          onClick={() => {
                            const cur = edits[it.productId] ?? it.countedQty ?? 0
                            setEdits((e) => ({ ...e, [it.productId]: Math.max(0, cur - 1) }))
                          }}
                          aria-label="کاهش"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <Input
                          data-qty
                          inputMode="numeric"
                          value={edits[it.productId] ?? it.countedQty ?? ''}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
                            setEdits((e) => ({ ...e, [it.productId]: v === '' ? (undefined as unknown as number) : Number(v) }))
                          }}
                          onBlur={() => {
                            const raw = edits[it.productId]
                            if (raw !== undefined && !Number.isNaN(raw)) saveRow(it, raw)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const raw = edits[it.productId]
                              if (raw !== undefined && !Number.isNaN(raw)) saveRow(it, raw)
                            }
                          }}
                          placeholder="تعداد"
                          className="w-20 h-9 text-center num font-bold"
                          aria-label={`تعداد شمرده‌شده ${it.name}`}
                        />
                        <Button
                          variant="outline" size="icon" className="h-9 w-9"
                          disabled={savingRows.has(it.productId)}
                          onClick={() => {
                            const cur = edits[it.productId] ?? it.countedQty ?? 0
                            setEdits((e) => ({ ...e, [it.productId]: cur + 1 }))
                          }}
                          aria-label="افزایش"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        {savingRows.has(it.productId) && <Loader2 className="h-4 w-4 animate-spin text-[#3E7C59]" />}
                      </div>
                    ) : (
                      <div className="text-left">
                        <div className="text-sm font-black num">{it.countedQty !== null ? toFaDigits(it.countedQty) : '—'}</div>
                        <div className="text-[10px] text-muted-foreground">{it.countedByName ?? ''}</div>
                      </div>
                    )}

                    {/* diff badge */}
                    <div className="w-20 text-center">
                      {diff !== null && diff !== undefined && (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black num',
                            diff === 0 && 'bg-[#3E7C59]/10 text-[#3E7C59]',
                            diff > 0 && 'bg-[#C9A227]/15 text-[#8a6f1c] dark:text-[#e3c765]',
                            diff < 0 && 'bg-[#B33A3A]/10 text-[#B33A3A]'
                          )}
                          title={diff !== 0 ? `اثر ارزشی: ${money(diff * it.buyPrice)} تومان` : 'بدون مغایرت'}
                        >
                          {diff === 0 ? (
                            <CheckCircle2 className="h-3 w-3" aria-hidden />
                          ) : diff > 0 ? (
                            <TrendingUp className="h-3 w-3" aria-hidden />
                          ) : (
                            <TrendingDown className="h-3 w-3" aria-hidden />
                          )}
                          {diff === 0 ? 'انطباق' : diff > 0 ? `+${toFaDigits(diff)}` : toFaDigits(diff)}
                        </span>
                      )}
                      {counted && it.countedAt && diff !== 0 && (
                        <div className="text-[9px] text-muted-foreground mt-0.5">{timeAgo(it.countedAt)}</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border mt-1">
          <div className="flex items-center gap-2">
            {!isInProgress && shortageItems.length > 0 && (
              <Button
                variant="outline"
                onClick={reorderShortages}
                className="gap-1.5 border-[#3E7C59]/40 text-[#3E7C59] hover:bg-[#3E7C59]/10 text-xs"
              >
                <ShoppingCart className="h-4 w-4" />
                سفارش جایگزین برای {toFaDigits(shortageItems.length)} قلم کسری
              </Button>
            )}
            {isInProgress && (
              <>
                <a
                  href={`/api/stock-counts/${id}/export`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-accent transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  برگه خالی (چاپ/اکسل)
                </a>
                <Button onClick={() => setCommitOpen(true)} className="gap-2" disabled={stats.countedItems === 0}>
                  <CheckCircle2 className="h-4 w-4" />
                  بستن جرد و اصلاح موجودی
                </Button>
                <ConfirmButton
                  onConfirm={cancel}
                  confirmText="تأیید لغو جلسه؟"
                  variant="ghost"
                  className="text-xs text-[#B33A3A] border border-[#B33A3A]/30"
                >
                  <Ban className="h-4 w-4" />
                  لغو جلسه
                </ConfirmButton>
              </>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {isInProgress
              ? `${toFaDigits(stats.totalItems - stats.countedItems)} قلم مانده تا تکمیل شمارش`
              : `نتیجه نهایی — ${toFaDigits(stats.diffItems)} مغایرت با اثر ${moneyCompact(stats.diffValue)} تومان`}
          </div>
        </div>

        {/* commit confirm */}
        <Dialog open={commitOpen} onOpenChange={setCommitOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>بستن جرد و اصلاح موجودی</DialogTitle>
              <DialogDescription>
                موجودی سیستم برای همه ردیف‌های مغایرت‌دار به تعداد شمرده‌شده تغییر می‌کند و برای مدیریت و حسابداری اطلاع‌رسانی می‌شود.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-[#C9A227]/30 bg-[#C9A227]/5 p-3 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-muted-foreground">اقلام شمرده‌شده</span><b className="num">{toFaDigits(stats.countedItems)}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">بدون شمارش (دست‌نخورده)</span><b className="num">{toFaDigits(stats.totalItems - stats.countedItems)}</b></div>
              <div className="flex justify-between text-[#B33A3A]"><span>کسری</span><b className="num">{toFaDigits(data.items.filter((i) => i.countedQty !== null && i.countedQty < i.systemStock).length)} قلم</b></div>
              <div className="flex justify-between text-[#3E7C59]"><span>مازاد</span><b className="num">{toFaDigits(data.items.filter((i) => i.countedQty !== null && i.countedQty > i.systemStock).length)} قلم</b></div>
              <OrnateDivider />
              <div className="flex justify-between font-black">
                <span>اثر ارزشی خالص</span>
                <span className="num">{money(stats.diffValue)} تومان</span>
              </div>
            </div>
            <Button onClick={commit} disabled={commitBusy} className="w-full gap-2">
              {commitBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              تأیید نهایی و اصلاح
            </Button>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
