'use client'

import * as React from 'react'
import { api, uploadFile } from '@/lib/api'
import { useApp } from '@/store/app'
import { SectionHeader, EmptyState, LoadingBlock, StockIndicator, ChipSelect } from '@/components/platform/ui/shared'
import { BarcodeInput } from '@/components/platform/ui/barcode-input'
import { money, toFaDigits } from '@/lib/jalali'
import type { ProductDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToast } from '@/hooks/use-toast'
import { ProductDetail } from './ProductDetail'
import {
  Plus, FileSpreadsheet, PackageSearch, Loader2, ScanBarcode, CheckCircle2,
  AlertTriangle, Ban, ChevronDown, SearchCheck,
} from 'lucide-react'

const CARD_COLORS = ['#3E7C59', '#C9A227', '#B07D2B', '#B33A3A', '#8A6F3C', '#7D5BA6']
function colorOf(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return CARD_COLORS[h % CARD_COLORS.length]
}

// ---------- import preview types ----------
interface ImportRow {
  key: string
  name: string
  barcode: string
  qty: number
  price: number
  buyPrice: number
  isNew: boolean
  duplicateOf?: { id: string; productName: string }
  reason?: string
}
interface ImportStats {
  totalRows: number
  newCount: number
  duplicateCount: number
  emptyRows: number
  sheetName: string
}
type RowAction = 'create' | 'merge' | 'skip'

export function Products() {
  const { toast } = useToast()
  const user = useApp((s) => s.user)
  const canCreate = !!user && (user.isManager || user.roleKeys.includes('inventory'))
  const canImport = !!user && (user.isManager || user.roleKeys.includes('accountant'))

  const [products, setProducts] = React.useState<ProductDTO[]>([])
  const [categories, setCategories] = React.useState<string[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)

  const [q, setQ] = React.useState('')
  const [category, setCategory] = React.useState<string | null>(null)
  const [lowOnly, setLowOnly] = React.useState(false)
  const [sort, setSort] = React.useState('newest')

  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  // create dialog
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createPrefillBarcode, setCreatePrefillBarcode] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const emptyCreate = {
    name: '', category: '', brand: '', unit: 'عدد', sellPrice: '', sellPrice2: '',
    buyPrice: '', taxRate: '9', stock: '0', minStock: '6', barcodes: '',
  }
  const [createForm, setCreateForm] = React.useState(emptyCreate)

  // import dialog
  const [importOpen, setImportOpen] = React.useState(false)
  const [importStep, setImportStep] = React.useState<'upload' | 'review'>('upload')
  const [importLoading, setImportLoading] = React.useState(false)
  const [preview, setPreview] = React.useState<ImportRow[]>([])
  const [stats, setStats] = React.useState<ImportStats | null>(null)
  const [actions, setActions] = React.useState<Record<string, RowAction>>({})
  const [targets, setTargets] = React.useState<Record<string, string>>({})
  const [allProducts, setAllProducts] = React.useState<{ id: string; name: string }[]>([])
  const [targetPick, setTargetPick] = React.useState<{ rowKey: string; search: string } | null>(null)
  const [committing, setCommitting] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (category) params.set('category', category)
      if (lowOnly) params.set('lowStock', '1')
      params.set('sort', sort)
      const data = await api<{ products: ProductDTO[]; categories: string[]; total: number }>(
        `/api/products?${params.toString()}`
      )
      setProducts(data.products)
      setCategories(data.categories)
      setTotal(data.total)
    } catch (e) {
      toast({ title: 'خطا در دریافت کالاها', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [q, category, lowOnly, sort, toast])

  React.useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  // ---------- barcode scan ----------
  const onScan = async (code: string) => {
    try {
      const data = await api<{ products: ProductDTO[] }>(`/api/products?q=${encodeURIComponent(code)}&limit=20`)
      const hit = data.products.find((p) => p.barcodes.some((b) => b.code === code))
      if (hit) {
        setDetailId(hit.id)
        setDetailOpen(true)
      } else {
        toast({
          title: 'کالایی با این بارکد یافت نشد',
          description: 'می‌توانید کالای جدیدی با همین بارکد بسازید',
        })
        setCreateForm({ ...emptyCreate, barcodes: code })
        setCreatePrefillBarcode(code)
        setCreateOpen(true)
      }
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    }
  }

  // ---------- create ----------
  const submitCreate = async () => {
    if (!createForm.name.trim()) {
      toast({ title: 'نام کالا الزامی است', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const codes = createForm.barcodes
        .split(/[\n,،;]+/)
        .map((c) => c.trim())
        .filter(Boolean)
      const res = await api<{ id: string }>('/api/products', {
        body: {
          name: createForm.name,
          category: createForm.category,
          brand: createForm.brand,
          unit: createForm.unit,
          sellPrice: Number(createForm.sellPrice) || 0,
          sellPrice2: createForm.sellPrice2 ? Number(createForm.sellPrice2) : null,
          buyPrice: Number(createForm.buyPrice) || 0,
          taxRate: Number(createForm.taxRate) || 9,
          stock: Number(createForm.stock) || 0,
          minStock: Number(createForm.minStock) || 6,
          barcodes: codes,
        },
      })
      toast({ title: 'کالا ایجاد شد', description: createForm.name })
      setCreateOpen(false)
      setCreateForm(emptyCreate)
      setCreatePrefillBarcode('')
      if (res.id) {
        setDetailId(res.id)
        setDetailOpen(true)
      }
      load()
    } catch (e) {
      toast({ title: 'ایجاد ناموفق', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  // ---------- import ----------
  const openImport = () => {
    setImportStep('upload')
    setPreview([])
    setStats(null)
    setActions({})
    setTargets({})
    setImportOpen(true)
  }

  const onImportFile = async (file: File) => {
    setImportLoading(true)
    try {
      const res = await uploadFile<{ preview: ImportRow[]; stats: ImportStats }>('/api/products/import', file)
      setPreview(res.preview)
      setStats(res.stats)
      const initActions: Record<string, RowAction> = {}
      const initTargets: Record<string, string> = {}
      for (const r of res.preview) {
        initActions[r.key] = r.isNew ? 'create' : 'merge'
        if (r.duplicateOf) initTargets[r.key] = r.duplicateOf.id
      }
      setActions(initActions)
      setTargets(initTargets)
      setImportStep('review')
      const list = await api<{ products: { id: string; name: string }[] }>('/api/products?limit=500')
      setAllProducts(list.products.map((p) => ({ id: p.id, name: p.name })))
    } catch (e) {
      toast({ title: 'خطا در پردازش فایل', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setImportLoading(false)
    }
  }

  const commitImport = async () => {
    setCommitting(true)
    try {
      const rows = preview.map((r) => ({
        action: actions[r.key] ?? 'skip',
        name: r.name,
        barcode: r.barcode,
        qty: r.qty,
        price: r.price,
        buyPrice: r.buyPrice,
        targetId: targets[r.key],
      }))
      const res = await api<{ created: number; merged: number; skipped: number; errors?: { name: string; error: string }[] }>(
        '/api/products/import-commit',
        { body: { rows } }
      )
      toast({
        title: 'ورود گروهی انجام شد',
        description: `${toFaDigits(res.created)} جدید، ${toFaDigits(res.merged)} ادغام، ${toFaDigits(res.skipped)} رد`,
      })
      if (res.errors?.length) {
        toast({
          title: 'برخی ردیف‌ها ثبت نشدند',
          description: res.errors.slice(0, 3).map((e) => `${e.name}: ${e.error}`).join(' — '),
          variant: 'destructive',
          duration: 9000,
        })
      }
      setImportOpen(false)
      load()
    } catch (e) {
      toast({ title: 'ثبت ناموفق', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setCommitting(false)
    }
  }

  const pendingCount = preview.filter((r) => (actions[r.key] ?? 'skip') !== 'skip').length

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={<PackageSearch className="h-6 w-6" />}
        title="محصولات"
        subtitle={`${toFaDigits(total)} کالا در فهرست`}
        actions={
          <>
            {canCreate && (
              <Button onClick={() => { setCreateForm(emptyCreate); setCreateOpen(true) }} className="min-h-11">
                <Plus className="h-4 w-4" /> کالای جدید
              </Button>
            )}
            {canImport && (
              <Button variant="outline" onClick={openImport} className="min-h-11">
                <FileSpreadsheet className="h-4 w-4" /> ورود از اکسل هولو
              </Button>
            )}
          </>
        }
      />

      {/* ---------- toolbar ---------- */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="grid gap-2 md:grid-cols-[minmax(220px,280px)_1fr_auto]">
          <BarcodeInput onScan={onScan} autoFocus={false} />
          <Input
            placeholder="جستجوی نام، نام ثانویه یا برند…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11"
          />
          <div className="flex items-center gap-2">
            <Button
              variant={lowOnly ? 'default' : 'outline'}
              onClick={() => setLowOnly((v) => !v)}
              className="min-h-11"
              aria-pressed={lowOnly}
            >
              <AlertTriangle className="h-4 w-4" /> کم‌موجود
            </Button>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="h-11 w-[150px]" aria-label="ترتیب نمایش">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">جدیدترین</SelectItem>
                <SelectItem value="name">بر اساس نام</SelectItem>
                <SelectItem value="stock">کم‌ترین موجودی</SelectItem>
                <SelectItem value="price">گران‌ترین</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <ChipSelect
              options={[
                { key: '', label: 'همه دسته‌ها' },
                ...categories.map((c) => ({ key: c, label: c })),
              ]}
              value={category ?? ''}
              onChange={(v) => setCategory(v || null)}
            />
          </div>
        )}
      </div>

      {/* ---------- grid ---------- */}
      {loading ? (
        <LoadingBlock rows={4} />
      ) : products.length === 0 ? (
        <EmptyState
          icon={<PackageSearch />}
          title="کالایی پیدا نشد"
          description="فیلترها را تغییر دهید یا کالای جدیدی بسازید."
          action={
            canCreate ? (
              <Button onClick={() => setCreateOpen(true)} className="min-h-11">
                <Plus className="h-4 w-4" /> کالای جدید
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setDetailId(p.id); setDetailOpen(true) }}
              className="glow-border-static rounded-2xl border border-border bg-card p-3 flex flex-col text-right transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {p.image ? (
                <img src={p.image} alt={p.name} className="h-28 w-full rounded-xl object-cover border border-border bg-muted" loading="lazy" />
              ) : (
                <div
                  className="h-28 w-full rounded-xl flex items-center justify-center text-4xl font-black text-white/90"
                  style={{ background: `linear-gradient(135deg, ${colorOf(p.name)}, ${colorOf(p.name)}c0)` }}
                  aria-hidden
                >
                  {p.name.trim()[0] ?? '؟'}
                </div>
              )}
              <p className="text-sm font-bold mt-2 line-clamp-2 leading-6 min-h-12">{p.name}</p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {p.brand && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-accent">{p.brand}</Badge>}
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-accent">{p.category}</Badge>
              </div>
              <div className="mt-2 space-y-0.5 text-xs">
                <p className="num">{money(p.sellPrice)} <span className="text-muted-foreground">تومان</span></p>
                <p className="num text-muted-foreground">خرید: {money(p.buyPrice)}</p>
              </div>
              <div className="mt-auto pt-2 border-t border-border flex items-center justify-between gap-1">
                <StockIndicator stock={p.stock} minStock={p.minStock} showLabel={false} />
                <span className="text-[10px] text-muted-foreground num inline-flex items-center gap-1">
                  <ScanBarcode className="h-3 w-3" /> {toFaDigits(p.barcodes.length)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ---------- product detail dialog ---------- */}
      <ProductDetail
        productId={detailId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onChanged={load}
      />

      {/* ---------- create dialog ---------- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle>کالای جدید</DialogTitle>
            <DialogDescription>
              {createPrefillBarcode
                ? `بارکد ${toFaDigits(createPrefillBarcode)} به‌صورت خودکار ثبت می‌شود`
                : 'اطلاعات کالای جدید را وارد کنید'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label htmlFor="pf-name">نام کالا *</Label>
              <Input id="pf-name" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-cat">دسته‌بندی</Label>
              <Input id="pf-cat" list="pf-cats" value={createForm.category} onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))} />
              <datalist id="pf-cats">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-brand">برند</Label>
              <Input id="pf-brand" value={createForm.brand} onChange={(e) => setCreateForm((f) => ({ ...f, brand: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-unit">واحد</Label>
              <Input id="pf-unit" value={createForm.unit} onChange={(e) => setCreateForm((f) => ({ ...f, unit: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-barcode">بارکدها (خط یا ویرگول)</Label>
              <Input id="pf-barcode" className="num" value={createForm.barcodes} onChange={(e) => setCreateForm((f) => ({ ...f, barcodes: e.target.value }))} placeholder="۶۲۶۰…" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-sell">قیمت فروش (تومان)</Label>
              <Input id="pf-sell" className="num" inputMode="numeric" value={createForm.sellPrice} onChange={(e) => setCreateForm((f) => ({ ...f, sellPrice: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-sell2">قیمت فروش ۲ (تخفیفی)</Label>
              <Input id="pf-sell2" className="num" inputMode="numeric" value={createForm.sellPrice2} onChange={(e) => setCreateForm((f) => ({ ...f, sellPrice2: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-buy">قیمت خرید (تومان)</Label>
              <Input id="pf-buy" className="num" inputMode="numeric" value={createForm.buyPrice} onChange={(e) => setCreateForm((f) => ({ ...f, buyPrice: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-tax">مالیات (٪)</Label>
              <Input id="pf-tax" className="num" inputMode="numeric" value={createForm.taxRate} onChange={(e) => setCreateForm((f) => ({ ...f, taxRate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-stock">موجودی اولیه</Label>
              <Input id="pf-stock" className="num" inputMode="numeric" value={createForm.stock} onChange={(e) => setCreateForm((f) => ({ ...f, stock: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-min">حد سفارش</Label>
              <Input id="pf-min" className="num" inputMode="numeric" value={createForm.minStock} onChange={(e) => setCreateForm((f) => ({ ...f, minStock: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="min-h-11">انصراف</Button>
            <Button onClick={submitCreate} disabled={creating} className="min-h-11">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              ایجاد کالا
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- import dialog ---------- */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle>ورود گروهی محصولات از هولو</DialogTitle>
            <DialogDescription>
              {importStep === 'upload'
                ? 'فایل اکسل خروجی هولو (xlsx/xls/csv) را بارگذاری کنید؛ پیش از ثبت، تکراری‌ها بررسی می‌شوند.'
                : `بررسی ردیف‌ها — ${toFaDigits(stats?.newCount ?? 0)} جدید، ${toFaDigits(stats?.duplicateCount ?? 0)} تکراری`}
            </DialogDescription>
          </DialogHeader>

          {importStep === 'upload' && (
            <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card/60 py-12 cursor-pointer hover:bg-accent/40 transition-colors min-h-44">
              {importLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              ) : (
                <FileSpreadsheet className="h-8 w-8 text-primary" />
              )}
              <span className="text-sm font-medium">{importLoading ? 'در حال پردازش فایل…' : 'انتخاب فایل اکسل'}</span>
              <span className="text-xs text-muted-foreground">ستون‌های شناسایی‌شده: بارکد، نام، تعداد، قیمت، قیمت خرید</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) onImportFile(f)
                }}
              />
            </label>
          )}

          {importStep === 'review' && (
            <div className="space-y-3">
              <div className="max-h-96 overflow-y-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-accent/80 backdrop-blur">
                    <tr>
                      <th className="p-2 text-right font-medium">نام کالا</th>
                      <th className="p-2 text-right font-medium hidden md:table-cell">بارکد</th>
                      <th className="p-2 text-right font-medium">تعداد</th>
                      <th className="p-2 text-right font-medium hidden md:table-cell">قیمت</th>
                      <th className="p-2 text-right font-medium">وضعیت</th>
                      <th className="p-2 text-right font-medium">اقدام</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.map((r) => {
                      const action = actions[r.key] ?? 'skip'
                      const targetId = targets[r.key]
                      const targetName =
                        allProducts.find((p) => p.id === targetId)?.name ??
                        preview.find((x) => x.duplicateOf?.id === targetId)?.duplicateOf?.productName ??
                        r.duplicateOf?.productName ??
                        '—'
                      return (
                        <tr key={r.key} className="align-middle">
                          <td className="p-2 max-w-44">
                            <p className="line-clamp-2 leading-5">{r.name}</p>
                          </td>
                          <td className="p-2 num text-muted-foreground hidden md:table-cell">{r.barcode ? toFaDigits(r.barcode) : '—'}</td>
                          <td className="p-2 num">{toFaDigits(r.qty)}</td>
                          <td className="p-2 num text-muted-foreground hidden md:table-cell">{r.price ? money(r.price) : '—'}</td>
                          <td className="p-2">
                            {r.isNew ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: '#3E7C59' }}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> جدید
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 text-xs font-bold"
                                style={{ color: '#C9A227' }}
                                title={r.reason}
                              >
                                <AlertTriangle className="h-3.5 w-3.5" /> تکراری
                                <span className="font-normal text-muted-foreground hidden lg:inline">{r.reason}</span>
                              </span>
                            )}
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              <Select
                                value={action}
                                onValueChange={(v) => setActions((a) => ({ ...a, [r.key]: v as RowAction }))}
                              >
                                <SelectTrigger className="h-9 w-[120px] text-xs" aria-label="اقدام">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {r.isNew ? (
                                    <>
                                      <SelectItem value="create">افزودن جدید</SelectItem>
                                      <SelectItem value="skip">رد</SelectItem>
                                    </>
                                  ) : (
                                    <>
                                      <SelectItem value="merge">ادغام با موجود</SelectItem>
                                      <SelectItem value="skip">رد</SelectItem>
                                    </>
                                  )}
                                </SelectContent>
                              </Select>
                              {action === 'merge' && (
                                <Popover
                                  open={targetPick?.rowKey === r.key}
                                  onOpenChange={(o) => setTargetPick(o ? { rowKey: r.key, search: '' } : null)}
                                >
                                  <PopoverTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-9 max-w-40 text-xs px-2">
                                      <span className="truncate">{targetName}</span>
                                      <ChevronDown className="h-3 w-3 shrink-0" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-72 p-2" align="start">
                                    <Input
                                      autoFocus
                                      placeholder="جستجوی کالای هدف…"
                                      value={targetPick?.search ?? ''}
                                      onChange={(e) => setTargetPick((t) => (t ? { ...t, search: e.target.value } : t))}
                                      className="h-9 mb-2"
                                    />
                                    <div className="max-h-52 overflow-y-auto space-y-0.5">
                                      {allProducts
                                        .filter((p) => !targetPick?.search || p.name.includes(targetPick.search))
                                        .slice(0, 30)
                                        .map((p) => (
                                          <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => {
                                              setTargets((t) => ({ ...t, [r.key]: p.id }))
                                              setTargetPick(null)
                                            }}
                                            className={`w-full text-right text-xs rounded-lg px-2 py-2 hover:bg-accent transition-colors min-h-9 ${p.id === targetId ? 'bg-accent font-bold' : ''}`}
                                          >
                                            {p.name}
                                          </button>
                                        ))}
                                      {allProducts.filter((p) => !targetPick?.search || p.name.includes(targetPick.search)).length === 0 && (
                                        <p className="text-xs text-muted-foreground p-2">نتیجه‌ای نیست</p>
                                      )}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                              {action === 'skip' && <Ban className="h-3.5 w-3.5 text-muted-foreground" />}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {toFaDigits(pendingCount)} ردیف برای ثبت انتخاب شده · فایل: {stats?.sheetName ?? '—'}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setImportStep('upload')} className="min-h-11" disabled={committing}>
                    فایل دیگر
                  </Button>
                  <Button onClick={commitImport} disabled={committing || pendingCount === 0} className="min-h-11">
                    {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
                    ثبت نهایی
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
