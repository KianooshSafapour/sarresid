'use client'
import type { PUser, Role } from './types'
import { toFaDigits } from './jalali'

export interface NavItem {
  key: string
  label: string
  labelFa: string
  icon: string // lucide icon name mapped in Sidebar
  roles: Role[]
  badgeKey?: 'orders' | 'deliveries' | 'tasksMine' | 'messagesUnread' | 'cheques'
  group: 'OPS' | 'TEAM' | 'SYSTEM'
}

/** pill text: Persian digits, "+" suffix above 9, hard cap at 99+ */
export function badgeCountText(n: number): string {
  if (n > 99) return `${toFaDigits(99)}+`
  if (n > 9) return `${toFaDigits(n)}+`
  return toFaDigits(n)
}

export const NAV_GROUP_LABELS: Record<NavItem['group'], { fa: string; en: string }> = {
  OPS: { fa: 'عملیات', en: 'Operations' },
  TEAM: { fa: 'تیم و انگیزه', en: 'Team' },
  SYSTEM: { fa: 'سیستم', en: 'System' },
}

const ALL: Role[] = ['OWNER', 'GENERAL_MANAGER', 'OPERATION_MANAGER', 'PRODUCT_MANAGER', 'ACCOUNTANT', 'INVENTORY_SUPERVISOR', 'DELIVERY_RECEIVER', 'CASHIER', 'SALESPERSON', 'MERCHANDISER', 'IT_ADMIN']
const MGMT: Role[] = ['OWNER', 'GENERAL_MANAGER', 'OPERATION_MANAGER', 'IT_ADMIN']
const BUYERS: Role[] = ['GENERAL_MANAGER', 'PRODUCT_MANAGER', 'OPERATION_MANAGER', 'IT_ADMIN', 'OWNER']

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', labelFa: 'داشبورد', icon: 'LayoutDashboard', roles: ALL, group: 'OPS' },
  { key: 'orders', label: 'Orders', labelFa: 'سفارش‌ها', icon: 'ShoppingCart', roles: [...BUYERS, 'ACCOUNTANT'], badgeKey: 'orders', group: 'OPS' },
  { key: 'deliveries', label: 'Deliveries', labelFa: 'تحویل کالا', icon: 'Truck', roles: ['DELIVERY_RECEIVER', 'INVENTORY_SUPERVISOR', ...MGMT, 'ACCOUNTANT', 'PRODUCT_MANAGER'], badgeKey: 'deliveries', group: 'OPS' },
  { key: 'accounting', label: 'Accounting', labelFa: 'حسابداری', icon: 'Calculator', roles: ['ACCOUNTANT', ...MGMT], group: 'OPS' },
  { key: 'payments', label: 'Payments & Cheques', labelFa: 'پرداخت و چک', icon: 'CreditCard', roles: [...MGMT, 'ACCOUNTANT'], badgeKey: 'cheques', group: 'OPS' },
  { key: 'products', label: 'Products', labelFa: 'کالاها', icon: 'Package', roles: [...ALL], group: 'OPS' },
  { key: 'suppliers', label: 'Suppliers', labelFa: 'تأمین‌کنندگان', icon: 'Building2', roles: [...MGMT, 'PRODUCT_MANAGER', 'ACCOUNTANT'], group: 'OPS' },
  { key: 'warehouse', label: 'Warehouse', labelFa: 'انبار', icon: 'Warehouse', roles: ['INVENTORY_SUPERVISOR', 'MERCHANDISER', 'PRODUCT_MANAGER', ...MGMT], group: 'OPS' },
  { key: 'planogram', label: 'Planogram', labelFa: 'چیدمان قفسه', icon: 'Map', roles: ['MERCHANDISER', 'PRODUCT_MANAGER', ...MGMT], group: 'OPS' },
  { key: 'crm', label: 'Customers & Sales', labelFa: 'مشتریان و فروش', icon: 'Users', roles: ['SALESPERSON', 'CASHIER', ...MGMT], group: 'OPS' },
  { key: 'tasks', label: 'Tasks', labelFa: 'تسک‌ها', icon: 'CheckSquare', roles: ALL, badgeKey: 'tasksMine', group: 'TEAM' },
  { key: 'sops', label: 'SOPs & Help', labelFa: 'دستورالعمل‌ها', icon: 'BookOpen', roles: ALL, group: 'TEAM' },
  { key: 'community', label: 'Team Wall', labelFa: 'دیوار تیمی', icon: 'MessageSquareHeart', roles: ALL, group: 'TEAM' },
  { key: 'notes', label: 'My Notes', labelFa: 'یادداشت من', icon: 'StickyNote', roles: ALL, group: 'TEAM' },
  { key: 'messages', label: 'Messages', labelFa: 'پیام‌ها', icon: 'MessageCircle', roles: ALL, badgeKey: 'messagesUnread', group: 'TEAM' },
  { key: 'profile', label: 'My Progress', labelFa: 'پیشرفت من', icon: 'Sparkles', roles: ALL, group: 'TEAM' },
  { key: 'audit', label: 'Audit Trail', labelFa: 'گزارش تغییرات', icon: 'ShieldCheck', roles: MGMT, group: 'SYSTEM' },
  { key: 'reports', label: 'Reports', labelFa: 'گزارش و تحلیل', icon: 'BarChart3', roles: [...MGMT, 'ACCOUNTANT', 'PRODUCT_MANAGER'], group: 'SYSTEM' },
  { key: 'demo', label: 'Industry Demo Lab', labelFa: 'آزمایشگاه دموی صنعت', icon: 'FlaskConical', roles: MGMT, group: 'SYSTEM' },
  { key: 'pilot', label: 'Field Pilot', labelFa: 'آزمون میدانی', icon: 'ClipboardCheck', roles: [...MGMT, 'PRODUCT_MANAGER'], group: 'SYSTEM' },
  { key: 'admin', label: 'Administration', labelFa: 'مدیریت سامانه', icon: 'Settings', roles: ['IT_ADMIN', 'OPERATION_MANAGER', 'OWNER'], group: 'SYSTEM' },
]

export function navGroupsFor(user: PUser | null): { group: NavItem['group']; items: NavItem[] }[] {
  const items = navFor(user)
  const order: NavItem['group'][] = ['OPS', 'TEAM', 'SYSTEM']
  return order
    .map((g) => ({ group: g, items: items.filter((i) => i.group === g) }))
    .filter((g) => g.items.length > 0)
}

export function navFor(user: PUser | null): NavItem[] {
  if (!user) return []
  const roles = user.roles.split(',').map((r) => r.trim()) as Role[]
  return NAV_ITEMS.filter((n) => n.roles.some((r) => roles.includes(r)))
}
