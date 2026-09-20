import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const LEAD = 3
async function main() {
  const products = await db.product.findMany({
    where: { active: true, mergedInto: null },
    select: { id: true, name: true, stock: true, minStock: true, sellPrice: true, buyPrice: true, supplier: { select: { name: true } } },
  })
  const now = Date.now()
  const s30 = new Date(now - 30*86400000), s60 = new Date(now - 60*86400000)
  const sales60 = await db.sale.findMany({ where: { createdAt: { gte: s60 } }, select: { productId: true, qty: true, total: true, createdAt: true } })
  const rev = new Map<number, number>()
  for (const s of sales60) if (s.productId != null) rev.set(s.productId, (rev.get(s.productId) ?? 0) + s.total)
  const totRev = [...rev.values()].reduce((a,b)=>a+b,0)
  const sorted = products.map(p => ({ id: p.id, name: p.name, revenue: rev.get(p.id) ?? 0 })).sort((a,b)=>b.revenue-a.revenue)
  const cnt = {A:0,B:0,C:0}, shr = {A:0,B:0,C:0}
  let cum = 0; const topA: string[] = []
  for (const it of sorted) { cum += it.revenue; const sh = totRev>0?cum/totRev:1; const k = sh<=0.8?'A':sh<=0.95?'B':'C'; cnt[k]++; shr[k]+=it.revenue; if(k==='A'&&topA.length<5) topA.push(it.name) }
  console.log('MIRROR ABC:', JSON.stringify({A:{c:cnt.A,p:+(shr.A/totRev*1000/10).toFixed(1)},B:{c:cnt.B,p:+(shr.B/totRev*1000/10).toFixed(1)},C:{c:cnt.C,p:+(shr.C/totRev*1000/10).toFixed(1)},topA}))
  const qty30 = new Map<number, number>()
  for (const s of sales60) { if (s.productId==null) continue; if (new Date(s.createdAt).getTime() < s30.getTime()) continue; qty30.set(s.productId, (qty30.get(s.productId) ?? 0)+s.qty) }
  const cand = products.map(p => { const q = qty30.get(p.id) ?? 0; const d = q>0?Math.max(q/30,0.1):0; return { p, d, rop: d*LEAD+p.minStock } })
    .filter(({p,rop}) => p.stock <= Math.max(p.minStock, rop))
    .map(({p,d}) => ({ id: p.id, name: p.name, stock: p.stock, min: p.minStock, demand: Math.round(d*100)/100, sug: Math.max(Math.round(p.minStock*1.5-p.stock),1), sup: p.supplier?.name ?? null }))
    .sort((a,b) => (a.min>0?a.stock/a.min:1e15) - (b.min>0?b.stock/b.min:1e15))
  console.log('MIRROR reorder count:', cand.length, 'top12 first3:', JSON.stringify(cand.slice(0,3)))
  console.log('MIRROR reorder all:', cand.map(c=>`${c.name} stock${c.stock}/min${c.min} d${c.demand} sug${c.sug}`).join(' | '))
  const sold60 = new Set(sales60.filter(s=>s.productId!=null).map(s=>s.productId as number))
  const slow = products.filter(p=>p.stock>0 && p.sellPrice>0 && !sold60.has(p.id))
    .map(p=>({ id:p.id, name:p.name, stock:p.stock, val:Math.round(p.stock*p.buyPrice), sell:p.sellPrice }))
    .sort((a,b)=>b.val-a.val).slice(0,10)
  console.log('MIRROR slow:', slow.map(s=>`${s.name}(${s.val})`).join(' | '))
  // sales denominator checks for ratio cross-check
  const agg7 = await db.sale.aggregate({ where: { createdAt: { gte: new Date(now-7*86400000) } }, _sum: { total: true } })
  console.log('sales30d-sum-check & sales7d:', (await db.sale.aggregate({ where: { createdAt: { gte: s30 } }, _sum: { total: true } }))._sum.total, agg7._sum.total)
}
main().finally(() => db.$disconnect())
