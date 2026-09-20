/** Single source of truth for app versioning — shown in Login, footer, and Administration. */
export const APP_VERSION = '0.1.0-alpha'
export const APP_CODENAME = 'Hello, World'
export const APP_RELEASE_LABEL = `نسخه ${APP_VERSION} — «${APP_CODENAME}»`
export const APP_RELEASE_DATE_G = '2026-09-11'
export const APP_TAG = 'v0.1.0-alpha-hello-world'

/* ---------- Persian rendering (۰٫۱٫۰ آلفا) — additive helpers for footer/Login ---------- */

const FA_DIGITS_MAP = '۰۱۲۳۴۵۶۷۸۹'
const toFaStr = (s: string) => s.replace(/\d/g, (d) => FA_DIGITS_MAP[Number(d)])
const TAG_FA: Record<string, string> = { alpha: 'آلفا', beta: 'بتا', rc: 'آر‌سی' }

/** '0.1.0-alpha' → '۰٫۱٫۰ آلفا' (Persian digits + Persian decimal separator) */
export const APP_VERSION_FA = (() => {
  const [core, tag] = APP_VERSION.split('-')
  return `${toFaStr(core).replace(/\./g, '٫')}${tag && TAG_FA[tag] ? ` ${TAG_FA[tag]}` : ''}`
})()

/** «نسخه ۰٫۱٫۰ آلفا — «Hello, World»» — version chip / footer line */
export const APP_RELEASE_FA = `نسخه ${APP_VERSION_FA} — «${APP_CODENAME}»`
