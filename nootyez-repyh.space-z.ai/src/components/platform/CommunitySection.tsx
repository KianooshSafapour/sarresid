'use client'
import * as React from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { toFaDigits } from '@/lib/jalali'
import { hasRole, IDEA_STATUSES, IDEA_STATUS_LABELS, type PUser } from '@/lib/types'
import {
  Avatar, Badge, Card, EmptyState, Field, GhostButton, inputCls,
  Loading, PrimaryButton, SectionHeader, Tabs, TimeAgo,
} from '@/components/platform/kit'

interface WallPostT {
  id: number
  userId: number
  content: string
  pinned: boolean
  createdAt: string
  user: { id: number; name: string; color: string } | null
}

interface IdeaT {
  id: number
  userId: number
  title: string
  content: string
  status: string
  decision: string | null
  createdAt: string
  decidedAt: string | null
  user: { id: number; name: string; color: string } | null
}

interface FeedbackT {
  id: number
  content: string
  rating: number | null
  createdAt: string
}

const IDEA_STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'bg-stone-100 text-stone-700 border-stone-200',
  REVIEWING: 'bg-amber-50 text-amber-800 border-amber-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  IMPLEMENTED: 'bg-[#FBF3DC] text-[#8A6508] border-[#EAD9A8] font-bold',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
}

function Stars({ rating, size = 'text-base' }: { rating: number | null; size?: string }) {
  return (
    <span className={cn('tracking-widest', size)} aria-label={rating ? `${toFaDigits(rating)} از ۵ ستاره` : 'بدون امتیاز'}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={rating && n <= rating ? 'text-[#DAA520]' : 'text-[#D8D2BC]'}>★</span>
      ))}
    </span>
  )
}

export default function CommunitySection({ user }: { user: PUser }) {
  // pin/unpin + idea decisions: GM/OM/IT — feedback inbox: GM/OM/OWNER/IT
  const canModerate = hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'OPERATION_MANAGER') || hasRole(user, 'IT_ADMIN')
  const canReadFeedback = canModerate || hasRole(user, 'OWNER')

  const [tab, setTab] = React.useState('wall')
  const [loading, setLoading] = React.useState(true)

  // wall
  const [posts, setPosts] = React.useState<WallPostT[]>([])
  const [wallText, setWallText] = React.useState('')
  const [posting, setPosting] = React.useState(false)

  // ideas
  const [ideas, setIdeas] = React.useState<IdeaT[]>([])
  const [ideaTitle, setIdeaTitle] = React.useState('')
  const [ideaBody, setIdeaBody] = React.useState('')
  const [submittingIdea, setSubmittingIdea] = React.useState(false)
  const [decideStatus, setDecideStatus] = React.useState<Record<number, string>>({})
  const [decideNote, setDecideNote] = React.useState<Record<number, string>>({})

  // feedback
  const [feedback, setFeedback] = React.useState<FeedbackT[]>([])
  const [rating, setRating] = React.useState(0)
  const [fbText, setFbText] = React.useState('')
  const [sendingFeedback, setSendingFeedback] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setLoading(true)
      const [w, i] = await Promise.all([
        api.get<{ posts: WallPostT[] }>('/api/wall'),
        api.get<{ ideas: IdeaT[] }>('/api/ideas'),
      ])
      setPosts(w.posts)
      setIdeas(i.ideas)
      if (canReadFeedback) {
        const f = await api.get<{ feedback: FeedbackT[] }>('/api/feedback')
        setFeedback(f.feedback)
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [canReadFeedback])

  React.useEffect(() => { void load() }, [load])

  /* ---------- wall ---------- */

  async function publishPost() {
    const content = wallText.trim()
    if (!content) { toast.error('چیزی برای انتشار بنویس'); return }
    setPosting(true)
    try {
      const res = await api.post<{ post: WallPostT }>('/api/wall', { userId: user.id, content })
      setPosts((prev) => [res.post, ...prev])
      setWallText('')
      toast.success('منتشر شد! ممنون که تیم را به‌روز نگه می‌داری 💚 (+۲ امتیاز)')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPosting(false)
    }
  }

  async function togglePin(p: WallPostT) {
    try {
      const res = await api.patch<{ post: { id: number; pinned: boolean } }>('/api/wall', { id: p.id, pinned: !p.pinned, userId: user.id })
      setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, pinned: res.post.pinned } : x)))
      toast.success(res.post.pinned ? 'پست سنجاق شد 📌 — همه اول این را می‌بینند' : 'سنجاق برداشته شد')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /* ---------- ideas ---------- */

  async function submitIdea() {
    const title = ideaTitle.trim()
    const content = ideaBody.trim()
    if (!title || !content) { toast.error('عنوان و توضیح ایده را کامل بنویس'); return }
    setSubmittingIdea(true)
    try {
      const res = await api.post<{ idea: IdeaT }>('/api/ideas', { userId: user.id, title, content })
      setIdeas((prev) => [res.idea, ...prev])
      setIdeaTitle('')
      setIdeaBody('')
      toast.success('ایده‌ات ثبت شد! اگر پیاده شود جایزه دارد 🌟')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmittingIdea(false)
    }
  }

  async function decideIdea(i: IdeaT) {
    const status = decideStatus[i.id] ?? i.status
    try {
      const res = await api.patch<{ idea: IdeaT }>('/api/ideas', {
        id: i.id, status,
        decision: decideNote[i.id] !== undefined ? decideNote[i.id] : i.decision,
        decidedById: user.id,
      })
      setIdeas((prev) => prev.map((x) => (x.id === i.id ? { ...x, status: res.idea.status, decision: res.idea.decision, decidedAt: res.idea.decidedAt } : x)))
      toast.success('وضعیت ایده به‌روز شد — به صاحب ایده خبر داده شد ✅')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /* ---------- feedback ---------- */

  async function sendFeedback() {
    const content = fbText.trim()
    if (!content) { toast.error('متن بازخورد را بنویس — هر چه کوتاه‌تر بهتر'); return }
    setSendingFeedback(true)
    try {
      const res = await api.post<{ feedback: FeedbackT }>('/api/feedback', { content, rating: rating > 0 ? rating : null })
      setFeedback((prev) => [res.feedback, ...prev])
      setFbText('')
      setRating(0)
      toast.success('نظر ناشناس شما ثبت شد — ممنون که کمک می‌کنی بهتر شویم 💚')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSendingFeedback(false)
    }
  }

  /* ---------- render ---------- */

  const tabs = [
    { key: 'wall', label: 'دیوار تیمی' },
    { key: 'ideas', label: 'ایده‌ها' },
    { key: 'feedback', label: 'بازخورد ناشناس' },
    ...(canReadFeedback ? [{ key: 'inbox', label: 'صندوق بازخورد' }] : []),
  ]

  return (
    <div dir="rtl" className="space-y-4">
      <SectionHeader
        title="تیم"
        subtitle="جایی برای هم‌فکری، ایده و شنیده‌شدن — صدای هر عضو تیم مهم است"
        icon={<span className="text-lg">🤝</span>}
      />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {loading ? (
        <Loading />
      ) : tab === 'wall' ? (
        <div className="space-y-4">
          {/* composer */}
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <Avatar name={user.name} color={user.color} size={40} />
              <div className="min-w-0 flex-1 space-y-3">
                <textarea
                  className={cn(inputCls, 'min-h-[88px] resize-y')}
                  value={wallText}
                  onChange={(e) => setWallText(e.target.value)}
                  placeholder="خبر خوب، اطلاع‌رسانی یا یک نکته مفید برای تیم بنویس…"
                  aria-label="متن پست دیوار تیمی"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#8A9884]">هر پست مفید +۲ امتیاز دارد 🌱</span>
                  <PrimaryButton disabled={posting || !wallText.trim()} onClick={() => void publishPost()}>انتشار</PrimaryButton>
                </div>
              </div>
            </div>
          </Card>

          {posts.length === 0 ? (
            <EmptyState
              icon={<span className="text-3xl">🖌️</span>}
              title="دیوار هنوز خالی است"
              hint="اولین خبر خوب را تو بنویس — یک اطلاع‌رسانی کوچک می‌تواند روز همه را بسازد."
            />
          ) : (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pb-2 pl-1 pz-scroll">
              {posts.map((p) => (
                <Card key={p.id} className={cn('p-4', p.pinned && 'border-[#EAD9A8] bg-[#FDF8EA]')}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={p.user?.name ?? '؟'} color={p.user?.color ?? '#8A9884'} size={36} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-bold text-[#253A2A]">{p.user?.name ?? 'کاربر'}</span>
                          {p.pinned && (
                            <Badge className="border-[#EAD9A8] bg-[#FBF3DC] font-bold text-[#8A6508]">📌 سنجاق شده</Badge>
                          )}
                        </div>
                        <TimeAgo iso={p.createdAt} />
                      </div>
                    </div>
                    {canModerate && (
                      <GhostButton className="shrink-0 text-xs" onClick={() => void togglePin(p)}>
                        {p.pinned ? 'برداشتن سنجاق' : '📌 سنجاق'}
                      </GhostButton>
                    )}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#33402F]">{p.content}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'ideas' ? (
        <div className="space-y-4">
          {/* submit card */}
          <Card className="p-4">
            <div className="space-y-3">
              <Field label="عنوان ایده">
                <input
                  className={inputCls}
                  value={ideaTitle}
                  onChange={(e) => setIdeaTitle(e.target.value)}
                  placeholder="مثلاً: چیدمان پرفروش‌ها در قفسه هم‌سطح چشم"
                />
              </Field>
              <Field label="توضیح" hint="کوتاه بنویس، مهم همین است که بگویی — همه ایده‌ها خوانده می‌شوند">
                <textarea
                  className={cn(inputCls, 'min-h-[80px] resize-y')}
                  value={ideaBody}
                  onChange={(e) => setIdeaBody(e.target.value)}
                  aria-label="توضیح ایده"
                />
              </Field>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#8A9884]">ارسال ایده +۳ امتیاز، پذیرش +۲۰، اجرا +۵۰ 🌟</span>
                <PrimaryButton disabled={submittingIdea || !ideaTitle.trim() || !ideaBody.trim()} onClick={() => void submitIdea()}>
                  ارسال ایده
                </PrimaryButton>
              </div>
            </div>
          </Card>

          {ideas.length === 0 ? (
            <EmptyState
              icon={<span className="text-3xl">💡</span>}
              title="هنوز ایده‌ای ثبت نشده"
              hint="اولین نفر باش — ایده‌های کوچک روزمره معمولاً بهترین‌ها هستند."
            />
          ) : (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pb-2 pl-1 pz-scroll">
              {ideas.map((i) => (
                <Card key={i.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={i.user?.name ?? '؟'} color={i.user?.color ?? '#8A9884'} size={36} />
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-bold text-[#253A2A]">{i.user?.name ?? 'کاربر'}</span>
                        <TimeAgo iso={i.createdAt} />
                      </div>
                    </div>
                    <Badge className={IDEA_STATUS_COLORS[i.status] ?? IDEA_STATUS_COLORS.SUBMITTED}>
                      {IDEA_STATUS_LABELS[i.status] ?? i.status}
                    </Badge>
                  </div>
                  <h3 className="mt-2 break-words font-bold text-[#253A2A]">{i.title}</h3>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7 text-[#5A6B54]">{i.content}</p>

                  {i.decision && (
                    <div className="mt-3 rounded-xl border border-[#EAD9A8] bg-[#FBF3DC] px-3 py-2 text-xs leading-6 text-[#8A6508]">
                      💬 پاسخ مدیر: {i.decision}
                    </div>
                  )}

                  {canModerate && (
                    <div className="mt-3 space-y-2 rounded-xl border border-[#E4DCC8] bg-[#FBF9F3] p-3">
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <select
                          className={cn(inputCls, 'py-2')}
                          value={decideStatus[i.id] ?? i.status}
                          onChange={(e) => setDecideStatus((prev) => ({ ...prev, [i.id]: e.target.value }))}
                          aria-label={`وضعیت ایده ${i.title}`}
                        >
                          {IDEA_STATUSES.map((s) => <option key={s} value={s}>{IDEA_STATUS_LABELS[s]}</option>)}
                        </select>
                        <PrimaryButton className="min-h-[44px]" onClick={() => void decideIdea(i)}>ثبت تصمیم</PrimaryButton>
                      </div>
                      <input
                        className={cn(inputCls, 'py-2 text-xs')}
                        value={decideNote[i.id] ?? i.decision ?? ''}
                        onChange={(e) => setDecideNote((prev) => ({ ...prev, [i.id]: e.target.value }))}
                        placeholder="یادداشت تصمیم (اختیاری) — مثلاً: از هفته بعد اجرا می‌کنیم"
                        aria-label={`یادداشت تصمیم برای ایده ${i.title}`}
                      />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'feedback' ? (
        <Card className="mx-auto max-w-xl p-5">
          <h3 className="text-base font-bold text-[#253A2A]">نظر تو، بی‌نام و امن</h3>
          <p className="mt-1 text-xs leading-6 text-[#8A9884]">
            🔒 نام شما ذخیره نمی‌شود — این فرم فقط برای شنیدن صدای توست. راحت و رک بنویس.
          </p>
          <div className="mt-4">
            <span className="mb-1.5 block text-xs font-semibold text-[#4A5A44]">به امروزت چه نمره‌ای می‌دهی؟ (اختیاری)</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${toFaDigits(n)} ستاره`}
                  aria-pressed={rating >= n}
                  onClick={() => setRating(n)}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-xl border text-2xl transition-all active:scale-95',
                    n <= rating
                      ? 'border-[#EAD9A8] bg-[#FBF3DC] text-[#DAA520]'
                      : 'border-[#D8D2BC] bg-white text-[#C9C3AC] hover:bg-[#FBF3DC]/50'
                  )}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <Field label="تجربه‌ات را بنویس">
              <textarea
                className={cn(inputCls, 'min-h-[110px] resize-y')}
                value={fbText}
                onChange={(e) => setFbText(e.target.value)}
                placeholder="چه چیزی خوب کار می‌کند؟ چه چیزی می‌تواند بهتر شود؟"
                aria-label="متن بازخورد ناشناس"
              />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <PrimaryButton disabled={sendingFeedback || !fbText.trim()} onClick={() => void sendFeedback()}>
              ارسال ناشناس
            </PrimaryButton>
          </div>
        </Card>
      ) : (
        /* feedback inbox — managers only */
        <div className="space-y-3">
          <div className="rounded-2xl border border-[#C8D8C0] bg-[#F3F7EF] px-4 py-3 text-xs leading-6 text-[#3E6B4A]">
            🔒 این صندوق فقط برای مدیرها دیده می‌شود. هر نظر را جدی بخوان — پشت هر خط یک همکار می‌خواهد کمک کند.
          </div>
          {feedback.length === 0 ? (
            <EmptyState
              icon={<span className="text-3xl">📬</span>}
              title="هنوز بازخوردی دریافت نشده"
              hint="وقتی همکاران با اطمینان بنویسند، اینجا پر می‌شود — فضای امن را حفظ کن."
            />
          ) : (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pb-2 pl-1 pz-scroll">
              {feedback.map((f) => (
                <Card key={f.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Stars rating={f.rating} />
                    <TimeAgo iso={f.createdAt} />
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[#33402F]">{f.content}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
