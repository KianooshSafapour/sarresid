'use client'
import * as React from 'react'
import { toast } from 'sonner'
import { Search, Pencil, Plus, Globe, ImagePlus, Upload, Info, PackageSearch, FileSpreadsheet, RotateCcw, Wand2, Tags } from 'lucide-react'
import { api, uploadFile } from '@/lib/api'
import { toFaDigits } from '@/lib/jalali'
import { hasRole, type PUser, type ProductT, type SupplierT } from '@/lib/types'
import {
  Card, SectionHeader, Badge, StockBadge, stockDot, Field, inputCls, PrimaryButton, GoldButton,
  GhostButton, EmptyState, Modal, Money, ProductImage, Spinner,
} from './kit'
import { LowStockDraftModal } from './LowStockDraft'

/* ---------- local types ---------- */
type ParseRow = {
  name: string
  barcode: string
  buyPrice: number
  sellPrice: number
  stock: number
  category: string
  duplicateOfId?: number
  status: 'new' | 'duplicate' | 'invalid'
}
type ParseResult = { rows: ParseRow[]; total: number; invalid: number; duplicates: number; news: number }
type SupplierOpt = { id: number; name: string }
type CompanyOpt = { id: number; name: string }

type PriceRow = {
  barcode: string
  name: string
  productId?: number
  matchedName?: string
  oldBuy?: number
  newBuy?: number
  oldSell?: number
  newSell?: number
  status: 'ok' | 'unchanged' | 'notfound' | 'invalid'
  reason?: string
  supplier?: { id: number; name: string } | null
  supplierStatus?: 'matched' | 'unknown'
  supplierChanged?: boolean
  // percentage-change column — fills EMPTY price cells only (explicit cells win)
  pct?: number
}
type PriceParseResult = { rows: PriceRow[]; total: number; ok: number; unchanged: number; notfound: number; invalid: number }

type ProductForm = {
  name: string; nameFa: string; barcode: string
  buyPrice: string; sellPrice: string; sellPrice2: string; shelfLifeDays: string
  stock: string; minStock: string
  category: string; unit: string
  supplierId: string; companyId: string
  active: boolean; imageUrl: string | null
}

const emptyForm = (): ProductForm => ({
  name: '', nameFa: '', barcode: '',
  buyPrice: '0', sellPrice: '0', sellPrice2: '', shelfLifeDays: '',
  stock: '0', minStock: '10',
  category: '', unit: 'عدد',
  supplierId: '', companyId: '',
  active: true, imageUrl: null,
})

const MANAGE_HINT = 'اینجا مرکز اطلاعات کالاست: قیمت فروش، موجودی و بارکد همه کالاها رو ببین. افزودن یا ویرایش کالا با مدیران محصول است.'

/** downscale an image file via canvas → JPEG dataUrl (max 320px, quality 0.8) */
async function fileToDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('read failed'))
    r.readAsDataURL(file)
  })
  const img = document.createElement('img')
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('decode failed'))
    img.src = dataUrl
  })
  const max = 320
  const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')?.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.8)
}

/** image-search thumbnail with eslint escape */
function Thumb({ src, name, onClick }: { src: string; name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-16 w-16 overflow-hidden rounded-lg border border-[#E4DCC8] bg-white p-0 transition hover:ring-2 hover:ring-[#93C572]"
      title="انتخاب این تصویر"
    >
      <img src={src} alt={name} className="h-full w-full object-cover" />
    </button>
  )
}

function StatusChip({ status }: { status: ParseRow['status'] }) {
  if (status === 'new') return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">جدید</Badge>
  if (status === 'duplicate') return <Badge className="border-amber-200 bg-amber-50 text-amber-700">تکراری</Badge>
  return <Badge className="border-rose-200 bg-rose-50 text-rose-700">نامعتبر</Badge>
}

/** shimmer placeholder block (cream/stone sweep — .pz-skeleton in globals.css) */
function SkeletonBlock({ className }: { className?: string }) {
  return <div aria-hidden className={`pz-skeleton ${className ?? ''}`} />
}

/** skeleton card mirroring the real product card layout (image, 2 text lines, price, stock) */
function ProductCardSkeleton() {
  return (
    <Card className="flex flex-col gap-2 p-4" aria-hidden>
      <div className="flex items-start justify-between gap-2">
        <SkeletonBlock className="h-14 w-14" />
        <SkeletonBlock className="h-5 w-16" />
      </div>
      <div className="min-w-0">
        <SkeletonBlock className="h-4 w-3/4" />
        <SkeletonBlock className="mt-1.5 h-3 w-1/2" />
      </div>
      <SkeletonBlock className="h-3 w-2/5" />
      <div className="flex items-center justify-between gap-2">
        <SkeletonBlock className="h-4 w-16" />
        <SkeletonBlock className="h-5 w-14" />
      </div>
      <div className="mt-auto flex items-end justify-between border-t border-[#EFEAD8] pt-2">
        <SkeletonBlock className="h-8 w-16" />
        <SkeletonBlock className="h-3 w-10" />
      </div>
    </Card>
  )
}

export default function ProductsSection({ user }: { user: PUser }) {
  const manage =
    hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'PRODUCT_MANAGER') ||
    hasRole(user, 'OPERATION_MANAGER') || hasRole(user, 'IT_ADMIN')

  /* ---------- list state ---------- */
  const [products, setProducts] = React.useState<ProductT[]>([])
  const [categories, setCategories] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(true)
  const [qInput, setQInput] = React.useState('')
  const [q, setQ] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [low, setLow] = React.useState(false)
  const [draftOpen, setDraftOpen] = React.useState(false)

  React.useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 400)
    return () => clearTimeout(t)
  }, [qInput])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '500' })
      if (q) params.set('q', q)
      if (category) params.set('category', category)
      if (low) params.set('low', '1')
      const data = await api.get<{ products: ProductT[]; categories: string[] }>(`/api/products?${params.toString()}`)
      setProducts(data.products ?? [])
      setCategories(data.categories ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت کالاها')
    } finally {
      setLoading(false)
    }
  }, [q, category, low])

  React.useEffect(() => { void load() }, [load])

  /* ---------- edit modal ---------- */
  const [editOpen, setEditOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ProductT | null>(null) // null = new
  const [form, setForm] = React.useState<ProductForm>(emptyForm())
  const [saving, setSaving] = React.useState(false)
  const [suppliers, setSuppliers] = React.useState<SupplierOpt[]>([])
  const [companies, setCompanies] = React.useState<CompanyOpt[]>([])

  React.useEffect(() => {
    if (!manage) return
    void (async () => {
      try {
        const [s, c] = await Promise.all([
          api.get<{ suppliers: SupplierT[] }>('/api/suppliers'),
          api.get<{ companies: CompanyOpt[] }>('/api/companies'),
        ])
        setSuppliers((s.suppliers ?? []).map((x) => ({ id: x.id, name: x.name })))
        setCompanies(c.companies ?? [])
      } catch { /* selects stay empty */ }
    })()
  }, [manage])

  const openEdit = (p: ProductT | null) => {
    setEditing(p)
    setForm(p ? {
      name: p.name, nameFa: p.nameFa ?? '', barcode: p.barcode ?? '',
      buyPrice: String(p.buyPrice ?? 0), sellPrice: String(p.sellPrice ?? 0),
      sellPrice2: p.sellPrice2 != null ? String(p.sellPrice2) : '',
      shelfLifeDays: p.shelfLifeDays != null ? String(p.shelfLifeDays) : '',
      stock: String(p.stock ?? 0), minStock: String(p.minStock ?? 10),
      category: p.category ?? '', unit: p.unit ?? 'عدد',
      supplierId: p.supplierId ? String(p.supplierId) : '',
      companyId: p.companyId ? String(p.companyId) : '',
      active: p.active, imageUrl: p.imageUrl ?? null,
    } : emptyForm())
    setImgResults([])
    setEditOpen(true)
  }

  const setF = (k: keyof ProductForm, v: string | boolean | null) => setForm((f) => ({ ...f, [k]: v }))

  const saveProduct = async () => {
    if (!form.name.trim()) { toast.error('نام محصول الزامی است'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        nameFa: form.nameFa.trim() || null,
        barcode: form.barcode.trim() || null,
        buyPrice: Number(form.buyPrice) || 0,
        sellPrice: Number(form.sellPrice) || 0,
        sellPrice2: form.sellPrice2 !== '' ? Number(form.sellPrice2) : null,
        shelfLifeDays: form.shelfLifeDays !== '' ? Number(form.shelfLifeDays) : null,
        stock: Number(form.stock) || 0,
        minStock: Number(form.minStock) || 0,
        category: form.category.trim() || null,
        unit: form.unit.trim() || 'عدد',
        supplierId: form.supplierId ? Number(form.supplierId) : null,
        companyId: form.companyId ? Number(form.companyId) : null,
        active: form.active,
        imageUrl: form.imageUrl,
        userId: user.id,
        userName: user.name,
      }
      if (editing?.id) {
        await api.patch('/api/products', { id: editing.id, ...payload })
        toast.success('محصول بروزرسانی شد')
      } else {
        await api.post('/api/products', payload)
        toast.success('محصول جدید ثبت شد')
      }
      setEditOpen(false)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ذخیره محصول')
    } finally {
      setSaving(false)
    }
  }

  /* ---------- image tools ---------- */
  const [imgResults, setImgResults] = React.useState<string[]>([])
  const [imgBusy, setImgBusy] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const searchImages = async () => {
    const query = (form.name || '').trim()
    if (!query) { toast.error('اول نام محصول را بنویسید'); return }
    setImgBusy(true)
    try {
      const res = await api.post<{ images: string[]; error?: string }>('/api/products/image-search', { query })
      if (!res.images?.length) {
        toast.info('جستجوی وب در دسترس نیست')
        setImgResults([])
      } else {
        setImgResults(res.images)
        toast.success(`${toFaDigits(res.images.length)} تصویر پیدا شد`)
      }
    } catch {
      toast.info('جستجوی وب در دسترس نیست')
    } finally {
      setImgBusy(false)
    }
  }

  const applyImage = async (imageUrl: string) => {
    setForm((f) => ({ ...f, imageUrl }))
    if (editing?.id) {
      try {
        await api.patch('/api/products/image', { id: editing.id, imageUrl, userId: user.id, userName: user.name })
        toast.success('تصویر بروزرسانی شد')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'خطا در ثبت تصویر')
      }
    }
    setProducts((ps) => ps.map((p) => (editing?.id && p.id === editing.id ? { ...p, imageUrl } : p)))
  }

  const onPickFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      await applyImage(dataUrl)
      if (!editing?.id) toast.success('تصویر پیوست شد — با ذخیره محصول ثبت می‌شود')
    } catch {
      toast.error('خواندن تصویر ناموفق بود')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /* ---------- import wizard (Holoo Excel) ---------- */
  const [importOpen, setImportOpen] = React.useState(false)
  const [parsing, setParsing] = React.useState(false)
  const [parsed, setParsed] = React.useState<ParseResult | null>(null)
  const [fileName, setFileName] = React.useState('')
  const [mergeOpt, setMergeOpt] = React.useState<'fill-empty' | 'merge-stock'>('fill-empty')
  const [committing, setCommitting] = React.useState(false)
  const xlsxRef = React.useRef<HTMLInputElement>(null)

  const openImport = () => { setParsed(null); setFileName(''); setMergeOpt('fill-empty'); setImportOpen(true) }

  const onXlsx = async (file: File | undefined) => {
    if (!file) return
    setFileName(file.name)
    setParsing(true)
    try {
      const res = await uploadFile<ParseResult>('/api/products/parse', file)
      setParsed(res)
      if (!res.rows?.length) toast.info('ردیفی در فایل پیدا نشد')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در پردازش فایل')
    } finally {
      setParsing(false)
      if (xlsxRef.current) xlsxRef.current.value = ''
    }
  }

  const commitImport = async () => {
    if (!parsed?.rows?.length) return
    setCommitting(true)
    try {
      const rows = parsed.rows.map((r) =>
        mergeOpt === 'merge-stock' && r.status === 'duplicate' ? { ...r, action: 'merge-stock' } : r
      )
      const res = await api.post<{ created: number; merged: number; skipped: number }>('/api/products/commit', {
        rows,
        userId: user.id,
        userName: user.name,
      })
      toast.success(`ورود انجام شد — جدید: ${toFaDigits(res.created)} | ادغام: ${toFaDigits(res.merged)} | رد شده: ${toFaDigits(res.skipped)}`)
      setImportOpen(false)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ورود اطلاعات')
    } finally {
      setCommitting(false)
    }
  }

  /* ---------- price-list import (supplier Excel) ---------- */
  const [priceOpen, setPriceOpen] = React.useState(false)
  const [priceParsing, setPriceParsing] = React.useState(false)
  const [priceParsed, setPriceParsed] = React.useState<PriceParseResult | null>(null)
  const [priceFileName, setPriceFileName] = React.useState('')
  const [priceCommitting, setPriceCommitting] = React.useState(false)
  const priceFileRef = React.useRef<HTMLInputElement>(null)

  const openPriceImport = () => { setPriceParsed(null); setPriceFileName(''); setPriceOpen(true) }

  const onPriceFile = async (file: File | undefined) => {
    if (!file) return
    setPriceFileName(file.name)
    setPriceParsing(true)
    try {
      const res = await uploadFile<PriceParseResult>('/api/products/prices', file)
      setPriceParsed(res)
      if (!res.rows?.length) toast.info('ردیفی در فایل پیدا نشد')
      else toast.success(`${toFaDigits(res.ok)} تغییر قیمت پیدا شد`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در پردازش فایل قیمت')
    } finally {
      setPriceParsing(false)
      if (priceFileRef.current) priceFileRef.current.value = ''
    }
  }

  const commitPrices = async () => {
    if (!priceParsed?.rows?.length) return
    // price changes from 'ok' rows + supplier reassignments (also from 'unchanged' rows
    // whose matched supplier differs from the product's current one)
    const okRows = priceParsed.rows
      .filter((r) => (r.status === 'ok' || (r.status === 'unchanged' && r.supplierChanged)) && r.productId)
      .map((r) => ({
        productId: r.productId!,
        newBuy: r.newBuy,
        newSell: r.newSell,
        supplierId: r.supplierStatus === 'matched' ? r.supplier?.id : undefined,
      }))
    if (okRows.length === 0) { toast.error('تغییری برای ثبت نیست'); return }
    setPriceCommitting(true)
    try {
      const res = await api.post<{ updated: number; buyChanges: number; sellChanges: number; supplierChanges?: number }>('/api/products/prices', {
        rows: okRows,
        userId: user.id,
      })
      toast.success(
        `${toFaDigits(res.updated)} کالا بروزرسانی شد (خرید: ${toFaDigits(res.buyChanges)} — فروش: ${toFaDigits(res.sellChanges)}${res.supplierChanges ? ` — تأمین‌کننده: ${toFaDigits(res.supplierChanges)}` : ''}) ✓`
      )
      setPriceOpen(false)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ثبت قیمت‌ها')
    } finally {
      setPriceCommitting(false)
    }
  }

  /* ---------- render ---------- */
  // rows whose supplier will be reassigned on commit (preview-time server comparison)
  const supplierChangeCount = priceParsed?.rows.filter((r) => r.supplierChanged).length ?? 0
  return (
    <div>
      <SectionHeader
        title="کالاها | Products"
        subtitle="مرجع قیمت، بارکد و موجودی فروشگاه"
        icon={<PackageSearch className="h-5 w-5" />}
        actions={
          manage ? (
            <>
              <GoldButton onClick={openImport} className="min-h-[44px]">
                <FileSpreadsheet className="h-4 w-4" /> ورود از Holoo (Excel)
              </GoldButton>
              <GhostButton onClick={openPriceImport} className="min-h-[44px] border-[#EAD9A8] bg-[#FBF6E8] text-[#8A6508] hover:bg-[#F5EDD3]" title="بروزرسانی گروهی قیمت خرید/فروش از فایل تأمین‌کننده">
                <Tags className="h-4 w-4" /> ورود قیمت‌ها (Excel)
              </GhostButton>
              <PrimaryButton onClick={() => openEdit(null)} className="min-h-[44px]">
                <Plus className="h-4 w-4" /> کالای جدید
              </PrimaryButton>
            </>
          ) : undefined
        }
      />

      {!manage && (
        <Card className="mb-4 flex items-start gap-3 border-[#EAD9A8] bg-[#FBF6E8] p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#B8860B]" />
          <p className="text-sm leading-6 text-[#6B5B2A]">{MANAGE_HINT}</p>
        </Card>
      )}

      {/* filters */}
      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8A28C]" />
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="جستجو: نام، نام فارسی یا بارکد…"
                className={`${inputCls} min-h-[44px] pr-9`}
                aria-label="جستجوی کالا"
              />
            </div>
            <GhostButton
              onClick={() => setLow((v) => !v)}
              className={`min-h-[44px] shrink-0 ${low ? 'border-[#B45309] bg-amber-50 text-amber-800' : ''}`}
              aria-pressed={low}
            >
              <PackageSearch className="h-4 w-4" /> کمبود موجودی
            </GhostButton>
            {manage && (
              <GhostButton
                onClick={() => setDraftOpen(true)}
                className="min-h-[44px] shrink-0 border-[#EAD9A8] bg-[#FBF6E8] text-[#8A6508] hover:bg-[#F5EDD3]"
                title="ساخت یک‌جای پیش‌نویس سفارش برای همه کمبودها"
              >
                <Wand2 className="h-4 w-4" /> سفارش خودکار
              </GhostButton>
            )}
            <span className="shrink-0 rounded-full border border-[#E4DCC8] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7A66]">
              {toFaDigits(products.length)} کالا
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pz-scroll">
            <button
              type="button"
              onClick={() => setCategory('')}
              className={`min-h-[36px] shrink-0 rounded-full border px-3.5 text-xs font-semibold transition ${category === '' ? 'border-[#3E6B4A] bg-[#3E6B4A] text-white' : 'border-[#E4DCC8] bg-white text-[#4A5A44] hover:border-[#5F8F55]'}`}
            >
              همه دسته‌ها
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(category === c ? '' : c)}
                className={`min-h-[36px] shrink-0 rounded-full border px-3.5 text-xs font-semibold transition ${category === c ? 'border-[#3E6B4A] bg-[#3E6B4A] text-white' : 'border-[#E4DCC8] bg-white text-[#4A5A44] hover:border-[#5F8F55]'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading ? (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
          role="status"
          aria-label="در حال دریافت کالاها…"
          data-products-skeleton
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState icon={<PackageSearch className="h-10 w-10" />} title="کالایی پیدا نشد" hint="فیلترها را عوض کنید یا جستجوی دیگری امتحان کنید." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {products.map((p) => (
            <Card key={p.id} className="relative flex flex-col gap-2 p-4">
              {manage && (
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="absolute end-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full border border-[#E4DCC8] bg-white text-[#4A5A44] shadow-sm transition hover:border-[#5F8F55] hover:text-[#3E6B4A]"
                  title="ویرایش کالا"
                  aria-label={`ویرایش ${p.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              <ProductImage src={p.imageUrl} name={p.name} size={56} />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-[#253A2A]" title={p.name}>{p.name}</div>
                {p.nameFa && <div className="truncate text-xs text-[#6B7A66]" title={p.nameFa}>{p.nameFa}</div>}
              </div>
              {p.barcode && <div className="pz-barcode text-xs text-[#8A9884]">{p.barcode}</div>}
              <div className="flex items-center justify-between gap-2">
                <Money value={p.sellPrice} className="text-sm font-bold text-[#8A6508]" />
                <StockBadge stock={p.stock} minStock={p.minStock} />
              </div>
              <div className="mt-auto flex items-end justify-between border-t border-[#EFEAD8] pt-2">
                <div className="flex items-baseline gap-1">
                  <span className={`text-3xl font-black leading-none tabular-nums ${stockDot(p.stock, p.minStock)}`}>
                    {toFaDigits(Math.floor(p.stock))}
                  </span>
                  {p.unit && <span className="text-[10px] text-[#8A9884]">{p.unit}</span>}
                </div>
                <span className="text-[10px] font-medium text-[#8A9884]">موجودی</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ---------- edit / add modal ---------- */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} wide title={editing ? `ویرایش: ${editing.name}` : 'کالای جدید'}>
        <div className="space-y-4">
          {/* image tools */}
          <div className="rounded-2xl border border-[#E4DCC8] bg-white/70 p-4">
            <div className="flex items-center gap-3">
              <ProductImage src={form.imageUrl} name={form.name || 'محصول'} size={72} />
              <div className="flex flex-1 flex-wrap gap-2">
                <GhostButton onClick={searchImages} disabled={imgBusy || uploading} className="min-h-[44px]">
                  {imgBusy ? <Spinner /> : <Globe className="h-4 w-4" />} جستجوی عکس در وب | Find image online
                </GhostButton>
                <GhostButton onClick={() => fileRef.current?.click()} disabled={uploading || imgBusy} className="min-h-[44px]">
                  {uploading ? <Spinner /> : <ImagePlus className="h-4 w-4" />} بارگذاری عکس از دستگاه
                </GhostButton>
                {form.imageUrl && (
                  <GhostButton onClick={() => setF('imageUrl', null)} className="min-h-[44px]">
                    <RotateCcw className="h-4 w-4" /> حذف عکس
                  </GhostButton>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onPickFile(e.target.files?.[0])}
                  aria-hidden
                />
              </div>
            </div>
            {imgResults.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-y-auto pz-scroll p-1" style={{ maxHeight: '10rem' }}>
                {imgResults.map((u) => (
                  <Thumb key={u} src={u} name={form.name} onClick={() => void applyImage(u)} />
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="نام (انگلیسی)" required>
              <input value={form.name} onChange={(e) => setF('name', e.target.value)} className={inputCls} placeholder="Kalleh Milk 1L" />
            </Field>
            <Field label="نام فارسی">
              <input value={form.nameFa} onChange={(e) => setF('nameFa', e.target.value)} className={inputCls} placeholder="شیر کاله ۱ لیتری" />
            </Field>
            <Field label="بارکد">
              <input value={form.barcode} onChange={(e) => setF('barcode', e.target.value)} className={`${inputCls} pz-barcode`} placeholder="6260…" dir="ltr" />
            </Field>
            <Field label="دسته">
              <input value={form.category} onChange={(e) => setF('category', e.target.value)} className={inputCls} list="pz-category-list" placeholder="لبنیات" />
              <datalist id="pz-category-list">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Field>
            <Field label="قیمت خرید (تومان)">
              <input type="number" min={0} value={form.buyPrice} onChange={(e) => setF('buyPrice', e.target.value)} className={inputCls} dir="ltr" />
            </Field>
            <Field label="قیمت فروش (تومان)">
              <input type="number" min={0} value={form.sellPrice} onChange={(e) => setF('sellPrice', e.target.value)} className={inputCls} dir="ltr" />
            </Field>
            <Field label="قیمت فروش ۲ (تخفیف‌دار)">
              <input type="number" min={0} value={form.sellPrice2} onChange={(e) => setF('sellPrice2', e.target.value)} className={inputCls} dir="ltr" placeholder="اختیاری" />
            </Field>
            <Field label="واحد">
              <input value={form.unit} onChange={(e) => setF('unit', e.target.value)} className={inputCls} placeholder="عدد / بسته / کیلو" />
            </Field>
            <Field label="موجودی">
              <input type="number" value={form.stock} onChange={(e) => setF('stock', e.target.value)} className={inputCls} dir="ltr" />
            </Field>
            <Field label="حداقل موجودی" hint="زیر این عدد، در تب کمبود موجودی انبار می‌آید">
              <input type="number" value={form.minStock} onChange={(e) => setF('minStock', e.target.value)} className={inputCls} dir="ltr" />
            </Field>
            <Field label="عمر مفید (روز)" hint="برای کالاهای فاسدشدنی — مبنای هشدار انقضا (FEFO) در انبار">
              <input type="number" min={0} value={form.shelfLifeDays} onChange={(e) => setF('shelfLifeDays', e.target.value)} className={inputCls} dir="ltr" placeholder="اختیاری" />
            </Field>
            <Field label="شرکت / برند">
              <select value={form.companyId} onChange={(e) => setF('companyId', e.target.value)} className={inputCls}>
                <option value="">— بدون شرکت —</option>
                {companies.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="تامین‌کننده">
              <select value={form.supplierId} onChange={(e) => setF('supplierId', e.target.value)} className={inputCls}>
                <option value="">— بدون تامین‌کننده —</option>
                {suppliers.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#4A5A44]">
            <input type="checkbox" checked={form.active} onChange={(e) => setF('active', e.target.checked)} className="h-4 w-4 accent-[#3E6B4A]" />
            فعال (در فروش و نمایش باشد)
          </label>

          <div className="flex justify-end gap-2 border-t border-[#EFEAD8] pt-3">
            <GhostButton onClick={() => setEditOpen(false)} className="min-h-[44px]">انصراف</GhostButton>
            <PrimaryButton onClick={() => void saveProduct()} disabled={saving} className="min-h-[44px]">
              {saving ? <Spinner /> : <Plus className="h-4 w-4" />} ذخیره محصول
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* ---------- import wizard ---------- */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} wide title="ورود گروهی از Holoo (Excel)">
        <div className="space-y-4">
          {/* Step A — file + preview */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#253A2A]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3E6B4A] text-xs text-white">۱</span>
              انتخاب فایل اکسل
            </div>
            <input
              ref={xlsxRef}
              type="file"
              accept=".xls,.xlsx,.csv"
              className="hidden"
              onChange={(e) => void onXlsx(e.target.files?.[0])}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => xlsxRef.current?.click()}
              className="flex min-h-[88px] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[#D8D2BC] bg-white/70 px-4 py-4 text-center transition hover:border-[#5F8F55] hover:bg-[#F3F7EF]"
            >
              <Upload className="h-5 w-5 text-[#5F8F55]" />
              <span className="text-sm font-semibold text-[#4A5A44]">
                {fileName ? fileName : 'فایل خروجی Holoo را بکشید یا کلیک کنید (.xlsx / .csv)'}
              </span>
              {parsing && <span className="flex items-center gap-2 text-xs text-[#8A9884]"><Spinner /> در حال پردازش فایل…</span>}
            </button>
          </div>

          {parsed && (
            <>
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#253A2A]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3E6B4A] text-xs text-white">۲</span>
                  بازبینی ردیف‌ها
                </div>
                <div className="mb-2 flex flex-wrap gap-2 text-xs">
                  <Badge className="border-[#E4DCC8] bg-white text-[#4A5A44]">کل: {toFaDigits(parsed.total)}</Badge>
                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">جدید: {toFaDigits(parsed.news)}</Badge>
                  <Badge className="border-amber-200 bg-amber-50 text-amber-700">تکراری: {toFaDigits(parsed.duplicates)}</Badge>
                  <Badge className="border-rose-200 bg-rose-50 text-rose-700">نامعتبر: {toFaDigits(parsed.invalid)}</Badge>
                </div>
                <div className="max-h-80 overflow-y-auto pz-scroll rounded-2xl">
                  <table className="w-full min-w-[560px] text-right text-xs">
                    <thead>
                      <tr className="bg-[#F5F2E8] text-[#4A5A44]">
                        <th className="border-b border-[#E4DCC8] px-2 py-2 font-bold">وضعیت</th>
                        <th className="border-b border-[#E4DCC8] px-2 py-2 font-bold">نام</th>
                        <th className="border-b border-[#E4DCC8] px-2 py-2 font-bold">بارکد</th>
                        <th className="border-b border-[#E4DCC8] px-2 py-2 font-bold">خرید</th>
                        <th className="border-b border-[#E4DCC8] px-2 py-2 font-bold">فروش</th>
                        <th className="border-b border-[#E4DCC8] px-2 py-2 font-bold">موجودی</th>
                        <th className="border-b border-[#E4DCC8] px-2 py-2 font-bold">دسته</th>
                        <th className="border-b border-[#E4DCC8] px-2 py-2 font-bold">ادغام با</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.map((r, i) => (
                        <tr key={`${r.barcode}-${i}`} className="bg-white even:bg-[#FBF9F3]">
                          <td className="border-b border-[#EFEAD8] px-2 py-1.5"><StatusChip status={r.status} /></td>
                          <td className="max-w-40 truncate border-b border-[#EFEAD8] px-2 py-1.5 font-medium" title={r.name}>{r.name || '—'}</td>
                          <td className="pz-barcode border-b border-[#EFEAD8] px-2 py-1.5" dir="ltr">{r.barcode || '—'}</td>
                          <td className="border-b border-[#EFEAD8] px-2 py-1.5 tabular-nums">{toFaDigits(r.buyPrice)}</td>
                          <td className="border-b border-[#EFEAD8] px-2 py-1.5 tabular-nums">{toFaDigits(r.sellPrice)}</td>
                          <td className="border-b border-[#EFEAD8] px-2 py-1.5 tabular-nums">{toFaDigits(r.stock)}</td>
                          <td className="border-b border-[#EFEAD8] px-2 py-1.5">{r.category || '—'}</td>
                          <td className="border-b border-[#EFEAD8] px-2 py-1.5">
                            {r.duplicateOfId ? <span className="font-bold text-amber-700">#{toFaDigits(r.duplicateOfId)}</span> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Step B — merge option + commit */}
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#253A2A]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3E6B4A] text-xs text-white">۳</span>
                  رفتار اقلام تکراری
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${mergeOpt === 'fill-empty' ? 'border-[#3E6B4A] bg-[#F3F7EF] font-semibold text-[#3E6B4A]' : 'border-[#E4DCC8] bg-white text-[#4A5A44]'}`}>
                    <input type="radio" name="merge-opt" checked={mergeOpt === 'fill-empty'} onChange={() => setMergeOpt('fill-empty')} className="h-4 w-4 accent-[#3E6B4A]" />
                    فقط فیلدهای خالی را پر کن (پیش‌فرض)
                  </label>
                  <label className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${mergeOpt === 'merge-stock' ? 'border-[#3E6B4A] bg-[#F3F7EF] font-semibold text-[#3E6B4A]' : 'border-[#E4DCC8] bg-white text-[#4A5A44]'}`}>
                    <input type="radio" name="merge-opt" checked={mergeOpt === 'merge-stock'} onChange={() => setMergeOpt('merge-stock')} className="h-4 w-4 accent-[#3E6B4A]" />
                    موجودی اقلام تکراری اضافه شود
                  </label>
                </div>
                <div className="mt-3 flex justify-end">
                  <PrimaryButton onClick={() => void commitImport()} disabled={committing || !parsed.rows.length} className="min-h-[44px]">
                    {committing ? <Spinner /> : <FileSpreadsheet className="h-4 w-4" />} ثبت نهایی ورود اطلاعات
                  </PrimaryButton>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ---------- low-stock auto-draft modal ---------- */}
      <LowStockDraftModal user={user} open={draftOpen} onClose={() => setDraftOpen(false)} />

      {/* ---------- price-list import modal ---------- */}
      <Modal open={priceOpen} onClose={() => setPriceOpen(false)} wide title="ورود گروهی قیمت‌ها | Bulk price import">
        <div className="space-y-4">
          {!priceParsed ? (
            <>
              <div className="rounded-xl border border-[#EAD9A8] bg-[#FBF6E8] px-4 py-3 text-xs leading-6 text-[#6B5B2A]">
                فایل اکسل لیست قیمت تأمین‌کننده را بارگذاری کنید. ستون‌های شناسایی‌شده:
                <b> بارکد / نام کالا / قیمت خرید / قیمت فروش</b> — کالاها با بارکد و بعد نام مطابقت داده می‌شوند و فقط قیمت‌های تغییر یافته ثبت می‌شوند.
                ستون اختیاری <b>تأمین‌کننده</b> در صورت وجود، تأمین‌کنندهٔ هر کالا را بروزرسانی می‌کند.
                ستون اختیاری <b>درصد تغییر</b> هم پشتیبانی می‌شود — با آن، هر دو قیمتِ خالیِ همان ردیف به همان درصد تغییر می‌کند (قیمت صریح همیشه اولویت دارد).
              </div>
              <label className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[#D8D2BC] bg-white transition hover:border-[#B8860B] hover:bg-[#FDFBF3]">
                <Upload className="h-6 w-6 text-[#B8860B]" />
                <span className="text-sm font-bold text-[#4A5A44]">{priceFileName || 'انتخاب فایل Excel (xlsx / xls / csv)'}</span>
                {priceFileName && <span className="text-[11px] text-[#8A9884]">برای تغییر، فایل دیگری انتخاب کنید</span>}
                <input
                  ref={priceFileRef}
                  type="file"
                  accept=".xls,.xlsx,.csv"
                  className="hidden"
                  onChange={(e) => void onPriceFile(e.target.files?.[0])}
                />
              </label>
              {priceParsing && (
                <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[#6B7A66]">
                  <Spinner /> در حال پردازش فایل…
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">{toFaDigits(priceParsed.ok)} تغییر جدید</Badge>
                <Badge className="border-[#E4DCC8] bg-white text-[#6B7A66]">{toFaDigits(priceParsed.unchanged)} بدون تغییر</Badge>
                <Badge className="border-amber-200 bg-amber-50 text-amber-700">{toFaDigits(priceParsed.notfound)} پیدا نشد</Badge>
                <Badge className="border-rose-200 bg-rose-50 text-rose-700">{toFaDigits(priceParsed.invalid)} نامعتبر</Badge>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-xl border border-[#E4DCC8] bg-white pz-scroll">
                <table className="w-full text-right text-xs">
                  <thead className="sticky top-0 bg-[#F5F2E8] text-[#4A5A44]">
                    <tr>
                      <th className="px-3 py-2 font-bold">کالا</th>
                      <th className="px-3 py-2 font-bold">قیمت خرید</th>
                      <th className="px-3 py-2 font-bold">قیمت فروش</th>
                      <th className="px-3 py-2 font-bold">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEAD8]">
                    {priceParsed.rows.map((r, i) => (
                      <tr key={`${r.barcode}-${r.name}-${i}`} className={r.status === 'ok' ? 'bg-emerald-50/40' : r.status === 'invalid' || r.status === 'notfound' ? 'opacity-60' : ''}>
                        <td className="px-3 py-2">
                          <div className="flex items-start gap-1.5">
                            <div className="min-w-0 flex-1 truncate font-bold text-[#253A2A]" dir="auto">{r.matchedName || r.name || r.barcode || '—'}</div>
                            {r.pct !== undefined && (
                              <span className="shrink-0" data-pct-chip title="درصد تغییر از ستون فایل — فقط خانه‌های خالی قیمت را پر می‌کند">
                                <Badge className="border-[#EAD9A8] bg-[#FBF6E8] text-[#8A6508]">
                                  {r.pct > 0 ? `${toFaDigits(r.pct)}٪+` : r.pct < 0 ? `${toFaDigits(Math.abs(r.pct))}٪-` : '۰٪'}
                                </Badge>
                              </span>
                            )}
                          </div>
                          {r.barcode && <div className="pz-barcode text-[10px] text-[#8A9884]">{r.barcode}</div>}
                          {r.supplierStatus === 'matched' && r.supplier && (
                            <div className="mt-1" title="تأمین‌کننده شناسایی‌شده از ستون فایل">
                              <Badge className="border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]">{r.supplier.name}</Badge>
                            </div>
                          )}
                          {r.supplierStatus === 'unknown' && (
                            <div className="mt-1" title="این نام با هیچ تأمین‌کننده‌ای مطابقت نداشت">
                              <Badge className="border-amber-200 bg-amber-50 text-amber-700">تأمین‌کننده ناشناس</Badge>
                            </div>
                          )}
                          {r.reason && <div className="text-[10px] text-amber-700">{r.reason}</div>}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {r.newBuy !== undefined ? (
                            <span>
                              <span className="text-[#8A9884] line-through">{r.oldBuy != null ? toFaDigits(r.oldBuy.toLocaleString('en-US')) : '—'}</span>
                              {' ← '}
                              <b className="text-emerald-700">{toFaDigits(r.newBuy.toLocaleString('en-US'))}</b>
                            </span>
                          ) : <span className="text-[#8A9884]">—</span>}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {r.newSell !== undefined ? (
                            <span>
                              <span className="text-[#8A9884] line-through">{r.oldSell != null ? toFaDigits(r.oldSell.toLocaleString('en-US')) : '—'}</span>
                              {' ← '}
                              <b className="text-emerald-700">{toFaDigits(r.newSell.toLocaleString('en-US'))}</b>
                            </span>
                          ) : <span className="text-[#8A9884]">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {r.status === 'ok' && <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">تغییر</Badge>}
                          {r.status === 'unchanged' && <Badge className="border-[#E4DCC8] bg-white text-[#8A9884]">بدون تغییر</Badge>}
                          {r.status === 'notfound' && <Badge className="border-amber-200 bg-amber-50 text-amber-700">پیدا نشد</Badge>}
                          {r.status === 'invalid' && <Badge className="border-rose-200 bg-rose-50 text-rose-700">نامعتبر</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {supplierChangeCount > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-[#EAD9A8] bg-[#FBF6E8] px-3 py-2 text-xs font-semibold text-[#8A6508]">
                  <Tags className="h-3.5 w-3.5 shrink-0" />
                  تغییر تأمین‌کننده: {toFaDigits(supplierChangeCount)} کالا — تأمین‌کنندهٔ این کالاها از فایل بروزرسانی می‌شود
                </div>
              )}

              <div className="flex flex-col gap-2 border-t border-[#EFEAD8] pt-3 sm:flex-row sm:justify-end">
                <GhostButton className="min-h-[44px]" onClick={() => { setPriceParsed(null); setPriceFileName('') }}>
                  فایل دیگر
                </GhostButton>
                <PrimaryButton
                  onClick={() => void commitPrices()}
                  disabled={priceCommitting || (priceParsed.ok === 0 && supplierChangeCount === 0)}
                  className="min-h-[44px]"
                >
                  {priceCommitting ? <Spinner /> : <Tags className="h-4 w-4" />}
                  {priceParsed.ok > 0
                    ? `ثبت ${toFaDigits(priceParsed.ok)} تغییر قیمت`
                    : `ثبت ${toFaDigits(supplierChangeCount)} تغییر تأمین‌کننده`}
                </PrimaryButton>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
