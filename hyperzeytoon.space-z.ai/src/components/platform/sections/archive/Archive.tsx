'use client'

// Archive — بایگانی ترکیبی فیزیکی+دیجیتال هایپر زیتون (اصول ISO 15489)
// طبقه‌بندی موضوعی، شناسه یکتا (AB-NN)، ردیابی موقعیت فیزیکی، جست‌وجوی سریع
// + نقشه تأمین کشوری (کارتوگرام استان‌ها)
import * as React from 'react'
import { SectionHeader, EmptyState, LoadingBlock, ChipSelect, StatCard, ConfirmButton, AnimatedCount } from '@/components/platform/ui/shared'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import {
  Archive as ArchiveIcon, Library, MapPin, Plus, Printer, Search, Copy, PencilLine, ArrowLeftRight,
  Loader2, FolderOpen, Landmark, FileText, Trash2, X, CheckCircle2, Globe2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { money, moneyCompact, toFaDigits, toEnDigits, formatJalali, formatJalaliFull, timeAgo } from '@/lib/jalali'
import { useApp } from '@/store/app'
import { JalaliDatePicker } from '@/components/platform/ui/jalali-date-picker'
import { IranMap } from './IranMap'

// ============================ انواع داده ============================

export interface BinderRow {
  id: string
  code: string
  title: string
  category: string
  color: string
  location: string | null
  capacity: number
  active: boolean
  note: string | null
  createdAt: string
  _count: { documents: number }
}

interface DocRow {
  id: string
  pocket: number
  docType: string
  title: string
  docDate: string | null
  amount: number | null
  providerId: string | null
  providerName: string | null
  providerColor: string | null
  orderId?: string | null
  chequeId?: string | null
  note: string | null
  createdByName?: string | null
  createdAt: string
}

interface ProviderLite {
  id: string
  name: string
  color: string
  province?: string | null
  city?: string | null
}

interface StatsPayload {
  totals: { binderCount: number; activeBinders: number; docCount: number; totalValue: number }
  perCategory: { category: string; binderCount: number; docCount: number; totalAmount: number }[]
  recent: {
    id: string; pocket: number; docType: string; title: string; docDate: string | null
    amount: number | null; createdAt: string; providerName: string | null
    binderCode: string; binderTitle: string; binderColor: string; binderLocation: string | null
  }[]
}

// ============================ ثابت‌ها ============================

const DOC_TYPE_INFO: Record<string, { label: string; color: string }> = {
  INVOICE: { label: 'فاکتور', color: '#3E7C59' },
  RECEIPT: { label: 'رسید', color: '#2E6E8E' },
  CHEQUE: { label: 'چک', color: '#C9A227' },
  STATEMENT: { label: 'صورت‌حساب', color: '#8A6F3C' },
  CONTRACT: { label: 'قرارداد', color: '#8A3B5C' },
  OTHER: { label: 'سایر', color: '#6B7280' },
}
const DOC_TYPE_ORDER = ['INVOICE', 'RECEIPT', 'CHEQUE', 'STATEMENT', 'CONTRACT', 'OTHER']

const COLOR_PRESETS = ['#3E7C59', '#5E8C61', '#B07D2B', '#C9A227', '#8A3B5C', '#A34A7D', '#2E6E8E', '#7D5BA6', '#4C7A34', '#B33A3A', '#8A6F3C', '#C96F27']

// روشن/تیره‌سازی رنگ hex برای گرادیان عطف بایندر
function shade(hex: string, percent: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const num = parseInt(h, 16)
  const clamp = (v: number) => Math.max(0, Math.min(255, v))
  const r = clamp((num >> 16) + Math.round(2.55 * percent))
  const g = clamp(((num >> 8) & 0xff) + Math.round(2.55 * percent))
  const b = clamp((num & 0xff) + Math.round(2.55 * percent))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** مسیر فیزیکی کامل — قابلیت کلیدی: یافتن آنی محل فیزیکی سند */
function physicalPath(b: { location?: string | null; code: string }, pocket?: number | null): string {
  const head = b.location?.trim() ? b.location.trim() : 'بایگانی'
  return `${head} ← بایندر ${b.code}${pocket ? ` ← جیب ${toFaDigits(pocket)}` : ''}`
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast({ title: 'مسیر فیزیکی کپی شد', description: text })
  } catch {
    toast({ title: 'کپی ناموفق بود', variant: 'destructive' })
  }
}

// ============================ برچسب چاپی بایندر ============================

function printLabel(b: BinderRow) {
  const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8">
  <title>برچسب بایندر ${b.code}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; font-family: Vazirmatn, Tahoma, sans-serif; }
    body { margin: 0; display: flex; justify-content: center; padding-top: 30mm; color: #1d2a22; background: #fff; }
    .sticker { width: 118mm; border: 3px double #C9A227; outline: 1px solid #C9A22766; outline-offset: 3px; border-radius: 14px; padding: 10mm 12mm; background: linear-gradient(160deg,#fbf9f2,#f1efe4); }
    .brand { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #C9A227; padding-bottom: 6px; }
    .brand .name { font-size: 15px; font-weight: 900; color: #2c5443; }
    .brand .sub { font-size: 9px; color: #8a8574; }
    .orn { text-align: center; color: #C9A227; font-size: 9px; letter-spacing: 5px; margin: 6px 0; }
    .code { text-align: center; font-size: 44px; font-weight: 900; color: #8A6F3C; letter-spacing: 6px; font-variant-numeric: tabular-nums; margin: 4mm 0 1mm; }
    .title { text-align: center; font-size: 15px; font-weight: 800; color: #1d2a22; }
    .cat { display: flex; justify-content: center; margin-top: 3mm; }
    .cat span { font-size: 10.5px; font-weight: 700; color: #2c5443; background: #e7efe9; border: 1px solid #bcd3c5; border-radius: 999px; padding: 3px 14px; }
    .loc { margin-top: 4mm; text-align: center; font-size: 12px; color: #5a6b60; border-top: 1px dashed #c9c3ae; padding-top: 3mm; }
    .loc b { color: #2c5443; }
    .foot { margin-top: 4mm; text-align: center; font-size: 8px; color: #a29c88; }
  </style></head><body>
  <div class="sticker">
    <div class="brand">
      <span class="name">هایپر زیتون</span>
      <span class="sub">بایگانی اسناد — کرمان</span>
    </div>
    <div class="orn">◆ ─── ✦ ─── ◆</div>
    <div class="code">${b.code}</div>
    <div class="title">${b.title}</div>
    <div class="cat"><span>${b.category}</span></div>
    <div class="loc">محل فیزیکی: <b>${b.location?.trim() ? b.location : 'بایگانی مرکزی'}</b></div>
    <div class="foot">پلتفرم مدیریت یکپارچه هایپر زیتون • ${formatJalaliFull(new Date())}</div>
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

// ============================ نشانگر نوع سند ============================

function DocTypeBadge({ type, className }: { type: string; className?: string }) {
  const info = DOC_TYPE_INFO[type] ?? DOC_TYPE_INFO.OTHER
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap', className)}
      style={{ backgroundColor: `${info.color}1a`, color: info.color, border: `1px solid ${info.color}55` }}
    >
      {info.label}
    </span>
  )
}

// ============================ مسیر فیزیکی (LOCATOR) ============================

function PhysicalPath({
  binder, pocket, className, compact,
}: { binder: { location?: string | null; code: string; color?: string }; pocket?: number | null; className?: string; compact?: boolean }) {
  const text = physicalPath(binder, pocket)
  return (
    <div className={cn('flex items-center gap-1.5 min-w-0', className)}>
      {binder.color && <span className="h-3.5 w-3.5 rounded-[4px] shrink-0 shadow-inner" style={{ backgroundColor: binder.color }} aria-hidden />}
      <span className={cn('truncate font-semibold', compact ? 'text-[11px]' : 'text-sm')} title={text}>
        {binder.location?.trim() ? binder.location : 'بایگانی'}
        <span className="mx-1 text-[#C9A227]" aria-hidden>←</span>
        بایندر <span className="num font-black text-[#8A6F3C]">{binder.code}</span>
        {pocket ? (<><span className="mx-1 text-[#C9A227]" aria-hidden>←</span> جیب <span className="num font-black">{toFaDigits(pocket)}</span></>) : null}
      </span>
      <button
        type="button"
        onClick={() => copyText(text)}
        className="shrink-0 rounded-md p-1 text-muted-foreground/70 hover:bg-accent hover:text-[#8A6F3C] transition-colors touch-target"
        title="کپی مسیر فیزیکی"
        aria-label="کپی مسیر فیزیکی"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ============================ فرم ثبت/ویرایش سند ============================

function DocForm({
  binderId, pocket, doc, binders, providers, onDone, onCancel,
}: {
  binderId: string
  pocket: number
  doc?: DocRow | null
  binders: BinderRow[]
  providers: ProviderLite[]
  onDone: () => void
  onCancel: () => void
}) {
  const [docType, setDocType] = React.useState(doc?.docType ?? 'INVOICE')
  const [title, setTitle] = React.useState(doc?.title ?? '')
  const [docDate, setDocDate] = React.useState<Date | null>(doc?.docDate ? new Date(doc.docDate) : null)
  const [amount, setAmount] = React.useState(doc?.amount ? String(doc.amount) : '')
  const [providerId, setProviderId] = React.useState(doc?.providerId ?? 'none')
  const [targetBinder, setTargetBinder] = React.useState(binderId)
  const [note, setNote] = React.useState(doc?.note ?? '')
  const [busy, setBusy] = React.useState(false)

  const amountNum = Number(toEnDigits(amount).replace(/[^\d.]/g, '')) || 0

  async function submit() {
    if (!title.trim()) {
      toast({ title: 'عنوان سند لازم است', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      const payload = {
        docType, title: title.trim(),
        docDate: docDate ? `${docDate.getFullYear()}-${String(docDate.getMonth() + 1).padStart(2, '0')}-${String(docDate.getDate()).padStart(2, '0')}` : null,
        amount: amountNum > 0 ? amountNum : null,
        providerId: providerId === 'none' ? null : providerId,
        note: note.trim() || null,
      }
      if (doc) {
        await api(`/api/archive/documents/${doc.id}`, { method: 'PATCH', body: { ...payload, binderId: targetBinder, pocket } })
        toast({ title: 'سند ویرایش شد', description: payload.title })
      } else {
        await api('/api/archive/documents', { method: 'POST', body: { ...payload, binderId, pocket } })
        toast({ title: 'سند ثبت شد', description: `${payload.title} — جیب ${toFaDigits(pocket)}` })
      }
      onDone()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'خطای نامشخص', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold flex items-center gap-1.5">
          {doc ? <><PencilLine className="h-4 w-4 text-[#8A6F3C]" /> ویرایش سند</> : <><Plus className="h-4 w-4 text-[#3E7C59]" /> ثبت سند تازه</>}
        </p>
        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-primary num">جیب {toFaDigits(pocket)}</span>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">نوع سند</Label>
        <ChipSelect
          className="mt-1.5"
          options={DOC_TYPE_ORDER.map((k) => ({ key: k, label: DOC_TYPE_INFO[k].label, color: DOC_TYPE_INFO[k].color }))}
          value={docType}
          onChange={setDocType}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">عنوان سند *</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: فاکتور شیر پگاه — هفته دوم" className="touch-target" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">تاریخ سند</Label>
          <JalaliDatePicker value={docDate} onChange={setDocDate} placeholder="انتخاب تاریخ" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">مبلغ (تومان)</Label>
          <Input
            inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="۰" className="touch-target num" dir="ltr"
          />
          {amountNum > 0 && <p className="text-[11px] text-[#8A6F3C] font-bold num">{money(amountNum)} تومان</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">تأمین‌کننده مرتبط</Label>
          <Select value={providerId} onValueChange={setProviderId}>
            <SelectTrigger className="touch-target w-full" aria-label="تأمین‌کننده"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-64 nice-scroll">
              <SelectItem value="none">بدون تأمین‌کننده</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {doc && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">بایندر مقصد</Label>
            <Select value={targetBinder} onValueChange={setTargetBinder}>
              <SelectTrigger className="touch-target w-full" aria-label="بایندر مقصد"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64 nice-scroll">
                {binders.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.code} — {b.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">یادداشت</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="توضیح اختیاری…" className="resize-none" />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} className="touch-target">انصراف</Button>
        <Button size="sm" onClick={submit} disabled={busy} className="touch-target gap-1.5 min-w-24">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> {doc ? 'ذخیره' : 'ثبت سند'}</>}
        </Button>
      </div>
    </div>
  )
}

// ============================ گفت‌وگوی بایندر (شبکه جیب‌ها) ============================

function BinderDialog({
  binder, open, onClose, binders, providers, canMutate, isManager, onChanged,
}: {
  binder: BinderRow | null
  open: boolean
  onClose: () => void
  binders: BinderRow[]
  providers: ProviderLite[]
  canMutate: boolean
  isManager: boolean
  onChanged: () => void
}) {
  const [docs, setDocs] = React.useState<DocRow[] | null>(null)
  const [selected, setSelected] = React.useState<number | null>(null)
  const [mode, setMode] = React.useState<'view' | 'create' | 'edit' | 'move'>('view')
  const [busyDoc, setBusyDoc] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!binder) return
    try {
      const res = await api<{ binder: BinderRow & { documents: DocRow[] } }>(`/api/archive/binders/${binder.id}`)
      setDocs(res.binder.documents)
    } catch {
      setDocs([])
    }
  }, [binder])

  React.useEffect(() => {
    if (open && binder) {
      setSelected(null)
      setMode('view')
      setDocs(null)
      load()
    }
  }, [open, binder, load])

  if (!binder) return null

  const docByPocket = new Map<number, DocRow>((docs ?? []).map((d) => [d.pocket, d]))
  const selDoc = selected ? docByPocket.get(selected) : undefined
  const fillPct = Math.min(100, Math.round(((docs?.length ?? binder._count.documents) / binder.capacity) * 100))

  function selectPocket(p: number) {
    if (!binder) return
    if (mode === 'move' && selected && selDoc) {
      if (p === selected) return
      // انتقال سند انتخاب‌شده به این جیب خالی
      setBusyDoc(true)
      api(`/api/archive/documents/${selDoc.id}`, { method: 'PATCH', body: { binderId: binder.id, pocket: p } })
        .then(() => {
          toast({ title: 'سند منتقل شد', description: `${binder.code} — جیب ${toFaDigits(selected)} ← ${toFaDigits(p)}` })
          setMode('view')
          setSelected(null)
          load()
          onChanged()
        })
        .catch((e) => toast({ title: e instanceof Error ? e.message : 'خطای انتقال', variant: 'destructive' }))
        .finally(() => setBusyDoc(false))
      return
    }
    setSelected(p)
    // جیب خالی → مستقیم فرم ثبت سند (برای مدیران/حسابدار)
    if (!docByPocket.get(p)) setMode(canMutate ? 'create' : 'view')
    else setMode('view')
  }

  async function deleteDoc() {
    if (!selDoc) return
    setBusyDoc(true)
    try {
      await api(`/api/archive/documents/${selDoc.id}`, { method: 'DELETE' })
      toast({ title: 'سند حذف شد' })
      setSelected(null)
      setMode('view')
      load()
      onChanged()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'خطای حذف', variant: 'destructive' })
    } finally {
      setBusyDoc(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-3xl lg:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
            <span className="h-6 w-6 rounded-md shrink-0 shadow" style={{ background: `linear-gradient(160deg, ${binder.color}, ${shade(binder.color, -30)})` }} aria-hidden />
            بایندر <span className="num text-[#8A6F3C]">{binder.code}</span> — {binder.title}
          </DialogTitle>
          <DialogDescription className="sr-only">شبکه جیب‌های بایندر و جزئیات اسناد</DialogDescription>
        </DialogHeader>

        {/* —— مسیریاب فیزیکی: قابلیت کلیدی —— */}
        <div className="shrink-0 rounded-xl border-2 border-[#C9A227]/40 bg-gradient-to-l from-[#C9A227]/[0.07] to-transparent px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold text-muted-foreground tracking-wide">مسیر فیزیکی</p>
            <div className="flex items-center gap-2">
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', mode === 'move' ? 'bg-[#8A3B5C] text-white animate-pulse' : 'bg-accent text-primary')}>
                {mode === 'move' ? 'جیب مقصد را انتخاب کنید' : `${toFaDigits(docs?.length ?? binder._count.documents)} سند از ${toFaDigits(binder.capacity)} جیب`}
              </span>
              {mode === 'move' && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setMode('view'); setSelected(null) }}>
                  <X className="h-3.5 w-3.5" /> لغو انتقال
                </Button>
              )}
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-[#C9A227]" aria-hidden />
            <p className="text-sm sm:text-base font-extrabold truncate" title={physicalPath(binder, selected)}>
              {binder.location?.trim() ? binder.location : 'بایگانی'}
              <span className="mx-1.5 text-[#C9A227]" aria-hidden>←</span>
              بایندر <span className="num text-[#8A6F3C]">{binder.code}</span>
              {selected ? (<><span className="mx-1.5 text-[#C9A227]" aria-hidden>←</span> جیب <span className="num text-primary">{toFaDigits(selected)}</span></>) : null}
            </p>
            <button
              type="button" onClick={() => copyText(physicalPath(binder, selected))}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-[#8A6F3C] transition-colors shrink-0"
              title="کپی مسیر" aria-label="کپی مسیر فیزیکی"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-4 min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_330px] overflow-y-auto lg:overflow-visible nice-scroll py-1">
          {/* —— شبکه جیب‌ها —— */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ backgroundColor: binder.color }} /> اشغال</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-dashed border-muted-foreground/50" /> خالی</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded ring-2 ring-[#C9A227]" /> انتخاب‌شده</span>
              <span className="mr-auto font-bold num">{toFaDigits(fillPct)}٪ پر</span>
            </div>
            <div className="rounded-xl border border-border bg-card/60 p-2.5 max-h-[24rem] lg:max-h-[30rem] overflow-y-auto nice-scroll">
              <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-16 gap-1.5">
                {Array.from({ length: binder.capacity }, (_, i) => i + 1).map((p) => {
                  const d = docByPocket.get(p)
                  const isSel = selected === p
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => selectPocket(p)}
                      disabled={busyDoc}
                      title={d ? `${DOC_TYPE_INFO[d.docType]?.label ?? 'سند'} — ${d.title}` : `جیب ${toFaDigits(p)} — خالی`}
                      aria-label={`جیب ${toFaDigits(p)}${d ? ' — اشغال' : ' — خالی'}`}
                      className={cn(
                        'relative h-7 sm:h-8 rounded-md text-[10px] font-bold transition-all touch-target focus-visible:ring-2 focus-visible:ring-ring',
                        d ? 'text-white shadow-sm hover:brightness-110 hover:scale-[1.06]' : 'border border-dashed border-muted-foreground/40 text-muted-foreground/50 hover:border-primary/70 hover:text-primary hover:bg-primary/5',
                        isSel && 'ring-2 ring-[#C9A227] ring-offset-1 ring-offset-background'
                      )}
                      style={d ? { backgroundColor: binder.color } : undefined}
                    >
                      {toFaDigits(p)}
                      {d && <span className="absolute top-0.5 left-0.5 h-1 w-1 rounded-full bg-white/90" aria-hidden />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* —— پنل جزئیات / فرم —— */}
          <div className="min-w-0 rounded-xl border border-border bg-card/70 p-3.5 max-h-[24rem] lg:max-h-[30rem] overflow-y-auto nice-scroll">
            {mode === 'create' && selected ? (
              <DocForm
                binderId={binder.id} pocket={selected} binders={binders} providers={providers}
                onDone={() => { setMode('view'); load(); onChanged() }}
                onCancel={() => setMode('view')}
              />
            ) : mode === 'edit' && selDoc ? (
              <DocForm
                binderId={binder.id} pocket={selected!} doc={selDoc} binders={binders} providers={providers}
                onDone={() => { setMode('view'); load(); onChanged() }}
                onCancel={() => setMode('view')}
              />
            ) : selDoc && selected ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <DocTypeBadge type={selDoc.docType} />
                  <span className="text-[11px] text-muted-foreground num">ثبت {timeAgo(selDoc.createdAt)}</span>
                </div>
                <p className="font-extrabold leading-7">{selDoc.title}</p>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                    <dt className="text-muted-foreground text-[10px]">تاریخ سند</dt>
                    <dd className="num font-bold mt-0.5">{formatJalali(selDoc.docDate)}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                    <dt className="text-muted-foreground text-[10px]">مبلغ</dt>
                    <dd className="num font-bold mt-0.5 text-[#3E7C59]">{selDoc.amount ? `${moneyCompact(selDoc.amount)} تومان` : '—'}</dd>
                    {selDoc.amount ? <dd className="num text-[10px] text-muted-foreground mt-0.5">{money(selDoc.amount)}</dd> : null}
                  </div>
                </dl>
                {selDoc.providerName && (
                  <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: `${selDoc.providerColor ?? '#3E7C59'}14`, color: selDoc.providerColor ?? '#3E7C59' }}>
                    <Landmark className="h-3.5 w-3.5" /> {selDoc.providerName}
                  </div>
                )}
                {selDoc.note && <p className="text-xs text-muted-foreground rounded-lg bg-[#C9A227]/[0.07] border border-[#C9A227]/25 px-2.5 py-2 leading-5">یادداشت: {selDoc.note}</p>}
                {selDoc.createdByName && <p className="text-[10px] text-muted-foreground">ثبت‌کننده: {selDoc.createdByName}</p>}
                {canMutate && (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                    <Button size="sm" variant="outline" className="touch-target gap-1.5 text-xs" onClick={() => setMode('edit')}>
                      <PencilLine className="h-3.5 w-3.5" /> ویرایش
                    </Button>
                    <Button size="sm" variant="outline" className="touch-target gap-1.5 text-xs" onClick={() => setMode('move')} disabled={busyDoc}>
                      <ArrowLeftRight className="h-3.5 w-3.5" /> انتقال به جیب دیگر
                    </Button>
                    {isManager && (
                      <ConfirmButton onConfirm={deleteDoc} confirmText="حذف قطعی؟" className="text-xs">
                        <span className="inline-flex items-center gap-1.5"><Trash2 className="h-3.5 w-3.5" /> حذف</span>
                      </ConfirmButton>
                    )}
                  </div>
                )}
              </div>
            ) : selected && !selDoc ? (
              <div className="space-y-3 text-center">
                <div className="mx-auto h-12 w-12 rounded-xl border-2 border-dashed border-[#3E7C59]/50 flex items-center justify-center">
                  <FolderOpen className="h-5 w-5 text-[#3E7C59]" />
                </div>
                <p className="text-sm font-bold">جیب {toFaDigits(selected)} خالی است</p>
                <p className="text-xs text-muted-foreground leading-5">سند فیزیکی را در این جیب جای‌گذاری و در سامانه ثبت کنید تا مسیر فیزیکی آن همیشه در دسترس باشد.</p>
                {canMutate ? (
                  <Button size="sm" className="touch-target gap-1.5" onClick={() => setMode('create')}>
                    <Plus className="h-4 w-4" /> ثبت سند در این جیب
                  </Button>
                ) : (
                  <p className="text-[11px] text-muted-foreground">ثبت سند برای مدیران و حسابدار ممکن است.</p>
                )}
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-6 space-y-2">
                <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground/40" />
                <p className="font-bold text-foreground">یک جیب را انتخاب کنید</p>
                <p className="text-xs leading-5">روی جیب اشغال بزنید تا جزئیات سند را ببینید؛ روی جیب خالی بزنید تا سند تازه ثبت کنید.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================ گفت‌وگوی ایجاد/ویرایش بایندر ============================

function BinderFormDialog({
  open, onClose, onSaved, categories, initial,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  categories: string[]
  initial?: BinderRow | null
}) {
  const [title, setTitle] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [color, setColor] = React.useState('#3E7C59')
  const [location, setLocation] = React.useState('')
  const [capacity, setCapacity] = React.useState('200')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? '')
      setCategory(initial?.category ?? '')
      setColor(initial?.color ?? '#3E7C59')
      setLocation(initial?.location ?? '')
      setCapacity(String(initial?.capacity ?? 200))
    }
  }, [open, initial])

  async function submit() {
    if (!title.trim() || !category.trim()) {
      toast({ title: 'عنوان و گروه موضوعی لازم است', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      const payload = {
        title: title.trim(), category: category.trim(), color,
        location: location.trim(), capacity: Number(toEnDigits(capacity)) || 200,
      }
      if (initial) {
        await api(`/api/archive/binders/${initial.id}`, { method: 'PATCH', body: payload })
        toast({ title: 'بایندر ویرایش شد' })
      } else {
        const res = await api<{ binder: BinderRow }>('/api/archive/binders', { method: 'POST', body: payload })
        toast({ title: 'بایندر تازه ثبت شد', description: `کد ${res.binder.code} — ${payload.title}` })
      }
      onSaved()
      onClose()
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'خطای نامشخص', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Library className="h-5 w-5 text-[#3E7C59]" /> {initial ? 'ویرایش بایندر' : 'بایندر تازه بایگانی'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {initial ? 'مشخصات ظاهری و محل فیزیکی بایندر را به‌روزرسانی کنید.' : 'کد AB-NN به‌صورت خودکار تولید می‌شود.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">عنوان بایندر *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: لبنیات — پگاه، کاله، میهن" className="touch-target" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">گروه موضوعی *</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="مثال: لبنیات و پروتئین" className="touch-target" />
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {categories.slice(0, 8).map((c) => (
                  <button key={c} type="button" onClick={() => setCategory(c)} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">رنگ عطف</Label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c} type="button" onClick={() => setColor(c)}
                  aria-label={`رنگ ${c}`}
                  className={cn('h-7 w-7 rounded-lg transition-transform hover:scale-110 touch-target', color === c && 'ring-2 ring-[#C9A227] ring-offset-1 ring-offset-background')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">محل فیزیکی</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="کابینت A / طبقه اول" className="touch-target" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">ظرفیت (جیب)</Label>
              <Input inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="touch-target num" dir="ltr" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} className="touch-target">انصراف</Button>
            <Button size="sm" onClick={submit} disabled={busy} className="touch-target gap-1.5 min-w-24">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> {initial ? 'ذخیره' : 'ایجاد'}</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================ نمای کابینت‌ها ============================

function BinderSpineCard({
  binder, onOpen, onPrint, onEdit, canMutate,
}: {
  binder: BinderRow
  onOpen: () => void
  onPrint: () => void
  onEdit: () => void
  canMutate: boolean
}) {
  const c = binder.color
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl text-right shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer focus-visible:ring-2 focus-visible:ring-ring',
        !binder.active && 'opacity-50 saturate-50'
      )}
      style={{ background: `linear-gradient(160deg, ${shade(c, 8)} 0%, ${c} 45%, ${shade(c, -28)} 100%)` }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      aria-label={`بایندر ${binder.code} — ${binder.title}`}
    >
      {/* عطف سمت راست با شیارها */}
      <span className="absolute inset-y-0 right-0 w-4 bg-black/25 border-l border-white/10" aria-hidden
        style={{ backgroundImage: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.14) 0 2px, transparent 2px 9px)' }} />
      {/* لبه طلایی بالا و پایین */}
      <span className="absolute top-0 inset-x-4 h-[3px] bg-gradient-to-l from-transparent via-[#C9A227] to-transparent opacity-90" aria-hidden />
      <span className="absolute bottom-0 inset-x-4 h-[3px] bg-gradient-to-l from-transparent via-[#C9A227]/70 to-transparent" aria-hidden />
      {/* براقیت */}
      <span className="absolute -top-8 -left-8 h-24 w-24 rounded-full bg-white/10 blur-2xl pointer-events-none" aria-hidden />

      <div className="relative p-3.5 pl-4 pr-6 text-white">
        <div className="flex items-start justify-between gap-2">
          <span className="inline-block rounded-md bg-[#C9A227] px-2 py-0.5 text-[11px] font-black tracking-[0.18em] text-[#2b2413] shadow-sm num" dir="ltr">
            {binder.code}
          </span>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button" onClick={onPrint}
              className="rounded-md bg-white/15 p-1.5 backdrop-blur-sm transition-colors hover:bg-white/30 touch-target"
              title="چاپ برچسب بایندر" aria-label={`چاپ برچسب ${binder.code}`}
            >
              <Printer className="h-3.5 w-3.5" />
            </button>
            {canMutate && (
              <button
                type="button" onClick={onEdit}
                className="rounded-md bg-white/15 p-1.5 backdrop-blur-sm transition-colors hover:bg-white/30 touch-target"
                title="ویرایش بایندر" aria-label={`ویرایش ${binder.code}`}
              >
                <PencilLine className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <p className="mt-2.5 font-extrabold leading-6 line-clamp-2 min-h-12">{binder.title}</p>

        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-white/90">
          <span className="rounded-full bg-black/25 px-2 py-0.5 font-bold num">{toFaDigits(binder._count.documents)} سند</span>
          {binder.location && (
            <span className="inline-flex items-center gap-1 truncate text-white/80">
              <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{binder.location}</span>
            </span>
          )}
        </div>

        {/* نوار پرشدگی ظرفیت */}
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full rounded-full bg-[#C9A227] transition-all duration-500"
            style={{ width: `${Math.min(100, (binder._count.documents / binder.capacity) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function CabinetTab({
  binders, loading, canMutate, onOpenBinder, onNewBinder, onEditBinder,
}: {
  binders: BinderRow[]
  loading: boolean
  canMutate: boolean
  onOpenBinder: (b: BinderRow) => void
  onNewBinder: () => void
  onEditBinder: (b: BinderRow) => void
}) {
  const groups = React.useMemo(() => {
    const m = new Map<string, BinderRow[]>()
    for (const b of binders) {
      const arr = m.get(b.category) ?? []
      arr.push(b)
      m.set(b.category, arr)
    }
    return Array.from(m.entries())
  }, [binders])

  if (loading) return <LoadingBlock rows={4} />
  if (binders.length === 0)
    return (
      <EmptyState
        icon={<Library className="h-6 w-6" />}
        title="هنوز بایندری ثبت نشده"
        description="نخستین بایندر بایگانی را بسازید؛ هر بایندر کد یکتا (AB-NN)، محل فیزیکی و شبکه جیب‌ها دریافت می‌کند."
        action={canMutate ? <Button onClick={onNewBinder} className="touch-target gap-1.5"><Plus className="h-4 w-4" /> بایندر تازه</Button> : undefined}
      />
    )

  return (
    <div className="space-y-6">
      {canMutate && (
        <div className="flex justify-start">
          <Button onClick={onNewBinder} size="sm" className="touch-target gap-1.5"><Plus className="h-4 w-4" /> بایندر تازه</Button>
        </div>
      )}
      {groups.map(([category, list]) => (
        <section key={category} aria-label={category}>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-[#C9A227] to-[#3E7C59]" aria-hidden />
            <h2 className="font-extrabold text-sm sm:text-base">{category}</h2>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-primary num">{toFaDigits(list.length)} بایندر</span>
            <span className="h-px flex-1 bg-gradient-to-l from-border to-transparent" aria-hidden />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {list.map((b) => (
              <BinderSpineCard
                key={b.id} binder={b} canMutate={canMutate}
                onOpen={() => onOpenBinder(b)}
                onPrint={() => printLabel(b)}
                onEdit={() => onEditBinder(b)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// ============================ نمای جست‌وجوی سریع ============================

interface SearchDoc {
  id: string
  pocket: number
  docType: string
  title: string
  docDate: string | null
  amount: number | null
  note: string | null
  providerName: string | null
  createdAt: string
  binder: { code: string; title: string; color: string; location: string | null; capacity: number }
}

function LocatorTab({
  providers,
}: {
  providers: ProviderLite[]
}) {
  const [q, setQ] = React.useState('')
  const [docType, setDocType] = React.useState<string | null>(null)
  const [providerId, setProviderId] = React.useState('none')
  const [results, setResults] = React.useState<SearchDoc[] | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    const t = setTimeout(async () => {
      const query = q.trim()
      if (query.length < 2 && !docType && providerId === 'none') {
        setResults(null)
        return
      }
      setBusy(true)
      try {
        const params = new URLSearchParams()
        if (query.length >= 2) params.set('q', query)
        if (docType) params.set('docType', docType)
        if (providerId !== 'none') params.set('providerId', providerId)
        const res = await api<{ documents: SearchDoc[] }>(`/api/archive/documents?${params.toString()}`)
        setResults(res.documents)
      } catch {
        setResults([])
      } finally {
        setBusy(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q, docType, providerId])

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#C9A227]/30 bg-gradient-to-l from-[#C9A227]/[0.06] to-transparent p-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#8A6F3C]" aria-hidden />
          {busy && <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جست‌وجوی سند… (عنوان، یادداشت یا نام تأمین‌کننده)"
            className="pr-10 pl-10 h-11 touch-target text-sm"
            aria-label="جست‌وجوی اسناد بایگانی"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ChipSelect
            options={[{ key: 'ALL', label: 'همه', color: '#3E7C59' }, ...DOC_TYPE_ORDER.map((k) => ({ key: k, label: DOC_TYPE_INFO[k].label, color: DOC_TYPE_INFO[k].color }))]}
            value={docType ?? 'ALL'}
            onChange={(v) => setDocType(v === 'ALL' ? null : v)}
          />
          <Select value={providerId} onValueChange={setProviderId}>
            <SelectTrigger className="h-8 w-44 text-xs touch-target" aria-label="فیلتر تأمین‌کننده"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-64 nice-scroll">
              <SelectItem value="none">همه تأمین‌کنندگان</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {results === null ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="مسیریاب بایگانی"
          description="بخشی از عنوان سند، نام تأمین‌کننده یا واژه‌ای از یادداشت را بنویسید تا مسیر فیزیکی کامل (کابینت ← بایندر ← جیب) فوراً نمایش داده شود."
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-6 w-6" />}
          title="سندی یافت نشد"
          description="با بخش دیگری از عنوان سند، نام تأمین‌کننده یا نوع سند دوباره جست‌وجو کنید."
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border max-h-[32rem] overflow-y-auto nice-scroll">
          {results.map((d) => (
            <div key={d.id} className="p-3 sm:p-3.5 hover:bg-accent/40 transition-colors">
              <div className="flex flex-wrap items-center gap-2">
                <DocTypeBadge type={d.docType} />
                <p className="font-bold text-sm min-w-0 truncate flex-1">{d.title}</p>
                {d.amount ? <span className="num text-sm font-extrabold text-[#3E7C59] whitespace-nowrap">{money(d.amount)}</span> : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {d.providerName && (
                  <span className="inline-flex items-center gap-1 font-bold text-foreground/80"><Landmark className="h-3 w-3" /> {d.providerName}</span>
                )}
                <span className="num">تاریخ سند: {formatJalali(d.docDate)}</span>
                <span className="num">ثبت: {timeAgo(d.createdAt)}</span>
              </div>
              <PhysicalPath binder={d.binder} pocket={d.pocket} compact className="mt-2 rounded-lg bg-muted/60 px-2 py-1.5 w-fit max-w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================ نمای آمار ============================

function StatsTab({ stats }: { stats: StatsPayload | null }) {
  const chartData = React.useMemo(
    () => (stats?.perCategory ?? []).slice(0, 10).map((c) => ({ name: c.category, docs: c.docCount })),
    [stats]
  )
  if (!stats) return <LoadingBlock rows={5} />

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard title="بایندر فعال" value={<AnimatedCount value={stats.totals.activeBinders} />} hint={`از ${toFaDigits(stats.totals.binderCount)} بایندر ثبت‌شده`} icon={<Library className="h-5 w-5" />} color="#3E7C59" />
        <StatCard title="اسناد بایگانی‌شده" value={<AnimatedCount value={stats.totals.docCount} />} hint="در جیب‌های اختصاصی" icon={<FileText className="h-5 w-5" />} color="#8A6F3C" />
        <StatCard title="ارزش اسناد" value={<span className="num">{moneyCompact(stats.totals.totalValue)}</span>} fullValue={`${money(stats.totals.totalValue)} تومان`} hint="مجموع مبالغ ثبت‌شده — تومان" icon={<Landmark className="h-5 w-5" />} color="#C9A227" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* اسناد به تفکیک دسته */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-extrabold"><Globe2 className="h-4 w-4 text-[#3E7C59]" /> اسناد به تفکیک گروه موضوعی</p>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#8884" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} />
                <RTooltip
                  formatter={(v: number) => [`${toFaDigits(v)} سند`, 'اسناد']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #C9A22755', fontFamily: 'inherit', fontSize: 12, direction: 'rtl' }}
                />
                <Bar dataKey="docs" fill="#3E7C59" radius={[0, 8, 8, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* کارت دسته‌ها */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-extrabold"><Library className="h-4 w-4 text-[#8A6F3C]" /> گروه‌های موضوعی</p>
          <div className="space-y-2 max-h-64 overflow-y-auto nice-scroll">
            {stats.perCategory.map((c) => (
              <div key={c.category} className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
                <p className="text-sm font-bold min-w-0 truncate">{c.category}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-full bg-[#3E7C59]/10 px-2 py-0.5 text-[10px] font-bold text-[#3E7C59] num">{toFaDigits(c.docCount)} سند</span>
                  <span className="rounded-full bg-[#8A6F3C]/10 px-2 py-0.5 text-[10px] font-bold text-[#8A6F3C] num">{toFaDigits(c.binderCount)} بایندر</span>
                  <span className="num text-xs font-extrabold text-[#C9A227] whitespace-nowrap" title={`${money(c.totalAmount)} تومان`}>
                    {c.totalAmount ? moneyCompact(c.totalAmount) : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* اسناد اخیر */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-extrabold"><FileText className="h-4 w-4 text-[#C9A227]" /> آخرین اسناد ثبت‌شده</p>
        {stats.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">هنوز سندی ثبت نشده است.</p>
        ) : (
          <div className="divide-y divide-border max-h-80 overflow-y-auto nice-scroll">
            {stats.recent.map((d) => (
              <div key={d.id} className="py-2.5 flex flex-wrap items-center gap-2">
                <DocTypeBadge type={d.docType} />
                <p className="text-sm font-bold min-w-0 truncate flex-1">{d.title}</p>
                {d.providerName && <span className="text-[11px] text-muted-foreground">{d.providerName}</span>}
                {d.amount ? <span className="num text-xs font-extrabold text-[#3E7C59]">{moneyCompact(d.amount)}</span> : null}
                <PhysicalPath binder={{ code: d.binderCode, color: d.binderColor, location: d.binderLocation }} pocket={d.pocket} compact />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================ بخش اصلی ============================

export function Archive() {
  const { user } = useApp()
  const canMutate = !!user && (user.isManager || user.roleKeys.includes('accountant'))
  const isManager = !!user?.isManager

  const [tab, setTab] = React.useState('cabinets')
  const [binders, setBinders] = React.useState<BinderRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [providers, setProviders] = React.useState<ProviderLite[]>([])
  const [stats, setStats] = React.useState<StatsPayload | null>(null)
  const [openBinder, setOpenBinder] = React.useState<BinderRow | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editBinder, setEditBinder] = React.useState<BinderRow | null>(null)

  const loadBinders = React.useCallback(async () => {
    try {
      const res = await api<{ binders: BinderRow[] }>('/api/archive/binders')
      setBinders(res.binders)
    } catch {
      toast({ title: 'خطا در دریافت بایندرها', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  const loadStats = React.useCallback(async () => {
    try {
      const res = await api<StatsPayload>('/api/archive/stats')
      setStats(res)
    } catch {
      /* بی‌صدا */
    }
  }, [])

  React.useEffect(() => {
    loadBinders()
    api<{ providers: ProviderLite[] }>('/api/providers')
      .then((res) => setProviders(res.providers.map((p) => ({ id: p.id, name: p.name, color: p.color, province: (p as { province?: string | null }).province ?? null, city: (p as { city?: string | null }).city ?? null }))))
      .catch(() => setProviders([]))
  }, [loadBinders])

  React.useEffect(() => {
    if (tab === 'stats') loadStats()
  }, [tab, loadStats])

  const categories = React.useMemo(() => Array.from(new Set(binders.map((b) => b.category))), [binders])

  function refreshAll() {
    loadBinders()
    if (tab === 'stats') loadStats()
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={<ArchiveIcon className="h-5 w-5" />}
        title="بایگانی و اسناد"
        subtitle="سازماندهی علمی کلاسیورها و اسناد حسابداری — شناسه یکتا، مسیر فیزیکی و ردیابی کامل (اصول ISO 15489)"
        actions={canMutate && (
          <Button size="sm" variant="outline" className="touch-target gap-1.5" onClick={() => { setEditBinder(null); setFormOpen(true) }}>
            <Plus className="h-4 w-4" /> بایندر تازه
          </Button>
        )}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full max-w-2xl grid grid-cols-4 h-auto p-1">
          <TabsTrigger value="cabinets" className="gap-1.5 text-xs sm:text-sm py-2 touch-target"><Library className="h-4 w-4" /> کابینت‌ها</TabsTrigger>
          <TabsTrigger value="locator" className="gap-1.5 text-xs sm:text-sm py-2 touch-target"><Search className="h-4 w-4" /> جست‌وجوی سریع</TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5 text-xs sm:text-sm py-2 touch-target"><Globe2 className="h-4 w-4" /> آمار</TabsTrigger>
          <TabsTrigger value="map" className="gap-1.5 text-xs sm:text-sm py-2 touch-target"><MapPin className="h-4 w-4" /> نقشه تأمین</TabsTrigger>
        </TabsList>

        <TabsContent value="cabinets" className="mt-4">
          <CabinetTab
            binders={binders} loading={loading} canMutate={canMutate}
            onOpenBinder={setOpenBinder}
            onNewBinder={() => { setEditBinder(null); setFormOpen(true) }}
            onEditBinder={(b) => { setEditBinder(b); setFormOpen(true) }}
          />
        </TabsContent>

        <TabsContent value="locator" className="mt-4">
          <LocatorTab providers={providers} />
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <StatsTab stats={stats} />
        </TabsContent>

        <TabsContent value="map" className="mt-4">
          <IranMap providers={providers} />
        </TabsContent>
      </Tabs>

      <BinderDialog
        binder={openBinder}
        open={!!openBinder}
        onClose={() => setOpenBinder(null)}
        binders={binders}
        providers={providers}
        canMutate={canMutate}
        isManager={isManager}
        onChanged={refreshAll}
      />

      <BinderFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={refreshAll}
        categories={categories}
        initial={editBinder}
      />
    </div>
  )
}
