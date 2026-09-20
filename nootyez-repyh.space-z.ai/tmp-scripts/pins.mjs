import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const users = await db.user.findMany({ select: { id: true, name: true, pin: true, active: true, roles: true } });
for (const u of users) console.log(u.id, u.name, 'pin=' + u.pin, u.active ? 'active' : 'INACTIVE', u.roles);
const count = await db.user.count();
console.log('TOTAL', count);
await db.$disconnect();
