'use client'
import * as React from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { toFaDigits } from '@/lib/jalali'
import type { PUser } from '@/lib/types'
import {
  Field, inputCls, Loading, Modal, PrimaryButton, SectionHeader,
  EmptyState, GhostButton, TimeAgo,
} from '@/components/platform/kit'

interface NoteT {
  id: number
  userId: number
  title: string
  content: string | null
  color: string
  createdAt: string
  updatedAt: string
}

const NOTE_COLORS = [
  { key: 'olive', bg: 'bg-[#F3F7EF]', border: 'border-[#D8E2D0]', dot: '#93C572', label: 'زیتونی' },
  { key: 'gold', bg: 'bg-[#FBF3DC]', border: 'border-[#EAD9A8]', dot: '#DAA520', label: 'طلایی' },
  { key: 'rose', bg: 'bg-[#FBEAEA]', border: 'border-[#F2CDCD]', dot: '#E08A8A', label: 'گلگون' },
  { key: 'sky', bg: 'bg-[#EAF3F7]', border: 'border-[#CDE0E8]', dot: '#8FBFCF', label: 'فیروزه‌ای روشن' },
]
const noteColor = (c: string) => NOTE_COLORS.find((x) => x.key === c) ?? NOTE_COLORS[0]

export default function NotesSection({ user }: { user: PUser }) {
  const [notes, setNotes] = React.useState<NoteT[]>([])
  const [loading, setLoading] = React.useState(true)

  // editor modal
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<NoteT | null>(null)
  const [fTitle, setFTitle] = React.useState('')
  const [fContent, setFContent] = React.useState('')
  const [fColor, setFColor] = React.useState('olive')
  const [saving, setSaving] = React.useState(false)

  // two-step delete confirm
  const [delConfirmId, setDelConfirmId] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    try {
      setLoading(true)
      const d = await api.get<{ notes: NoteT[] }>(`/api/notes?userId=${user.id}`)
      setNotes(d.notes)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [user.id])

  React.useEffect(() => { void load() }, [load])

  function openEditor(n?: NoteT) {
    setEditing(n ?? null)
    setFTitle(n?.title ?? '')
    setFContent(n?.content ?? '')
    setFColor(n?.color ?? 'olive')
    setDelConfirmId(null)
    setEditorOpen(true)
  }

  async function saveNote(e: React.FormEvent) {
    e.preventDefault()
    if (!fTitle.trim()) { toast.error('برای یادداشت یک عنوان بگذار'); return }
    setSaving(true)
    try {
      if (editing) {
        await api.patch<{ note: NoteT }>('/api/notes', { id: editing.id, title: fTitle.trim(), content: fContent.trim() || null, color: fColor })
        toast.success('یادداشت به‌روز شد ✅')
      } else {
        await api.post<{ note: NoteT }>('/api/notes', { userId: user.id, title: fTitle.trim(), content: fContent.trim() || null, color: fColor })
        toast.success('یادداشت ذخیره شد — خیالت راحت 🗒️')
      }
      setEditorOpen(false)
      void load()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteNote(n: NoteT) {
    try {
      await api.del(`/api/notes?id=${n.id}`)
      setDelConfirmId(null)
      toast.success('یادداشت حذف شد')
      void load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div dir="rtl" className="space-y-4">
      <SectionHeader
        title="یادداشت‌های من"
        subtitle="جای چیزهای کوچک: چک‌لیست شخصی، شماره‌ها، یادآوری‌ها"
        icon={<span className="text-lg">🗒️</span>}
        actions={<PrimaryButton onClick={() => openEditor()}>+ یادداشت جدید</PrimaryButton>}
      />

      <div className="flex items-center gap-2 rounded-2xl border border-[#C8D8C0] bg-[#F3F7EF] px-4 py-3 text-sm font-semibold text-[#3E6B4A]">
        🔒 این یادداشت‌ها فقط برای خودت است — هیچ‌کس دیگر نمی‌بیند.
      </div>

      {loading ? (
        <Loading />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={<span className="text-3xl">🗒️</span>}
          title="هنوز یادداشتی نداری"
          hint="یکی بساز و خیالت راحت کن — مثلاً کدهای قفسه‌ها یا یادآوری فردا صبح."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {notes.map((n) => {
            const c = noteColor(n.color)
            return (
              <div
                key={n.id}
                className={cn(
                  'flex min-h-[180px] flex-col rounded-2xl border p-4 shadow-sm transition-transform hover:-translate-y-0.5',
                  c.bg,
                  c.border
                )}
              >
                <h3 className="break-words font-bold leading-6 text-[#253A2A]">{n.title}</h3>
                {n.content && (
                  <p className="mt-1.5 flex-1 whitespace-pre-wrap break-words text-xs leading-6 text-[#5A6B54]">{n.content}</p>
                )}
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/5 pt-2">
                  <TimeAgo iso={n.updatedAt} />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`ویرایش یادداشت ${n.title}`}
                      onClick={() => openEditor(n)}
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-base transition hover:bg-black/5"
                    >
                      ✏️
                    </button>
                    {delConfirmId === n.id ? (
                      <button
                        type="button"
                        onClick={() => void deleteNote(n)}
                        className="min-h-[44px] rounded-xl bg-rose-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700"
                      >
                        حذف؟
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`حذف یادداشت ${n.title}`}
                        onClick={() => setDelConfirmId(n.id)}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-base transition hover:bg-black/5"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* add-note friendly button always visible at end of grid */}
      {!loading && notes.length > 0 && (
        <button
          type="button"
          onClick={() => openEditor()}
          className="flex min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#C8D8C0] bg-white/60 text-sm font-bold text-[#6B7A66] transition hover:border-[#5F8F55] hover:bg-[#F3F7EF] active:scale-[0.99]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-b from-[#4A7A52] to-[#3A6242] text-xl font-bold text-white shadow-md">+</span>
          یادداشت جدید
        </button>
      )}

      {/* create / edit modal */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? 'ویرایش یادداشت' : 'یادداشت جدید'}>
        <form onSubmit={saveNote} className="space-y-4">
          <Field label="عنوان" required>
            <input className={inputCls} value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="مثلاً: یادآوری سفارش نان فردا" />
          </Field>
          <Field label="متن یادداشت" hint="فقط برای خودت ذخیره می‌شود">
            <textarea
              className={cn(inputCls, 'min-h-[110px] resize-y')}
              value={fContent}
              onChange={(e) => setFContent(e.target.value)}
              placeholder="هر چیزی که نمی‌خواهی فراموش کنی…"
            />
          </Field>
          <Field label="رنگ">
            <div className="flex gap-3">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-label={`رنگ ${c.label}`}
                  aria-pressed={fColor === c.key}
                  onClick={() => setFColor(c.key)}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-full border-2 transition-all',
                    fColor === c.key ? 'border-[#3E6B4A] ring-2 ring-[#93C572]/40' : 'border-black/10 hover:border-black/25'
                  )}
                  style={{ backgroundColor: `${c.dot}33` }}
                >
                  <span className="h-4 w-4 rounded-full" style={{ backgroundColor: c.dot }} />
                </button>
              ))}
            </div>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton type="button" onClick={() => setEditorOpen(false)}>انصراف</GhostButton>
            <PrimaryButton type="submit" disabled={saving}>{editing ? 'ذخیره تغییرات' : 'ذخیره یادداشت'}</PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  )
}
