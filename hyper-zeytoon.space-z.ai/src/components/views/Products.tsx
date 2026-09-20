'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { api } from '@/lib/client'
import { faMoney, faNum, formatJalaliShort, addDaysIso, daysBetween, todayIso } from '@/lib/jalali'
import { SectionCard, Pill, EmptyState, SearchInput, Labeled, stockStatus, CATEGORY_EMOJI, KeyValue } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import type { AppCtx } from '@/components/app/ui-bits'
import { LineChart, Donut, BarChart } from '@/components/app/charts'
import { ShoppingBasket, Plus, FileSpreadsheet, Merge, ImagePlus, RefreshCw, Pencil, Search, Sparkles, Tags, TrendingUp, Printer, CheckSquare, Square, ChevronRight, ChevronLeft, LayoutGrid, CalendarClock, Trash2, BarChart3, PieChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import JsBarcode from 'jsbarcode'

type Product = {
  id: string; name: string; barcodes: string[]; holooCode: string; unit: string; brand: string
  category: string; buyPrice: number; sellPrice: number; sellPrice2: number; stock: number
  reorderLevel: number; imageUrl: string; providerId: string | null; inHoloo: boolean
  active?: boolean; sales30?: number
}

type CatFacet = { name: string; count: number }
type PagedResponse = {
  products: Product[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  categories: CatFacet[]
  lowCount?: number
}

const PAGE_SIZE = 48

export default function ProductsView({ ctx }: { ctx: AppCtx }) {
  // ── دادهٔ صفحه‌بندی‌شده از سرور (آمادهٔ ۱۰هزار کالا) ──
  const [data, setData] = useState<PagedResponse | null>(null)
  const [facets, setFacets] = useState<{ categories: CatFacet[]; lowCount: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadErr, setLoadErr] = useState('')

  // ── فیلترها ──
  const [q, setQ] = useState('')
  const [qDeb, setQDeb] = useState('')
  const [cat, setCat] = useState('')
  const [lowOnly, setLowOnly] = useState(false) // ← پارامتر سرور lowstock=1
  const [hotOnly, setHotOnly] = useState(false) // ← فیلتر سریع سمت کلاینت روی همین صفحه
  const [sort, setSort] = useState<'name' | 'stock' | 'sales30' | 'margin'>('name')
  const [page, setPage] = useState(1)
  const [reloadTick, setReloadTick] = useState(0)

  // ── مودال‌ها و حالت‌های قبلی (همه حفظ شده) ──
  const [editFor, setEditFor] = useState<Product | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [smartOpen, setSmartOpen] = useState(false)
  const [detailFor, setDetailFor] = useState<Product | null>(null)
  const [reportFor, setReportFor] = useState<Product | null>(null)
  const [labelMode, setLabelMode] = useState(false)
  const [labelSel, setLabelSel] = useState<Record<string, boolean>>({})
  const [labelOpen, setLabelOpen] = useState(false)

  // جستجو با تأخیر ۳۵۰ms — سمت سرور اعمال می‌شود
  useEffect(() => {
    const t = setTimeout(() => {
      setQDeb(q)
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  // واکشی صفحه جاری
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      setBusy(true)
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (qDeb) params.set('q', qDeb)
      if (cat) params.set('category', cat)
      if (lowOnly) params.set('lowstock', '1')
      if (sort !== 'name') params.set('sort', sort)
      api<PagedResponse>(`/api/products?${params.toString()}`)
        .then((d) => {
          if (!alive) return
          setData(d)
          setFacets((f) => ({ categories: d.categories, lowCount: d.lowCount ?? f?.lowCount ?? 0 }))
          setLoadErr('')
        })
        .catch((e: any) => alive && setLoadErr(e.message || 'خطا در دریافت کالاها'))
        .finally(() => alive && setBusy(false))
    }, 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [page, qDeb, cat, lowOnly, sort, reloadTick])

  // فست‌های دسته — بلافاصله برای سایدبار (بعد از هر واکشی هم به‌روز می‌شود)
  useEffect(() => {
    api<{ categories: CatFacet[]; lowCount: number }>('/api/products?facets=1')
      .then((d) => setFacets((f) => ({ categories: d.categories, lowCount: d.lowCount ?? f?.lowCount ?? 0 })))
      .catch(() => {})
  }, [])

  const reload = () => setReloadTick((t) => t + 1)

  // فیلتر سریع پرفروش‌ها روی همین صفحه (سرعت فروش از سرور می‌آید)
  const pageRows = useMemo(
    () => (data?.products || []).filter((p) => !hotOnly || (p.sales30 || 0) >= 5),
    [data, hotOnly]
  )

  const canEdit = ['GM', 'PM', 'OM', 'ACC', 'SK'].includes(ctx.user!.role)
  const canOrder = ['GM', 'PM', 'OM'].includes(ctx.user!.role)
  const lowCount = facets?.lowCount ?? 0
  const totalAll = (facets?.categories || []).reduce((s, c) => s + c.count, 0)
  const curPage = data?.page ?? page
  const totalPages = data?.totalPages ?? 1
  const firstLoad = busy && !data

  return (
    <div className="space-y-4">
      <SectionCard
        title="کالاها و موجودی انبار"
        subtitle="دسته‌بندی هوشمند + صفحه‌بندی سرور (آمادهٔ ده‌ها هزار کالا) — رنگ هر کارت وضعیت موجودی است: قرمز کمبود جدی، زرد رو به اتمام، سبز مناسب"
        icon={<ShoppingBasket size={18} />}
        actions={
          canEdit && (
            <div className="flex flex-wrap gap-2">
              {canOrder && lowCount > 0 && (
                <button onClick={() => setSmartOpen(true)} className="flex items-center gap-1 rounded-xl bg-gradient-to-l from-[#77934a] to-[#8fa85e] px-3.5 py-2 text-xs font-extrabold text-white shadow-md">
                  <Sparkles size={14} /> پیش‌نویس هوشمند ({faNum(lowCount)})
                </button>
              )}
              <button onClick={() => setAddOpen(true)} className="flex items-center gap-1 rounded-xl bg-primary px-3.5 py-2 text-xs font-extrabold text-white">
                <Plus size={14} /> کالای جدید
              </button>
              <button onClick={() => setImportOpen(true)} className="flex items-center gap-1 rounded-xl bg-[#0f766e] px-3.5 py-2 text-xs font-extrabold text-white">
                <FileSpreadsheet size={14} /> ورود از هلو (اکسل)
              </button>
              <button onClick={() => setMergeOpen(true)} className="flex items-center gap-1 rounded-xl bg-[#8a5a2b] px-3.5 py-2 text-xs font-extrabold text-white">
                <Merge size={14} /> ادغام تکراری‌ها
              </button>
              <button
                onClick={() => { setLabelMode((v) => !v); setLabelSel({}) }}
                className={cn('flex items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-extrabold text-white', labelMode ? 'bg-[#b3372f]' : 'bg-[#5c7236]')}
              >
                <Tags size={14} /> {labelMode ? 'انصراف از انتخاب' : 'چاپ لیبل قفسه'}
              </button>
            </div>
          )
        }
      >
        <div className="flex gap-4">
          {/* ── سایدبار دسته‌ها (دسکتاپ — چسبان) ── */}
          <aside className="hidden w-48 shrink-0 lg:block">
            <div className="scroll-gold sticky top-24 max-h-[62vh] space-y-1 overflow-y-auto pl-1">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-black text-foreground/80"><LayoutGrid size={13} /> دسته‌ها</p>
              <SidebarCat active={!cat} label="همهٔ دسته‌ها" count={totalAll} onClick={() => { setCat(''); setPage(1) }} />
              {(facets?.categories || []).map((c) => (
                <SidebarCat key={c.name} active={cat === c.name} label={`${CATEGORY_EMOJI[c.name] || '📦'} ${c.name}`} count={c.count} onClick={() => { setCat(c.name); setPage(1) }} />
              ))}
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-3">
            {/* ── نوار ابزار: جستجو + مرتب‌سازی + فیلترهای سریع ── */}
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={q} onChange={setQ} placeholder="نام، برند یا بارکد…" className="w-full sm:w-56" />
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1) }}
                className="min-h-11 rounded-xl border border-input bg-white/90 px-3 text-xs font-bold outline-none focus:border-primary"
                title="ترتیب نمایش کالاها"
              >
                <option value="name">مرتب‌سازی: نام</option>
                <option value="stock">مرتب‌سازی: موجودی (کم اول)</option>
                <option value="sales30">مرتب‌سازی: فروش ۳۰ روز</option>
                <option value="margin">مرتب‌سازی: حاشیه سود</option>
              </select>
              <button onClick={() => { setLowOnly((v) => !v); setPage(1) }} className={cn('rounded-full border px-3 py-2 text-[11px] font-bold', lowOnly ? 'border-[#b3372f] bg-[#b3372f] text-white' : 'border-border bg-card')}>
                فقط کم‌موجودی‌ها
              </button>
              <button onClick={() => setHotOnly((v) => !v)} className={cn('rounded-full border px-3 py-2 text-[11px] font-bold transition', hotOnly ? 'border-[#c96f4a] bg-[#c96f4a] text-white shadow-md' : 'border-border bg-card hover:border-[#c96f4a]/50')} title="کالاهایی که در ۳۰ روز اخیر ۵ عدد یا بیشتر فروخته‌اند (روی همین صفحه)">
                پرفروش‌ها 🔥
              </button>
              {data && (
                <span className="rounded-full bg-[#fdf6dd] px-3 py-1.5 text-[11px] font-black text-[#8a6d10]" title="تعداد کل کالاهای مطابق فیلتر">
                  {faNum(data.total)} کالا
                </span>
              )}
              <span className="hidden items-center gap-2 text-[10px] font-bold text-muted-foreground xl:flex" title="سرعت فروش از پیش‌فاکتورهای ۳۰ روز اخیر محاسبه می‌شود">
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#c96f4a]" /> پرفروش ۸+</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#c9a227]" /> معمولی ۳+</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" /> کم‌فروش</span>
              </span>
            </div>

            {/* ── چیپ دسته‌ها (موبایل — اسکرول افقی) ── */}
            <div className="scroll-gold flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
              <FilterChip active={!cat} label="همه" onClick={() => { setCat(''); setPage(1) }} />
              {(facets?.categories || []).map((c) => (
                <FilterChip key={c.name} active={cat === c.name} label={`${CATEGORY_EMOJI[c.name] || '📦'} ${c.name} (${faNum(c.count)})`} onClick={() => { setCat(c.name); setPage(1) }} />
              ))}
            </div>

            {loadErr && (
              <div className="rounded-xl border border-[#b3372f]/40 bg-[#fee2e2]/60 p-3 text-xs font-bold text-[#b3372f]">{loadErr}</div>
            )}

            {/* ── شبکهٔ کالاها ── */}
            {firstLoad ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="animate-pulse rounded-2xl bg-muted/60 p-3">
                    <div className="mb-2 h-24 rounded-xl bg-muted" />
                    <div className="mb-1.5 h-3.5 w-3/4 rounded bg-muted" />
                    <div className="mb-3 h-3 w-1/2 rounded bg-muted" />
                    <div className="h-6 rounded-lg bg-muted" />
                  </div>
                ))}
              </div>
            ) : (
              <div className={cn('scroll-gold grid max-h-[64vh] grid-cols-2 gap-3 overflow-y-auto pl-1 transition-opacity sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5', busy && 'pointer-events-none opacity-50')}>
                {pageRows.map((p) => {
                  const st = stockStatus(p.stock, p.reorderLevel)
                  const selected = !!labelSel[p.id]
                  return (
                    <div key={p.id} className={cn('glow-card group relative flex flex-col rounded-2xl bg-white/85 p-3 transition', labelMode && selected && 'ring-2 ring-[#0e7a4a]')}>
                      {labelMode && (
                        <button
                          onClick={() => setLabelSel((s) => ({ ...s, [p.id]: !s[p.id] }))}
                          className="absolute left-2 top-2 z-10 rounded-lg bg-white/90 p-1 shadow-md transition hover:bg-white"
                          aria-label={selected ? 'حذف از انتخاب' : 'افزودن به انتخاب'}
                        >
                          {selected ? <CheckSquare size={18} className="text-[#0e7a4a]" /> : <Square size={18} className="text-muted-foreground" />}
                        </button>
                      )}
                      <button onClick={() => (labelMode ? setLabelSel((s) => ({ ...s, [p.id]: !s[p.id] })) : setDetailFor(p))} className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-secondary to-muted text-4xl">
                        {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" /> : CATEGORY_EMOJI[p.category] || '📦'}
                      </button>
                      <p className="line-clamp-2 min-h-9 text-xs font-extrabold leading-4">{p.name}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{p.brand || '—'} • {p.category}</p>
                      {(p.sales30 || 0) >= 3 && (
                        <span
                          className={cn(
                            'mt-1 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black',
                            (p.sales30 || 0) >= 8 ? 'bg-[#c96f4a]/15 text-[#c96f4a]' : 'bg-[#c9a227]/15 text-[#8a6d10]'
                          )}
                          title="سرعت فروش ۳۰ روز اخیر (از پیش‌فاکتورها)"
                        >
                          {(p.sales30 || 0) >= 8 ? '🔥' : '▫'} فروش {faNum(p.sales30 || 0)} در ماه
                        </span>
                      )}
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[#8a6d10]">{faMoney(p.sellPrice)}</span>
                        <span className="text-xs font-black" style={{ color: st.color }}>{faNum(p.stock)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (p.stock / Math.max(p.reorderLevel * 2, 1)) * 100)}%`, background: st.color }} />
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        <button onClick={() => setReportFor(p)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#fdf6dd]/90 py-2 text-[10px] font-bold text-[#8a6d10] transition hover:bg-[#fdf6dd]" title="نمودار فروش، حاشیه سود، ضایعات و انقضا">
                          گزارش کالا 📈
                        </button>
                        {canEdit && (
                          <button onClick={() => setEditFor(p)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-muted/70 py-2 text-[10px] font-bold text-muted-foreground transition hover:bg-muted group-hover:text-primary">
                            <Pencil size={11} /> ویرایش
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {!firstLoad && pageRows.length === 0 && !loadErr && <EmptyState emoji="🔍" title="کالایی یافت نشد" hint="فیلترها را تغییر دهید یا عبارت دیگری جستجو کنید" />}

            {/* ── صفحه‌بندی ── */}
            {data && totalPages > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <div className="flex items-center gap-2">
                  <button
                    disabled={curPage <= 1 || busy}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="flex min-h-11 items-center gap-1 rounded-xl border border-border bg-card px-4 text-xs font-extrabold transition hover:border-primary disabled:opacity-40"
                  >
                    <ChevronRight size={14} /> قبلی
                  </button>
                  <span className="text-xs font-black text-foreground">صفحه {faNum(curPage)} از {faNum(totalPages)}</span>
                  <button
                    disabled={curPage >= totalPages || busy}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="flex min-h-11 items-center gap-1 rounded-xl border border-border bg-card px-4 text-xs font-extrabold transition hover:border-primary disabled:opacity-40"
                  >
                    بعدی <ChevronLeft size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={curPage}
                    onChange={(e) => setPage(Number(e.target.value))}
                    className="min-h-11 rounded-xl border border-input bg-white/90 px-3 text-xs font-bold outline-none"
                    title="پرش به صفحه"
                    aria-label="پرش به صفحه"
                  >
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <option key={i} value={i + 1}>صفحه {faNum(i + 1)}</option>
                    ))}
                  </select>
                  <span className="rounded-full bg-[#e9f0e4] px-3 py-1.5 text-[11px] font-black text-[#0e7a4a]">{faNum(data.total)} کالا در {faNum(data.categories.length)} دسته</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {labelMode && (
          <div className="sticky bottom-0 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0e7a4a]/30 bg-[#e9f0e4]/90 p-3 backdrop-blur">
            <p className="text-[11px] font-bold">
              {faNum(Object.values(labelSel).filter(Boolean).length)} کالا انتخاب شد — برای چاپ لیبل قفسه (نام + قیمت + بارکد)
            </p>
            <button
              onClick={() => {
                const n = Object.values(labelSel).filter(Boolean).length
                if (n === 0) return toast.error('اول کالاها را انتخاب کنید')
                setLabelOpen(true)
              }}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white shadow-md"
            >
              <Printer size={14} /> چاپ لیبل‌ها
            </button>
          </div>
        )}
      </SectionCard>

      {(editFor || addOpen) && (
        <ProductEditModal
          product={editFor}
          onClose={() => { setEditFor(null); setAddOpen(false) }}
          onSaved={() => { setEditFor(null); setAddOpen(false); reload() }}
        />
      )}

      {importOpen && <ImportWizard onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); reload() }} />}
      {mergeOpen && <MergeWizard onClose={() => setMergeOpen(false)} onDone={() => { setMergeOpen(false); reload() }} />}
      {detailFor && <ProductDetailModal product={detailFor} onClose={() => setDetailFor(null)} />}
      {reportFor && <ProductReportModal product={reportFor} onClose={() => setReportFor(null)} />}
      {labelOpen && (
        <LabelPrintModal
          products={pageRows.filter((p) => labelSel[p.id])}
          onClose={() => setLabelOpen(false)}
        />
      )}
      {smartOpen && (
        <SmartReorderModal
          onClose={() => setSmartOpen(false)}
          onDone={(created) => {
            setSmartOpen(false)
            reload()
            toast.success(`${created} سفارش پیش‌نویس ساخته شد — از بخش سفارش‌ها ارسال کنید`)
            ctx.navigate('orders')
          }}
        />
      )}
    </div>
  )
}

function SidebarCat({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-right text-xs font-bold transition',
        active ? 'bg-primary text-white shadow-md' : 'text-foreground/75 hover:bg-secondary'
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black', active ? 'bg-white/20' : 'bg-muted text-muted-foreground')}>
        {faNum(count)}
      </span>
    </button>
  )
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('whitespace-nowrap rounded-full border px-3 py-2 text-[11px] font-bold transition', active ? 'border-primary bg-primary text-white' : 'border-border bg-card text-foreground/70 hover:bg-secondary')}>
      {label}
    </button>
  )
}

/* ───────────────── Smart reorder: low-stock → DRAFT orders per provider ───────────────── */

type ProviderRow = { id: string; name: string }

function SmartReorderModal({ onClose, onDone }: { onClose: () => void; onDone: (created: number) => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loaded, setLoaded] = useState(false)
  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [qtys, setQtys] = useState<Record<string, number>>({})
  const [excluded, setExcluded] = useState<Record<string, boolean>>({}) // by providerId
  const [skipped, setSkipped] = useState<Record<string, boolean>>({}) // per product
  const [busy, setBusy] = useState(false)

  // فهرست کم‌موجودی‌ها از سرور (پارامتر lowstock=1 — مقیاس‌پذیر برای ۱۰هزار کالا)
  useEffect(() => {
    api<{ products: Product[] }>('/api/products?lowstock=1&page=1&pageSize=500')
      .then((d) => { setProducts(d.products); setLoaded(true) })
      .catch(() => setLoaded(true))
    api<{ providers: ProviderRow[] }>('/api/providers').then((d) => setProviders(d.providers)).catch(() => {})
  }, [])

  const low = useMemo(() => products.filter((p) => p.stock <= p.reorderLevel), [products])
  const suggested = (p: Product) => Math.max(p.reorderLevel * 2 - p.stock, 1)

  // initialize suggestion quantities once
  useEffect(() => {
    if (Object.keys(qtys).length === 0 && low.length > 0) {
      const init: Record<string, number> = {}
      for (const p of low) init[p.id] = suggested(p)
      setQtys(init)
    }
  }, [low.length])

  const groups = useMemo(() => {
    const m = new Map<string, Product[]>()
    for (const p of low) {
      const key = p.providerId || '_none'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(p)
    }
    return [...m.entries()]
  }, [low])

  const activeGroups = groups.filter(([pid]) => !excluded[pid])
  const activeItems = activeGroups.flatMap(([, ps]) => ps).filter((p) => !skipped[p.id])
  const estTotal = activeItems.reduce((s, p) => s + (qtys[p.id] || 0) * p.buyPrice, 0)

  const create = async () => {
    if (activeItems.length === 0) return
    setBusy(true)
    const d = new Date()
    d.setDate(d.getDate() + 2)
    const deliveryDate = d.toISOString().slice(0, 10)
    let created = 0
    try {
      for (const [pid, ps] of activeGroups) {
        const items = ps.filter((p) => !skipped[p.id])
        if (items.length === 0) continue
        const prov = providers.find((x) => x.id === pid)
        await api('/api/orders', {
          method: 'POST',
          body: {
            providerId: pid,
            providerName: prov?.name || 'بدون تأمین‌کننده',
            status: 'DRAFT',
            deliveryDate,
            notes: 'پیش‌نویس هوشمند — بر اساس نقطه سفارش و موجودی فعلی',
            items: items.map((p) => ({ productId: p.id, qty: qtys[p.id] || suggested(p), unitBuyPrice: p.buyPrice })),
          },
        })
        created++
      }
      onDone(created)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="پیش‌نویس هوشمند سفارش 🤖" onClose={onClose} wide>
      <p className="mb-4 rounded-xl border border-[#77934a]/30 bg-[#e9f0e4]/60 p-3 text-[11px] leading-5">
        سامانه {faNum(low.length)} کالای رسیده به نقطه سفارش را پیدا کرده و بر اساس «دو برابر نقطه سفارش منهای موجودی فعلی» پیشنهاد تعداد می‌دهد.
        تعدادها را اصلاح کنید، تأمین‌کننده‌های غیرضروری را بردارید و سفارش‌های پیش‌نویس را یک‌جا بسازید — بعد از بخش سفارش‌ها ارسالشان کنید.
      </p>

      {!loaded ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/60" />)}
        </div>
      ) : low.length === 0 ? (
        <EmptyState emoji="🌿" title="همه موجودی‌ها سالم‌اند" hint="فعلاً کالایی به نقطه سفارش نرسیده" />
      ) : (
        <div className="scroll-gold max-h-[52vh] space-y-3 overflow-y-auto pl-1">
          {groups.map(([pid, ps]) => {
            const prov = providers.find((x) => x.id === pid)
            const isExcluded = !!excluded[pid]
            const groupTotal = ps.reduce((s, p) => s + (qtys[p.id] || 0) * p.buyPrice, 0)
            return (
              <div key={pid} className={cn('rounded-2xl border p-3 transition', isExcluded ? 'border-border bg-muted/40 opacity-60' : 'glow-card border-[#77934a]/30 bg-white/80')}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!isExcluded}
                      onChange={(e) => setExcluded((x) => ({ ...x, [pid]: !e.target.checked }))}
                      className="h-4 w-4 accent-[#77934a]"
                    />
                    <span className="text-sm font-black">🚚 {prov?.name || 'بدون تأمین‌کننده مشخص'}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-[#5c7236]">{faNum(ps.length)} قلم</span>
                  </label>
                  <span className="text-[11px] font-black text-[#8a6d10]">{faMoney(groupTotal)} تومان</span>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {ps.map((p) => (
                    <div key={p.id} className={cn('flex items-center justify-between gap-2 rounded-xl border border-border/70 px-2.5 py-2', skipped[p.id] && 'opacity-40')}>
                      <label className="flex min-w-0 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!skipped[p.id]}
                          disabled={isExcluded}
                          onChange={(e) => setSkipped((x) => ({ ...x, [p.id]: !e.target.checked }))}
                          className="h-3.5 w-3.5 accent-[#0e7a4a]"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-bold">{p.name}</span>
                          <span className="block text-[9px] text-muted-foreground">
                            موجودی {faNum(p.stock)} • نقطه سفارش {faNum(p.reorderLevel)} {p.stock === 0 ? '• 🔴 ناموجود' : ''}
                          </span>
                        </span>
                      </label>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          disabled={isExcluded}
                          onClick={() => setQtys((q) => ({ ...q, [p.id]: Math.max((q[p.id] || 1) - 1, 1) }))}
                          className="stepper-btn !h-8 !w-8 text-sm disabled:opacity-30"
                        >
                          −
                        </button>
                        <span className="w-10 text-center text-xs font-black">{faNum(qtys[p.id] || 0)}</span>
                        <button
                          disabled={isExcluded}
                          onClick={() => setQtys((q) => ({ ...q, [p.id]: (q[p.id] || 0) + 1 }))}
                          className="stepper-btn !h-8 !w-8 text-sm disabled:opacity-30"
                        >
                          +
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="text-[11px] font-bold text-muted-foreground">
          {faNum(activeItems.length)} قلم در {faNum(activeGroups.length)} سفارش پیش‌نویس • برآورد خرید: <b className="text-[#8a6d10]">{faMoney(estTotal)} تومان</b>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-xl border px-4 py-2.5 text-xs font-bold">انصراف</button>
          <button
            onClick={create}
            disabled={busy || activeItems.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-5 py-2.5 text-xs font-extrabold text-white shadow-lg disabled:opacity-40"
          >
            <Sparkles size={14} /> {busy ? 'در حال ساخت…' : `ساخت ${faNum(activeGroups.length)} سفارش پیش‌نویس`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ───────────────── Product edit + image tools ───────────────── */

function ProductEditModal({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(null)
  const [imgSearching, setImgSearching] = useState(false)
  const [imgQuery, setImgQuery] = useState('')
  const [imgResults, setImgResults] = useState<{ url: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (product) setForm({ ...product, barcodes: product.barcodes.join(', ') })
    else setForm({ name: '', barcodes: '', holooCode: '', unit: 'عدد', brand: '', category: 'عمومی', buyPrice: '', sellPrice: '', sellPrice2: '', stock: '0', reorderLevel: '12', imageUrl: '', notes: '' })
  }, [product])

  if (!form) return null
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const searchImages = async () => {
    if (!imgQuery.trim()) return
    setImgSearching(true)
    try {
      const res = await api<{ images: { url: string }[] }>('/api/products/image-search', { method: 'POST', body: { query: imgQuery } })
      setImgResults(res.images)
      if (!res.images.length) toast.error('تصویری پیدا نشد — می‌توانید آدرس تصویر دستی وارد کنید یا فایل آپلود کنید')
    } catch (e: any) { toast.error(e.message) } finally { setImgSearching(false) }
  }

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 400_000) return toast.error('حجم تصویر باید کمتر از ۴۰۰ کیلوبایت باشد')
    const reader = new FileReader()
    reader.onload = () => set('imageUrl', reader.result)
    reader.readAsDataURL(file)
  }

  const save = async () => {
    if (!form.name?.trim()) return toast.error('نام کالا الزامی است')
    setBusy(true)
    const body = {
      ...form,
      barcodes: String(form.barcodes).split(',').map((s: string) => s.trim()).filter(Boolean),
    }
    try {
      if (product) await api(`/api/products/${product.id}`, { method: 'PATCH', body })
      else await api('/api/products', { method: 'POST', body })
      toast.success('کالا ذخیره شد ✅')
      onSaved()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={product ? `ویرایش «${product.name}»` : 'کالای جدید'} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="نام کالا *"><input value={form.name} onChange={(e) => set('name', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="بارکدها (با کاما جدا کنید)"><input value={form.barcodes} onChange={(e) => set('barcodes', e.target.value)} className="w-full rounded-xl border border-input p-3 font-mono text-sm" dir="ltr" /></Labeled>
        <Labeled label="کد هلو"><input value={form.holooCode} onChange={(e) => set('holooCode', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" dir="ltr" /></Labeled>
        <Labeled label="برند"><input value={form.brand} onChange={(e) => set('brand', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="دسته"><input value={form.category} onChange={(e) => set('category', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="واحد"><input value={form.unit} onChange={(e) => set('unit', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="قیمت خرید (تومان)"><input type="number" value={form.buyPrice} onChange={(e) => set('buyPrice', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="قیمت فروش (تومان)"><input type="number" value={form.sellPrice} onChange={(e) => set('sellPrice', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="قیمت فروش با تخفیف"><input type="number" value={form.sellPrice2} onChange={(e) => set('sellPrice2', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="موجودی انبار"><input type="number" value={form.stock} onChange={(e) => set('stock', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="حد سفارش مجدد (زیر این عدد، قرمز می‌شود)"><input type="number" value={form.reorderLevel} onChange={(e) => set('reorderLevel', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
      </div>

      {/* image section */}
      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-black"><ImagePlus size={14} /> تصویر کالا</p>
        <div className="mb-2 flex items-center gap-2">
          {form.imageUrl ? (
            <img src={form.imageUrl} alt="تصویر کالا" className="h-16 w-16 rounded-xl object-cover" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-secondary text-2xl">🖼️</span>
          )}
          <input value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="یا آدرس اینترنتی تصویر…" className="flex-1 rounded-xl border border-input p-2.5 text-xs" dir="ltr" />
          <button onClick={() => fileRef.current?.click()} className="rounded-xl bg-secondary px-3 py-2.5 text-[11px] font-bold">📁 از دستگاه</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
        </div>
        <div className="flex gap-2">
          <input value={imgQuery} onChange={(e) => setImgQuery(e.target.value)} placeholder="جستجوی عکس در اینترنت: مثلاً بسته شیر پگاه…" className="flex-1 rounded-xl border border-input p-2.5 text-xs" />
          <button onClick={searchImages} disabled={imgSearching} className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-[11px] font-extrabold text-white disabled:opacity-50">
            {imgSearching ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />} جستجو
          </button>
        </div>
        {imgResults.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {imgResults.map((r, i) => (
              <button key={i} onClick={() => { set('imageUrl', r.url); setImgResults([]); toast.success('تصویر انتخاب شد') }} className="overflow-hidden rounded-xl border-2 border-transparent transition hover:border-primary">
                <img src={r.url} alt={`گزینه ${i + 1}`} className="h-20 w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <button onClick={save} disabled={busy} className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? 'در حال ذخیره…' : 'ذخیره ✅'}
      </button>
    </Modal>
  )
}

function ProductDetailModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [history, setHistory] = useState<any>(null)
  const [labelOpen, setLabelOpen] = useState(false)
  useEffect(() => {
    api<{ history: any }>(`/api/products/${product.id}`).then((d) => setHistory(d.history)).catch(() => {})
  }, [product.id])
  const margin = product.buyPrice > 0 ? Math.round(((product.sellPrice - product.buyPrice) / product.buyPrice) * 100) : 0
  const trend = history?.priceTrend || []
  const trendData = trend.map((t: any) => ({ label: formatJalaliShort(t.at), value: t.printedPrice || t.unitBuyPrice }))
  const first = trend.length > 0 ? trend[0].printedPrice || trend[0].unitBuyPrice : 0
  const last = trend.length > 0 ? trend[trend.length - 1].printedPrice || trend[trend.length - 1].unitBuyPrice : 0
  const rise = first > 0 ? Math.round(((last - first) / first) * 100) : 0

  // quick single-product label reprint — same sheet/steppers as the bulk modal
  if (labelOpen) return <LabelPrintModal products={[product]} onClose={() => setLabelOpen(false)} />

  return (
    <Modal title={product.name} onClose={onClose}>
      <div className="flex items-center gap-3">
        {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-20 w-20 rounded-xl object-cover" /> : <span className="flex h-20 w-20 items-center justify-center rounded-xl bg-secondary text-3xl">{CATEGORY_EMOJI[product.category] || '📦'}</span>}
        <div className="flex-1 space-y-1 text-xs">
          <p><b>برند:</b> {product.brand || '—'}</p>
          <p><b>دسته:</b> {product.category}</p>
          <p><b>بارکد:</b> <span className="font-mono" dir="ltr">{product.barcodes.join(', ') || '—'}</span></p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <KeyValue k="قیمت خرید" v={`${faMoney(product.buyPrice)}`} />
        <KeyValue k="قیمت فروش" v={`${faMoney(product.sellPrice)}`} />
        <KeyValue k="حاشیه سود" v={<span style={{ color: margin < 10 ? '#b3372f' : margin < 25 ? '#a16207' : '#0e7a4a' }}>{faNum(margin)}٪</span>} />
        <KeyValue k="موجودی" v={faNum(product.stock)} />
      </div>
      <button
        onClick={() => setLabelOpen(true)}
        className="quick-label-btn flex w-full items-center justify-center gap-2 rounded-xl border border-[#c9a227]/50 bg-[#fdf6dd]/70 py-2.5 text-xs font-extrabold text-[#8a6d10] transition hover:bg-[#fdf6dd]"
        title="چاپ سریع لیبل قفسه فقط برای همین کالا"
      >
        <Printer size={14} /> چاپ لیبل قفسه این کالا 🏷️
      </button>
      {trendData.length >= 2 && (
        <div className="rounded-2xl border border-[#c9a227]/35 bg-[#fdf6dd]/40 p-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-black"><TrendingUp size={14} className="text-[#8a6d10]" /> روند قیمت در سفارش‌های اخیر</p>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black text-white', rise > 0 ? 'bg-[#b3372f]' : rise < 0 ? 'bg-[#0e7a4a]' : 'bg-muted-foreground')}>
              {rise > 0 ? '▲' : rise < 0 ? '▼' : '•'} {faNum(Math.abs(rise))}٪ نسبت به اولین سفارش
            </span>
          </div>
          <LineChart data={trendData} height={120} color="#c9a227" autoMin formatValue={(v) => faMoney(v)} />
          <p className="mt-1 text-center text-[10px] text-muted-foreground">قیمت چاپ‌شده (یا خرید) در هر سفارش — برای پیگیری تورم روزانه</p>
        </div>
      )}
      {history && (
        <div className="rounded-xl bg-muted/40 p-3 text-xs">
          <p className="font-black">📊 ماه اخیر:</p>
          <p className="mt-1">{faNum(history.orderedLastMonth)} عدد سفارش در {faNum(history.ordersLastMonth)} سفارش</p>
          {history.lastOrders.slice(0, 4).map((o: any, i: number) => (
            <p key={i} className="mt-0.5 text-[11px] text-muted-foreground">{o.code} — {faNum(o.qty)} عدد</p>
          ))}
        </div>
      )}
    </Modal>
  )
}

/* ───────────────── گزارش تعاملی کالا (نمودار خطی فروش، حاشیه، دونات سهم دسته، ضایعات، انقضا) ───────────────── */

type ReportBlock = {
  stock: number
  reorderLevel: number
  sales30: number
  avgMarginPct: number
  sales: { date: string; qty: number; amount: number }[]
  margins: { date: string; buyPrice: number; sellPrice: number; marginPct: number }[]
  waste: { date: string; qty: number; estValue: number }[]
  wasteTotal: number
  expiry: { date: string; qty: number; status: string }[]
  ordersBuy?: {
    series: { date: string; qty: number; value: number }[]
    providers: { id: string; name: string; qty: number; value: number; orders: number }[]
    providersCount: number
    ordersCount: number
    totalQty90: number
    totalBuy90: number
    avgGapDays: number
    nextExpectedIso: string
  }
  categoryShare: {
    category: string
    thisValue: number
    siblings: { id: string; name: string; value: number }[]
    othersValue: number
    categoryTotal: number
    storeTotal: number
    windowDays: number
  }
}

function ReportKpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2.5 text-center">
      <p className="text-base font-black" style={{ color: color || '#0e7a4a' }}>{value}</p>
      <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">{label}</p>
    </div>
  )
}

function ProductReportModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [rep, setRep] = useState<ReportBlock | null>(null)
  const [err, setErr] = useState('')

  // گزارش فقط وقتی مودال باز می‌شود واکشی می‌شود — بدون polling
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      api<{ report: ReportBlock }>(`/api/products/${product.id}?report=1`)
        .then((d) => alive && setRep(d.report))
        .catch((e: any) => alive && setErr(e.message || 'خطا در دریافت گزارش'))
    }, 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [product.id])

  // سری پیوستهٔ ۹۰ روزه — روزهای بدون فروش صفر می‌گیرند تا خط واقعی باشد
  const salesSeries = useMemo(() => {
    if (!rep) return []
    const map = new Map(rep.sales.map((s) => [s.date, s]))
    const out: { label: string; value: number; extra?: string }[] = []
    for (let i = 89; i >= 0; i--) {
      const iso = addDaysIso(-i)
      const cell = map.get(iso)
      out.push({ label: formatJalaliShort(iso), value: cell?.qty || 0, extra: cell ? `${faMoney(cell.amount)} تومان فروش` : undefined })
    }
    return out
  }, [rep])

  const marginSeries = useMemo(
    () =>
      (rep?.margins || []).map((m) => ({
        label: formatJalaliShort(m.date),
        value: m.marginPct,
        extra: `خرید ${faMoney(m.buyPrice)} • فروش ${faMoney(m.sellPrice)} تومان`,
      })),
    [rep]
  )

  const wasteSeries = useMemo(() => (rep?.waste || []).map((w) => ({ label: formatJalaliShort(w.date), value: Math.round(w.estValue) })), [rep])

  /* سری پیوستهٔ ۹۰ روزهٔ سفارش/خرید — روزهای بدون سفارش صفر می‌گیرند */
  const orderQtySeries = useMemo(() => {
    if (!rep?.ordersBuy) return []
    const map = new Map(rep.ordersBuy.series.map((s) => [s.date, s]))
    const out: { label: string; value: number; extra?: string }[] = []
    for (let i = 89; i >= 0; i--) {
      const iso = addDaysIso(-i)
      const cell = map.get(iso)
      out.push({ label: formatJalaliShort(iso), value: cell?.qty || 0, extra: cell ? `${faMoney(cell.value)} تومان خرید` : undefined })
    }
    return out
  }, [rep])

  const orderValueSeries = useMemo(() => {
    if (!rep?.ordersBuy) return []
    const map = new Map(rep.ordersBuy.series.map((s) => [s.date, s]))
    const out: { label: string; value: number; extra?: string }[] = []
    for (let i = 89; i >= 0; i--) {
      const iso = addDaysIso(-i)
      const cell = map.get(iso)
      out.push({ label: formatJalaliShort(iso), value: cell?.value || 0, extra: cell ? `${faNum(cell.qty)} عدد سفارش` : undefined })
    }
    return out
  }, [rep])

  /* دونات تأمین‌کنندگان (top ۳ + سایر) — هاور: سفارش‌ها، تعداد و ارزش خرید */
  const providerDonut = useMemo(() => {
    const ob = rep?.ordersBuy
    if (!ob || !ob.providers.length) return []
    const segs: { label: string; value: number; meta?: { k: string; v: string }[] }[] = ob.providers.map((p) => ({
      label: p.name || 'تأمین‌کننده',
      value: p.value,
      meta: [
        { k: 'سفارش‌ها', v: `${faNum(p.orders)} سفارش` },
        { k: 'تعداد', v: `${faNum(p.qty)} عدد` },
        { k: 'میانگین هر سفارش', v: faMoney(p.orders ? Math.round(p.value / p.orders) : 0) + ' تومان' },
      ],
    }))
    const rest = ob.totalBuy90 - ob.providers.reduce((s, p) => s + p.value, 0)
    if (rest > 0)
      segs.push({
        label: 'سایر تأمین‌کنندگان',
        value: rest,
        meta: [{ k: 'توضیح', v: `جمع ${faNum(Math.max(0, ob.providersCount - ob.providers.length))} تأمین‌کنندهٔ دیگر` }],
      })
    return segs
  }, [rep])

  const donutSegments = useMemo(() => {
    if (!rep) return []
    const cs = rep.categoryShare
    const segs: { label: string; value: number; meta?: { k: string; v: string }[] }[] = [
      {
        label: 'این کالا',
        value: cs.thisValue,
        meta: [
          { k: 'دسته', v: cs.category },
          { k: 'کل فروش دسته', v: `${faNum(cs.categoryTotal)} عدد در ${faNum(cs.windowDays)} روز` },
          { k: 'سهم از فروش کل فروشگاه', v: `${faNum(cs.storeTotal > 0 ? Math.round((cs.thisValue / cs.storeTotal) * 100) : 0)}٪` },
        ],
      },
      ...cs.siblings.map((s) => ({
        label: s.name,
        value: s.value,
        meta: [
          { k: 'دسته', v: cs.category },
          { k: 'سهم از فروش دسته', v: `${faNum(cs.categoryTotal > 0 ? Math.round((s.value / cs.categoryTotal) * 100) : 0)}٪` },
        ],
      })),
    ]
    if (cs.othersValue > 0)
      segs.push({
        label: 'سایر کالاهای دسته',
        value: cs.othersValue,
        meta: [{ k: 'دسته', v: cs.category }, { k: 'توضیح', v: 'جمع فروش بقیهٔ کالاهای همین دسته' }],
      })
    return segs
  }, [rep])

  const daysCover = rep && rep.sales30 > 0 ? Math.round(rep.stock / (rep.sales30 / 30)) : null
  const total90 = rep?.sales.reduce((s, x) => s + x.qty, 0) || 0
  const amount90 = rep?.sales.reduce((s, x) => s + x.amount, 0) || 0
  const today = todayIso()

  return (
    <Modal title={`گزارش کالا — ${product.name}`} onClose={onClose} wide>
      {!rep && !err && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/60" />)}
          </div>
          <div className="h-48 animate-pulse rounded-2xl bg-muted/50" />
          <div className="h-32 animate-pulse rounded-2xl bg-muted/40" />
          <p className="text-center text-[11px] font-bold text-muted-foreground">در حال ساختن گزارش ۹۰ روزه…</p>
        </div>
      )}
      {err && (
        <div className="rounded-xl border border-[#b3372f]/40 bg-[#fee2e2]/60 p-3.5 text-xs font-bold text-[#b3372f]">{err}</div>
      )}

      {rep && (
        <div className="scroll-gold max-h-[64vh] space-y-4 overflow-y-auto pl-1">
          {/* ── نوار KPI ── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <ReportKpi label="موجودی فعلی" value={`${faNum(rep.stock)} ${product.unit}`} color={rep.stock <= rep.reorderLevel ? '#b3372f' : '#0e7a4a'} />
            <ReportKpi label="فروش ۳۰ روز اخیر" value={`${faNum(rep.sales30)} عدد`} color="#c96f4a" />
            <ReportKpi label="میانگین حاشیه سود" value={`${faNum(rep.avgMarginPct)}٪`} color={rep.avgMarginPct < 10 ? '#b3372f' : rep.avgMarginPct < 25 ? '#a16207' : '#0e7a4a'} />
            <ReportKpi label="ارزش ضایعات ثبت‌شده" value={`${faMoney(rep.wasteTotal)} ت`} color={rep.wasteTotal > 0 ? '#b3372f' : '#556057'} />
            <ReportKpi
              label="پوشش موجودی (روز)"
              value={daysCover === null ? '—' : faNum(daysCover)}
              color={daysCover !== null && daysCover > 45 ? '#a16207' : '#5c7236'}
            />
          </div>

          {/* ── نمودار خطی فروش روزانه (مهم‌ترین) ── */}
          <section className="rounded-2xl border border-[#0e7a4a]/25 bg-[#e9f0e4]/40 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-black text-[#0e7a4a]"><TrendingUp size={14} /> فروش روزانه — ۹۰ روز اخیر</p>
              <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-black text-[#0e7a4a]">
                جمع: {faNum(total90)} عدد • {faMoney(amount90)} تومان
              </span>
            </div>
            {salesSeries.some((s) => s.value > 0) ? (
              <>
                <LineChart data={salesSeries} height={210} color="#0e7a4a" area markers formatValue={(v) => `${faNum(v)} عدد`} />
                <p className="mt-1.5 text-center text-[10px] text-muted-foreground">انگشت یا موس را روی نمودار بکشید — تاریخ شمسی، تعداد و مبلغ همان روز نمایش داده می‌شود</p>
              </>
            ) : (
              <EmptyState emoji="🍃" title="فروش ثبت‌شده‌ای در ۹۰ روز اخیر نیست" hint="به‌محض ثبت پیش‌فاکتور فروش، نمودار همین‌جا ساخته می‌شود" />
            )}
          </section>

          {/* ── سفارش و خرید ۹۰ روز (نمودار دوم + دونات تأمین‌کننده‌ها + KPI) ── */}
          {rep.ordersBuy && (
            <section className="rounded-2xl border border-[#77934a]/30 bg-[#eef3e3]/40 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-black text-[#5c7236]"><ShoppingBasket size={14} /> سفارش و خرید — ۹۰ روز اخیر (اقلام سفارش‌های خرید)</p>
                <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-black text-[#5c7236]">
                  {faNum(rep.ordersBuy.totalQty90)} عدد • {faMoney(rep.ordersBuy.totalBuy90)} تومان
                </span>
              </div>
              {rep.ordersBuy.ordersCount === 0 && rep.ordersBuy.totalBuy90 === 0 ? (
                <EmptyState emoji="🚚" title="دادهٔ کافی نیست" hint="سفارش خرید ثبت‌شده‌ای برای این کالا در ۹۰ روز اخیر نیست — به‌محض ثبت سفارش، نمودار همین‌جا ساخته می‌شود" />
              ) : (
                <div className="space-y-3">
                  {/* چیپ‌های KPI */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <ReportKpi label="جمع خرید ۹۰ روز" value={`${faMoney(rep.ordersBuy.totalBuy90)} ت`} color="#8a6d10" />
                    <ReportKpi label="تعداد سفارش‌ها" value={`${faNum(rep.ordersBuy.ordersCount)} سفارش`} color="#77934a" />
                    <ReportKpi
                      label="میانگین فاصلهٔ سفارش"
                      value={rep.ordersBuy.avgGapDays > 0 ? `${faNum(rep.ordersBuy.avgGapDays)} روز` : '—'}
                      color="#c96f4a"
                    />
                    <ReportKpi label="سفارش‌دهنده‌ها" value={`${faNum(rep.ordersBuy.providersCount)} تأمین‌کننده`} color="#0e7a4a" />
                  </div>
                  {rep.ordersBuy.avgGapDays > 0 && rep.ordersBuy.nextExpectedIso && (
                    <p className="rounded-xl bg-white/70 p-2.5 text-center text-[11px] font-bold text-[#8a6d10]">
                      🔮 پیش‌بینی سفارش بعدی: حدود {formatJalaliShort(rep.ordersBuy.nextExpectedIso)} — بر پایهٔ فاصلهٔ میانگین {faNum(rep.ordersBuy.avgGapDays)} روزهٔ سفارش‌های این کالا
                    </p>
                  )}
                  {orderQtySeries.some((s) => s.value > 0) ? (
                    <>
                      <div>
                        <p className="mb-1 text-[11px] font-black text-[#5c7236]">تعداد سفارش‌داده‌شده در روز (عدد)</p>
                        <LineChart data={orderQtySeries} height={130} color="#77934a" area markers formatValue={(v) => `${faNum(v)} عدد`} />
                      </div>
                      <div>
                        <p className="mb-1 text-[11px] font-black text-[#8a6d10]">ارزش خرید روز (تومان)</p>
                        <LineChart data={orderValueSeries} height={130} color="#c9a227" area markers formatValue={(v) => `${faMoney(v)} تومان`} />
                      </div>
                      <p className="text-center text-[10px] text-muted-foreground">انگشت یا موس را روی نمودار بکشید — تاریخ شمسی، تعداد و ارزش همان روز نمایش داده می‌شود</p>
                    </>
                  ) : (
                    <EmptyState emoji="🫙" title="دادهٔ کافی نیست" hint="سفارش این کالا قدیمی‌تر از ۹۰ روز اخیر است" />
                  )}
                  {providerDonut.length > 0 && (
                    <div className="rounded-xl border border-border bg-white/70 p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-black"><PieChart size={13} className="text-[#c96f4a]" /> سهم تأمین‌کنندگان از خرید ۹۰ روز (سه تأمین‌کنندهٔ برتر)</p>
                      <Donut data={providerDonut} size={150} thickness={22} centerLabel="خرید (تومان)" centerValue={faMoney(rep.ordersBuy.totalBuy90)} />
                      <p className="mt-2 text-center text-[10px] text-muted-foreground">روی هر قطعه هاور کنید — تعداد سفارش و میانگین خرید همان تأمین‌کننده نمایش داده می‌شود</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── حاشیه سود تاریخی ── */}
          {marginSeries.length >= 2 && (
            <section className="rounded-2xl border border-[#c9a227]/35 bg-[#fdf6dd]/40 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-black text-[#8a6d10]"><BarChart3 size={14} /> روند حاشیه سود (%) از تاریخ سفارش‌ها</p>
                <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-black text-[#8a6d10]">میانگین {faNum(rep.avgMarginPct)}٪</span>
              </div>
              <LineChart data={marginSeries} height={150} color="#c9a227" area markers autoMin formatValue={(v) => `${faNum(v)}٪`} />
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">حاشیه = (قیمت چاپ‌شده − قیمت خرید واحد) ÷ قیمت خرید — روی هر نقطه نگه دارید</p>
            </section>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {/* ── دونات سهم فروش در دسته ── */}
            <section className="rounded-2xl border border-border bg-white/70 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-black"><PieChart size={13} className="text-[#c96f4a]" /> سهم فروش {faNum(rep.categoryShare.windowDays)} روز — دسته «{rep.categoryShare.category}»</p>
              {donutSegments.length > 0 && donutSegments.some((s) => s.value > 0) ? (
                <>
                  <Donut
                    data={donutSegments}
                    size={170}
                    thickness={24}
                    centerLabel="فروش (عدد)"
                    centerValue={faNum(rep.categoryShare.categoryTotal)}
                  />
                  <p className="mt-2 text-center text-[10px] text-muted-foreground">روی هر قطعه هاور کنید — قطعه بیرون می‌آید و جزئیات کامل همان لحظه نمایش داده می‌شود</p>
                </>
              ) : (
                <EmptyState emoji="🫙" title="فروش ثبت‌شده‌ای برای این دسته نیست" />
              )}
            </section>

            <div className="space-y-3">
              {/* ── ضایعات ── */}
              <section className="rounded-2xl border border-[#b3372f]/25 bg-[#fdeee9]/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-black text-[#b3372f]"><Trash2 size={13} /> ضایعات ثبت‌شده</p>
                  <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-black text-[#b3372f]">{faMoney(rep.wasteTotal)} تومان</span>
                </div>
                {wasteSeries.length > 0 ? (
                  <BarChart data={wasteSeries} height={110} color="#b3372f" formatValue={(v) => `${faMoney(v)} تومان`} />
                ) : (
                  <p className="rounded-xl bg-white/60 py-4 text-center text-[11px] font-bold text-muted-foreground">ضایعه‌ای برای این کالا ثبت نشده 🌿</p>
                )}
              </section>

              {/* ── انقضاهای نزدیک ── */}
              <section className="rounded-2xl border border-[#77934a]/30 bg-[#eef3e3]/60 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-black text-[#5c7236]"><CalendarClock size={13} /> انقضاهای نزدیک (FEFO)</p>
                {rep.expiry.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {rep.expiry.map((e, i) => {
                      const left = daysBetween(e.date, today)
                      return (
                        <span
                          key={i}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[10px] font-black',
                            left <= 14 ? 'bg-[#b3372f]/12 text-[#b3372f]' : 'bg-[#c9a227]/15 text-[#8a6d10]'
                          )}
                          title={`تاریخ انقضا: ${formatJalaliShort(e.date)} — ${faNum(left)} روز مانده`}
                        >
                          🗓 {formatJalaliShort(e.date)} • {faNum(e.qty)} عدد • {faNum(left)} روز مانده
                        </span>
                      )
                    })}
                  </div>
                ) : (
                  <p className="rounded-xl bg-white/60 py-4 text-center text-[11px] font-bold text-muted-foreground">انقضای نزدیکی ثبت نشده 🌿</p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ───────────────── Shelf label printing (بارکد + قیمت برای قفسه) ───────────────── */

function LabelPrintModal({ products, onClose }: { products: Product[]; onClose: () => void }) {
  const [copies, setCopies] = useState<Record<string, number>>({})
  const copiesOf = (p: Product) => copies[p.id] ?? 1
  const total = products.reduce((s, p) => s + copiesOf(p), 0)
  const barcodeOf = (p: Product) => p.barcodes[0] || p.holooCode || ''
  const withBarcode = products.filter((p) => barcodeOf(p))
  const withoutBarcode = products.filter((p) => !barcodeOf(p))
  return (
    <Modal title={`چاپ لیبل قفسه — ${faNum(total)} لیبل`} onClose={onClose} wide>
      <p className="mb-3 rounded-xl border border-[#77934a]/30 bg-[#e9f0e4]/60 p-3 text-[11px] leading-5">
        لیبل‌ها آماده چاپ روی کاغذ A4 هستند: نام کالا، قیمت فروش و بارکد. تعداد نسخه هر کالا را تنظیم کنید و دکمه چاپ را بزنید — از تنظیمات چاپ، مقیاس ۱۰۰٪ و حاشیه «پیش‌فرض» را انتخاب کنید.
        {withoutBarcode.length > 0 && <b className="text-[#b3372f]"> {faNum(withoutBarcode.length)} کالا بارکد ندارد و فقط نام/قیمت می‌گیرد.</b>}
      </p>
      <div className="scroll-gold mb-3 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
        {products.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
            <span className="min-w-0 truncate text-[11px] font-bold">{p.name}</span>
            <span className="flex shrink-0 items-center gap-1">
              <span className="text-[10px] text-muted-foreground">نسخه:</span>
              <button onClick={() => setCopies((c) => ({ ...c, [p.id]: Math.max(copiesOf(p) - 1, 1) }))} className="stepper-btn !h-7 !w-7 text-xs">−</button>
              <span className="w-7 text-center text-xs font-black">{faNum(copiesOf(p))}</span>
              <button onClick={() => setCopies((c) => ({ ...c, [p.id]: Math.min(copiesOf(p) + 1, 20) }))} className="stepper-btn !h-7 !w-7 text-xs">+</button>
            </span>
          </div>
        ))}
      </div>
      {/* پیش‌نمایش لیبل‌ها — همین بخش چاپ می‌شود */}
      <div className="rounded-2xl border-2 border-dashed border-border p-3">
        <div className="print-area label-sheet" id="label-sheet">
          {products.map((p) =>
            Array.from({ length: copiesOf(p) }).map((_, ci) => (
              <BarcodeLabel key={`${p.id}-${ci}`} name={p.name} price={p.sellPrice} barcode={barcodeOf(p)} />
            ))
          )}
        </div>
      </div>
      <button
        onClick={() => window.print()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-extrabold text-white"
      >
        <Printer size={16} /> چاپ {faNum(total)} لیبل (A4)
      </button>
    </Modal>
  )
}

function BarcodeLabel({ name, price, barcode }: { name: string; price: number; barcode: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!svgRef.current || !barcode) return
    const opts = {
      width: 1.15,
      height: 30,
      fontSize: 10,
      fontOptions: 'bold' as const,
      margin: 0,
      displayValue: true,
    }
    try {
      JsBarcode(svgRef.current!, barcode, {
        ...opts,
        format: barcode.length === 13 ? 'EAN13' : barcode.length === 8 ? 'EAN8' : 'CODE128',
      })
    } catch {
      // بارکد با چک‌سام نامعتبر — به CODE128 می‌افتیم که هر رشته‌ای را می‌پذیرد
      try {
        JsBarcode(svgRef.current!, barcode, { ...opts, format: 'CODE128' })
      } catch (e) {
        console.error('barcode render fail', barcode, e)
      }
    }
  }, [barcode])
  return (
    <div className="shelf-label overflow-hidden">
      <p className="truncate text-[11px] font-black leading-4">{name}</p>
      <div className="flex items-end justify-between gap-1">
        <p className="shrink-0 text-sm font-black text-[#0e7a4a]">{faMoney(price)} <span className="text-[8px] font-bold">تومان</span></p>
        {barcode ? <svg ref={svgRef} className="shelf-label-barcode max-w-[60%]" /> : <span className="text-[8px] text-muted-foreground">هایپر زیتون</span>}
      </div>
    </div>
  )
}

/* ───────────────── Holoo XLS import wizard ───────────────── */

type ImportRow = { name: string; barcode: string; holooCode: string; buyPrice: number; sellPrice: number; stock: number; unit: string; brand: string; category: string; duplicate: boolean; dupWith?: string }

function ImportWizard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<ImportRow[]>([])
  const [existing, setExisting] = useState<Product[]>([])
  const [mode, setMode] = useState<'skip' | 'update'>('update')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    api<{ products: Product[] }>('/api/products').then((d) => setExisting(d.products))
  }, [])

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<any>(ws, { defval: '' })
      const mapped: ImportRow[] = json.map((r: any) => {
        // try to map common Holoo columns (Persian/English), with fallbacks
        const get = (...keys: string[]) => {
          for (const k of keys) {
            const found = Object.keys(r).find((rk) => rk.trim() === k || rk.includes(k))
            if (found && r[found] !== '') return r[found]
          }
          return ''
        }
        const name = String(get('کالا', 'شرح کالا', 'نام کالا', 'شرح', 'name', 'product', 'کالای موجود') || '').trim()
        const barcode = String(get('بارکد', 'کد بارکد', 'barcode', 'بارکد کالا') || '').trim()
        const row: ImportRow = {
          name,
          barcode,
          holooCode: String(get('کد هلو', 'کد کالا', 'کد', 'holooCode', 'code') || ''),
          buyPrice: Number(String(get('قیمت خرید', 'بهای خرید', 'خرید', 'buyPrice')).replace(/[^\d.]/g, '')) || 0,
          sellPrice: Number(String(get('قیمت فروش', 'فروش', 'sellPrice', 'قیمت')).replace(/[^\d.]/g, '')) || 0,
          stock: Number(String(get('موجودی', 'تعداد', 'stock', 'شمار')).replace(/[^\d.]/g, '')) || 0,
          unit: String(get('واحد', 'unit') || 'عدد'),
          brand: String(get('برند', 'برند کالا', 'brand') || ''),
          category: String(get('دسته', 'گروه', 'category') || 'عمومی'),
          duplicate: false,
        }
        return row
      }).filter((r: ImportRow) => r.name)

      // duplicate detection
      const byBarcode = new Map<string, Product>()
      const byName = new Map<string, Product>()
      for (const p of existing) {
        for (const b of p.barcodes) byBarcode.set(b, p)
        byName.set(p.name.trim().toLowerCase(), p)
      }
      for (const r of mapped) {
        const hit = (r.barcode && byBarcode.get(r.barcode)) || byName.get(r.name.toLowerCase())
        if (hit) { r.duplicate = true; r.dupWith = hit.name }
      }
      setRows(mapped)
      if (!mapped.length) toast.error('سطر قابل‌نگاشت پیدا نشد — ستون‌های «نام کالا» و «بارکد» را بررسی کنید')
      else toast.success(`${faNum(mapped.length)} سطر خوانده شد، ${faNum(mapped.filter((x) => x.duplicate).length)} مورد تکراری تشخیص داده شد`)
    } catch (err: any) {
      toast.error('خواندن فایل ناموفق بود: ' + err.message)
    }
  }

  const doImport = async () => {
    setBusy(true)
    try {
      const res = await api<any>('/api/products/import', { method: 'POST', body: { items: rows, mode } })
      setResult(res)
      toast.success(`درون‌ریزی انجام شد: ${faNum(res.created)} جدید، ${faNum(res.updated)} به‌روزرسانی، ${faNum(res.skipped)} ردشد`)
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="ورود کالاها از فایل اکسل هلو" onClose={onClose} wide>
      {!rows.length ? (
        <div className="rounded-2xl border-2 border-dashed border-[#c9a227]/50 bg-[#fdf6dd]/40 p-8 text-center">
          <FileSpreadsheet size={40} className="mx-auto mb-3 text-[#8a6d10]" />
          <p className="text-sm font-black">فایل اکسل خروجی هلو را انتخاب کنید (.xls / .xlsx / .csv)</p>
          <p className="mx-auto mt-1 max-w-md text-[11px] leading-5 text-muted-foreground">
            ستون‌های رایج هلو (نام کالا، بارکد، کد، قیمت خرید، قیمت فروش، موجودی) به‌طور خودکار شناسایی می‌شوند و تکراری‌ها مشخص می‌گردند.
          </p>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-extrabold text-white">
            📁 انتخاب فایل اکسل
            <input type="file" accept=".xls,.xlsx,.csv" hidden onChange={onFile} />
          </label>
        </div>
      ) : result ? (
        <div className="space-y-3 text-center">
          <p className="text-3xl">🎉</p>
          <p className="text-sm font-black">درون‌ریزی کامل شد</p>
          <div className="grid grid-cols-3 gap-2">
            <KeyValue k="جدید" v={faNum(result.created)} />
            <KeyValue k="به‌روزرسانی" v={faNum(result.updated)} />
            <KeyValue k="ردشده" v={faNum(result.skipped)} />
          </div>
          {result.log?.length > 0 && (
            <div className="scroll-gold max-h-40 overflow-y-auto rounded-xl bg-muted/40 p-3 text-right text-[11px]">
              {result.log.map((l: string, i: number) => <p key={i}>• {l}</p>)}
            </div>
          )}
          <button onClick={onDone} className="w-full rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white">بستن</button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold">{faNum(rows.length)} سطر خوانده شد — {faNum(rows.filter((r) => r.duplicate).length)} تکراری</p>
            <div className="flex gap-1.5">
              <button onClick={() => setMode('update')} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-bold', mode === 'update' ? 'bg-primary text-white' : 'border')}>به‌روزرسانی تکراری‌ها</button>
              <button onClick={() => setMode('skip')} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-bold', mode === 'skip' ? 'bg-primary text-white' : 'border')}>ردکردن تکراری‌ها</button>
            </div>
          </div>
          <div className="scroll-gold max-h-72 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-right text-[11px]">
              <thead className="sticky top-0 bg-secondary">
                <tr>
                  <th className="p-2">کالا</th><th className="p-2">بارکد</th><th className="p-2">خرید</th><th className="p-2">فروش</th><th className="p-2">موجودی</th><th className="p-2">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={cn('border-t border-border/50', r.duplicate && 'bg-[#fef9c3]/50')}>
                    <td className="max-w-40 truncate p-2 font-bold">{r.name}</td>
                    <td className="p-2 font-mono" dir="ltr">{r.barcode || '—'}</td>
                    <td className="p-2">{r.buyPrice ? faMoney(r.buyPrice) : '—'}</td>
                    <td className="p-2">{r.sellPrice ? faMoney(r.sellPrice) : '—'}</td>
                    <td className="p-2">{r.stock || '—'}</td>
                    <td className="p-2">{r.duplicate ? <Pill label="تکراری" color="#a16207" /> : <Pill label="جدید" color="#0e7a4a" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={doImport} disabled={busy} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
            {busy ? 'در حال درون‌ریزی…' : `شروع درون‌ریزی (${faNum(rows.length)} کالا)`}
          </button>
        </>
      )}
    </Modal>
  )
}

/* ───────────────── Duplicate merge wizard ───────────────── */

function MergeWizard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loaded, setLoaded] = useState(false)

  // فهرست کامل از سرور (تشخیص تکراری سراسری، نه فقط صفحهٔ جاری)
  useEffect(() => {
    api<{ products: Product[] }>('/api/products')
      .then((d) => { setProducts(d.products); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  const groups = useMemo(() => {
    const byName = new Map<string, Product[]>()
    for (const p of products) {
      const key = p.name.replace(/\s+/g, ' ').trim().toLowerCase()
      const norm = key.replace(/[يیكک]/g, (m) => (m === 'ي' || m === 'ی' ? 'ی' : 'ک'))
      if (!byName.has(norm)) byName.set(norm, [])
      byName.get(norm)!.push(p)
    }
    return [...byName.values()].filter((g) => g.length > 1)
  }, [products])
  const [primary, setPrimary] = useState<Record<string, string>>({})

  const merge = async (groupName: string, ids: string[]) => {
    const primaryId = primary[groupName] || ids[0]
    try {
      await api('/api/products/merge', { method: 'POST', body: { primaryId, duplicateIds: ids.filter((i) => i !== primaryId) } })
      toast.success('ادغام انجام شد ✅ — موجودی و بارکد‌ها ترکیب شدند')
      onDone()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <Modal title="پاک‌سازی کالاهای تکراری" onClose={onClose} wide>
      {!loaded ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/60" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          <p className="text-3xl">✨</p>
          <p className="mt-2 font-bold">تکراری‌ای پیدا نشد — انبار تمیز است!</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="rounded-xl bg-accent/60 p-3 text-[11px] leading-5">
            برای هر گروه تکراری، کالای «اصلی» را انتخاب کنید. موجودی‌ها جمع و همه بارکدها زیر کالای اصلی نگه‌داری می‌شوند و تکراری‌ها غیرفعال می‌گردند.
          </p>
          <div className="scroll-gold max-h-80 space-y-3 overflow-y-auto">
            {groups.map((g, gi) => {
              const key = `g${gi}`
              return (
                <div key={key} className="rounded-2xl border border-border p-3">
                  <p className="mb-2 text-xs font-black">{g[0].name.replace(/\s+/g, ' ').trim()} <span className="text-muted-foreground">({faNum(g.length)} مورد)</span></p>
                  <div className="grid gap-1.5">
                    {g.map((p) => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-xl bg-muted/40 p-2 text-xs">
                        <input type="radio" name={key} defaultChecked={!primary[key] || primary[key] === p.id} onChange={() => setPrimary((s) => ({ ...s, [key]: p.id }))} />
                        <span className="flex-1 font-bold">{p.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground" dir="ltr">{p.barcodes.join(', ') || '—'}</span>
                        <span>موجودی: {faNum(p.stock)}</span>
                      </label>
                    ))}
                  </div>
                  <button onClick={() => merge(key, g.map((p) => p.id))} className="mt-2 rounded-lg bg-[#8a5a2b] px-4 py-1.5 text-[11px] font-extrabold text-white">
                    ادغام این گروه
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}
