'use client'

import * as React from 'react'
import { api, type ClientUser } from '@/lib/api-client'
import { toFaDigits, formatJalali } from '@/lib/jalali'
import { SectionHeader, EmptyState } from '@/components/zeytoon-ui'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Pin, PinOff, Check } from 'lucide-react'

interface Note {
  id: string
  content: string
  color: string
  pinned: boolean
  createdAt: string
  updatedAt: string
}

const NOTE_COLORS: Record<string, { label: string; bg: string; border: string; dot: string }> = {
  olive: { label: 'زیتونی', bg: '#eef4e6', border: '#b9cf9d', dot: '#5a7d4f' },
  gold: { label: 'طلایی', bg: '#faf3dd', border: '#e3c987', dot: '#b8860b' },
  amber: { label: 'نارنجی', bg: '#fdeeda', border: '#eec9a0', dot: '#c07a1f' },
  rose: { label: 'گل‌گل', bg: '#fbe9ec', border: '#eab4bf', dot: '#c25e77' },
}

export function NotesSection({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const [notes, setNotes] = React.useState<Note[] | null>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState('')
  const [draftColor, setDraftColor] = React.useState('olive')
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [newText, setNewText] = React.useState('')
  const [newColor, setNewColor] = React.useState('olive')

  const load = React.useCallback(() => {
    api.get<Note[]>('/api/notes').then(setNotes).catch(() => setNotes([]))
  }, [])
  React.useEffect(() => { load() }, [load])

  const sorted = [...(notes || [])].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  async function create() {
    if (!newText.trim()) { toast({ title: 'اول یه چیزی بنویس ✍️' }); return }
    try {
      await api.post('/api/notes', { content: newText.trim(), color: newColor })
      setNewText(''); setNewColor('olive'); setCreating(false)
      load()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  function startEdit(n: Note) {
    setEditingId(n.id)
    setDraft(n.content)
    setDraftColor(n.color)
  }

  async function saveEdit() {
    const note = (notes || []).find((n) => n.id === editingId)
    if (!note) return
    if (draft.trim() === note.content && draftColor === note.color) { setEditingId(null); return }
    try {
      await api.patch(`/api/notes/${note.id}`, { content: draft.trim() || note.content, color: draftColor })
      setEditingId(null)
      load()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  async function togglePin(n: Note) {
    try { await api.patch(`/api/notes/${n.id}`, { pinned: !n.pinned }); load() } catch { toast({ title: 'خطا', variant: 'destructive' }) }
  }

  async function remove() {
    if (!deleteId) return
    try { await api.delete(`/api/notes/${deleteId}`); setDeleteId(null); load() } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  return (
    <div>
      <SectionHeader
        title="یادداشت‌های من"
        subtitle="کاغذهای چسبان تو — فقط خودت این‌ها را می‌بینی 🔒"
        actions={
          <Button className="h-11 px-5 font-bold bg-olive hover:bg-olive/90 text-white" onClick={() => { setCreating(true); setTimeout(() => document.getElementById('new-note-input')?.focus(), 50) }}>
            <Plus className="size-4 ml-1" /> یادداشت جدید
          </Button>
        }
      />

      {/* Create inline */}
      {creating && (
        <div className="rounded-2xl border-2 border-dashed border-gold/50 bg-card p-4 mb-5 shadow-sm">
          <Textarea
            id="new-note-input"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) create() }}
            placeholder="بنویس: چیزی که نباید یادت بره..."
            className="min-h-20 bg-transparent"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <ColorPicker value={newColor} onChange={setNewColor} />
            <div className="flex gap-2">
              <Button onClick={create} className="h-10 px-5 font-bold bg-olive hover:bg-olive/90 text-white">ذخیره 📌</Button>
              <Button variant="ghost" onClick={() => { setCreating(false); setNewText('') }} className="h-10">بی‌خیال</Button>
            </div>
          </div>
        </div>
      )}

      {/* Masonry grid */}
      {!notes ? (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-36 rounded-2xl mb-4 break-inside-avoid" />)}</div>
      ) : sorted.length === 0 ? (
        <EmptyState icon="🗒️" title="هنوز یادداشتی نداری" description="هر چیزی که نباید یادت بره — شماره تلفن، رمز قفسه، ایده کوچیک — این‌جا بچسبون." />
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
          {sorted.map((n) => {
            const c = NOTE_COLORS[n.color] || NOTE_COLORS.olive
            const isEditing = editingId === n.id
            return (
              <div
                key={n.id}
                className="mb-4 break-inside-avoid rounded-2xl border-2 p-4 shadow-sm transition-transform hover:-translate-y-0.5 cursor-pointer group"
                style={{ background: c.bg, borderColor: c.border }}
                onClick={() => !isEditing && startEdit(n)}
              >
                {isEditing ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Textarea
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="min-h-24 bg-transparent border-none p-0 focus-visible:ring-0 text-sm resize-none"
                      onBlur={saveEdit}
                    />
                    <div className="mt-3 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                      <ColorPicker value={draftColor} onChange={setDraftColor} small />
                      <Button size="sm" className="h-8 px-3 bg-olive hover:bg-olive/90 text-white" onMouseDown={(e) => { e.preventDefault(); saveEdit() }}>
                        <Check className="size-3.5" /> ذخیره
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm leading-6 whitespace-pre-wrap break-words">{n.content || '(خالی)'}</p>
                    <div className="mt-3 flex items-center justify-between text-[10px] text-black/45">
                      <span>{toFaDigits(formatJalali(n.updatedAt))}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); togglePin(n) }}
                          className="size-7 rounded-full flex items-center justify-center hover:bg-black/10"
                          aria-label={n.pinned ? 'برداشتن سنجاق' : 'سنجاق کردن'}
                          title={n.pinned ? 'برداشتن سنجاق' : 'سنجاق کردن'}
                        >
                          {n.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteId(n.id) }}
                          className="size-7 rounded-full flex items-center justify-center hover:bg-red-100 text-red-700/70"
                          aria-label="حذف یادداشت"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      {n.pinned && <Pin className="size-3.5 group-hover:hidden" />}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">یادداشت حذف شود؟</AlertDialogTitle>
            <AlertDialogDescription>این یادداشت فقط مال خودت بود؛ بعد از حذف برنمی‌گرده.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-start gap-2">
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={remove}>بله، حذف کن</AlertDialogAction>
            <AlertDialogCancel>بی‌خیال</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster />
    </div>
  )
}

function ColorPicker({ value, onChange, small }: { value: string; onChange: (c: string) => void; small?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {Object.entries(NOTE_COLORS).map(([k, c]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          title={c.label}
          aria-label={`رنگ ${c.label}`}
          className={cn(
            'rounded-full border-2 transition-all active:scale-90',
            small ? 'size-5' : 'size-7',
            value === k ? 'scale-110 shadow-md' : 'opacity-70 hover:opacity-100'
          )}
          style={{ background: c.dot, borderColor: value === k ? '#00000055' : 'transparent' }}
        />
      ))}
      <span className="text-[10px] text-muted-foreground mr-1">{NOTE_COLORS[value]?.label || 'رنگ'}</span>
    </div>
  )
}
