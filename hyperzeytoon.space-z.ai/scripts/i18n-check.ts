// One-off i18n consistency checker (bun scripts/i18n-check.ts).
// Asserts dictionary parity, fallback chains, direction metadata and —
// critically — that every live NAV_GROUPS label resolves through
// localizedSectionLabel (byte-exact ZWNJ match against the fa dict).

import { DICT, LOCALES, localeDir } from '../src/lib/i18n/dict'
import { makeT } from '../src/lib/i18n/index'
import { localizedSectionLabel } from '../src/lib/i18n/section-names'
import { NAV_GROUPS } from '../src/store/app'

let failures = 0
function ok(cond: boolean, label: string, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failures++
}

const keysOf = (d: Record<string, string>) => new Set(Object.keys(d))
const faKeys = keysOf(DICT.fa)

// 1. fa key count ≥ 140
ok(faKeys.size >= 140, `fa has ≥140 keys`, `${faKeys.size}`)

// 2. fa === en key parity (print missing both ways)
const enKeys = keysOf(DICT.en)
const missingEn = [...faKeys].filter((k) => !enKeys.has(k))
const extraEn = [...enKeys].filter((k) => !faKeys.has(k))
ok(missingEn.length === 0, 'fa → en: no missing keys', missingEn.join(', ') || 'none')
ok(extraEn.length === 0, 'en → fa: no extra keys', extraEn.join(', ') || 'none')

// 3. ar/tr coverage of required namespaces + per-locale counts
const REQUIRED_NS = ['nav.group.', 'section.', 'login.', 'topbar.', 'common.', 'unit.']
for (const loc of ['ar', 'tr'] as const) {
  const locKeys = keysOf(DICT[loc])
  const missing = REQUIRED_NS.flatMap((ns) => [...faKeys].filter((k) => k.startsWith(ns) && !locKeys.has(k)))
  ok(missing.length === 0, `${loc} covers required namespaces`, missing.join(', ') || 'complete')
  console.log(`      counts: fa=${faKeys.size} en=${enKeys.size} ar=${keysOf(DICT.ar).size} tr=${keysOf(DICT.tr).size}`)
}

// 4. makeT: en returns non-fa translation; fallback chain locale→fa→fallbackFa→key
const tEn = makeT('en')
const tTr = makeT('tr')
ok(tEn('login.chooseAccountTitle') !== DICT.fa['login.chooseAccountTitle'] && tEn('login.chooseAccountTitle').length > 0, `makeT('en')('login.chooseAccountTitle') non-fa`, tEn('login.chooseAccountTitle'))
ok(makeT('ar')('section.orders') !== DICT.fa['section.orders'], `makeT('ar')('section.orders') non-fa`, makeT('ar')('section.orders'))
ok(tTr('toast.serverError') === DICT.fa['toast.serverError'], `makeT('tr') falls back to fa for uncovered key`, tTr('toast.serverError'))
ok(tEn('totally.unknown.key', 'توضیح فارسی') === 'توضیح فارسی', 'makeT unknown key → fallbackFa')
ok(tEn('totally.unknown.key') === 'totally.unknown.key', 'makeT unknown key → key itself')

// 5. directions
for (const l of LOCALES) {
  ok(localeDir(l.code) === l.dir, `localeDir(${l.code})=${l.dir}`)
}

// 6. localizedSectionLabel
ok(localizedSectionLabel('en', 'سفارش‌ها') === 'Orders', `localizedSectionLabel(en, سفارش‌ها)`, localizedSectionLabel('en', 'سفارش‌ها'))
ok(localizedSectionLabel('ar', 'تنظیمات') === 'الإعدادات', `localizedSectionLabel(ar, تنظیمات)`, localizedSectionLabel('ar', 'تنظیمات'))
ok(localizedSectionLabel('tr', 'جرد انبار') === 'Depo Sayımı', `localizedSectionLabel(tr, جرد انبار)`, localizedSectionLabel('tr', 'جرد انبار'))
ok(localizedSectionLabel('fa', 'سفارش‌ها') === 'سفارش‌ها', 'localizedSectionLabel(fa, …) returns input')
ok(localizedSectionLabel('en', 'برچسب ناموجود') === 'برچسب ناموجود', 'localizedSectionLabel unknown → graceful passthrough')

// 7. STRONG: every live NAV_GROUPS group title + item label (exact runtime
// strings incl. ZWNJ) must localize for all non-fa locales
let liveFail = 0
for (const g of NAV_GROUPS) {
  for (const loc of ['en', 'ar', 'tr'] as const) {
    if (localizedSectionLabel(loc, g.title) === g.title) {
      liveFail++
      console.log(`      missing group title for ${loc}: ${g.title}`)
    }
    for (const item of g.items) {
      if (localizedSectionLabel(loc, item.label) === item.label) {
        liveFail++
        console.log(`      missing section label for ${loc}: ${item.label}`)
      }
    }
  }
}
ok(liveFail === 0, 'all NAV_GROUPS titles + section labels localize (en/ar/tr)', liveFail ? `${liveFail} misses` : 'complete')

console.log(failures === 0 ? '\nALL CHECKS PASSED ✅' : `\n${failures} CHECK(S) FAILED ❌`)
process.exit(failures === 0 ? 0 : 1)
