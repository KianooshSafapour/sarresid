import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const items = await db.orderItem.findMany({
  where: { productId: { not: null }, order: { status: { in: ['RECEIVED','CONFIRMED','DONE'] } } },
  select: { productId: true, name: true, order: { select: { receivingDate: true, code: true } } },
});
const seen = new Map();
for (const it of items) {
  const pid = it.productId; const d = it.order.receivingDate;
  if (!pid || !d) continue;
  if (!seen.has(pid)) seen.set(pid, { name: it.name, d, code: it.order.code });
}
for (const [pid, v] of seen) {
  const days = Math.floor((Date.now() - new Date(v.d).getTime()) / 86400000);
  console.log('RECEIVED-BATCH', pid, '|', v.name.slice(0,40), '|', days, 'd ago |', v.code);
}
const prods = await db.product.findMany({ where: { active: true, mergedInto: null }, select: { id: true, name: true, stock: true } });
console.log('---ALL PRODUCTS---');
for (const p of prods) console.log('PROD', p.id, p.name.slice(0,50), 'stock', p.stock);
await db.$disconnect();
