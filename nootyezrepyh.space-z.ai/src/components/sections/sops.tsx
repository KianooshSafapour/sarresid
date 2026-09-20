'use client'

import * as React from 'react'
import { api, type ClientUser } from '@/lib/api-client'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { toFaDigits, formatJalali } from '@/lib/jalali'
import { GlowCard, SectionHeader, EmptyState } from '@/components/zeytoon-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Eye, BookOpen, ArrowRight, CheckCircle2, Circle, Pencil, Search, Loader2 } from 'lucide-react'

interface Sop {
  id: string
  title: string
  content: string
  category: string
  steps: string | null
  views: number
  active: boolean
  createdByName?: string
  createdAt: string
}

export function SopsSection({ user }: { user: ClientUser }) {
  const isManager = canUser(user.roles, PERMISSIONS.MANAGE_SOPS)
  const { toast } = useToast()
  const [sops, setSops] = React.useState<Sop[] | null>(null)
  const [search, setSearch] = React.useState('')
  const [openSop, setOpenSop] = React.useState<Sop | null>(null)
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Sop | null>(null)

  const load = React.useCallback(() => {
    api.get<Sop[]>('/api/sops').then(setSops).catch(() => setSops([]))
  }, [])
  React.useEffect(() => { load() }, [load])

  function open(s: Sop) {
    setOpenSop(s)
    api.patch<{ views?: number }>(`/api/sops/${s.id}`, { view: true })
      .then((r) => {
        setSops((prev) => prev ? prev.map((x) => x.id === s.id ? { ...x, views: r.views ?? x.views } : x) : prev)
        setOpenSop((cur) => cur && cur.id === s.id ? { ...cur, views: r.views ?? cur.views } : cur)
      })
      .catch(() => {})
  }

  const visible = (sops || []).filter((s) => (isManager ? true : s.active))
  const q = search.trim()
  const filtered = visible.filter((s) => !q || s.title.includes(q) || s.category.includes(q) || s.content.includes(q))
  const categories = [...new Set(filtered.map((s) => s.category))]

  if (openSop) {
    return (
      <SopDetail
        sop={openSop}
        onBack={() => setOpenSop(null)}
      />
    )
  }

  return (
    <div>
      <SectionHeader
        title="دستورالعمل‌ها (SOP)"
        subtitle="برای خیال راحت — هر کاری رویه استاندارد داره، این‌جاست 📖"
        actions={
          isManager && (
            <Button className="h-11 px-5 font-bold bg-olive hover:bg-olive/90 text-white" onClick={() => { setEditing(null); setEditorOpen(true) }}>
              <Plus className="size-4 ml-1" /> دستورالعمل جدید
            </Button>
          )
        }
      />

      <div className="relative mb-5">
        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو در دستورالعمل‌ها..." className="h-11 pr-10 rounded-xl" />
      </div>

      {!sops ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📖" title="هنوز دستورالعملی نیست" description={q ? 'چیزی با این عبارت پیدا نشد — یه بار دیگه جستجو کن.' : 'به‌زودی رویه‌های کاری این‌جا جمع می‌شن.'} />
      ) : (
        categories.map((cat) => (
          <div key={cat} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block size-2 rounded-full bg-gold" />
              <h3 className="font-extrabold">{cat}</h3>
              <span className="text-xs text-muted-foreground">({toFaDigits(filtered.filter((s) => s.category === cat).length)} مورد)</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.filter((s) => s.category === cat).map((s) => {
                const steps = parseSteps(s.steps)
                return (
                  <GlowCard key={s.id} className={cn('p-4 flex flex-col gap-2', !s.active && 'opacity-60')}>
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => open(s)} className="text-right font-bold text-[15px] leading-relaxed hover:text-olive transition-colors">
                        {s.title}
                      </button>
                      {isManager && (
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => { setEditing(s); setEditorOpen(true) }} aria-label="ویرایش">
                            <Pencil className="size-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8" onClick={async () => {
                            try {
                              await api.patch(`/api/sops/${s.id}`, { active: !s.active })
                              toast({ title: s.active ? 'غیرفعال شد' : 'فعال شد ✅' })
                              load()
                            } catch { toast({ title: 'خطا', variant: 'destructive' }) }
                          }} aria-label={s.active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}>
                            <span className={cn('text-[10px] font-black', s.active ? 'text-emerald-600' : 'text-muted-foreground')}>{s.active ? 'فعال' : 'خاموش'}</span>
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-2">{s.content}</p>
                    <div className="mt-auto pt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Eye className="size-3.5" /> {toFaDigits(s.views)} بازدید</span>
                      {steps.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 font-bold text-gold">{toFaDigits(steps.length)} مرحله</span>}
                      <button onClick={() => open(s)} className="font-bold text-olive inline-flex items-center gap-1 hover:underline">
                        <BookOpen className="size-3.5" /> شروع کن
                      </button>
                    </div>
                  </GlowCard>
                )
              })}
            </div>
          </div>
        ))
      )}

      <SopEditorDialog
        open={editorOpen}
        sop={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); load(); toast({ title: 'ذخیره شد ✅' }) }}
      />
      <Toaster />
    </div>
  )
}

/* ==================== SOP DETAIL (step-by-step) ==================== */

function SopDetail({ sop, onBack }: { sop: Sop; onBack: () => void }) {
  const steps = parseSteps(sop.steps)
  const [checked, setChecked] = React.useState<boolean[]>(() => steps.map(() => false))
  const doneCount = checked.filter(Boolean).length
  const allDone = steps.length > 0 && doneCount === steps.length
  const paragraphs = sop.content.split('\n').map((p) => p.trim()).filter(Boolean)

  return (
    <div className="animate-fade-up">
      <Button variant="ghost" onClick={onBack} className="mb-3 h-10 font-bold">
        <ArrowRight className="size-4" /> بازگشت به کتابخانه
      </Button>

      <GlowCard className="p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">{sop.title}</h2>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className="rounded-full bg-gold/10 text-gold px-2.5 py-0.5 font-bold">{sop.category}</span>
              <span className="inline-flex items-center gap-1"><Eye className="size-3.5" /> {toFaDigits(sop.views)} بازدید</span>
              <span>{toFaDigits(formatJalali(sop.createdAt))}</span>
            </div>
          </div>
          <div className="text-center px-4 py-2 rounded-2xl bg-olive/10 border border-olive/20">
            <div className="text-xl font-black text-olive">{toFaDigits(doneCount)}<span className="text-sm font-bold opacity-60"> / {toFaDigits(steps.length)}</span></div>
            <div className="text-[10px] text-muted-foreground">مراحل انجام‌شده</div>
          </div>
        </div>

        {steps.length > 0 && (
          <>
            {/* Progress */}
            <div className="mt-5">
              <div className="h-3 rounded-full bg-accent overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-l from-gold to-olive transition-all duration-500" style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }} />
              </div>
              <div className={cn('mt-2.5 text-sm font-bold text-center', allDone ? 'text-emerald-600' : 'text-muted-foreground')}>
                {allDone ? 'همه مراحل انجام شد! تو عالی‌ای 🎉' : `مرحله ${toFaDigits(Math.min(doneCount + 1, steps.length))} از ${toFaDigits(steps.length)} — داری عالی پیش میرید!`}
              </div>
            </div>

            {/* Steps */}
            <div className="mt-5 space-y-2.5">
              {steps.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setChecked((p) => p.map((x, j) => j === i ? !x : x))}
                  className={cn(
                    'w-full flex items-center gap-3.5 rounded-2xl border p-4 text-right transition-all touch-manipulation active:scale-[0.99]',
                    checked[i] ? 'bg-emerald-50/70 border-emerald-300' : 'bg-card border-gold/20 hover:border-gold/45'
                  )}
                >
                  {checked[i]
                    ? <CheckCircle2 className="size-7 shrink-0 text-emerald-600" />
                    : <Circle className="size-7 shrink-0 text-gold/60" />}
                  <span className={cn('flex-1 text-[15px] font-bold leading-relaxed', checked[i] && 'line-through text-muted-foreground')}>
                    {s}
                  </span>
                  <span className={cn('size-8 shrink-0 rounded-full flex items-center justify-center text-sm font-black', checked[i] ? 'bg-emerald-600 text-white' : 'bg-accent text-muted-foreground')}>
                    {toFaDigits(i + 1)}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Full content */}
        <div className="mt-6 rounded-2xl bg-accent/50 border border-gold/15 p-4 md:p-5 space-y-2.5">
          <div className="text-[13px] font-extrabold text-olive mb-1">📖 جزئیات کامل رویه</div>
          {paragraphs.map((p, i) => (
            <p key={i} className="text-[14px] leading-7 text-foreground/85">{p}</p>
          ))}
        </div>

        <Button
          onClick={onBack}
          className={cn('w-full h-12 mt-5 text-base font-black text-white', allDone ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-olive hover:bg-olive/90')}
        >
          تمام شد ✓
        </Button>
      </GlowCard>
    </div>
  )
}

/* ==================== MANAGER EDITOR ==================== */

function SopEditorDialog({ open, sop, onClose, onSaved }: { open: boolean; sop: Sop | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [title, setTitle] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [steps, setSteps] = React.useState<string[]>([''])
  const [content, setContent] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setTitle(sop?.title || '')
      setCategory(sop?.category || '')
      setSteps(sop ? (parseSteps(sop.steps).length ? parseSteps(sop.steps) : ['']) : [''])
      setContent(sop?.content || '')
    }
  }, [open, sop])

  async function submit() {
    if (!title.trim() || !category.trim()) {
      toast({ title: 'عنوان و دسته را کامل کن 🙂', variant: 'destructive' }); return
    }
    setBusy(true)
    try {
      const body = {
        title: title.trim(),
        category: category.trim(),
        content: content.trim(),
        steps: steps.map((s) => s.trim()).filter(Boolean),
      }
      if (sop) await api.patch(`/api/sops/${sop.id}`, body)
      else await api.post('/api/sops', body)
      onSaved()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-right">{sop ? 'ویرایش دستورالعمل' : 'دستورالعمل جدید 📖'}</DialogTitle></DialogHeader>
        <div className="space-y-3.5">
          <div>
            <div className="text-[13px] font-bold mb-1.5">عنوان</div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: رویه دریافت مرسولات" className="h-11" />
          </div>
          <div>
            <div className="text-[13px] font-bold mb-1.5">دسته‌بندی</div>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="مثلاً: انبار و دریافت" className="h-11" />
          </div>
          <div>
            <div className="text-[13px] font-bold mb-1.5">مرحله‌ها (به ترتیب)</div>
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <span className="size-10 shrink-0 rounded-xl bg-accent flex items-center justify-center text-sm font-black text-muted-foreground">{toFaDigits(i + 1)}</span>
                  <Input value={s} onChange={(e) => setSteps((p) => p.map((x, j) => j === i ? e.target.value : x))} placeholder={`مرحله ${toFaDigits(i + 1)}...`} className="h-10" />
                  <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 text-muted-foreground hover:text-red-600" onClick={() => setSteps((p) => p.filter((_, j) => j !== i))} aria-label="حذف مرحله">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" className="w-full h-9 border-dashed" onClick={() => setSteps((p) => [...p, ''])}>
                <Plus className="size-4 ml-1" /> افزودن مرحله
              </Button>
            </div>
          </div>
          <div>
            <div className="text-[13px] font-bold mb-1.5">محتوای کامل (هر خط، یک پاراگراف)</div>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-32" placeholder="رویه کامل را بنویس..." />
          </div>
        </div>
        <DialogFooter className="flex-row justify-start gap-2">
          <Button onClick={submit} disabled={busy} className="h-11 px-6 font-bold bg-olive hover:bg-olive/90 text-white">
            {busy ? <Loader2 className="size-4 animate-spin" /> : 'ذخیره ✅'}
          </Button>
          <Button variant="ghost" onClick={onClose} className="h-11">انصراف</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ==================== SHARED ==================== */

function parseSteps(json: string | null): string[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.map(String) : []
  } catch { return [] }
}
