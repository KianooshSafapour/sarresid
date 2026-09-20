'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import {
  SectionHeader, EmptyState, LoadingBlock, ConfirmButton, OrnateDivider,
} from '@/components/platform/ui/shared'
import { formatJalali, toFaDigits } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Vault as VaultIcon, Lock, Folder, FileText, ImagePlus, Loader2, Pencil, Download, Plus, FolderOpen, Image as ImageIcon,
} from 'lucide-react'

// ============================================================
// گنجینه شخصی — پرونده‌ها و یادداشت‌های کاملاً خصوصی هر همکار
// عکس رسیدها، فاکتورها و اسناد شخصی؛ دسترسی فقط برای مالک
// ============================================================

interface VaultFileDTO {
  id: string
  name: string
  mime: string | null
  size: number
  dataUrl: string | null
  folder: string
  note: string | null
  createdAt: string
}

const MAX_DATAURL_CHARS = 600_000
const MAX_SIZE_BYTES = 450_000
const MAX_PDF_BYTES = 400_000

function sizeFa(size: number): string {
  if (size >= 1024) return `${toFaDigits(Math.round(size / 1024))} کیلوبایت`
  return `${toFaDigits(size)} بایت`
}

function isImage(f: VaultFileDTO): boolean {
  return !!f.mime && f.mime.startsWith('image/')
}

/** فشرده‌سازی تصویر: حداکثر ۱۲۰۰ پیکسل، JPEG با کیفیت کاهش‌یابنده تا رسیدن به حد مجاز */
async function imageToDataUrl(file: File): Promise<string> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('این فرمت تصویر پشتیبانی نمی‌شود — لطفاً تصویر JPG یا PNG انتخاب کنید')
  }
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('پردازش تصویر در مرورگر ممکن نشد')
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  for (const q of [0.75, 0.6, 0.45, 0.3]) {
    const url = canvas.toDataURL('image/jpeg', q)
    if (url.length <= MAX_DATAURL_CHARS) return url
  }
  throw new Error('این تصویر پس از فشرده‌سازی همچنان بزرگ است — لطفاً تصویر کوچک‌تری انتخاب کنید')
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('خواندن فایل ناموفق بود'))
    reader.readAsDataURL(file)
  })
}

export function Vault() {
  const { user } = useApp()
  const { toast } = useToast()

  const [loading, setLoading] = React.useState(true)
  const [files, setFiles] = React.useState<VaultFileDTO[]>([])
  const [folders, setFolders] = React.useState<string[]>(['عمومی'])
  const [activeFolder, setActiveFolder] = React.useState<string>('همه')

  // new file flow
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [draft, setDraft] = React.useState<{ name: string; mime: string; size: number; dataUrl: string } | null>(null)
  const [draftName, setDraftName] = React.useState('')
  const [draftFolder, setDraftFolder] = React.useState('عمومی')
  const [draftNote, setDraftNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [processing, setProcessing] = React.useState(false)

  // preview / edit
  const [preview, setPreview] = React.useState<VaultFileDTO | null>(null)
  const [editTarget, setEditTarget] = React.useState<VaultFileDTO | null>(null)
  const [editName, setEditName] = React.useState('')
  const [editFolder, setEditFolder] = React.useState('')
  const [editNote, setEditNote] = React.useState('')
  const [editSaving, setEditSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const d = await api<{ files: VaultFileDTO[]; folders: string[] }>('/api/vault')
      setFiles(d.files)
      const set = new Set<string>(['عمومی', ...d.folders])
      setFolders(Array.from(set))
    } catch (e) {
      toast({ title: 'دریافت گنجینه ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    load()
  }, [load])

  // ---- انتخاب فایل و فشرده‌سازی ----
  const onPick = async (f: File) => {
    setProcessing(true)
    try {
      if (f.type.startsWith('image/')) {
        const dataUrl = await imageToDataUrl(f)
        setDraft({ name: f.name.replace(/\.[^.]+$/, '') || 'تصویر', mime: 'image/jpeg', size: Math.round((dataUrl.length * 3) / 4), dataUrl })
      } else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        if (f.size > MAX_PDF_BYTES) {
          toast({
            title: 'حجم PDF زیاد است',
            description: `فایل PDF باید کمتر از ${toFaDigits(400)} کیلوبایت باشد — لطفاً نسخه فشرده‌تری ذخیره کنید.`,
            variant: 'destructive',
          })
          return
        }
        const dataUrl = await fileToDataUrl(f)
        if (dataUrl.length > MAX_DATAURL_CHARS) {
          toast({
            title: 'حجم PDF برای گنجینه زیاد است',
            description: 'لطفاً نسخه کوچک‌تری از پرونده تهیه کنید (حدود ۴۵۰ کیلوبایت).',
            variant: 'destructive',
          })
          return
        }
        setDraft({ name: f.name.replace(/\.pdf$/i, '') || 'سند', mime: 'application/pdf', size: f.size, dataUrl })
      } else {
        toast({
          title: 'فرمت پشتیبانی نمی‌شود',
          description: 'تنها تصاویر (JPG/PNG) و فایل‌های PDF در گنجینه ذخیره می‌شوند.',
          variant: 'destructive',
        })
        return
      }
      setDraftName('')
      setDraftFolder(activeFolder !== 'همه' ? activeFolder : 'عمومی')
      setDraftNote('')
    } catch (e) {
      toast({
        title: 'پردازش فایل ناموفق بود',
        description: e instanceof Error ? e.message : 'لطفاً فایل کوچک‌تری انتخاب کنید',
        variant: 'destructive',
      })
    } finally {
      setProcessing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const saveDraft = async () => {
    if (!draft) return
    const name = draftName.trim() || draft.name
    setSaving(true)
    try {
      await api('/api/vault', {
        body: {
          name,
          mime: draft.mime,
          size: draft.size,
          dataUrl: draft.dataUrl,
          folder: draftFolder.trim() || 'عمومی',
          note: draftNote.trim() || undefined,
        },
      })
      toast({ title: 'به گنجینه شخصی اضافه شد 🔒' })
      setDraft(null)
      await load()
    } catch (e) {
      toast({ title: 'ذخیره ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (f: VaultFileDTO) => {
    setEditTarget(f)
    setEditName(f.name)
    setEditFolder(f.folder)
    setEditNote(f.note ?? '')
  }

  const saveEdit = async () => {
    if (!editTarget) return
    if (!editName.trim()) {
      toast({ title: 'نام پرونده نمی‌تواند خالی باشد', variant: 'destructive' })
      return
    }
    setEditSaving(true)
    try {
      const d = await api<{ file: VaultFileDTO }>(`/api/vault/${editTarget.id}`, {
        method: 'PATCH',
        body: { name: editName.trim(), folder: editFolder.trim() || 'عمومی', note: editNote },
      })
      setFiles((prev) => prev.map((x) => (x.id === editTarget.id ? { ...x, name: d.file.name, folder: d.file.folder, note: d.file.note } : x)))
      if (preview?.id === editTarget.id) setPreview((p) => (p ? { ...p, name: d.file.name, folder: d.file.folder, note: d.file.note } : p))
      setEditTarget(null)
      toast({ title: 'تغییرات ذخیره شد 🌿' })
      await load()
    } catch (e) {
      toast({ title: 'ذخیره ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setEditSaving(false)
    }
  }

  const removeFile = async (f: VaultFileDTO) => {
    try {
      await api(`/api/vault/${f.id}`, { method: 'DELETE' })
      setFiles((prev) => prev.filter((x) => x.id !== f.id))
      if (preview?.id === f.id) setPreview(null)
      toast({ title: 'پرونده حذف شد' })
    } catch (e) {
      toast({ title: 'حذف ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const shown = activeFolder === 'همه' ? files : files.filter((f) => f.folder === activeFolder)

  return (
    <div className="space-y-4">
      <SectionHeader
        title="گنجینه شخصی"
        subtitle={`یادداشت‌ها و پرونده‌های خصوصی شما، ${user?.name ?? 'همکار عزیز'} — با خیال راحت نگه‌دارید`}
        icon={<VaultIcon className="h-5 w-5" />}
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onPick(f)
              }}
            />
            <Button size="sm" className="gap-1.5" disabled={processing} onClick={() => fileInputRef.current?.click()}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              پرونده جدید
            </Button>
          </>
        }
      />

      {/* نوار حریم خصوصی */}
      <div className="rounded-2xl border border-[#C9A227]/30 bg-gradient-to-l from-[#C9A227]/10 via-[#C9A227]/5 to-transparent p-3 flex items-center gap-2.5">
        <span className="h-9 w-9 rounded-xl bg-[#C9A227]/15 text-[#8A6F3C] dark:text-[#e0bc4a] flex items-center justify-center shrink-0">
          <Lock className="h-4 w-4" />
        </span>
        <p className="text-xs leading-5">
          <span className="font-bold">این گنجینه کاملاً شخصی است و تنها شما به آن دسترسی دارید.</span>
          <span className="text-muted-foreground"> مناسب برای عکس رسیدها، فاکتورها و اسناد شخصی — هر پرونده تا حدود ۴۵۰ کیلوبایت.</span>
        </p>
      </div>

      {/* پوشه‌ها */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setActiveFolder('همه')}
          className={[
            'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors touch-target inline-flex items-center gap-1.5',
            activeFolder === 'همه' ? 'text-white border-transparent bg-primary' : 'bg-card text-foreground/80 hover:bg-accent border-primary/40',
          ].join(' ')}
        >
          <FolderOpen className="h-3.5 w-3.5" /> همه
          <span className="num opacity-70">({toFaDigits(files.length)})</span>
        </button>
        {folders.map((f) => {
          const count = files.filter((x) => x.folder === f).length
          const active = activeFolder === f
          return (
            <button
              key={f}
              type="button"
              onClick={() => setActiveFolder(f)}
              className={[
                'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors touch-target inline-flex items-center gap-1.5',
                active ? 'text-white border-transparent bg-primary' : 'bg-card text-foreground/80 hover:bg-accent border-primary/40',
              ].join(' ')}
            >
              <Folder className="h-3.5 w-3.5" /> {f}
              <span className="num opacity-70">({toFaDigits(count)})</span>
            </button>
          )
        })}
      </div>

      {/* شبکه پرونده‌ها */}
      {loading ? (
        <LoadingBlock rows={4} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<VaultIcon />}
          title={activeFolder === 'همه' ? 'گنجینه شما خالی است' : 'این پوشه خالی است'}
          description="با «پرونده جدید» اولین یادگاری را اضافه کنید — عکس رسید، فاکتور یا هر سند شخصی که می‌خواهید همیشه در دسترس باشد."
          action={<OrnateDivider className="w-56" />}
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {shown.map((f) => (
            <Card key={f.id} className="glow-border-static overflow-hidden card-hover">
              <button type="button" onClick={() => setPreview(f)} className="w-full text-right focus-visible:ring-2 focus-visible:ring-ring">
                {isImage(f) && f.dataUrl ? (
                  <img src={f.dataUrl} alt={f.name} className="w-full h-36 object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-36 flex items-center justify-center bg-accent/50">
                    <FileText className="h-12 w-12 text-pomegranate/70" />
                  </div>
                )}
                <CardContent className="p-3 space-y-1.5">
                  <p className="text-sm font-bold truncate" title={f.name}>{f.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Badge variant="secondary" className="rounded-full text-[10px] gap-1">
                      <Folder className="h-2.5 w-2.5" /> {f.folder}
                    </Badge>
                    <span className="num">{sizeFa(f.size)}</span>
                    <span className="num">• {formatJalali(f.createdAt)}</span>
                  </div>
                  {f.note && <p className="text-[11px] text-muted-foreground truncate" title={f.note}>📝 {f.note}</p>}
                </CardContent>
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* گفتگوی ثبت پرونده جدید */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <ImageIcon className="h-5 w-5 text-primary" /> افزودن به گنجینه
            </DialogTitle>
            <DialogDescription className="text-right">
              این پرونده به‌صورت خصوصی برای شما ذخیره می‌شود.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              {draft.mime === 'image/jpeg' && (
                <img src={draft.dataUrl} alt="پیش‌نمایش" className="w-full max-h-44 object-contain rounded-xl border border-border bg-accent/30" />
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">نام پرونده</Label>
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder={draft.name}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">پوشه</Label>
                <Input
                  value={draftFolder}
                  onChange={(e) => setDraftFolder(e.target.value)}
                  list="vault-folders"
                  placeholder="عمومی"
                  maxLength={60}
                />
                <datalist id="vault-folders">
                  {folders.map((f) => <option key={f} value={f} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">یادداشت (اختیاری)</Label>
                <Textarea
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  rows={2}
                  placeholder="مثلاً: خرید لوازم صندوق — مبلغ ۴۸۰ هزار تومان"
                />
              </div>
              <p className="text-[11px] text-muted-foreground num">حجم: {sizeFa(draft.size)}</p>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setDraft(null)}>بی‌خیال</Button>
                <Button disabled={saving} onClick={saveDraft} className="gap-1.5 min-w-28">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  ذخیره در گنجینه
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* پیش‌نمایش پرونده */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {preview && (
            <>
              <DialogHeader>
                <DialogTitle className="text-right">{preview.name}</DialogTitle>
                <DialogDescription className="text-right num">
                  {sizeFa(preview.size)} • {formatJalali(preview.createdAt)} • {preview.folder}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {isImage(preview) && preview.dataUrl ? (
                  <img src={preview.dataUrl} alt={preview.name} className="w-full max-h-[55vh] object-contain rounded-xl border border-border bg-accent/30" />
                ) : preview.dataUrl ? (
                  <object data={preview.dataUrl} type="application/pdf" className="w-full h-[55vh] rounded-xl border border-border">
                    <div className="h-[55vh] flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-10 w-10" />
                      <p>پیش‌نمایش PDF در این مرورگر ممکن نیست — از دکمه دانلود استفاده کنید.</p>
                    </div>
                  </object>
                ) : (
                  <div className="h-40 flex items-center justify-center text-muted-foreground">
                    <FileText className="h-10 w-10" />
                  </div>
                )}
                {preview.note && (
                  <p className="text-xs rounded-xl bg-accent/60 p-3 leading-5">📝 {preview.note}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {preview.dataUrl && (
                    <a
                      href={preview.dataUrl}
                      download={preview.name + (isImage(preview) ? '.jpg' : '.pdf')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 h-9 text-sm hover:bg-accent transition-colors touch-target"
                    >
                      <Download className="h-4 w-4" /> دانلود
                    </a>
                  )}
                  <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={() => openEdit(preview)}>
                    <Pencil className="h-3.5 w-3.5" /> ویرایش
                  </Button>
                  <ConfirmButton
                    variant="destructive"
                    className="h-9"
                    confirmText="حذف قطعی؟"
                    onConfirm={() => removeFile(preview)}
                  >
                    حذف
                  </ConfirmButton>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ویرایش پرونده */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-right">ویرایش پرونده</DialogTitle>
            <DialogDescription className="text-right">نام، پوشه و یادداشت را به‌روزرسانی کنید.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">نام پرونده</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">پوشه</Label>
              <Input value={editFolder} onChange={(e) => setEditFolder(e.target.value)} list="vault-folders-edit" maxLength={60} />
              <datalist id="vault-folders-edit">
                {folders.map((f) => <option key={f} value={f} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">یادداشت</Label>
              <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={2} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setEditTarget(null)}>بی‌خیال</Button>
              <Button disabled={editSaving} onClick={saveEdit} className="gap-1.5">
                {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                ذخیره تغییرات
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
