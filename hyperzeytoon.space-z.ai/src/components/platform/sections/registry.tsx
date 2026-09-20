'use client'

// Central section registry — merges commerce, catalog and people section maps.
import type { ComponentType } from 'react'
import { Dashboard } from '@/components/platform/sections/Dashboard'
import { commerceSections } from '@/components/platform/sections/commerce'
import { catalogSections } from '@/components/platform/sections/catalog'
import { peopleSections } from '@/components/platform/sections/people'
import { archiveSections } from '@/components/platform/sections/archive'
import { reportsSections } from '@/components/platform/sections/reports'
import { warehouseSections } from '@/components/platform/sections/warehouse'
import { EmptyState } from '@/components/platform/ui/shared'
import { Sparkles } from 'lucide-react'

export const registry: Record<string, ComponentType> = {
  dashboard: Dashboard,
  ...commerceSections,
  ...catalogSections,
  ...peopleSections,
  ...archiveSections,
  ...reportsSections,
  ...warehouseSections,
}

const SECTION_NAMES: Record<string, string> = {
  orders: 'سفارش‌ها',
  deliveries: 'تحویل‌ها',
  accounting: 'حسابداری و هولو',
  payments: 'چک‌ها و پرداخت‌ها',
  products: 'محصولات',
  providers: 'تأمین‌کنندگان',
  inventory: 'انبار و موجودی',
  'stock-count': 'جرد انبار',
  archive: 'بایگانی اسناد',
  planogram: 'چیدمان قفسه',
  customers: 'مشتریان و فروش',
  floor: 'عملیات فروشگاه',
  tasks: 'کارهای من',
  sops: 'رویه‌ها و راهنما',
  wall: 'دیوار همکاری',
  chat: 'پیام‌ها',
  notes: 'یادداشت‌های من',
  feedback: 'بازخورد و ایده‌ها',
  team: 'تیم و عملکرد',
  help: 'راهنمای پلتفرم',
  admin: 'کاربران و نقش‌ها',
  activity: 'گزارش فعالیت',
  settings: 'تنظیمات',
  leaves: 'مرخصی و برنامه تیم',
  vault: 'گنجینه شخصی',
  'demo-lab': 'آزمایشگاه نمایشی',
}

export function SectionPlaceholder({ section }: { section: string }) {
  return (
    <EmptyState
      icon={<Sparkles />}
      title={SECTION_NAMES[section] ?? 'در حال ساخت'}
      description="این بخش به‌زودی فعال می‌شود. پلتفرم به‌صورت تدریجی و بدون وقفه در کار روزانه توسعه می‌یابد."
    />
  )
}
