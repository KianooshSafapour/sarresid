/**
 * مبانی علمی پلتفرم — Scientific Foundations of Hyper Zeytoon
 *
 * Curated findings from academic & industry research on supermarket/grocery
 * operations, mapped to the concrete platform features that answer them.
 * Rendered in the Industry Demo Lab («آزمایشگاه دموی صنعت») → tab «مبانی علمی».
 * Each finding cites its source so prospective testers can verify the science.
 */

export interface ResearchFinding {
  id: string
  title: string
  titleEn: string
  icon: string // lucide icon name
  category: 'INVENTORY' | 'LOSS' | 'WORKFLOW' | 'PEOPLE' | 'MARKET'
  bullets: string[] // Persian findings, research-backed
  citation: string
  citationEn: string
  platformAnswer: string // how Hyper Zeytoon answers it
  featureRefs: string[] // existing platform feature keys
}

export const RESEARCH_FINDINGS: ResearchFinding[] = [
  {
    id: 'shrinkage',
    title: 'نزولات و کسری انبار؛ قاتل خاموش حاشیه سود',
    titleEn: 'Retail Shrinkage — the silent profit killer',
    icon: 'ShieldAlert',
    category: 'LOSS',
    bullets: [
      'نزولات فروشگاه‌های مواد غذایی معمولاً بین ۱ تا ۳ درصد درآمد است؛ در حاشیه سود کم خرده‌فروشی غذایی، این یعنی تا یک‌سوم سود عملیاتی.',
      'پژوهش‌ها نشان می‌دهد بیش از ۱۵٪ مشتریان در مواجهه با اتمام کالا (استوک‌اوت) از خرید صرف‌نظر و به فروشگاه دیگر می‌روند.',
      'منابع اصلی نزولات: فساد و انقضا، آسیب حمل، خطای ثبت دریافت، و سرقت — سه مورد اول کاملاً قابل کنترل فرآیندی هستند.',
    ],
    citation: 'ECR Shrinkage Roadmap (ECR Loss)؛ مطالعه کاهش نزولات و استوک‌اوت در فروشگاه مواد غذایی (ResearchGate)',
    citationEn: 'ECR Shrinkage Roadmap; Reducing Shrinkage and Stockouts in a Food Retail Store',
    platformAnswer:
      'دفتر نزولات (ثبت فساد/انقضا/آسیب/سرقت با بهای تمام‌شده)، نرخ نزولات به‌صورت شاخص زنده، و بستن حلقه‌ی دریافت کالا با اسکن بارکد و اختلاف‌سنجی مقدار تحویلی/تأییدشده — جایی که اکثر خطاها متولد می‌شوند.',
    featureRefs: ['ShrinkageLog', 'اسکن بارکد دریافت', 'شاخص نرخ نزولات', 'گزارش تغییرات (Audit)'],
  },
  {
    id: 'fefo',
    title: 'کالاهای فاسدشدنی؛ مدل نوین‌فروش و FEFO',
    titleEn: 'Perishables — FEFO & the Newsvendor Model',
    icon: 'Leaf',
    category: 'INVENTORY',
    bullets: [
      'برای کالای فاسدشدنی، سیاست FEFO (اول انقضا، اول خروج) به‌طور تجربی کمترین ضایعات را تولید می‌کند.',
      'مدل نوین‌فروش (Newsvendor) سفارش بهینه را در نقطه‌ای می‌دهد که هزینه کمبود و هزینه مازاد را متعادل کند — سفارش بیش از حد = ضایعات، کمتر از حد = فروش از دست رفته.',
      'پژوهش‌ها نشان می‌دهد اعتمادبه‌نفس بیش از حدِ سفارش‌دهنده (Overconfidence) مستقیماً به سفارش غیربهینه می‌انجامد؛ یعنی تصمیم باید بر داده تکیه کند نه حس شخصی.',
    ],
    citation: 'Inventory Management of Perishable Goods (MDPI)؛ Simulation-based inventory management of perishables (ScienceDirect)',
    citationEn: 'MDPI: Inventory Management of Perishable Goods; ScienceDirect: Simulation-based perishable inventory',
    platformAnswer:
      'زنجیره سفارش ← تحویل ← تأیید مقدار واقعی (به‌جای مقدار فاکتور)، به همراه حداقل موجودی و پیشنهاد سفارش مجدد مبتنی بر تقاضای واقعی ثبت‌شده در سیستم — داده به‌جای حدس.',
    featureRefs: ['تحویل کالا با اختلاف‌سنجی', 'حداقل موجودی', 'پیشنهاد سفارش مجدد'],
  },
  {
    id: 'abc',
    title: 'طبقه‌بندی ABC/VED؛ تمرکز انرژی روی کالای درست',
    titleEn: 'ABC/VEN Inventory Classification',
    icon: 'BarChart3',
    category: 'INVENTORY',
    bullets: [
      'طبقه‌بندی ABC ارزش کالاها را تفکیک می‌کند: معمولاً ~۲۰٪ کالاها ~۸۰٪ گردش مالی را می‌سازند (اصل پارتو در خرده‌فروشی).',
      'رویکرد چندمعیاره ABC-VED (ارزش + حساسیت بحرانی) برای مواد غذایی دقیق‌تر است چون کالای ارزانِ حیاتی (مثل لبنیات) را هم درست رده‌بندی می‌کند.',
      'بدون طبقه‌بندی، وقت مدیر محصول به‌طور یکنواخت هدر می‌شود؛ با آن، شمارش و مذاکره روی کالای A متمرکز می‌شود.',
    ],
    citation: 'The application of ABC-VED with multi-criteria analysis (PMC/NIH)',
    citationEn: 'ABC-VED analysis with multi-criteria decision making (PubMed Central)',
    platformAnswer:
      'پنل «تحلیل هوشمند انبار»: دسته‌بندی خودکار ABC بر پایه فروش/گردش واقعی، کالاهای کندگرد (باقی‌مانده در قفسه)، و پیشنهاد نقطه سفارش مجدد برای هر کالا.',
    featureRefs: ['تحلیل هوشمند انبار', 'ABC خودکار', 'کالاهای کندگرد'],
  },
  {
    id: 'reorder',
    title: 'نقطه سفارش مجدد و موجودی اطمینان',
    titleEn: 'Reorder Point & Safety Stock',
    icon: 'RefreshCw',
    category: 'INVENTORY',
    bullets: [
      'نقطه سفارش مجدد (ROP) = تقاضای میانگین روزانه × زمان تأمین + موجودی اطمینان؛ زیر آن برسد باید سفارش ثبت شود.',
      'موجودی اطمینان باید از نوسان تقاضا و قابلیت اطمینان تأمین‌کننده محاسبه شود، نه به‌صورت عدد ثابت برای همه کالاها.',
      'خرده‌فروشی‌های کوچک معمولاً ROP را «با چشم» تخمین می‌زنند — همین‌جا استوک‌اوت و مازاد موجودی همزمان متولد می‌شود.',
    ],
    citation: 'Ayalew (2025), Reorder Point & inventory optimization؛ Inventory Management 101 (IIENSTITU)',
    citationEn: 'Ayalew 2025 — Reorder Point & Safety Stock Optimization',
    platformAnswer:
      'محاسبه خودکار تقاضای روزانه از فروش/سفارش‌های ثبت‌شده، ترکیب با حداقل موجودی هر کالا، و پیشنهاد «سفارش این کالا» با یک لمس در بخش انبار.',
    featureRefs: ['پیشنهاد سفارش مجدد', 'حداقل موجودی', 'درخواست انبار'],
  },
  {
    id: 'manual',
    title: 'فرآیند دستی کاغذی؛ گلوگاه پنهان عملیات',
    titleEn: 'Manual Paper Workflows — the hidden bottleneck',
    icon: 'FileWarning',
    category: 'WORKFLOW',
    bullets: [
      'تحول دیجیتال فرآیندهای دستی در فروشگاه‌ها بیشترین اثر را روی «جستجوی اطلاعات، ثبت مضاعف و خطای انسانی» دارد — نه صرفاً سرعت.',
      'مطالعات ERP نشان می‌دهد یکپارچه‌سازی داده (یک منبع حقیقت) زمان کارهای اداری را به‌طور معنادار کاهش و دقت را بالا می‌برد.',
      'در سیستم دستی، هر جابه‌جایی کاغذ یک نقطه شکست است: فاکتور گم می‌شود، قیمت اشتباه کپی می‌شود، و ردیابی بعدی غیرممکن است.',
    ],
    citation: 'Wolniak (2024) — Digital Transformation of Grocery In-Store Shopping (PMC)؛ Systematic Review of ERP Implementation (MDPI/ResearchGate)',
    citationEn: 'Wolniak 2024, PMC; ERP Implementation Systematic Review, MDPI',
    platformAnswer:
      'یک منبع حقیقت برای سفارش تا پرداخت: ثبت یک‌باره، جریان وضعیت مشخص، گزارش تغییرات (Audit Trail) کامل، و رفت‌وبرگشت اکسل با نرم‌افزار حسابداری (هلو/سبز) بدون تایپ مجدد.',
    featureRefs: ['گزارش تغییرات', 'ورود/خروج XLS هلو', 'گردش کار وضعیت‌دار'],
  },
  {
    id: 'gamification',
    title: 'بازی‌وارسازی علمی؛ انگیزه بدون فضای نظارتی',
    titleEn: 'Evidence-based Gamification',
    icon: 'Sparkles',
    category: 'PEOPLE',
    bullets: [
      'پژوهش‌های منابع انسانی نشان می‌دهد امتیاز، نشان و رتبه‌بندی وقتی با «تسلط و پیشرفت» گره بخورد (نه کنترل و نظارت) به‌طور معناداری تعلق و دقت کار را بالا می‌برد.',
      'حلقه‌های بازخورد کوتاه (بلافاصله بعد از عمل درست، پاداش کوچک ببینید) مبنای عصب‌شناختی عادت‌سازی است.',
      'شور و شوق تیم انبار در شمارش و دریافت کالا یکی از گران‌ترین مشکلات خرده‌فروشی است — بازی‌وارسازی مستقیم به دقت داده تبدیل می‌شود.',
    ],
    citation: 'Gamified HRM as a driver of engagement (PMC/NIH)؛ Gamification & Employee Engagement (Tilburg University)',
    citationEn: 'Gamified Human Resource Management (PMC); Tilburg: Gamification & Employee Engagement',
    platformAnswer:
      'امتیاز و نشان برای دریافت دقیق، اسکن موفق، و تکمیل به‌موقع؛ جدول «برترین اسکن‌کننده‌ها» و دیوار تیمی — طراحی‌شده برای حس پیشرفت، نه نظارت.',
    featureRefs: ['امتیاز و نشان‌ها', 'برترین اسکن‌کننده‌ها', 'دیوار تیمی'],
  },
  {
    id: 'markdown',
    title: 'قیمت‌گذاری پویا برای کاهش ضایعات',
    titleEn: 'Markdown & Expiration-based Pricing',
    icon: 'Percent',
    category: 'LOSS',
    bullets: [
      'قیمت‌گذاری بر اساس تاریخ انقضا یکی از رایج‌ترین و اثبات‌شده‌ترین راه‌های کاهش ضایعات خرده‌فروشی است.',
      'مارک‌داون بهینه بین «فروختن با تخفیف» و «ضایع شدن کامل» تعادل برقرار می‌کند و مشتری حساس به قیمت را جذب می‌کند.',
      'بدون داده، مارک‌داون دیر و احساسی انجام می‌شود؛ با داده، زودتر و بر اساس سرعت گردش کالا.',
    ],
    citation: 'Optimizing markdown pricing (Taylor & Francis)؛ IoT-Enabled Quality-Triggered Markdown Pricing (PMC)',
    citationEn: 'Taylor & Francis: Balancing profitability and waste reduction; PMC: Quality-triggered Markdown',
    platformAnswer:
      'فیلد «قیمت فروش ویژه» روی هر کالا، شناسایی کندگرد/نزدیک به انقضا در تحلیل هوشمند، و آمادگی پیشنهاد مارک‌داون هدفمند در نقشه راه.',
    featureRefs: ['قیمت فروش ویژه (sellPrice2)', 'تحلیل هوشمند انبار'],
  },
  {
    id: 'srm',
    title: 'مدیریت ارتباط با تأمین‌کننده؛ داده و اعتماد',
    titleEn: 'Supplier Relationship Management',
    icon: 'Building2',
    category: 'WORKFLOW',
    bullets: [
      'موانع کلاسیک تأمین در فروشگاه زنجیره‌ای: یکپارچگی داده (قیمت‌های به‌روز)، ارتباط ضعیف، و عدم قطعیت در پرداخت است.',
      'فهرست قیمت کهنه، ریشه پنهان حاشیه سود ناپدیدشده است — اختلاف قیمت فاکتور جدید و فهرست قدیمی بی‌صدا سود را می‌خورد.',
      'پرداخت چکِ قابل‌پیش‌بینی، قدرت چانه‌زنی و تخفیف خرید را مستقیماً افزایش می‌دهد.',
    ],
    citation: 'Grocery Supplier Relationship Management (Bamboo Rose)؛ Understanding SRM (Preprints.org/Ivalua)',
    citationEn: 'Bamboo Rose: Grocery SRM; Ivalua SRM Guide',
    platformAnswer:
      'پروفایل کامل تأمین‌کننده با تاریخچه فهرست قیمت، هشدار خودکار «فهرست قیمت کهنه» با یادآوری ۷روزه، خط لوله چک جلالی با وضعیت‌های شفاف، و خروجی فهرست قیمت برای هر تأمین‌کننده.',
    featureRefs: ['هشدار فهرست قیمت کهنه', 'خروجی فهرست قیمت', 'خط لوله چک'],
  },
  {
    id: 'iran',
    title: 'بازار ایران؛ جای خالی سیستم عملیاتی بومی',
    titleEn: 'The Iranian Market Gap',
    icon: 'MapPinned',
    category: 'MARKET',
    bullets: [
      'خرده‌فروشی ایران ترکیبی از زنجیره‌های مدرن و فروشگاه‌های مستقل است؛ ابزار عملیاتی در دسترس اغلب به حسابداری خلاصه می‌شود.',
      'نرم‌افزارهای حسابداری بومی (هلو، سبز و…) ستون مالی هستند — اما لایه عملیاتی (سفارش، تحویل، انبار، تیم) را پوشش نمی‌دهند.',
      'تقویم جلالی، فرهنگ چک، زبان فارسی و ساختار خانوادگی کسب‌وکارها باید در هسته سیستم باشد، نه ترجمه سطحی یک محصول خارجی.',
    ],
    citation: 'For Iran’s Supermarkets, Bigger May Not Be Better (Bourse & Bazaar)؛ Qoyod POS گزارش بازار منطقه',
    citationEn: "Bourse & Bazaar: Iran's Supermarkets analysis",
    platformAnswer:
      'هایپر زیتون جایگزین حسابداری نیست — لایه عملیاتیِ گمشده است: بومی فارسی/جلالی در هسته، خروجی/ورودی سازگار با هلو، و طراحی برای فرهنگ کاری تیم‌های ایرانی.',
    featureRefs: ['تقویم جلالی', 'سازگاری هلو', 'فارسی بومی RTL'],
  },
]

export const RESEARCH_CATEGORIES: Record<ResearchFinding['category'], { fa: string; en: string }> = {
  INVENTORY: { fa: 'مدیریت موجودی', en: 'Inventory' },
  LOSS: { fa: 'کاهش ضایعات', en: 'Loss Prevention' },
  WORKFLOW: { fa: 'فرآیند و گردش کار', en: 'Workflow' },
  PEOPLE: { fa: 'تیم و انگیزه', en: 'People' },
  MARKET: { fa: 'بازار بومی', en: 'Local Market' },
}
