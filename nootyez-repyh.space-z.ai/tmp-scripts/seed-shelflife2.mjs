import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const map = {
  97: 14,  // Kalleh Milk 1L — received 12d ago → 2d left (markdown!)
  98: 14,  // Milk 500ml
  99: 21,  // Chocolate Milk — 9d left (markdown)
  100: 14, // Yogurt — 5d left (markdown)
  101: 10, // Doogh
  102: 45, // Butter — 33d left (outside window)
  103: 30, // Lighvan Cheese
  104: 10, // Cream — 7d left (markdown)
  105: 365, 106: 365, // Rice
  107: 365, // Tomato paste
  108: 730, // Tuna
  109: 365, 110: 730, 111: 365, // Oil/Sugar/Vinegar
  112: 120, 113: 60, 114: 25, 115: 180, // Biscuit/Wafers/Danette/Chocolate
  116: 90,  // Juice
  117: 180, // Ice cream
  118: 30, 119: 25, // Salami/Sausage
  120: 3,   // Chicken
  121: 21,  // Eggs
  123: 365, // Pistachio
  124: 5, 125: 5, // Cucumber/Tomato
};
let n = 0;
for (const [id, days] of Object.entries(map)) {
  const r = await db.product.updateMany({ where: { id: Number(id) }, data: { shelfLifeDays: days } });
  n += r.count;
}
await db.auditLog.create({ data: { userId: 49, userName: 'سیستم', action: 'SHELF_LIFE_SEEDED', entity: 'Product', entityId: null,
  detail: `تنظیم عمر مفید (روز) برای کالاهای فاسدشدنی — ${n.toLocaleString('fa-IR')} کالا — مبنای FEFO و هشدار انقضا` } });
console.log('SEEDED', n);
await db.$disconnect();
