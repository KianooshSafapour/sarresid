'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import {
  SectionHeader, EmptyState, LoadingBlock, ChipSelect, ConfirmButton,
} from '@/components/platform/ui/shared'
import { timeAgo, toFaDigits } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  BookOpenCheck, Plus, AlertTriangle, Wand2, ChevronRight, ChevronLeft, Pencil,
  X, Loader2, Sparkles, Trash2, CheckCircle2,
} from 'lucide-react'

interface SopStep {
  title: string
  detail: string
  warning?: string
}

interface SopDTO {
  id: string
  title: string
  category: string
  summary?: string | null
  steps: SopStep[]
  version: number
  roleKeys: string
  updatedAt: string
}

const STEP_CATEGORIES = ['عمومی', 'فروش', 'صندوق', 'انبار', 'چیدمان', 'تحویل', 'بهداشت']

export function SOPs() {
  const { user } = useApp()
  const { toast } = useToast()
  const isManager = !!user?.isManager
  const [sops, setSops] = React.useState<SopDTO[] | null>(null)
  const [roleFilter, setRoleFilter] = React.useState<string | null>(null)
  const [wizard, setWizard] = React.useState<{ sop: SopDTO; step: number } | null>(null)
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<SopDTO | null>(null)
  const [roles, setRoles] = React.useState<{ key: string; name: string }[]>([])

  const load = React.useCallback(async () => {
    try {
      const d = await api<{ sops: SopDTO[] }>(`/api/sops${roleFilter ? `?roleKey=${roleFilter}` : ''}`)
      setSops(d.sops)
    } catch (e) {
      toast({ title: 'خطا در دریافت رویه‌ها', description: e instanceof Error ? e.message : '', variant: 'destructive' })
      setSops([])
    }
  }, [roleFilter, toast])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    if (!isManager) return
    api<{ roles: { key: string; name: string }[] }>('/api/users')
      .then((d) => setRoles(d.roles))
      .catch(() => null)
  }, [isManager])

  // auto filter by my primary role on first load
  const autoFiltered = React.useRef(false)
  React.useEffect(() => {
    if (!autoFiltered.current && user && user.roleKeys.length > 0) {
      setRoleFilter(user.roleKeys[0])
      autoFiltered.current = true
    }
  }, [user])

  const grouped = React.useMemo(() => {
    const map = new Map<string, SopDTO[]>()
    for (const s of sops ?? []) {
      const arr = map.get(s.category) ?? []
      arr.push(s)
      map.set(s.category, arr)
    }
    return Array.from(map.entries())
  }, [sops])

  const remove = async (sop: SopDTO) => {
    try {
      await api(`/api/sops/${sop.id}`, { method: 'DELETE' })
      toast({ title: 'رویه حذف شد' })
      load()
    } catch (e) {
      toast({ title: 'حذف نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="رویه‌ها و راهنما"
        subtitle="اینجا تجربه‌ی بقیه به دست توست — آرام پیش برو 🌿"
        icon={<BookOpenCheck className="h-5 w-5" />}
        actions={
          isManager ? (
            <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setEditorOpen(true) }}>
              <Plus className="h-4 w-4" /> رویه جدید
            </Button>
          ) : undefined
        }
      />

      {/* my-role auto filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">فیلتر نقش:</span>
        <ChipSelect
          options={[
            { key: 'all', label: 'همه' },
            ...(user?.roleKeys ?? []).map((k) => ({ key: k, label: roles.find((r) => r.key === k)?.name ?? k })),
            { key: 'none', label: 'بدون نقش خاص' },
          ]}
          value={roleFilter ?? 'all'}
          onChange={(v) => setRoleFilter(v === 'all' ? null : v === 'none' ? 'NONE_MATCH' : v)}
          className="flex-1"
        />
      </div>

      {!sops ? (
        <LoadingBlock rows={4} />
      ) : sops.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title="هنوز رویه‌ای برای این نقش ثبت نشده"
          description="به‌زودی مدیران تجربه‌شان را اینجا می‌نویسند. اگر چیزی می‌دانی که به کار بقیه می‌آید، از بخش بازخورد بگو 💚"
        />
      ) : (
        grouped.map(([category, list]) => (
          <div key={category} className="space-y-2">
            <h2 className="text-sm font-bold text-muted-foreground flex items-center gap-2 px-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {category}
              <span className="num text-xs">({toFaDigits(list.length)})</span>
            </h2>
            <Accordion type="single" collapsible className="space-y-2">
              {list.map((sop) => (
                <AccordionItem key={sop.id} value={sop.id} className="bg-card rounded-2xl border px-4">
                  <div className="flex items-center gap-2">
                    <AccordionTrigger className="flex-1 py-3 hover:no-underline">
                      <div className="text-right">
                        <p className="font-bold text-sm">{sop.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {toFaDigits(sop.steps.length)} مرحله · نسخه {toFaDigits(sop.version)} · {timeAgo(sop.updatedAt)}
                        </p>
                      </div>
                    </AccordionTrigger>
                    <Button
                      size="sm" variant="secondary" className="gap-1.5 shrink-0 h-9"
                      onClick={() => setWizard({ sop, step: 0 })}
                    >
                      <Wand2 className="h-4 w-4" /> اجرای قدم‌به‌قدم
                    </Button>
                    {isManager && (
                      <>
                        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => { setEditing(sop); setEditorOpen(true) }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ConfirmButton onConfirm={() => remove(sop)} confirmText="مطمئنی؟" className="h-9 shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </ConfirmButton>
                      </>
                    )}
                  </div>
                  <AccordionContent className="pb-4">
                    {sop.summary && <p className="text-sm text-muted-foreground mb-3">{sop.summary}</p>}
                    <ol className="space-y-2">
                      {sop.steps.map((st, i) => (
                        <li key={i} className="rounded-xl bg-accent/50 p-3">
                          <div className="flex items-start gap-2.5">
                            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0 num">
                              {toFaDigits(i + 1)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-sm">{st.title}</p>
                              {st.detail && <p className="text-xs text-muted-foreground mt-1 leading-5">{st.detail}</p>}
                              {st.warning && (
                                <div className="mt-2 rounded-lg border border-saffron/50 bg-saffron/10 text-saffron text-xs p-2 flex items-start gap-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                  <span>{st.warning}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))
      )}

      {/* guided step-by-step wizard */}
      <Dialog open={!!wizard} onOpenChange={(o) => !o && setWizard(null)}>
        <DialogContent className="max-w-md">
          {wizard && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-primary" /> {wizard.sop.title}
                </DialogTitle>
                <DialogDescription>آرام پیش برو، مرحله به مرحله — عجله‌ای نیست 🌿</DialogDescription>
              </DialogHeader>
              <Progress value={((wizard.step + 1) / Math.max(1, wizard.sop.steps.length)) * 100} className="h-2" />
              <p className="text-xs text-muted-foreground text-center num">
                مرحله {toFaDigits(wizard.step + 1)} از {toFaDigits(wizard.sop.steps.length)}
              </p>
              {wizard.sop.steps[wizard.step] && (
                <div className="rounded-2xl border bg-accent/40 p-5 text-center space-y-3 min-h-40">
                  <span className="inline-flex h-10 w-10 rounded-full bg-primary text-primary-foreground items-center justify-center font-extrabold num">
                    {toFaDigits(wizard.step + 1)}
                  </span>
                  <p className="font-bold text-base">{wizard.sop.steps[wizard.step].title}</p>
                  {wizard.sop.steps[wizard.step].detail && (
                    <p className="text-sm text-muted-foreground leading-6">{wizard.sop.steps[wizard.step].detail}</p>
                  )}
                  {wizard.sop.steps[wizard.step].warning && (
                    <div className="rounded-xl border border-saffron/50 bg-saffron/10 text-saffron text-xs p-3 flex items-start gap-2 text-right">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{wizard.sop.steps[wizard.step].warning}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline" className="gap-1" disabled={wizard.step === 0}
                  onClick={() => setWizard({ ...wizard, step: wizard.step - 1 })}
                >
                  <ChevronRight className="h-4 w-4" /> مرحله قبل
                </Button>
                {wizard.step < wizard.sop.steps.length - 1 ? (
                  <Button className="gap-1" onClick={() => setWizard({ ...wizard, step: wizard.step + 1 })}>
                    مرحله بعد <ChevronLeft className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button className="gap-1.5" onClick={() => { setWizard(null); toast({ title: 'آفرین، همه مراحل انجام شد! ⭐' }) }}>
                    <CheckCircle2 className="h-4 w-4" /> تمام شد
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <SopEditor
        open={editorOpen}
        sop={editing}
        roles={roles}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); load() }}
      />
    </div>
  )
}

function SopEditor({
  open, sop, roles, onClose, onSaved,
}: {
  open: boolean
  sop: SopDTO | null
  roles: { key: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = React.useState('')
  const [category, setCategory] = React.useState('عمومی')
  const [summary, setSummary] = React.useState('')
  const [steps, setSteps] = React.useState<SopStep[]>([{ title: '', detail: '' }])
  const [selectedRoles, setSelectedRoles] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setTitle(sop?.title ?? '')
      setCategory(sop?.category ?? 'عمومی')
      setSummary(sop?.summary ?? '')
      setSteps(sop?.steps.length ? sop.steps : [{ title: '', detail: '' }])
      setSelectedRoles(sop?.roleKeys ? sop.roleKeys.split(',').map((r) => r.trim()).filter(Boolean) : [])
    }
  }, [open, sop])

  const toggleRole = (key: string) =>
    setSelectedRoles((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  const save = async () => {
    const cleanSteps = steps.filter((s) => s.title.trim())
    if (!title.trim() || cleanSteps.length === 0) {
      toast({ title: 'عنوان و حداقل یک مرحله لازم است', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api('/api/sops', {
        body: {
          id: sop?.id,
          title,
          category,
          summary,
          steps: cleanSteps,
          roleKeys: selectedRoles.join(','),
        },
      })
      toast({ title: sop ? 'رویه بروز شد ✅' : 'رویه جدید ثبت شد ✅' })
      onSaved()
    } catch (e) {
      toast({ title: 'ذخیره نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sop ? `ویرایش رویه (نسخه ${toFaDigits(sop.version + 1)} خواهد شد)` : 'رویه جدید'}</DialogTitle>
          <DialogDescription>تجربه‌ات را قدم‌به‌قدم بنویس تا بقیه مطمئن جلو بروند.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>عنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: پذیرش بار نان تازه" />
          </div>
          <div className="space-y-1.5">
            <Label>دسته</Label>
            <ChipSelect options={STEP_CATEGORIES.map((c) => ({ key: c, label: c }))} value={category} onChange={setCategory} />
          </div>
          <div className="space-y-1.5">
            <Label>خلاصه (اختیاری)</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>نقش‌های هدف</Label>
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <button
                  key={r.key} type="button" onClick={() => toggleRole(r.key)}
                  className={`rounded-full px-3 py-1.5 text-xs border transition-colors h-9 ${
                    selectedRoles.includes(r.key) ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card hover:bg-accent'
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">بدون انتخاب = نمایش برای همه</p>
          </div>
          <div className="space-y-2">
            <Label>مراحل</Label>
            {steps.map((st, i) => (
              <div key={i} className="rounded-xl border p-3 space-y-2 relative">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="num rounded-full">{toFaDigits(i + 1)}</Badge>
                  <Input
                    value={st.title}
                    onChange={(e) => setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)))}
                    placeholder="عنوان مرحله"
                    className="h-9"
                  />
                  {steps.length > 1 && (
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-pomegranate"
                      onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Textarea
                  value={st.detail}
                  onChange={(e) => setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, detail: e.target.value } : s)))}
                  placeholder="توضیح مرحله"
                  rows={2}
                  className="text-xs"
                />
                <Input
                  value={st.warning ?? ''}
                  onChange={(e) => setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, warning: e.target.value } : s)))}
                  placeholder="⚠️ هشدار (اختیاری) — مثلاً: صبر کن تا سرد شود"
                  className="h-9 text-xs"
                />
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setSteps((p) => [...p, { title: '', detail: '' }])}>
              <Plus className="h-4 w-4" /> افزودن مرحله
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>انصراف</Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} ذخیره
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
