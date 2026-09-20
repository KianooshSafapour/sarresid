'use client'

import * as React from 'react'
import {
  LayoutDashboard, ClipboardList, PackageCheck, Calculator, Wallet,
  Boxes, Store, Grid3X3, CheckSquare, BookOpen, Newspaper, StickyNote,
  MessageSquareHeart, MessagesSquare, ShoppingCart, Warehouse, ShieldCheck, Trophy,
  CalendarDays, FlaskConical, Microscope, History,
} from 'lucide-react'
import { PERMISSIONS } from '@/lib/constants'

/**
 * Single source of truth for app navigation.
 * Consumed by the app shell (page.tsx) and the command palette.
 */
export interface SectionDef {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  permission?: string
  roles?: string[]
  group: string
  /** short hint shown in the command palette */
  hint?: string
}

export const SECTIONS: SectionDef[] = [
  { key: 'dashboard', label: 'داشبورد', icon: LayoutDashboard, permission: PERMISSIONS.VIEW_DASHBOARD, group: 'اصلی', hint: 'نمای کلی فروشگاه' },
  { key: 'orders', label: 'سفارشات', icon: ClipboardList, permission: PERMISSIONS.MANAGE_ORDERS, group: 'اصلی', hint: 'ثبت و پیگیری سفارش تأمین‌کننده' },
  { key: 'deliveries', label: 'دریافت کالا', icon: PackageCheck, permission: PERMISSIONS.RECEIVE_DELIVERY, group: 'گردش کار', hint: 'دریافت مرسولات و کنترل انبار' },
  { key: 'accounting', label: 'حسابداری و هلو', icon: Calculator, permission: PERMISSIONS.ACCOUNTING, group: 'گردش کار', hint: 'ثبت در هلو و نمای مالی' },
  { key: 'cheques', label: 'چک‌ها و پرداخت‌ها', icon: Wallet, group: 'گردش کار', roles: ['GENERAL_MANAGER', 'ACCOUNTANT', 'OWNER', 'OPERATION_MANAGER'], hint: 'تقویم چک و پرداخت‌ها' },
  { key: 'warehouse', label: 'انبار و درخواست‌ها', icon: Warehouse, permission: PERMISSIONS.WAREHOUSE, group: 'گردش کار', hint: 'درخواست‌های قفسه‌چین‌ها' },
  { key: 'products', label: 'کالاها', icon: Boxes, group: 'فروشگاه', roles: ['GENERAL_MANAGER', 'PRODUCT_MANAGER', 'OPERATION_MANAGER', 'IT_ADMIN', 'ACCOUNTANT', 'INVENTORY_SUPERVISOR', 'OWNER'], hint: 'کاتالوگ و واردات از هلو' },
  { key: 'suppliers', label: 'تأمین‌کنندگان', icon: Store, permission: PERMISSIONS.MANAGE_ORDERS, group: 'فروشگاه', hint: 'فروشندگان و سفارش سریع' },
  { key: 'planogram', label: 'چیدمان قفسه‌ها', icon: Grid3X3, permission: PERMISSIONS.MANAGE_PLANOGRAM, group: 'فروشگاه', hint: 'پلانوگرام قفسه‌ها' },
  { key: 'sales', label: 'فروش و مشتریان', icon: ShoppingCart, permission: PERMISSIONS.SALES_FLOOR, group: 'فروشگاه', hint: 'سفارش فروش و مشتریان' },
  { key: 'tasks', label: 'وظایف من', icon: CheckSquare, group: 'تیم', hint: 'وظایف روزانه من' },
  { key: 'sops', label: 'دستورالعمل‌ها (SOP)', icon: BookOpen, group: 'تیم', hint: 'راهنمای گام‌به‌گام کارها' },
  { key: 'wall', label: 'دیوار تیمی', icon: Newspaper, group: 'تیم', hint: 'اخبار و اطلاعیه‌ها' },
  { key: 'notes', label: 'یادداشت‌های من', icon: StickyNote, group: 'تیم', hint: 'یادداشت‌های خصوصی' },
  { key: 'feedback', label: 'بازخورد و ایده‌ها', icon: MessageSquareHeart, group: 'تیم', hint: 'نظرات و ایده‌های نقد و بررسی' },
  { key: 'messages', label: 'پیام‌ها', icon: MessagesSquare, group: 'تیم', hint: 'گفتگوی خصوصی با همکاران' },
  { key: 'shifts', label: 'شیفت‌های هفته', icon: CalendarDays, group: 'تیم', hint: 'برنامه نوبت‌کاری تیم' },
  { key: 'rewards', label: 'عملکرد و پاداش', icon: Trophy, group: 'تیم', hint: 'امتیازها و کارنامه من' },
  { key: 'research', label: 'علم پشت زیتون', icon: Microscope, group: 'رشد و پژوهش', hint: 'پژوهش‌های علمی، مقایسه با سیستم دستی و نقشه راه' },
  { key: 'demo', label: 'آزمایشگاه دمو', icon: FlaskConical, group: 'رشد و پژوهش', roles: ['GENERAL_MANAGER', 'OPERATION_MANAGER', 'IT_ADMIN', 'OWNER', 'PRODUCT_MANAGER'], hint: 'ساخت شرکت فرضی واقع‌گرایانه و تور دمو' },
  { key: 'versions', label: 'نسخه و بازیابی', icon: History, group: 'مدیریت', roles: ['GENERAL_MANAGER', 'OPERATION_MANAGER', 'IT_ADMIN', 'OWNER'], hint: 'نقاط بازیابی سامانه و نسخه Hello World' },
  { key: 'admin', label: 'مدیریت سامانه', icon: ShieldCheck, permission: PERMISSIONS.ADMIN_USERS, group: 'مدیریت', hint: 'کاربران، نقش‌ها و تنظیمات' },
]

/** Filter sections by user access (roles list OR permission key) */
export function allowedSections(roles: string[], can: (roles: string[], permission: string) => boolean): SectionDef[] {
  return SECTIONS.filter((s) => {
    if (s.roles && s.roles.some((r) => roles.includes(r))) return true
    if (s.permission && can(roles, s.permission)) return true
    return !s.roles && !s.permission
  })
}
