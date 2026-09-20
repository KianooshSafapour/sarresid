'use client'

import * as React from 'react'
import { api, getStoredUser, ClientUser } from '@/lib/api-client'
import { SectionHeader, EmptyState, StockBadge, Money, GlowCard, OrnamentDivider } from '@/components/zeytoon-ui'
import { toFaDigits, formatMoney, formatJalaliDateTime, formatJalali } from '@/lib/jalali'
import { canUser, PERMISSIONS, stockStatus, STOCK_STATUS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { JalaliDatePicker } from '@/components/jalali-date-picker'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  Plus, Search, X, Package, Upload, Globe, Loader2, Pencil, Boxes,
  AlertTriangle, ScanBarcode, FileSpreadsheet, Wand2, CheckCircle2, ImageIcon, Trash2, Download, Minus, RotateCcw,
} from 'lucide-react'

// ================= Types =================

export interface Product {
  id: string
  name: string
  holooName?: string | null
  barcode?: string | null
  barcodes: string[]
  price: number
  cost: number
  stock: number
  minStock: number
  unit: string
  category?: string | null
  companyId?: string | null
  company?: { id: string; name: string } | null
  image?: string | null
  isWeight: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}

interface Company { id: string; name: string }

interface ProductsData {
  products: Product[]
  categories: string[]
  companies: Company[]
  stats: { critical: number; low: number; total: number }
}

interface ProductDetail {
  product: Product
  lastOrders: { orderId: string; orderNumber: number; qty: number; lineTotal: number; date: string; status: string }[]
  stats: { totalQty: number; totalAmount: number; ordersCount: number }
}

interface ImportRow {
  name: string
  holooName?: string
  barcode?: string
  price?: number
  stock?: number
  unit?: string
  category?: string
  classification: 'NEW' | 'DUPLICATE' | 'INVALID'
  matchedId?: string
  matchedName?: string
  matchedField?: string
  action: 'CREATE' | 'UPDATE' | 'MERGE' | 'SKIP'
}

interface DedupeGroup {
  key: string
  type: 'NAME' | 'BARCODE'
  products: Product[]
}

// ---- smart reorder ----
interface ReorderItem { productId: string; name: string; stock: number; minStock: number; suggestedQty: number; unitPrice: number; estimated: number }
interface ReorderGroup { supplierId: string; supplierName: string; paymentType: string | null; items: ReorderItem[]; estimatedTotal: number }
interface ReorderData {
  suppliers: ReorderGroup[]
  orphans: { name: string; stock: number }[]
  totalEstimated: number
  productCount: number
  criticalCount: number
  coverage: number
  coverages: number[]
}
interface CreatedDraft { id: string; number: number; supplierName: string; itemCount: number; totalAmount: number }

/** coverage multiplier label: 1.5 → ×۱٫۵ */
const coverageLabel = (c: number) => `×${toFaDigits(String(c).replace('.', '٫'))}`

// ================= Small pieces =================

function ProductAvatar({ p, className }: { p: Pick<Product, 'image' | 'name'>; className?: string }) {
  if (p.image) {
    return (
      <img src={p.image} alt={p.name} className={cn('object-cover', className)} loading="lazy" />
    )
  }
  return (
    <div className={cn('flex items-center justify-center bg-gradient-to-br from-accent via-accent to-primary/15 text-olive', className)}>
      <span className="text-3xl font-black opacity-80">{(p.name || '🌿').trim().charAt(0)}</span>
    </div>
  )
}

function ProductThumbSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  )
}

// ================= Product form dialog =================

interface FormState {
  name: string
  holooName: string
  barcode: string
  barcodes: string[]
  price: string
  cost: string
  stock: string
  minStock: string
  unit: string
  category: string
  companyId: string
  image: string
  isWeight: boolean
  active: boolean
}

const emptyForm: FormState = {
  name: '', holooName: '', barcode: '', barcodes: [],
  price: '', cost: '', stock: '', minStock: '10', unit: 'عدد',
  category: '', companyId: '', image: '', isWeight: false, active: true,
}

function formFromProduct(p: Product): FormState {
  const chips = Array.from(new Set([...(p.barcodes || []), p.barcode || ''].filter(Boolean)))
  return {
    name: p.name, holooName: p.holooName || '', barcode: p.barcode || '',
    barcodes: chips,
    price: p.price ? String(p.price) : '', cost: p.cost ? String(p.cost) : '',
    stock: String(p.stock ?? 0), minStock: String(p.minStock ?? 10), unit: p.unit || 'عدد',
    category: p.category || '', companyId: p.companyId || '', image: p.image || '',
    isWeight: !!p.isWeight, active: p.active,
  }
}

function ProductFormDialog({
  open, onClose, editing, companies, categories, onSaved,
}: {
  open: boolean
  onClose: () => void
  editing: Product | null
  companies: Company[]
  categories: string[]
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [barcodeInput, setBarcodeInput] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [searching, setSearching] = React.useState(false)
  const [searchResults, setSearchResults] = React.useState<{ url: string; image: string }[]>([])
  const [searchError, setSearchError] = React.useState('')
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (open) {
      setForm(editing ? formFromProduct(editing) : emptyForm)
      setBarcodeInput('')
      setSearchResults([])
      setSearchError('')
    }
  }, [open, editing])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  function addBarcode() {
    const code = barcodeInput.trim()
    if (!code) return
    setForm((f) => (f.barcodes.includes(code) ? f : { ...f, barcodes: [...f.barcodes, code] }))
    setBarcodeInput('')
  }

  function onBarcodeKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addBarcode()
    }
  }

  async function doImageSearch() {
    const q = form.name.trim() || form.holooName.trim()
    if (!q) {
      toast({ title: 'اول نام محصول را بنویسید', variant: 'destructive' })
      return
    }
    setSearching(true)
    setSearchError('')
    setSearchResults([])
    try {
      const res = await api.post<{ results: { url: string; image: string }[] }>('/api/products/image-search', { query: q })
      setSearchResults(res.results || [])
      if (!res.results?.length) setSearchError('نتیجه‌ای پیدا نشد — از دستگاه انتخاب کنید')
    } catch {
      setSearchError('جستجوی تصویر موقتاً در دسترس نیست — از دستگاه انتخاب کنید')
    } finally {
      setSearching(false)
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const u = getStoredUser()
      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: fd,
        headers: u?.token ? { Authorization: `Bearer ${u.token}` } : {},
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در بارگذاری تصویر')
      set('image', data.url)
      toast({ title: 'تصویر بارگذاری شد ✓' })
    } catch (err) {
      toast({ title: 'خطا در بارگذاری', description: (err as Error).message, variant: 'destructive' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function save() {
    if (!form.name.trim()) {
      toast({ title: 'نام محصول الزامی است', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        holooName: form.holooName.trim() || null,
        barcode: form.barcodes[0] || form.barcode.trim() || null,
        barcodes: form.barcodes,
        price: parseFloat(form.price) || 0,
        cost: parseFloat(form.cost) || 0,
        stock: parseFloat(form.stock) || 0,
        minStock: parseFloat(form.minStock) || 0,
        unit: form.unit.trim() || 'عدد',
        category: form.category.trim() || null,
        companyId: form.companyId || null,
        image: form.image.trim() || null,
        isWeight: form.isWeight,
        active: form.active,
      }
      if (editing) {
        await api.patch(`/api/products/${editing.id}`, payload)
        toast({ title: 'محصول بروزرسانی شد ✓' })
      } else {
        await api.post('/api/products', payload)
        toast({ title: 'محصول جدید ثبت شد ✓' })
      }
      onSaved()
      onClose()
    } catch (err) {
      toast({ title: 'خطا', description: (err as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'ویرایش محصول' : 'محصول جدید'}</DialogTitle>
          <DialogDescription>
            {editing ? form.name : 'اطلاعات کالای جدید را وارد کنید'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>نام محصول *</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="مثلاً شیر پرچرب کاله ۱ لیتری" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>نام در نرم‌افزار هلو</Label>
            <Input value={form.holooName} onChange={(e) => set('holooName', e.target.value)} placeholder="اختیاری" className="h-11" />
          </div>
        </div>

        {/* Barcodes chips */}
        <div className="space-y-1.5">
          <Label>بارکدها <span className="text-xs text-muted-foreground">(بارکد را بنویسید و Enter بزنید)</span></Label>
          <div className="flex gap-2">
            <Input
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={onBarcodeKey}
              placeholder="مثلاً 6260111000017"
              className="h-11"
              inputMode="numeric"
            />
            <Button type="button" variant="secondary" className="h-11 shrink-0" onClick={addBarcode}>
              <Plus className="size-4" /> افزودن
            </Button>
          </div>
          {form.barcodes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {form.barcodes.map((b) => (
                <Badge key={b} variant="secondary" className="gap-1 pl-1.5 font-mono" dir="ltr">
                  <ScanBarcode className="size-3 opacity-60" />
                  {toFaDigits(b)}
                  <button
                    type="button"
                    aria-label={`حذف بارکد ${b}`}
                    className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive"
                    onClick={() => set('barcodes', form.barcodes.filter((x) => x !== b))}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Image picker */}
        <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5"><ImageIcon className="size-4 text-olive" /> تصویر محصول</Label>
            {form.image && (
              <Button type="button" size="sm" variant="ghost" className="text-destructive h-8" onClick={() => set('image', '')}>
                <Trash2 className="size-3.5" /> حذف تصویر
              </Button>
            )}
          </div>
          {form.image ? (
            <div className="flex items-center gap-3">
              <img src={form.image} alt="پیش‌نمایش تصویر محصول" className="size-20 rounded-lg object-cover border" />
              <p className="text-xs text-muted-foreground">تصویر انتخاب شد — با دکمه «حذف تصویر» می‌توانید تغییرش دهید.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" className="h-11" onClick={doImageSearch} disabled={searching}>
                {searching ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
                جستجوی تصویر در اینترنت
              </Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                انتخاب از دستگاه
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
            </div>
          )}
          {searchError && (
            <p className="text-xs rounded-lg bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1.5">{searchError}</p>
          )}
          {searchResults.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-44 overflow-y-auto rounded-lg p-1">
              {searchResults.map((r) => (
                <button
                  key={r.url}
                  type="button"
                  className="group relative overflow-hidden rounded-lg border-2 border-transparent hover:border-gold transition-colors"
                  onClick={() => { set('image', r.url); setSearchResults([]); toast({ title: 'تصویر انتخاب شد ✓' }) }}
                >
                  <img src={r.image} alt="نتیجه جستجو" className="aspect-square w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>قیمت فروش (تومان)</Label>
            <Input value={form.price} onChange={(e) => set('price', e.target.value)} inputMode="numeric" className="h-11 tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label>قیمت خرید (تومان)</Label>
            <Input value={form.cost} onChange={(e) => set('cost', e.target.value)} inputMode="numeric" className="h-11 tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label>موجودی فعلی</Label>
            <Input value={form.stock} onChange={(e) => set('stock', e.target.value)} inputMode="numeric" className="h-11 tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label>حداقل موجودی (هشدار)</Label>
            <Input value={form.minStock} onChange={(e) => set('minStock', e.target.value)} inputMode="numeric" className="h-11 tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label>واحد</Label>
            <Input value={form.unit} onChange={(e) => set('unit', e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>دسته‌بندی</Label>
            <Input list="product-categories" value={form.category} onChange={(e) => set('category', e.target.value)} className="h-11" />
            <datalist id="product-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>شرکت / برند</Label>
            <Select value={form.companyId || 'none'} onValueChange={(v) => set('companyId', v === 'none' ? '' : v)}>
              <SelectTrigger className="h-11"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— بدون شرکت —</SelectItem>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-6 pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={form.isWeight} onCheckedChange={(v) => set('isWeight', v)} />
              <span className="text-sm font-medium">فروش وزنی</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={form.active} onCheckedChange={(v) => set('active', v)} />
              <span className="text-sm font-medium">فعال</span>
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={saving}>انصراف</Button>
          <Button className="h-11 min-w-32" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================= Product detail dialog =================

function ProductDetailDialog({
  productId, onClose, canManage, onEdit,
}: {
  productId: string | null
  onClose: () => void
  canManage: boolean
  onEdit: (p: Product) => void
}) {
  const [detail, setDetail] = React.useState<ProductDetail | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!productId) { setDetail(null); return }
    setLoading(true)
    api.get<ProductDetail>(`/api/products/${productId}`)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [productId])

  const p = detail?.product
  const status = p ? stockStatus(p.stock, p.minStock) : null
  const s = status ? STOCK_STATUS[status] : null

  return (
    <Dialog open={!!productId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        {loading || !p ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-right">
                <ProductAvatar p={p} className="size-12 rounded-lg border" />
                <span className="flex-1">{p.name}</span>
              </DialogTitle>
              <DialogDescription>
                {p.company?.name ? `${p.company.name} — ` : ''}{p.category || 'بدون دسته'}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-3 space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">قیمت فروش</span>
                  <Money value={p.price} className="font-bold" />
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">قیمت خرید</span>
                  <Money value={p.cost} className="tabular-nums" />
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">موجودی</span>
                  <StockBadge stock={p.stock} minStock={p.minStock} unit={p.unit} />
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">حداقل موجودی</span>
                  <span className="tabular-nums">{toFaDigits(Math.round(p.minStock))} {p.unit}</span>
                </div>
              </div>
              <div className="rounded-xl border p-3 space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">نام در هلو</span>
                  <span className="font-medium">{p.holooName || '—'}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">واحد فروش</span>
                  <span>{p.unit}{p.isWeight ? ' (وزنی)' : ''}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">تاریخ ثبت</span>
                  <span className="tabular-nums">{formatJalali(p.createdAt)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">آخرین تغییر</span>
                  <span className="tabular-nums">{formatJalali(p.updatedAt)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">بارکدها</Label>
              <div className="flex flex-wrap gap-1.5">
                {(p.barcodes?.length ? p.barcodes : [p.barcode || '']).filter(Boolean).map((b) => (
                  <Badge key={b} variant="secondary" className="gap-1 font-mono" dir="ltr">
                    <ScanBarcode className="size-3 opacity-60" />{toFaDigits(b)}
                  </Badge>
                ))}
                {!p.barcodes?.length && !p.barcode && <span className="text-xs text-muted-foreground">بدون بارکد</span>}
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h4 className="font-bold text-sm flex items-center gap-1.5">
                  <Package className="size-4 text-olive" /> سفارش‌های اخیر
                </h4>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>فروش کل: <b className="text-foreground tabular-nums">{toFaDigits(Math.round(detail!.stats.totalQty))} {p.unit}</b></span>
                  <span>مبلغ کل: <b className="text-foreground">{formatMoney(detail!.stats.totalAmount)}</b> تومان</span>
                </div>
              </div>
              {detail!.lastOrders.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">هنوز در سفارشی ثبت نشده است 🌱</p>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto pl-1">
                  {detail!.lastOrders.map((o, i) => (
                    <div key={`${o.orderId}-${i}`} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <span className="font-medium">سفارش {toFaDigits(o.orderNumber)}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{formatJalali(o.date)}</span>
                      <span className="tabular-nums">{toFaDigits(Math.round(o.qty))} {p.unit}</span>
                      <span className="tabular-nums font-semibold">{formatMoney(o.lineTotal)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {canManage && (
              <DialogFooter>
                <Button className="h-11 min-w-36" onClick={() => onEdit(p)}>
                  <Pencil className="size-4" /> ویرایش محصول
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ================= Holoo import tab =================

const CLASSIFY_META: Record<ImportRow['classification'], { label: string; cls: string }> = {
  NEW: { label: 'جدید', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  DUPLICATE: { label: 'تکراری', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  INVALID: { label: 'نامعتبر', cls: 'bg-red-50 text-red-600 border-red-200' },
}

function ImportHolooTab({ onApplied }: { onApplied: () => void }) {
  const { toast } = useToast()
  const [rows, setRows] = React.useState<ImportRow[]>([])
  const [uploading, setUploading] = React.useState(false)
  const [applying, setApplying] = React.useState(false)
  const [fileName, setFileName] = React.useState('')
  const [dedupeOpen, setDedupeOpen] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const counts = React.useMemo(() => {
    const c = { NEW: 0, DUPLICATE: 0, INVALID: 0, toCreate: 0, toUpdate: 0, toSkip: 0 }
    for (const r of rows) {
      c[r.classification]++
      if (r.classification === 'INVALID' || r.action === 'SKIP') c.toSkip++
      else if (r.action === 'CREATE') c.toCreate++
      else c.toUpdate++
    }
    return c
  }, [rows])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    setRows([])
    try {
      const fd = new FormData()
      fd.append('file', f)
      const u = getStoredUser()
      const res = await fetch('/api/products/import-holoo', {
        method: 'POST',
        body: fd,
        headers: u?.token ? { Authorization: `Bearer ${u.token}` } : {},
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در پردازش فایل')
      setRows(data.rows || [])
      setFileName(f.name)
      toast({ title: 'فایل خوانده شد ✓', description: `${toFaDigits((data.rows || []).length)} ردیف پیدا شد` })
    } catch (err) {
      toast({ title: 'خطا در پردازش فایل', description: (err as Error).message, variant: 'destructive' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function setAction(idx: number, action: ImportRow['action']) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, action } : r)))
  }

  async function apply() {
    setApplying(true)
    try {
      const res = await api.post<{ created: number; updated: number; skipped: number; errors: number }>(
        '/api/products/import-holoo',
        { mode: 'apply', rows },
      )
      toast({
        title: 'واردات انجام شد ✓',
        description: `${toFaDigits(res.created)} محصول جدید، ${toFaDigits(res.updated)} بروزرسانی، ${toFaDigits(res.skipped)} رد شد`,
      })
      setRows([])
      setFileName('')
      onApplied()
    } catch (err) {
      toast({ title: 'خطا در اعمال', description: (err as Error).message, variant: 'destructive' })
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="space-y-4">
      <GlowCard className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl bg-accent flex items-center justify-center text-2xl shrink-0">📥</div>
            <div>
              <h3 className="font-extrabold">واردات از نرم‌افزار هلو</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                فایل اکسل خروجی هلو را بارگذاری کنید (ستون‌های بارکد، نام، قیمت، موجودی، واحد به‌صورت خودکار تشخیص داده می‌شوند)
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-11" onClick={() => setDedupeOpen(true)}>
              <Wand2 className="size-4" /> پاکسازی تکراری‌ها
            </Button>
            <Button className="h-11" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
              انتخاب فایل اکسل
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />
          </div>
        </div>
        {fileName && <p className="text-xs text-muted-foreground mt-2">فایل: {fileName}</p>}
      </GlowCard>

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50">جدید: {toFaDigits(counts.NEW)}</Badge>
            <Badge className="bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50">تکراری: {toFaDigits(counts.DUPLICATE)}</Badge>
            <Badge className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-50">نامعتبر: {toFaDigits(counts.INVALID)}</Badge>
            <Separator orientation="vertical" className="hidden sm:block h-6" />
            <span className="text-muted-foreground text-xs">
              اعمال: {toFaDigits(counts.toCreate)} ایجاد • {toFaDigits(counts.toUpdate)} بروزرسانی • {toFaDigits(counts.toSkip)} رد
            </span>
            <Button className="h-10 mr-auto min-w-32" onClick={apply} disabled={applying || counts.toCreate + counts.toUpdate === 0}>
              {applying ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              اعمال
            </Button>
          </div>

          <div className="rounded-xl border overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 sticky top-0">
                  <tr className="text-right">
                    <th className="px-3 py-2.5 font-bold">نام</th>
                    <th className="px-3 py-2.5 font-bold">بارکد</th>
                    <th className="px-3 py-2.5 font-bold">قیمت</th>
                    <th className="px-3 py-2.5 font-bold">موجودی</th>
                    <th className="px-3 py-2.5 font-bold">وضعیت</th>
                    <th className="px-3 py-2.5 font-bold">محصول موجود</th>
                    <th className="px-3 py-2.5 font-bold">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={cn('border-t', r.classification === 'INVALID' && 'opacity-50')}>
                      <td className="px-3 py-2 max-w-44 truncate font-medium">{r.name || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums" dir="ltr">{r.barcode ? toFaDigits(r.barcode) : '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{r.price ? formatMoney(r.price) : '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{r.stock !== undefined ? toFaDigits(Math.round(r.stock)) : '—'}</td>
                      <td className="px-3 py-2">
                        <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-xs font-bold', CLASSIFY_META[r.classification].cls)}>
                          {CLASSIFY_META[r.classification].label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.matchedName ? (
                          <span>{r.matchedName} <span className="text-muted-foreground">({r.matchedField})</span></span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {r.classification === 'INVALID' ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : r.classification === 'NEW' ? (
                          <span className="text-xs text-emerald-700 font-bold">ایجاد محصول جدید</span>
                        ) : (
                          <Select value={r.action} onValueChange={(v) => setAction(i, v as ImportRow['action'])}>
                            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="UPDATE">بروزرسانی</SelectItem>
                              <SelectItem value="MERGE">ادغام</SelectItem>
                              <SelectItem value="CREATE">جدید</SelectItem>
                              <SelectItem value="SKIP">ردشدن</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {rows.length === 0 && !uploading && (
        <EmptyState
          icon={<FileSpreadsheet className="size-7 text-olive" />}
          title="فایلی انتخاب نشده"
          description="فایل اکسل خروجی هلو را بارگذاری کنید تا ردیف‌ها بررسی و طبقه‌بندی شوند."
        />
      )}

      <DedupeDialog open={dedupeOpen} onClose={() => setDedupeOpen(false)} onMerged={onApplied} />
    </div>
  )
}

// ================= Dedupe tool =================

function DedupeDialog({ open, onClose, onMerged }: { open: boolean; onClose: () => void; onMerged: () => void }) {
  const { toast } = useToast()
  const [groups, setGroups] = React.useState<DedupeGroup[] | null>(null)
  const [keep, setKeep] = React.useState<Record<string, string>>({}) // groupKey -> keepId
  const [merging, setMerging] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setGroups(null)
      setKeep({})
      api.get<{ groups: DedupeGroup[] }>('/api/products/import-holoo?dedupeScan=1')
        .then((d) => setGroups(d.groups || []))
        .catch(() => setGroups([]))
    }
  }, [open])

  async function mergeGroup(g: DedupeGroup) {
    const keepId = keep[g.key]
    if (!keepId) {
      toast({ title: 'اول محصولی که باید بماند را انتخاب کنید', variant: 'destructive' })
      return
    }
    setMerging(g.key)
    try {
      const others = g.products.filter((p) => p.id !== keepId)
      for (const o of others) {
        await api.post('/api/products/merge', { sourceId: o.id, targetId: keepId })
      }
      toast({ title: 'ادغام انجام شد ✓', description: `${toFaDigits(others.length)} محصول تکراری با «${g.products.find((p) => p.id === keepId)?.name}» ادغام شد` })
      setGroups((gs) => (gs || []).filter((x) => x.key !== g.key))
      onMerged()
    } catch (err) {
      toast({ title: 'خطا در ادغام', description: (err as Error).message, variant: 'destructive' })
    } finally {
      setMerging('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="size-5 text-olive" /> پاکسازی محصولات تکراری</DialogTitle>
          <DialogDescription>
            گروه‌هایی که با نام مشابه یا بارکد مشترک پیدا شدند. در هر گروه محصولی که باید بماند را انتخاب و ادغام کنید.
          </DialogDescription>
        </DialogHeader>
        {!groups ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState icon="✨" title="تکراری‌ای پیدا نشد" description="همه محصولات تمیز و مرتب هستند." />
        ) : (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pl-1">
            {groups.map((g) => (
              <div key={g.key} className="rounded-xl border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm">
                    <Badge variant="secondary" className="text-[10px]">{g.type === 'BARCODE' ? 'بارکد مشترک' : 'نام مشابه'}</Badge>
                    <span className="mr-2 font-medium">{g.type === 'BARCODE' ? toFaDigits(g.key) : g.key}</span>
                  </div>
                  <Button size="sm" className="h-9" onClick={() => mergeGroup(g)} disabled={merging === g.key}>
                    {merging === g.key ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                    ادغام
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {g.products.map((p) => (
                    <label key={p.id} className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-2.5 py-2 cursor-pointer hover:bg-muted transition-colors">
                      <input
                        type="radio"
                        name={`keep-${g.key}`}
                        className="accent-[#5a7d4f]"
                        checked={keep[g.key] === p.id}
                        onChange={() => setKeep((k) => ({ ...k, [g.key]: p.id }))}
                      />
                      <ProductAvatar p={p} className="size-8 rounded-md border" />
                      <span className="text-sm font-medium flex-1 truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{toFaDigits(Math.round(p.stock))} {p.unit}</span>
                      <span className="text-xs tabular-nums">{formatMoney(p.price)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ================= Main section =================

export function ProductsSection({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const canManage = canUser(user.roles, PERMISSIONS.MANAGE_PRODUCTS)

  const [data, setData] = React.useState<ProductsData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [q, setQ] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [companyId, setCompanyId] = React.useState('')
  const [lowOnly, setLowOnly] = React.useState(false)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Product | null>(null)
  const [reorderOpen, setReorderOpen] = React.useState(false)
  const [exportBusy, setExportBusy] = React.useState(false)
  const canOrder = canUser(user.roles, PERMISSIONS.MANAGE_ORDERS)
  const canExport = canUser(user.roles, PERMISSIONS.ACCOUNTING) || canUser(user.roles, PERMISSIONS.VIEW_REPORTS)

  async function downloadStockXlsx() {
    setExportBusy(true)
    try {
      const stored = getStoredUser()
      const res = await fetch('/api/products/export-stock', { headers: { Authorization: `Bearer ${stored?.token || ''}` } })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'خطا در تولید فایل')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `zeytoon-stock-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: 'خروجی موجودی آماده است 📦', description: 'فایل اکسل دانلود شد — در آرشیو خروجی‌های حسابداری هم ثبت شد.' })
    } catch (e) {
      toast({ title: 'دریافت فایل ناموفق بود', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setExportBusy(false)
    }
  }

  const load = React.useCallback(() => {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (category) params.set('category', category)
    if (companyId) params.set('companyId', companyId)
    if (lowOnly) params.set('lowStock', '1')
    setLoading(true)
    api.get<ProductsData>(`/api/products?${params.toString()}`)
      .then(setData)
      .catch((e) => toast({ title: 'خطا در دریافت محصولات', description: (e as Error).message, variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [q, category, companyId, lowOnly, toast])

  React.useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, refreshKey, q])

  // deep-link hook from the command palette: open a product detail or prefill search
  React.useEffect(() => {
    try {
      const pid = sessionStorage.getItem('zeytoon_open_product')
      if (pid) {
        sessionStorage.removeItem('zeytoon_open_product')
        setDetailId(pid)
      }
      const pq = sessionStorage.getItem('zeytoon_products_query')
      if (pq) {
        sessionStorage.removeItem('zeytoon_products_query')
        setQ(pq)
      }
    } catch { /* private mode */ }
  }, [])

  const refresh = () => setRefreshKey((k) => k + 1)
  const alertCount = data ? data.stats.critical + data.stats.low : 0

  return (
    <div>
      <SectionHeader
        title="کاتالوگ کالاها"
        subtitle="مدیریت محصولات، موجودی و واردات از هلو"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canExport && (
              <Button variant="outline" className="h-11 gap-1.5 border-gold/40 text-yellow-800 hover:bg-gold/10 dark:text-yellow-200" disabled={exportBusy} onClick={downloadStockXlsx}>
                {exportBusy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} خروجی موجودی
              </Button>
            )}
            {canManage && (
              <Button className="h-11" onClick={() => { setEditing(null); setFormOpen(true) }}>
                <Plus className="size-4" /> محصول جدید
              </Button>
            )}
          </div>
        }
      />

      <Tabs defaultValue="catalog">
        <TabsList className="mb-4 h-11">
          <TabsTrigger value="catalog" className="gap-1.5 px-4"><Boxes className="size-4" /> کاتالوگ محصولات</TabsTrigger>
          {canManage && (
            <TabsTrigger value="import" className="gap-1.5 px-4"><FileSpreadsheet className="size-4" /> واردات از هلو</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="catalog" className="space-y-4">
          {/* Low stock alert strip */}
          {alertCount > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-300"
              style={{ borderColor: data?.stats.critical ? STOCK_STATUS.CRITICAL.color : STOCK_STATUS.LOW.color, background: data?.stats.critical ? STOCK_STATUS.CRITICAL.bg : STOCK_STATUS.LOW.bg }}>
              <span className="relative flex size-5 items-center justify-center">
                {data?.stats.critical ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: STOCK_STATUS.CRITICAL.color }} /> : null}
                <AlertTriangle className="relative size-5" style={{ color: data?.stats.critical ? STOCK_STATUS.CRITICAL.color : STOCK_STATUS.LOW.color }} />
              </span>
              <span className="font-bold text-sm">
                {toFaDigits(alertCount)} کالا کمبود موجودی دارد
                {data && data.stats.critical > 0 && <span className="text-red-600"> ({toFaDigits(data.stats.critical)} مورد کمبود جدی)</span>}
              </span>
              {canOrder && (
                <Button size="sm" className="h-9 gap-1.5 bg-olive hover:bg-olive/90 text-white shadow-sm" onClick={() => setReorderOpen(true)}>
                  <Wand2 className="size-4" /> پیشنهاد سفارش هوشمند
                </Button>
              )}
              <Button size="sm" variant={lowOnly ? 'default' : 'outline'} className="h-9 mr-auto" onClick={() => setLowOnly((v) => !v)}>
                {lowOnly ? 'نمایش همه' : 'فقط کمبوددارها'}
              </Button>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در نام، بارکد..." className="h-11 pr-9" />
            </div>
            <Select value={companyId || 'all'} onValueChange={(v) => setCompanyId(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-11 w-44"><SelectValue placeholder="همه شرکت‌ها" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه شرکت‌ها</SelectItem>
                {data?.companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Category chips */}
          {data && data.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategory('')}
                className={cn('rounded-full px-3 py-1.5 text-xs font-bold border transition-colors',
                  !category ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent')}
              >
                همه دسته‌ها
              </button>
              {data.categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(category === c ? '' : c)}
                  className={cn('rounded-full px-3 py-1.5 text-xs font-bold border transition-colors',
                    category === c ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent')}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Grid */}
          {loading && !data ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <ProductThumbSkeleton key={i} />)}
            </div>
          ) : !data || data.products.length === 0 ? (
            <EmptyState
              icon={<Package className="size-7 text-olive" />}
              title="محصولی پیدا نشد"
              description={lowOnly ? 'همه کالاها موجودی کافی دارند 🎉' : 'عبارت دیگری جستجو کنید یا فیلترها را تغییر دهید.'}
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {data.products.map((p) => {
                const st = stockStatus(p.stock, p.minStock)
                return (
                  <GlowCard key={p.id} interactive className="overflow-hidden cursor-pointer" >
                    <div role="button" tabIndex={0} onClick={() => setDetailId(p.id)}
                      onKeyDown={(e) => e.key === 'Enter' && setDetailId(p.id)}
                      className="text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-xl">
                      <div className="relative">
                        <ProductAvatar p={p} className="h-32 w-full" />
                        {st !== 'OK' && (
                          <span className="absolute top-2 left-2 size-2.5 rounded-full"
                            style={{ background: STOCK_STATUS[st].color, boxShadow: `0 0 0 3px ${STOCK_STATUS[st].bg}` }} aria-label={STOCK_STATUS[st].label} />
                        )}
                      </div>
                      <div className="p-3 space-y-1.5">
                        <div className="font-bold text-sm line-clamp-1">{p.name}</div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="truncate">{p.company?.name || p.category || '—'}</span>
                          {p.barcode && (
                            <span className="font-mono tabular-nums shrink-0" dir="ltr">{toFaDigits(p.barcode)}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <Money value={p.price} className="font-extrabold text-sm" />
                          <StockBadge stock={p.stock} minStock={p.minStock} unit={p.unit} />
                        </div>
                      </div>
                    </div>
                  </GlowCard>
                )
              })}
            </div>
          )}
        </TabsContent>

        {canManage && (
          <TabsContent value="import">
            <ImportHolooTab onApplied={refresh} />
          </TabsContent>
        )}
      </Tabs>

      <ProductDetailDialog
        productId={detailId}
        onClose={() => setDetailId(null)}
        canManage={canManage}
        onEdit={(p) => { setDetailId(null); setEditing(p); setFormOpen(true) }}
      />
      <ProductFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        companies={data?.companies || []}
        categories={data?.categories || []}
        onSaved={refresh}
      />
      {canOrder && <SmartReorderDialog open={reorderOpen} onOpenChange={setReorderOpen} onCreated={refresh} />}
    </div>
  )
}

// ================= Smart reorder =================

function SmartReorderDialog({ open, onOpenChange, onCreated }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const { toast } = useToast()
  const [data, setData] = React.useState<ReorderData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [saving, setSaving] = React.useState(false)
  const [created, setCreated] = React.useState<CreatedDraft[] | null>(null)
  const [deliveryDate, setDeliveryDate] = React.useState('')
  const [coverage, setCoverage] = React.useState(2)
  const [qty, setQty] = React.useState<Record<string, number>>({})

  const load = React.useCallback(() => {
    setLoading(true)
    setCreated(null)
    setDeliveryDate('')
    api.get<ReorderData>(`/api/orders/smart-reorder?coverage=${coverage}`)
      .then((d) => {
        setData(d)
        setSelected(new Set(d.suppliers.map((g) => g.supplierId)))
        const q: Record<string, number> = {}
        for (const g of d.suppliers) for (const it of g.items) q[it.productId] = it.suggestedQty
        setQty(q)
      })
      .catch((e) => toast({ title: 'خطا در دریافت پیشنهاد', description: (e as Error).message, variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [toast, coverage])

  React.useEffect(() => {
    if (open) load()
  }, [open, load])

  const toggleSupplier = (sid: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sid)) next.delete(sid)
      else next.add(sid)
      return next
    })
  }

  const bumpQty = (pid: string, delta: number, base: number) =>
    setQty((prev) => ({ ...prev, [pid]: Math.max(1, Math.min(9999, Math.round((prev[pid] ?? base) + delta))) }))
  const resetQty = (pid: string, base: number) =>
    setQty((prev) => ({ ...prev, [pid]: base }))

  // live totals honour per-item overrides
  const liveQty = (it: ReorderItem) => qty[it.productId] ?? it.suggestedQty
  const groupTotal = (g: ReorderGroup) => g.items.reduce((s, it) => s + liveQty(it) * it.unitPrice, 0)
  const chosenTotal = data ? data.suppliers.filter((g) => selected.has(g.supplierId)).reduce((s, g) => s + groupTotal(g), 0) : 0
  const chosenItems = data ? data.suppliers.filter((g) => selected.has(g.supplierId)).reduce((s, g) => s + g.items.length, 0) : 0
  const tweakedCount = data ? data.suppliers.reduce((s, g) => s + g.items.filter((it) => liveQty(it) !== it.suggestedQty).length, 0) : 0

  const submit = async () => {
    setSaving(true)
    try {
      const overrides: Record<string, number> = {}
      if (data) for (const g of data.suppliers) for (const it of g.items) {
        const q = liveQty(it)
        if (q !== it.suggestedQty) overrides[it.productId] = q
      }
      const res = await api.post<{ ok: boolean; created: CreatedDraft[] }>('/api/orders/smart-reorder', {
        supplierIds: [...selected],
        deliveryDate: deliveryDate || undefined,
        coverage,
        overrides: Object.keys(overrides).length ? overrides : undefined,
      })
      setCreated(res.created)
      onCreated()
      toast({ title: `${toFaDigits(res.created.length)} پیش‌نویس سفارش ثبت شد ✨`, description: 'پیشنهادها در بخش سفارشات آماده بررسی و ارسال هستند.' })
    } catch (e) {
      toast({ title: 'خطا در ثبت پیش‌نویس‌ها', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto nice-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="size-9 rounded-xl bg-olive/12 text-olive flex items-center justify-center"><Wand2 className="size-5" /></span>
            پیشنهاد سفارش هوشمند
          </DialogTitle>
          <DialogDescription>
            سامانه کالاهای کمبوددار را بررسی کرد و برای هر تأمین‌کننده یک پیش‌نویس سفارش آماده می‌کند.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />)}
          </div>
        ) : created ? (
          <div className="py-2 space-y-3">
            <div className="rounded-2xl border border-olive/30 bg-olive/8 p-4 text-center">
              <CheckCircle2 className="size-10 text-olive mx-auto mb-2" />
              <div className="font-black text-olive">{toFaDigits(created.length)} پیش‌نویس سفارش با موفقیت ثبت شد</div>
              <div className="text-xs text-muted-foreground mt-1">پیشنهادها در بخش «سفارشات» با وضعیت پیش‌نویس آماده بررسی هستند.</div>
            </div>
            <div className="space-y-2">
              {created.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 animate-in fade-in slide-in-from-bottom-1" style={{ animationDelay: `${i * 90}ms`, animationFillMode: 'backwards' }}>
                  <span className="size-8 rounded-lg bg-gold/12 text-gold flex items-center justify-center text-xs font-black">#{toFaDigits(c.number)}</span>
                  <span className="flex-1 text-sm font-bold truncate">{c.supplierName}</span>
                  <span className="text-xs text-muted-foreground">{toFaDigits(c.itemCount)} قلم</span>
                  <Money value={c.totalAmount} className="text-sm font-black" />
                </div>
              ))}
            </div>
          </div>
        ) : data ? (
          data.suppliers.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <div className="text-3xl mb-2">🌿</div>
              در حال حاضر کالای کمبودداری نیست — قفسه‌ها سرِ جای خودشان است!
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-red-200 text-red-600 bg-red-50/60">{toFaDigits(data.criticalCount)} کمبود جدی</Badge>
                <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50/60">{toFaDigits(data.productCount)} کالای کمبوددار</Badge>
                <span className="text-[11px] text-muted-foreground">هدف پوشش:</span>
                <div className="inline-flex rounded-xl border border-border bg-muted/40 p-0.5 gap-0.5" role="group" aria-label="هدف پوشش سفارش">
                  {(data.coverages || [1.5, 2, 3]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCoverage(c)}
                      aria-pressed={coverage === c}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-[11px] font-black transition-all active:scale-90',
                        coverage === c ? 'bg-olive text-white shadow-sm' : 'text-muted-foreground hover:text-olive hover:bg-olive/10'
                      )}
                    >
                      {coverageLabel(c)}
                    </button>
                  ))}
                </div>
                {data.orphans.length > 0 && (
                  <span className="text-[11px] text-muted-foreground">بدون تأمین‌کننده: {data.orphans.map((o) => o.name).join('، ')}</span>
                )}
              </div>
              <div className="space-y-2.5 max-h-[46vh] overflow-y-auto nice-scrollbar pl-1">
                {data.suppliers.map((g, gi) => {
                  const checked = selected.has(g.supplierId)
                  return (
                    <div
                      key={g.supplierId}
                      className={cn('rounded-2xl border transition-all animate-in fade-in slide-in-from-bottom-1', checked ? 'border-olive/40 bg-olive/[0.04]' : 'border-border bg-muted/30 opacity-70')}
                      style={{ animationDelay: `${gi * 80}ms`, animationFillMode: 'backwards' }}
                    >
                      <button className="w-full flex items-center gap-2.5 px-3.5 pt-3 pb-2 text-right" onClick={() => toggleSupplier(g.supplierId)} aria-pressed={checked}>
                        <span className={cn('size-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0', checked ? 'bg-olive border-olive text-white' : 'border-muted-foreground/40')}>
                          {checked && <CheckCircle2 className="size-4" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-extrabold truncate">{g.supplierName}</span>
                          <span className="block text-[11px] text-muted-foreground">{toFaDigits(g.items.length)} قلم کالا • {g.paymentType === 'CASH_ON_DELIVERY' ? 'نقدی هنگام تحویل' : 'چک'}</span>
                        </span>
                        <Money value={groupTotal(g)} className="text-sm font-black text-olive shrink-0" />
                      </button>
                      <div className="px-3.5 pb-3 space-y-1.5">
                        {g.items.map((it) => {
                          const q = liveQty(it)
                          const tweaked = q !== it.suggestedQty
                          return (
                            <div key={it.productId} className={cn('flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-all hover:border-olive/40', tweaked ? 'border-gold/50 bg-gold/[0.06]' : 'bg-card border-border/60')}>
                              <span className="flex-1 text-xs font-bold truncate">{it.name}</span>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap hidden sm:inline">
                                موجودی <span className={cn('font-black', it.stock <= it.minStock * 0.5 ? 'text-red-600' : 'text-amber-600')}>{toFaDigits(it.stock)}</span>
                              </span>
                              <span className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 px-1 py-0.5" role="group" aria-label={`تعداد سفارش ${it.name}`}>
                                <button
                                  className="size-5 rounded-md flex items-center justify-center text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-600 active:scale-75 disabled:opacity-40"
                                  onClick={() => bumpQty(it.productId, -1, it.suggestedQty)}
                                  disabled={q <= 1}
                                  aria-label="کاهش تعداد"
                                >
                                  <Minus className="size-3" />
                                </button>
                                <span className={cn('min-w-7 text-center text-xs font-black tabular-nums', tweaked ? 'text-gold' : 'text-olive')}>{toFaDigits(q)}</span>
                                <button
                                  className="size-5 rounded-md flex items-center justify-center text-muted-foreground transition-all hover:bg-olive/15 hover:text-olive active:scale-75"
                                  onClick={() => bumpQty(it.productId, +1, it.suggestedQty)}
                                  aria-label="افزایش تعداد"
                                >
                                  <Plus className="size-3" />
                                </button>
                              </span>
                              {tweaked ? (
                                <button
                                  className="size-5 rounded-md flex items-center justify-center text-gold transition-all hover:bg-gold/15 active:scale-75 animate-in fade-in zoom-in duration-150"
                                  onClick={() => resetQty(it.productId, it.suggestedQty)}
                                  title={`بازگشت به پیشنهاد سامانه (${toFaDigits(it.suggestedQty)})`}
                                  aria-label="بازگشت به پیشنهاد سامانه"
                                >
                                  <RotateCcw className="size-3" />
                                </button>
                              ) : (
                                <span className="w-5" />
                              )}
                              <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap hidden sm:inline w-20 text-left">{formatMoney(q * it.unitPrice)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        ) : null}

        {!created && data && data.suppliers.length > 0 && (
          <DialogFooter className="gap-2 sm:gap-0">
            <div className="w-full rounded-2xl border border-border bg-card/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-bold text-muted-foreground">موعد تحویل پیشنهادی (اختیاری):</div>
              <JalaliDatePicker value={deliveryDate} onChange={setDeliveryDate} placeholder="پیش‌فرض سامانه" />
            </div>
            <div className="w-full flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-gold/8 border border-gold/25 px-4 py-2.5">
              <div className="text-xs text-muted-foreground">
                {toFaDigits(selected.size)} تأمین‌کننده • {toFaDigits(chosenItems)} قلم
                {tweakedCount > 0 && <span className="mr-2 rounded-md bg-gold/15 text-gold px-1.5 py-0.5 font-black">{toFaDigits(tweakedCount)} قلم دستی</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">برآورد کل (پوشش {coverageLabel(coverage)}):</span>
                <Money value={chosenTotal} className="text-base font-black text-gold" />
              </div>
            </div>
            <div className="w-full flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 h-11" onClick={() => onOpenChange(false)}>بعداً</Button>
              <Button className="flex-[2] h-11 gap-1.5 bg-olive hover:bg-olive/90 text-white" disabled={saving || selected.size === 0} onClick={submit}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                ثبت پیش‌نویس سفارش‌ها
              </Button>
            </div>
          </DialogFooter>
        )}
        {created && (
          <DialogFooter>
            <Button className="w-full h-11" onClick={() => onOpenChange(false)}>متوجه شدم</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
