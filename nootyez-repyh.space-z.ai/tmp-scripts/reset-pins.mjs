import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const res = await db.user.updateMany({ data: { pin: '1234' } });
console.log('UPDATED PINS:', res.count);
const users = await db.user.findMany({ select: { id: true, name: true } });
await db.auditLog.create({ data: {
  userId: 49, userName: 'سیستم',
  action: 'PIN_RESET_ALL', entity: 'User', entityId: null,
  detail: `بازنشانی کد ورود همه کاربران به مقدار پیش‌فرض ۱۲۳۴ — ${res.count} کاربر (درخواست مالک پروژه)`,
} });
console.log('AUDIT WRITTEN');
await db.$disconnect();
