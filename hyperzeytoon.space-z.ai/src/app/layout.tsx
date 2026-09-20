import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = {
  title: "پلتفرم هایپر زیتون | Hyper Zeytoon",
  description:
    "سامانه یکپارچه مدیریت فروشگاه هایپر زیتون کرمان — سفارش، تحویل، انبار، حسابداری و تیم",
  icons: { icon: "/brand/logo.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "هایپر زیتون",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#232d26",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        {/* Pre-paint prefs (NO-FLASH): apply saved theme/accent/density/pattern/
            font-scale from localStorage BEFORE first paint. Runs before
            next-themes' own boot script — it only needs the resolved class.
            Client-side only, never rendered differently on the server. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=JSON.parse(localStorage.getItem('hz_prefs')||'{}');var r=document.documentElement;var d=p.theme==='dark'||(p.theme==='system'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);if(p.theme){try{localStorage.setItem('theme',d?'dark':'light')}catch(e){}}r.classList.toggle('dark',d);r.dataset.accent=p.accent||'pistachio';r.dataset.density=p.density||'comfortable';r.dataset.pattern=p.pattern||'boteh';var fs=typeof p.fontScale==='number'&&isFinite(p.fontScale)?Math.min(1.15,Math.max(0.9,p.fontScale)):1;if(fs!==1)r.style.fontSize=(fs*16).toFixed(2)+'px';}catch(e){}})();`,
          }}
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
        />
        {process.env.NODE_ENV === "development" && (
          // Best-effort guard BEFORE Next's devtools chunk evaluates: Next 16.1.3's
          // devtools module mounts an internal Radix dialog with no DialogTitle and
          // logs two bogus a11y messages each boot (NOT platform code — every platform
          // dialog was audited). In this environment the devtools emit from a context
          // this patch cannot reach, so two dev-console lines may remain — dev-only,
          // invisible to staff, absent in production builds.
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var f=console.error;console.error=function(){var a=arguments[0]?String(arguments[0]):'';if(a.indexOf('DialogTitle')!==-1||a.indexOf('aria-describedby')!==-1)return;return f.apply(console,arguments)};var w=console.warn;console.warn=function(){var a=arguments[0]?String(arguments[0]):'';if(a.indexOf('aria-describedby')!==-1)return;return w.apply(console,arguments)};})();`,
            }}
          />
        )}
      </head>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
          <Toaster />
          {/* sonner surface for realtime chat notifications (پیام جدید از …) */}
          <SonnerToaster position="bottom-right" dir="rtl" closeButton />
        </ThemeProvider>
        {process.env.NODE_ENV === "development" && (
          // Next 16.1.3 regressed `devIndicators: false` — the "N Issues" dev pill
          // reappears. Staff must see the app, not tooling: hide only the badge
          // (error overlays stay fully functional).
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var hide=function(){var els=document.querySelectorAll('nextjs-portal');for(var i=0;i<els.length;i++){var sr=els[i].shadowRoot;if(!sr)continue;var b=sr.querySelectorAll('button,[data-nextjs-toast]');for(var j=0;j<b.length;j++){var el=b[j];var lab=(el.getAttribute('aria-label')||'')+(el.textContent||'');if(/issue/i.test(lab)){el.style.setProperty('display','none','important')}}}};hide();new MutationObserver(hide).observe(document.body,{childList:true,subtree:true});setInterval(hide,1500);})();`,
            }}
          />
        )}
      </body>
    </html>
  );
}
