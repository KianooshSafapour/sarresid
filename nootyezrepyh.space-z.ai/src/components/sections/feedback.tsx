'use client'

import * as React from 'react'
import { api, type ClientUser } from '@/lib/api-client'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { toFaDigits, formatJalaliDateTime } from '@/lib/jalali'
import { GlowCard, SectionHeader, EmptyState, OrnamentDivider } from '@/components/zeytoon-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Star, Send, Lock, Lightbulb, Loader2, ShieldCheck, PartyPopper } from 'lucide-react'

interface Idea {
  id: string
  authorId: string
  title: string
  content: string
  status: string
  rewardPoints: number
  reviewedBy: string | null
  createdAt: string
  authorName?: string
}

interface FeedbackItem {
  id: string
  content: string
  category: string
  rating: number
  status: string
  response: string | null
  createdAt: string
}

const IDEA_STATUSES: Record<string, { label: string; color: string; bg: string }> = {
  SUBMITTED: { label: 'در انتظار بررسی', color: '#8a8a8a', bg: '#f0f0f0' },
  UNDER_REVIEW: { label: 'در حال بررسی', color: '#4f6d7d', bg: '#e6edf1' },
  ACCEPTED: { label: 'پذیرفته شد 🎉', color: '#2f7d4f', bg: '#e8f5ec' },
  IMPLEMENTED: { label: 'اجرا شده 🏆', color: '#8a6d1f', bg: '#f7f0dc' },
  REJECTED: { label: 'نیاز به بازنگری', color: '#a35d3f', bg: '#f9ece4' },
}

const FEEDBACK_CATEGORIES = ['پلتفرم', 'گردش کار', 'محیط کار', 'سایر']

const FEEDBACK_STATUSES: Record<string, { label: string; color: string }> = {
  NEW: { label: 'جدید', color: '#8a8a8a' },
  REVIEWED: { label: 'بررسی شد', color: '#4f6d7d' },
  ACTIONED: { label: 'اقدام شد ✅', color: '#2f7d4f' },
}

export function FeedbackSection({ user }: { user: ClientUser }) {
  const isManager = canUser(user.roles, PERMISSIONS.MANAGE_TASKS) || canUser(user.roles, PERMISSIONS.AWARD_POINTS)
  const [tab, setTab] = React.useState<'anonymous' | 'ideas' | 'review'>('anonymous')

  return (
    <div className="max-w-3xl mx-auto">
      <SectionHeader
        title="بازخورد و ایده‌ها"
        subtitle="صدای تو برای ما مهم‌ترین سند است — هر نظر و ایده، فروشگاه را بهتر می‌کند 🌿"
        actions={
          <div className="flex flex-wrap rounded-xl border border-gold/25 bg-card p-1 gap-1">
            <TabBtn active={tab === 'anonymous'} onClick={() => setTab('anonymous')}>بازخورد ناشناس</TabBtn>
            <TabBtn active={tab === 'ideas'} onClick={() => setTab('ideas')}>ایده‌های من</TabBtn>
            {isManager && <TabBtn active={tab === 'review'} onClick={() => setTab('review')}>بررسی</TabBtn>}
          </div>
        }
      />
      {tab === 'anonymous' && <AnonymousTab />}
      {tab === 'ideas' && <MyIdeasTab />}
      {tab === 'review' && isManager && <ReviewTab />}
      <Toaster />
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn('px-3.5 h-9 rounded-lg text-[13px] font-bold transition-colors', active ? 'bg-olive text-white' : 'text-muted-foreground hover:bg-accent')}
    >
      {children}
    </button>
  )
}

/* ==================== ANONYMOUS FEEDBACK ==================== */

function AnonymousTab() {
  const { toast } = useToast()
  const [content, setContent] = React.useState('')
  const [category, setCategory] = React.useState(FEEDBACK_CATEGORIES[0])
  const [rating, setRating] = React.useState(0)
  const [hover, setHover] = React.useState(0)
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    if (!content.trim() || rating === 0) {
      toast({ title: 'کمی کامل‌تر کن 🙂', description: 'متن بازخورد و ستاره‌ها را پر کن.', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      await api.post('/api/feedback', { content: content.trim(), category, rating })
      setContent(''); setRating(0)
      toast({ title: 'ممنون از صدای قشنگت 🙏', description: 'بازخوردت ۱۰۰٪ ناشناس ثبت شد و حتماً خونده می‌شه.' })
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <GlowCard className="p-5 md:p-6">
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3 mb-4">
          <Lock className="size-5 shrink-0 text-emerald-600 mt-0.5" />
          <div>
            <div className="font-extrabold text-emerald-800 text-sm">ناشناس ۱۰۰٪ — فقط برای بهتر شدن سامانه</div>
            <p className="text-[13px] text-emerald-700 mt-0.5 leading-relaxed">نامت هیچ‌جا ثبت نمی‌شه؛ نه مدیر می‌بینه، نه هیچ‌کس. راحت و رک بنویس 🌿</p>
          </div>
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {FEEDBACK_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn('rounded-full px-4 py-2 text-[13px] font-bold border transition-all', category === c ? 'bg-olive text-white border-transparent' : 'border-gold/25 text-muted-foreground hover:border-gold/50')}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Stars */}
        <div className="flex items-center justify-center gap-1.5 mb-4" dir="ltr">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(i)}
              aria-label={`${i} ستاره`}
              className="p-1 active:scale-90 transition-transform"
            >
              <Star className={cn('size-9 transition-colors', i <= (hover || rating) ? 'fill-gold text-gold' : 'text-gold/30')} />
            </button>
          ))}
        </div>
        <div className="text-center text-xs text-muted-foreground mb-4 -mt-2">
          {rating === 0 ? 'امتیازت به سامانه چنده؟' : rating <= 2 ? 'ممنون که صادقانه می‌گی — کمک بزرگیه 🙏' : rating <= 4 ? 'دمت گرم! همراهی‌ت ارزشمنده ✨' : 'وای چه عالی! خوشحالم که راحتی 🥳'}
        </div>

        <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="هر چی تو دلته بنویس — پیشنهاد، گلایه، یا حتی یه تشکر کوچیک..." className="min-h-28" />

        <Button onClick={submit} disabled={busy} className="w-full h-12 mt-4 text-base font-black bg-olive hover:bg-olive/90 text-white">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <><Send className="size-4 ml-1.5" /> بفرست، خیالت راحت</>}
        </Button>
      </GlowCard>
      <OrnamentDivider />
    </div>
  )
}

/* ==================== MY IDEAS ==================== */

function MyIdeasTab() {
  const { toast } = useToast()
  const [ideas, setIdeas] = React.useState<Idea[] | null>(null)
  const [title, setTitle] = React.useState('')
  const [content, setContent] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(() => {
    api.get<Idea[]>('/api/ideas').then(setIdeas).catch(() => setIdeas([]))
  }, [])
  React.useEffect(() => { load() }, [load])

  async function submit() {
    if (!title.trim() || !content.trim()) {
      toast({ title: 'عنوان و توضیح ایده را بنویس 🙂', variant: 'destructive' }); return
    }
    setBusy(true)
    try {
      await api.post('/api/ideas', { title: title.trim(), content: content.trim() })
      setTitle(''); setContent('')
      toast({ title: 'ایده‌ات رسید! 💡', description: 'مدیران بررسی می‌کنند و اگر پذیرفته بشه، امتیاز هم می‌گیری!' })
      load()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <GlowCard className="p-5">
        <div className="font-extrabold flex items-center gap-2 mb-1"><Lightbulb className="size-5 text-gold" /> یه ایده داری؟ خالی نذارش!</div>
        <p className="text-[13px] text-muted-foreground mb-4">ایده‌های عملی پذیرفته‌شده امتیاز پاداش هم دارن 🏅</p>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان ایده — مثلاً: جابجایی قفسه تنقلات" className="h-11 mb-2.5" />
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="کامل توضیح بده — چطور اجرا بشه و چه مشکلی رو حل می‌کنه؟" className="min-h-24" />
        <Button onClick={submit} disabled={busy} className="w-full h-11 mt-3 font-black bg-gold hover:bg-gold/90 text-[#3d2f05]">
          {busy ? <Loader2 className="size-4 animate-spin" /> : 'ثبت ایده 💡'}
        </Button>
      </GlowCard>

      {!ideas ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : ideas.length === 0 ? (
        <EmptyState icon="💡" title="هنوز ایده‌ای ثبت نکردی" description="کوچک‌ترین ایده هم ارزشمنده — شروع کن!" />
      ) : (
        <div className="space-y-3">
          {ideas.map((idea) => {
            const s = IDEA_STATUSES[idea.status] || IDEA_STATUSES.SUBMITTED
            return (
              <div key={idea.id} className="glow-card p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="font-bold">{idea.title}</div>
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: s.color, background: s.bg }}>{s.label}</span>
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed mt-1.5">{idea.content}</p>
                <div className="flex items-center justify-between mt-2.5 text-[11px] text-muted-foreground">
                  <span>{toFaDigits(formatJalaliDateTime(idea.createdAt))}</span>
                  {(idea.status === 'ACCEPTED' || idea.status === 'IMPLEMENTED') && idea.rewardPoints > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 text-gold px-2.5 py-1 font-black animate-pulse-gold">
                      <PartyPopper className="size-3.5" /> +{toFaDigits(idea.rewardPoints)} امتیاز پاداش!
                    </span>
                  )}
                  {idea.status === 'REJECTED' && <span className="text-[#a35d3f] font-bold">اشکالی نداره — یه بار دیگه با جزئیات بیشتر امتحان کن 💪</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ==================== MANAGER REVIEW ==================== */

function ReviewTab() {
  const { toast } = useToast()
  const [feedback, setFeedback] = React.useState<FeedbackItem[] | null>(null)
  const [ideas, setIdeas] = React.useState<Idea[] | null>(null)
  const [responses, setResponses] = React.useState<Record<string, string>>({})
  const [ideaDialog, setIdeaDialog] = React.useState<Idea | null>(null)

  const load = React.useCallback(() => {
    api.get<FeedbackItem[]>('/api/feedback').then(setFeedback).catch(() => setFeedback([]))
    api.get<Idea[]>('/api/ideas').then(setIdeas).catch(() => setIdeas([]))
  }, [])
  React.useEffect(() => { load() }, [load])

  async function setFeedbackStatus(f: FeedbackItem, status: string) {
    try {
      await api.patch('/api/feedback', { id: f.id, status, response: responses[f.id]?.trim() || f.response || undefined })
      toast({ title: status === 'ACTIONED' ? 'اقدام ثبت شد ✅' : 'بررسی ثبت شد' })
      load()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-5">
      {/* Feedback list */}
      <div>
        <h3 className="font-extrabold mb-3 flex items-center gap-2"><ShieldCheck className="size-4 text-olive" /> بازخوردهای ناشناس</h3>
        {!feedback ? (
          <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        ) : feedback.length === 0 ? (
          <EmptyState icon="📮" title="هنوز بازخوردی ثبت نشده" />
        ) : (
          <div className="space-y-3">
            {feedback.map((f) => {
              const st = FEEDBACK_STATUSES[f.status] || FEEDBACK_STATUSES.NEW
              return (
                <div key={f.id} className="glow-card p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: st.color }}>{st.label}</span>
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{f.category}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{toFaDigits(formatJalaliDateTime(f.createdAt))}</span>
                  </div>
                  <div className="flex gap-0.5" dir="ltr">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className={cn('size-4', i <= f.rating ? 'fill-gold text-gold' : 'text-gold/25')} />
                    ))}
                  </div>
                  <p className="text-[14px] leading-7">{f.content}</p>
                  {f.response && <div className="rounded-xl bg-accent/60 p-2.5 text-[13px]"><span className="font-bold">پاسخ مدیر: </span>{f.response}</div>}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={responses[f.id] ?? ''}
                      onChange={(e) => setResponses((p) => ({ ...p, [f.id]: e.target.value }))}
                      placeholder="پاسخ یا یادداشت داخلی (اختیاری)..."
                      className="h-10 flex-1"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-10 px-3 font-bold" onClick={() => setFeedbackStatus(f, 'REVIEWED')}>بررسی شد</Button>
                      <Button size="sm" className="h-10 px-3 font-bold bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setFeedbackStatus(f, 'ACTIONED')}>اقدام شد ✅</Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Ideas list */}
      <div>
        <h3 className="font-extrabold mb-3 flex items-center gap-2"><Lightbulb className="size-4 text-gold" /> ایده‌های همکاران</h3>
        {!ideas ? (
          <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
        ) : ideas.length === 0 ? (
          <EmptyState icon="💡" title="هنوز ایده‌ای ثبت نشده" />
        ) : (
          <div className="space-y-3">
            {ideas.map((idea) => {
              const s = IDEA_STATUSES[idea.status] || IDEA_STATUSES.SUBMITTED
              return (
                <div key={idea.id} className="glow-card p-4">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <div className="font-bold">{idea.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">از: {idea.authorName || idea.authorId} · {toFaDigits(formatJalaliDateTime(idea.createdAt))}</div>
                    </div>
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: s.color, background: s.bg }}>{s.label}</span>
                  </div>
                  <p className="text-[13px] text-muted-foreground leading-relaxed mt-1.5">{idea.content}</p>
                  <div className="mt-2.5">
                    <Button size="sm" variant="outline" className="h-9 font-bold" onClick={() => setIdeaDialog(idea)}>بررسی ایده</Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <IdeaReviewDialog
        idea={ideaDialog}
        onClose={() => setIdeaDialog(null)}
        onSaved={() => { setIdeaDialog(null); load(); toast({ title: 'نتیجه بررسی ثبت شد ✅' }) }}
      />
    </div>
  )
}

function IdeaReviewDialog({ idea, onClose, onSaved }: { idea: Idea | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [status, setStatus] = React.useState('ACCEPTED')
  const [points, setPoints] = React.useState('20')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (idea) { setStatus(idea.status === 'SUBMITTED' || idea.status === 'UNDER_REVIEW' ? 'ACCEPTED' : idea.status); setPoints(String(idea.rewardPoints || 20)) }
  }, [idea])

  async function submit() {
    if (!idea) return
    setBusy(true)
    try {
      await api.patch(`/api/ideas/${idea.id}`, { status, rewardPoints: Number(points) || 0 })
      onSaved()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={!!idea} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-right">بررسی ایده 💡</DialogTitle></DialogHeader>
        {idea && (
          <div className="space-y-3.5">
            <div className="rounded-xl bg-accent/50 p-3">
              <div className="font-bold text-sm">{idea.title}</div>
              <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{idea.content}</p>
            </div>
            <div>
              <div className="text-[13px] font-bold mb-1.5">نتیجه</div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(IDEA_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(status === 'ACCEPTED' || status === 'IMPLEMENTED') && (
              <div>
                <div className="text-[13px] font-bold mb-1.5">امتیاز پاداش (برای نویسنده ایده)</div>
                <Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} className="h-11" dir="ltr" />
                <div className="text-[11px] text-muted-foreground mt-1">پیشنهاد: {toFaDigits(20)} امتیاز — ایده اجراشده می‌تونه بیشتر باشه 🏅</div>
              </div>
            )}
            {status === 'REJECTED' && <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[13px] text-amber-800">با لحن مثبت اطلاع بده — «نیاز به بازنگری» یعنی هنوز فرصت دوباره هست 🌱</div>}
          </div>
        )}
        <DialogFooter className="flex-row justify-start gap-2">
          <Button onClick={submit} disabled={busy} className="h-11 px-6 font-bold bg-olive hover:bg-olive/90 text-white">
            {busy ? <Loader2 className="size-4 animate-spin" /> : 'ثبت نتیجه ✅'}
          </Button>
          <Button variant="ghost" onClick={onClose} className="h-11">انصراف</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
