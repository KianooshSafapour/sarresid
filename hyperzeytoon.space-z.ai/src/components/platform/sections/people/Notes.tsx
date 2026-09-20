'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { SectionHeader, EmptyState, LoadingBlock, ConfirmButton } from '@/components/platform/ui/shared'
import { timeAgo, toFaDigits } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Loader2, Lock, Plus, Pencil, Pin, StickyNote, Sparkles } from 'lucide-react'

interface NoteDTO {
  id: string
  title: string
  content?: string | null
  color: string
  pinned: boolean
  updatedAt: string
}

const NOTE_COLORS = ['#C9A227', '#3E7C59', '#D9832E', '#B33A3A', '#8A6F3C', '#5E8C61']

export function Notes() {
  const { toast } = useToast()
  const [notes, setNotes] = React.useState<NoteDTO[] | null>(null)
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<NoteDTO | null>(null)

  const load = React.useCallback(async () => {
    try {
      const d = await api<{ notes: NoteDTO[] }>('/api/notes')
      setNotes(d.notes)
    } catch {
      setNotes([])
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const remove = async (note: NoteDTO) => {
    try {
      await api(`/api/notes?id=${note.id}`, { method: 'DELETE' })
      toast({ title: 'یادداشت حذف شد' })
      load()
    } catch (e) {
      toast({ title: 'حذف نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="یادداشت‌های من"
        subtitle="دفترچه شخصی‌ات برای هر چیزی که نباید فراموش کنی"
        icon={<StickyNote className="h-5 w-5" />}
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setEditorOpen(true) }}>
            <Plus className="h-4 w-4" /> یادداشت جدید
          </Button>
        }
      />

      <div className="rounded-xl bg-accent border border-border p-3 flex items-center gap-2 text-xs">
        <Lock className="h-4 w-4 text-primary shrink-0" />
        <span>فقط خودت این‌ها را می‌بینی 🔒 — اینجا دفترچه خصوصی توست، هیچ‌کس دیگر دسترسی ندارد.</span>
      </div>

      {!notes ? (
        <LoadingBlock rows={3} />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title="هنوز یادداشتی ننوشتی"
          description="کد صندوق، شماره تأمین‌کننده یا هر نکته‌ای که لازم داری — اینجا جای امنی است ✨"
          action={
            <Button onClick={() => { setEditing(null); setEditorOpen(true) }} className="gap-1.5">
              <Plus className="h-4 w-4" /> اولین یادداشت
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {notes.map((n) => (
            <Card
              key={n.id}
              className="relative overflow-hidden border-0 text-white shadow-md"
              style={{ backgroundColor: n.color }}
            >
              <CardContent className="p-4 space-y-2 min-h-32">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-sm leading-6 break-words">{n.title}</p>
                  {n.pinned && <Pin className="h-4 w-4 shrink-0 opacity-80" />}
                </div>
                {n.content && <p className="text-xs leading-5 whitespace-pre-wrap opacity-90 line-clamp-6">{n.content}</p>}
                <div className="flex items-center justify-between gap-1 pt-1">
                  <span className="text-[10px] opacity-70">{timeAgo(n.updatedAt)}</span>
                  <div className="flex items-center gap-0.5">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={() => { setEditing(n); setEditorOpen(true) }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <ConfirmButton onConfirm={() => remove(n)} confirmText="حذف؟" variant="ghost" className="h-8 text-white hover:bg-white/20">
                      <span className="num">✕</span>
                    </ConfirmButton>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NoteEditor
        open={editorOpen}
        note={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); load() }}
      />
      <p className="text-[11px] text-muted-foreground text-center num">{toFaDigits(notes?.length ?? 0)} یادداشت خصوصی</p>
    </div>
  )
}

function NoteEditor({
  open, note, onClose, onSaved,
}: {
  open: boolean
  note: NoteDTO | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = React.useState('')
  const [content, setContent] = React.useState('')
  const [color, setColor] = React.useState(NOTE_COLORS[0])
  const [pinned, setPinned] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setTitle(note?.title ?? '')
      setContent(note?.content ?? '')
      setColor(note?.color ?? NOTE_COLORS[0])
      setPinned(note?.pinned ?? false)
    }
  }, [open, note])

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      if (note) {
        await api('/api/notes', { method: 'PATCH', body: { id: note.id, title, content, color, pinned } })
      } else {
        await api('/api/notes', { body: { title, content, color, pinned } })
      }
      toast({ title: note ? 'یادداشت بروز شد 🌿' : 'یادداشت ثبت شد 🌿' })
      onSaved()
    } catch (e) {
      toast({ title: 'ذخیره نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{note ? 'ویرایش یادداشت' : 'یادداشت جدید'}</DialogTitle>
          <DialogDescription>این یادداشت فقط برای خودت قابل دیدن است.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>عنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: کد رمز صندوق ۲" />
          </div>
          <div className="space-y-1.5">
            <Label>متن</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
          </div>
          <div className="space-y-1.5">
            <Label>رنگ</Label>
            <div className="flex gap-2">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c} type="button" onClick={() => setColor(c)} aria-label={`رنگ ${c}`}
                  className={`h-10 w-10 rounded-xl transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-foreground scale-105' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <span className="text-sm">سنجاق در ابتدای فهرست</span>
            <Switch checked={pinned} onCheckedChange={setPinned} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>انصراف</Button>
            <Button onClick={save} disabled={saving || !title.trim()} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} ذخیره
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
