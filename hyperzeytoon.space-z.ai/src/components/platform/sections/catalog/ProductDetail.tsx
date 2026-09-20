'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { EmptyState, LoadingBlock, StockIndicator, StatusBadge } from '@/components/platform/ui/shared'
import { money, toFaDigits, formatJalali } from '@/lib/jalali'
import { orderStatusInfo } from '@/lib/types'
import type { ProductDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { ConfirmButton } from '@/components/platform/ui/shared'
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import {
  Search, Upload, Loader2, Save, X, Plus, ImageOff, Barcode as BarcodeIcon,
  ShoppingBasket, LayoutGrid, Archive, TrendingUp, Webhook,
} from 'lucide-react'

interface DetailData {
  product: ProductDTO
  salesDaily: { label: string; qty: number; amount: number }[]
  totals: { qty: number; amount: number }
  recentOrders: {
    itemId: string; orderId: string; code: string; providerName: string
    receivingDate: string; status: string; qty: number; unitPrice: number; total: number
  }[]
  shelves: { id: string; name: string; section: string; row: number; col: number; capacity: number }[]
}

const CARD_COLORS = ['#3E7C59', '#C9A227', '#B07D2B', '#B33A3A', '#8A6F3C', '#7D5BA6']
function colorOf(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return CARD_COLORS[h % CARD_COLORS.length]
}

/** downscale an image file to max `max` px dataURL (keeps DB small) */
function fileToScaledDataUrl(file: File, max = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('خواندن فایل ناموفق بود'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('فایل تصویر معتبر نیست'))
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('پردازش تصویر ممکن نشد'))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export function ProductDetail({
  productId,
  open,
  onOpenChange,
  onChanged,
}: {
  productId: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onChanged?: () => void
}) {
  const { toast } = useToast()
  const user = useApp((s) => s.user)
  const canEdit = !!user && (user.isManager || user.roleKeys.includes('accountant') || user.roleKeys.includes('inventory'))
  const canArchive = !!user?.isManager

  const [data, setData] = React.useState<DetailData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState({
    sellPrice: '', sellPrice2: '', buyPrice: '', stock: '', minStock: '',
    unit: '', category: '', brand: '', notes: '',
  })
  const [newBarcode, setNewBarcode] = React.useState('')

  // image search dialog
  const [imgOpen, setImgOpen] = React.useState(false)
  const [imgQuery, setImgQuery] = React.useState('')
  const [imgResults, setImgResults] = React.useState<{ url: string; caption: string; source: string }[]>([])
  const [imgLoading, setImgLoading] = React.useState(false)
  const [imgPicking, setImgPicking] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const load = React.useCallback(async () => {
    if (!productId) return
    setLoading(true)
    try {
      const d = await api<DetailData>(`/api/products/${productId}`)
      setData(d)
      const p = d.product
      setForm({
        sellPrice: String(p.sellPrice ?? ''),
        sellPrice2: p.sellPrice2 != null ? String(p.sellPrice2) : '',
        buyPrice: String(p.buyPrice ?? ''),
        stock: String(p.stock ?? ''),
        minStock: String(p.minStock ?? ''),
        unit: p.unit ?? 'عدد',
        category: p.category ?? '',
        brand: p.brand ?? '',
        notes: p.notes ?? '',
      })
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [productId, toast])

  React.useEffect(() => {
    if (open && productId) load()
    if (!open) {
      setData(null)
      setImgResults([])
      setImgOpen(false)
    }
  }, [open, productId, load])

  const save = async () => {
    if (!productId) return
    setSaving(true)
    try {
      await api(`/api/products/${productId}`, {
        method: 'PATCH',
        body: {
          sellPrice: Number(form.sellPrice) || 0,
          sellPrice2: form.sellPrice2 ? Number(form.sellPrice2) : null,
          buyPrice: Number(form.buyPrice) || 0,
          stock: Number(form.stock) || 0,
          minStock: Number(form.minStock) || 0,
          unit: form.unit,
          category: form.category,
          brand: form.brand,
          notes: form.notes,
        },
      })
      toast({ title: 'ذخیره شد', description: 'اطلاعات کالا به‌روزرسانی شد' })
      await load()
      onChanged?.()
    } catch (e) {
      toast({ title: 'خطا در ذخیره', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const patchImage = async (image: string) => {
    if (!productId) return
    try {
      await api(`/api/products/${productId}`, { method: 'PATCH', body: { image } })
      setData((d) => (d ? { ...d, product: { ...d.product, image } } : d))
      toast({ title: 'تصویر ذخیره شد' })
      onChanged?.()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const runImageSearch = async () => {
    if (!imgQuery.trim()) return
    setImgLoading(true)
    setImgResults([])
    try {
      const res = await api<{ success: boolean; results: { url: string; caption: string; source: string }[] }>(
        '/api/products/image-search',
        { body: { query: imgQuery } }
      )
      setImgResults(res.results)
      if (!res.results.length) toast({ title: 'نتیجه‌ای پیدا نشد', description: 'عبارت دیگری را امتحان کنید' })
    } catch (e) {
      toast({ title: 'جستجوی تصویر ناموفق', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setImgLoading(false)
    }
  }

  const onUploadFile = async (file: File) => {
    try {
      const dataUrl = await fileToScaledDataUrl(file, 400)
      await patchImage(dataUrl)
    } catch (e) {
      toast({ title: 'آپلود ناموفق', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const addBarcode = async () => {
    const code = newBarcode.trim()
    if (!code || !productId) return
    try {
      await api(`/api/products/${productId}`, { method: 'PATCH', body: { barcodes: { add: [code] } } })
      setNewBarcode('')
      await load()
      onChanged?.()
    } catch (e) {
      toast({ title: 'بارکد ثبت نشد', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const removeBarcode = async (id: string) => {
    if (!productId) return
    try {
      await api(`/api/products/${productId}`, { method: 'PATCH', body: { barcodes: { removeIds: [id] } } })
      await load()
      onChanged?.()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const archive = async () => {
    if (!productId) return
    try {
      await api(`/api/products/${productId}`, { method: 'DELETE' })
      toast({ title: 'کالا آرشیو شد', description: 'از فهرست کالاهای فعال حذف شد' })
      onOpenChange(false)
      onChanged?.()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const p = data?.product
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
        {loading && <LoadingBlock rows={5} />}

        {!loading && !p && (
          <EmptyState icon={<ImageOff />} title="کالا یافت نشد" description="ممکن است حذف یا آرشیو شده باشد." />
        )}

        {!loading && p && (
          <div className="space-y-5">
            {/* ---------- hero ---------- */}
            <div className="relative">
              {p.image ? (
                <img
                  src={p.image}
                  alt={p.name}
                  className="h-52 w-full rounded-2xl object-cover border border-border bg-muted"
                />
              ) : (
                <div
                  className="h-52 w-full rounded-2xl flex items-center justify-center text-6xl font-black text-white/90"
                  style={{ background: `linear-gradient(135deg, ${colorOf(p.name)}, ${colorOf(p.name)}cc)` }}
                  aria-label={p.name}
                >
                  {p.name.trim()[0] ?? '؟'}
                </div>
              )}
              {p.status === 'ARCHIVED' && (
                <div className="absolute top-3 left-3">
                  <StatusBadge label="آرشیو شده" color="#8A8F98" />
                </div>
              )}
            </div>

            <DialogHeader className="text-right space-y-2">
              <DialogTitle className="text-xl leading-relaxed">{p.name}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-accent">{p.category}</Badge>
                {p.brand && <Badge variant="outline" className="bg-accent">{p.brand}</Badge>}
                <Badge variant="outline" className="num">{toFaDigits(p.barcodes.length)} بارکد</Badge>
                <StockIndicator stock={p.stock} minStock={p.minStock} />
              </DialogDescription>
            </DialogHeader>

            {/* ---------- editable fields ---------- */}
            {canEdit && (
              <section className="rounded-2xl border border-border p-4 space-y-3 bg-card">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Save className="h-4 w-4 text-primary" /> ویرایش اطلاعات
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="pd-sell" className="text-xs">قیمت فروش (تومان)</Label>
                    <Input id="pd-sell" className="num" inputMode="numeric" value={form.sellPrice} onChange={(e) => set('sellPrice', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pd-sell2" className="text-xs">قیمت فروش ۲ (تخفیفی)</Label>
                    <Input id="pd-sell2" className="num" inputMode="numeric" value={form.sellPrice2} onChange={(e) => set('sellPrice2', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pd-buy" className="text-xs">قیمت خرید (تومان)</Label>
                    <Input id="pd-buy" className="num" inputMode="numeric" value={form.buyPrice} onChange={(e) => set('buyPrice', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pd-stock" className="text-xs">موجودی انبار</Label>
                    <Input id="pd-stock" className="num" inputMode="numeric" value={form.stock} onChange={(e) => set('stock', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pd-min" className="text-xs">حد سفارش (minStock)</Label>
                    <Input id="pd-min" className="num" inputMode="numeric" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pd-unit" className="text-xs">واحد</Label>
                    <Input id="pd-unit" value={form.unit} onChange={(e) => set('unit', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pd-cat" className="text-xs">دسته‌بندی</Label>
                    <Input id="pd-cat" value={form.category} onChange={(e) => set('category', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pd-brand" className="text-xs">برند</Label>
                    <Input id="pd-brand" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
                  </div>
                  <div className="space-y-1 col-span-2 md:col-span-3">
                    <Label htmlFor="pd-notes" className="text-xs">یادداشت</Label>
                    <Textarea id="pd-notes" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={save} disabled={saving} className="min-h-11">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    ذخیره تغییرات
                  </Button>
                  {canArchive && (
                    <ConfirmButton onConfirm={archive} confirmText="تأیید آرشیو؟" variant="destructive">
                      <span className="inline-flex items-center gap-1.5"><Archive className="h-4 w-4" /> آرشیو کالا</span>
                    </ConfirmButton>
                  )}
                </div>
              </section>
            )}

            {/* ---------- image tools ---------- */}
            <section className="rounded-2xl border border-border p-4 space-y-3 bg-card">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Webhook className="h-4 w-4 text-primary" /> ابزار تصویر
              </h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    setImgQuery([p.brand, p.name].filter(Boolean).join(' ').trim())
                    setImgResults([])
                    setImgOpen(true)
                  }}
                >
                  <Search className="h-4 w-4" /> جستجو در وب
                </Button>
                <Button variant="outline" className="min-h-11" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" /> آپلود از دستگاه
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) onUploadFile(f)
                  }}
                />
              </div>
            </section>

            {/* ---------- barcodes ---------- */}
            <section className="rounded-2xl border border-border p-4 space-y-3 bg-card">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <BarcodeIcon className="h-4 w-4 text-primary" /> بارکدها
              </h3>
              <div className="flex flex-wrap gap-2">
                {p.barcodes.length === 0 && <span className="text-sm text-muted-foreground">بارکدی ثبت نشده است</span>}
                {p.barcodes.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-accent/50 px-3 py-1.5 text-sm num"
                  >
                    {b.isPrimary && <span className="h-1.5 w-1.5 rounded-full bg-primary" title="بارکد اصلی" />}
                    {toFaDigits(b.code)}
                    {canEdit && (
                      <button
                        type="button"
                        aria-label={`حذف بارکد ${b.code}`}
                        onClick={() => removeBarcode(b.id)}
                        className="text-destructive hover:scale-110 transition-transform"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {canEdit && (
                <div className="flex gap-2 max-w-sm">
                  <Input
                    className="num"
                    inputMode="numeric"
                    placeholder="بارکد جدید…"
                    value={newBarcode}
                    onChange={(e) => setNewBarcode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addBarcode()}
                  />
                  <Button variant="secondary" className="min-h-11" onClick={addBarcode} disabled={!newBarcode.trim()}>
                    <Plus className="h-4 w-4" /> افزودن
                  </Button>
                </div>
              )}
            </section>

            {/* ---------- 30d sales ---------- */}
            <section className="rounded-2xl border border-border p-4 space-y-3 bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> فروش ۳۰ روز اخیر
                </h3>
                <div className="text-xs text-muted-foreground num">
                  {toFaDigits(data!.totals.qty)} فروخته شده · {money(data!.totals.amount)} تومان
                </div>
              </div>
              <div className="h-36 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data!.salesDaily} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3E7C59" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#3E7C59" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={6} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ direction: 'rtl', borderRadius: 12, fontSize: 12, border: '1px solid #e5e7eb' }}
                      formatter={(v: number) => [`${toFaDigits(v)} عدد`, 'فروش']}
                    />
                    <Area type="monotone" dataKey="qty" stroke="#3E7C59" strokeWidth={2} fill="url(#salesFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* ---------- recent orders ---------- */}
            <section className="rounded-2xl border border-border p-4 space-y-3 bg-card">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <ShoppingBasket className="h-4 w-4 text-primary" /> سفارش‌های اخیر
              </h3>
              {data!.recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">سفارشی برای این کالا ثبت نشده است</p>
              ) : (
                <ul className="divide-y divide-border max-h-56 overflow-y-auto">
                  {data!.recentOrders.map((o) => {
                    const st = orderStatusInfo(o.status)
                    return (
                      <li key={o.itemId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium num">{o.code}</p>
                          <p className="text-xs text-muted-foreground">
                            {o.providerName} · {formatJalali(o.receivingDate)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge label={st.label} color={st.color} />
                          <span className="text-xs num">{toFaDigits(o.qty)} {p.unit}</span>
                          <span className="text-xs text-muted-foreground num">{money(o.total)} تومان</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* ---------- shelf placements ---------- */}
            <section className="rounded-2xl border border-border p-4 space-y-3 bg-card">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-primary" /> چیدمان قفسه
              </h3>
              {data!.shelves.length === 0 ? (
                <p className="text-sm text-muted-foreground">روی قفسه‌ای قرار نگرفته است</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data!.shelves.map((s) => (
                    <Badge key={s.id} variant="outline" className="bg-accent px-3 py-1.5">
                      {s.name} — بخش {s.section} (ردیف {toFaDigits(s.row)}، ستون {toFaDigits(s.col)})
                    </Badge>
                  ))}
                </div>
              )}
            </section>

            <Separator />
          </div>
        )}

        {/* ---------- nested image search dialog ---------- */}
        <Dialog open={imgOpen} onOpenChange={setImgOpen}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto" dir="rtl">
            <DialogHeader className="text-right">
              <DialogTitle>جستجوی تصویر محصول</DialogTitle>
              <DialogDescription>
                تصویر مناسب را از وب پیدا کنید؛ با انتخاب، تصویر کالا به‌روزرسانی می‌شود.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Input
                value={imgQuery}
                onChange={(e) => setImgQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runImageSearch()}
                placeholder="عبارت جستجو…"
              />
              <Button onClick={runImageSearch} disabled={imgLoading || !imgQuery.trim()} className="min-h-11 shrink-0">
                {imgLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                جستجو
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {imgResults.map((r) => (
                <button
                  key={r.url}
                  type="button"
                  disabled={imgPicking}
                  onClick={async () => {
                    setImgPicking(true)
                    await patchImage(r.url)
                    setImgPicking(false)
                    setImgOpen(false)
                  }}
                  className="group relative h-28 w-full overflow-hidden rounded-xl border border-border bg-muted transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring min-h-11"
                  title={r.caption || r.source}
                >
                  <img src={r.url} alt={r.caption || 'result'} className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
            {!imgLoading && imgResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {imgQuery ? 'هنوز جستجو نکرده‌اید' : 'برای شروع عبارت جستجو را بنویسید'}
              </p>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
