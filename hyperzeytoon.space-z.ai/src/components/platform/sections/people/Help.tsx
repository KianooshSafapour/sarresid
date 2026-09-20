'use client'

import * as React from 'react'
import { useApp } from '@/store/app'
import { useSandboxStore } from '@/store/sandbox'
import { toast } from '@/hooks/use-toast'
import { SectionHeader, UserAvatar } from '@/components/platform/ui/shared'
import { Card, CardContent } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { CircleHelp, HeartHandshake, ListChecks, MessagesSquare, BookOpenCheck, Megaphone, Users, Store, LayoutGrid, StickyNote, Lightbulb, Compass, FlaskConical, LogOut, Play } from 'lucide-react'

const ROLE_FEATURES: { roleKeys: string[]; title: string; icon: React.ReactNode; items: string[] }[] = [
  {
    roleKeys: ['owner', 'gm', 'om', 'pm'],
    title: 'مدیران',
    icon: <Users className="h-5 w-5" />,
    items: [
      'واگذاری کار به تیم و پیگیری گفتگوی هر کار — بدون پیامک و کاغذ',
      'بررسی بازخوردها و ایده‌ها با امکان پاداش امتیاز',
      'اعطای امتیاز تشویقی، سقف صندلی تیم و گزارش فعالیت',
      'مدیریت کاربران، نقش‌ها، تعطیلات و تنظیمات فروشگاه',
    ],
  },
  {
    roleKeys: ['sales'],
    title: 'فروشندگان',
    icon: <Store className="h-5 w-5" />,
    items: [
      'دفتر مشتریان با سلیقه‌ها؛ ثبت بازدید و سفارش پیش‌چک‌شده',
      'ارسال سبد به صندوق با یک لمس — مشتری فقط پرداخت می‌کند',
      'ثبت کالاهای درخواستی مشتری و دریافت امتیاز',
      'گفتگوی سریع با همکاران و صندوق',
    ],
  },
  {
    roleKeys: ['cashier'],
    title: 'صندوق‌داران',
    icon: <Lightbulb className="h-5 w-5" />,
    items: [
      'صف سبدهای آماده: فقط جمع می‌زنی و پرداخت را می‌گیری',
      'علامت «تکمیل شد» بعد از پرداخت — دیگر فراموشی نداریم',
      'اعلان لحظه‌ای هنگام رسیدن سبد جدید',
    ],
  },
  {
    roleKeys: ['merchandiser', 'inventory', 'delivery'],
    title: 'قفسه‌چین و انبار',
    icon: <LayoutGrid className="h-5 w-5" />,
    items: [
      'نقشه قفسه‌ها با رنگ وضعیت پُری؛ درخواست پر کردن با یک لمس',
      'درخواست جنس از انبار و تأیید تحویل (+۲ امتیاز برای دو طرف)',
      'ثبت کالای درخواستی مشتری و پیشنهاد کالای جدید',
    ],
  },
  {
    roleKeys: [],
    title: 'همه‌ی ما',
    icon: <HeartHandshake className="h-5 w-5" />,
    items: [
      'کارهای من: شروع، پیگیری، توقف با دلیل و «انجام شد» با جشن ⭐',
      'رویه‌ها و راهنما با حالت قدم‌به‌قدم آرام',
      'دیوار همکاری، یادداشت خصوصی، نظر مخفیانه و ایده‌ها',
      'پیام‌های امن داخلی و امتیازهای تشویقی',
    ],
  },
]

const FAQ: { q: string; a: string }[] = [
  {
    q: 'رمز ورودم را فراموش کردم یا می‌خواهم عوضش کنم؛ چه کنم؟',
    a: 'از بخش «تنظیمات» → «تغییر رمز» با وارد کردن رمز فعلی، رمز چهاررقمی جدیدت را انتخاب کن. اگر رمز فعلی یادت نیست، هر مدیری می‌تواند برایت رمز جدید تنظیم کند.',
  },
  {
    q: 'اسکنر بارکد با پلتفرم کار می‌کند؟',
    a: 'بله! در بخش «عملیات فروشگاه» و جستجوی کالا، اسکنر را روی فیلد بگذار و بارکد را اسکن کن — خودش می‌نویسد و با Enter ثبت می‌شود. اسکنرهای USB رایج بدون تنظیمات اضافه کار می‌کنند.',
  },
  {
    q: 'روند پردازش تحویل سفارش چطور است؟',
    a: 'سفارش بعد از تأیید به تأمین‌کننده ارسال می‌شود؛ روز تحویل، تحویل‌گیرنده اقلام را می‌شمارد و ثبت می‌کند؛ سپس انبار تأیید نهایی و حسابداری در هولو ثبت می‌کند. جزئیات هر مرحله در بخش «تحویل‌ها» دیده می‌شود.',
  },
  {
    q: 'قاعده چک‌های جمعه و تعطیل چیست؟',
    a: 'چکی که موعدش جمعه یا روز تعطیل رسمی باشد، از قبل (آخرین روز کاری) امضا و تحویل می‌شود تا تأمین‌کننده در نوبه‌ای نماند. سیستم تاریخ‌های تعطیل را در انتخاب‌گر تاریخ با نقطه قرمز نشان می‌دهد.',
  },
  {
    q: 'امتیازها (⭐) یعنی چه و چطور جمع می‌شود؟',
    a: 'امتیاز یعنی تشکر تیم از کار خوب: تکمیل کار +۵، چک‌لیست روزانه کامل +۲، مشارکت در دیوار +۱، ثبت کالای درخواستی مشتری +۱، تأیید تحویل انبار +۲ برای دو طرف و ایده پذیرفته‌شده امتیاز ویژه. امتیاز فقط برای تشویق است، برای مقایسه و فشار نه!',
  },
  {
    q: 'یادداشت‌های خصوصی و پیام‌ها امن هستند؟',
    a: 'یادداشت‌های شخصی فقط با حساب خودت دیده می‌شوند — حتی مدیران هم دسترسی ندارند. پیام‌های گفتگو فقط بین اعضای همان گفتگو قابل خواندن است و ورود همه‌ی کاربران با رمز اختصاصی و نشست امن انجام می‌شود.',
  },
  {
    q: 'چطور از اکسل اطلاعات وارد (Import) کنیم؟',
    a: 'در بخش محصولات امکان بارگذاری فایل اکسل فهرست کالاها وجود دارد؛ ستون‌های نام، بارکد، قیمت خرید و فروش و موجودی تشخیص داده می‌شوند و قبل از ثبت نهایی پیش‌نمایش می‌بینی تا خطا حذف شود.',
  },
  {
    q: 'چیدمان قفسه (پلانوگرام) چه کمکی می‌کند؟',
    a: 'نقشه فروشگاه را با رنگ وضعیت پُری می‌بینی: سبز یعنی پُر، زرد نیمه‌پُر و قرمز کمبود. با یک لمس «درخواست پر کردن»، درخواست جنس برای انبار ثبت می‌شود و انباردار اعلان می‌گیرد.',
  },
  {
    q: 'اگر کاری را ناتمام باید رها کنم چه؟',
    a: 'راحت دکمه «توقف» را بزن و دلیلش را بنویس — این یعنی صداقت، نه ضعف. تیم از دلیل باخبر می‌شود و هر وقت آماده بودی ادامه می‌دهیم.',
  },
]

export function Help() {
  const { user } = useApp()
  const sandboxEnabled = useSandboxStore((s) => s.enabled)
  const enableSandbox = useSandboxStore((s) => s.enable)
  const disableSandbox = useSandboxStore((s) => s.disable)
  const relevant = ROLE_FEATURES.filter(
    (r) => r.roleKeys.length === 0 || r.roleKeys.some((k) => user?.roleKeys.includes(k))
  )

  const startTour = () => {
    window.dispatchEvent(new CustomEvent('hz:start-tour'))
  }

  const toggleSandbox = () => {
    if (sandboxEnabled) {
      disableSandbox()
      toast({ title: 'از حالت تمرین خارج شدید 🌿', description: 'تغییرات آزمایشی پاک شد؛ از این پس تغییرات واقعاً ذخیره می‌شود.' })
    } else {
      enableSandbox()
      toast({
        title: 'حالت تمرین فعال شد 🧪',
        description: 'با خیال راحت هر بخش را امتحان کنید؛ هیچ تغییری روی داده‌های واقعی ذخیره نمی‌شود.',
      })
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="راهنمای پلتفرم"
        subtitle="پلتفرم دستیار توست — برای کم‌کردن خطا و خستگی ساخته شده، نه کنترل"
        icon={<CircleHelp className="h-5 w-5" />}
      />

      {/* platform values */}
      <Card className="border-gold/50 glow-border-static">
        <CardContent className="p-5 text-center space-y-2">
          <p className="text-lg font-extrabold">🌿 این سامانه برای کم‌کردن خطا و خستگی است، نه کنترل شما</p>
          <p className="text-sm text-muted-foreground leading-7 max-w-2xl mx-auto">
            هر قابلیت این‌جا جای یک دفترچه، یک یادداشت چسبان، یک پیامک یا یک «یادم رفته» است.
            امتیازها تشویق‌اند، یادداشت‌های خصوصی واقعاً خصوصی‌اند و نظرات مخفیانه بدون نام ثبت می‌شوند.
            اگر جایی حس کردی چیزی برخلاف این روحیه است، خودِ دکمه «نظر مخفیانه» برای همین است 💚
          </p>
        </CardContent>
      </Card>

      {/* guided tour + sandbox */}
      <Card className="border-[#c9a227]/50 glow-border-static">
        <CardContent className="p-5 space-y-3">
          <p className="text-lg font-extrabold flex items-center gap-2">
            <Compass className="h-5 w-5 text-[#8a6d13] dark:text-[#e0bc4a]" /> همراه شما در تمام مسیر
          </p>
          <p className="text-sm text-muted-foreground leading-7 max-w-3xl">
            پلتفرم هایپر زیتون برای همراهی و کمک به همکاران ساخته شده است؛ هر بخش راهنمای اختصاصی دارد و هیچ‌کس تنها نمی‌ماند.
            با «تور راهنما» در چند گام کوتاه با صفحه‌های اصلی و ابزارهای مربوط به نقش خود آشنا می‌شوید؛ کافی است دکمهٔ زیر را بزنید.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="gap-1.5 bg-gradient-to-l from-[#c9a227] to-[#b07d2b] text-white hover:from-[#b8941f] hover:to-[#9a6b21]"
              onClick={startTour}
            >
              <Play className="h-4 w-4" /> شروع تور راهنما
            </Button>
            {sandboxEnabled ? (
              <Button variant="outline" className="gap-1.5 border-[#c9a227]/60 text-[#8a6d13] dark:text-[#e0bc4a] hover:bg-[#c9a227]/10" onClick={toggleSandbox}>
                <LogOut className="h-4 w-4" /> خروج از حالت تمرین
              </Button>
            ) : (
              <Button variant="outline" className="gap-1.5" onClick={toggleSandbox}>
                <FlaskConical className="h-4 w-4 text-primary" /> ورود به حالت تمرین
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-6 rounded-xl bg-[#c9a227]/10 border border-[#c9a227]/30 p-3">
            <FlaskConical className="h-3.5 w-3.5 inline align-middle text-[#8a6d13] dark:text-[#e0bc4a]" />{' '}
            <span className="font-bold text-[#8a6d13] dark:text-[#e0bc4a]">حالت تمرین (سندباکس):</span>{' '}
            در این حالت می‌توانید همهٔ بخش‌ها را بدون نگرانی امتحان کنید؛ ثبت، ویرایش یا حذف‌ها فقط روی دستگاه شما ثبت می‌شود
            («کارنامهٔ تمرین») و هیچ دادهٔ واقعی تغییر نمی‌کند. با خروج از حالت تمرین، همهٔ تغییرات آزمایشی پاک می‌شود.
          </p>
        </CardContent>
      </Card>

      {/* role cards */}
      <div className="grid md:grid-cols-2 gap-3">
        {relevant.map((r) => (
          <Card key={r.title}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">{r.icon}</span>
                <p className="font-bold">{r.title}</p>
                {user && r.title === 'همه‌ی ما' && (
                  <span className="ms-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserAvatar name={user.name} color={user.color} size={24} /> نقش تو: {user.roles[0]?.name ?? 'همکار'}
                  </span>
                )}
              </div>
              <ul className="space-y-2">
                {r.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-6">
                    <span className="h-1.5 w-1.5 rounded-full bg-gold mt-2.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FAQ */}
      <Card>
        <CardContent className="p-4">
          <p className="font-bold mb-3 flex items-center gap-2">
            <CircleHelp className="h-4 w-4 text-primary" /> سؤال‌های پرتکرار
          </p>
          <Accordion type="single" collapsible>
            {FAQ.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-right text-sm leading-6">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-7">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: 'کارهای من', key: 'tasks', icon: <ListChecks className="h-4 w-4" /> },
          { label: 'رویه‌ها', key: 'sops', icon: <BookOpenCheck className="h-4 w-4" /> },
          { label: 'دیوار همکاری', key: 'wall', icon: <Megaphone className="h-4 w-4" /> },
          { label: 'پیام‌ها', key: 'chat', icon: <MessagesSquare className="h-4 w-4" /> },
          { label: 'یادداشت‌ها', key: 'notes', icon: <StickyNote className="h-4 w-4" /> },
        ].map((l) => (
          <QuickLink key={l.key} label={l.label} section={l.key} icon={l.icon} />
        ))}
      </div>
    </div>
  )
}

function QuickLink({ label, section, icon }: { label: string; section: string; icon: React.ReactNode }) {
  const setSection = useApp((s) => s.setSection)
  return (
    <button
      onClick={() => setSection(section)}
      className="rounded-xl border bg-card p-3 flex items-center gap-2 text-xs font-bold hover:bg-accent transition-colors min-h-11"
    >
      <span className="text-primary">{icon}</span> {label}
    </button>
  )
}
