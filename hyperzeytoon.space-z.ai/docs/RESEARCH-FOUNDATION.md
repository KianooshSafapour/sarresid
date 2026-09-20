# Research Foundation — Hyper Zeytoon Platform's Scientific Basis + Expansion Backlog

**Status:** Research document (Task 9-g) · **Web sources accessed:** 2026-09-15 · Companion docs: `HOLOO-APEX-INTEGRATION.md`, `LEAVE-SCHEDULING-SCIENCE.md`, `DEPLOYMENT.md`.
**Purpose:** Part A records, with citations, the scientific models behind what the platform already ships. Part B is the prioritized backlog of *new* science-backed tools. Rule: no fabricated facts — anything uncertain is tagged **needs vendor confirmation / needs data**.

---

## Part A — What is implemented, with citations

### A1. EOQ — Economic Order Quantity (EOQ/ABC tool, per owner task list)
Classic EOQ: **Q\* = √(2DS/H)** where D = annual demand (units), S = fixed cost per order, H = holding cost per unit-year. Introduced by Ford W. Harris (1913, *Factory, The Magazine of Management*) and popularized by R. H. Wilson; the square-root form follows directly from the continuous-constant-demand assumption [1][2]. Assumptions to respect in the tool's tooltips: known constant demand, instantaneous or fixed lead time, constant costs, no quantity discounts/unlimited capacity [1][3]. Fine print for the UI: EOQ is a *cost-tradeoff* baseline; our reorder engine may override it when safety-stock logic dominates.

### A2. ABC / Pareto classification
ABC analysis applies Pareto's 80/20 rule to inventory value: ~10–20% of items (class A) carry ~70–80% of value; B and C follow [4][5]. Implementation: per-product value ranking feeding count frequency and review priority (the platform's value-weighted inventory views + Ms. Darvishi's margin-band logic [6]).

### A3. Safety stock + reorder point (z-score service level)
Implemented in `/api/reorders/suggestions` (Task 14): **SS = z × σ_d × √L** with z = 1.65 (≈95% cycle service level, normal demand) and L = 3-day lead time; **ROP = d̄×L + SS** [7][8][9]. MIT's teaching note confirms z=1 ⇒ ~84% protection (one σ) [7]; ASCM and industry references give the same service-level-factor form [8][9].

### A4. Weighted moving-average forecasting
`avgDaily` = 7d×0.6 + prev7d×0.3 + 14d×0.1 — a weighted moving average (WMA), the simplest member of the exponential-smoothing family. Full Holt-Winters (level+trend+seasonality triple smoothing) is the documented upgrade path [10][11]; Winters' original: "Forecasting Sales by Exponentially Weighted Moving Averages", *Management Science* 6(3), 1960 [12].

### A5. SPLH — Sales Per Labor Hour (gamified KPI)
**SPLH = Total Sales ÷ Total Labor Hours**; standard retail/restaurant labor-productivity KPI, used for scheduling targets and labor forecasting [13][14][15]. Platform computes it from sales ÷ (activeStaff × 7d × `labor_hours_per_day`) with manager quick-edit. Gamification context (points, awards, wall): gamified workplace training measurably raises employee self-efficacy and engagement (Bitrián et al., 2024, cited by 86) [16]; the 2025 in-store-tech study recorded in worklog Task 14 (Shewani et al.) — **URL re-verification pending; cited per worklog round 14**.

### A6. Margin color thresholds (Ms. Darvishi's Excel)
Margin bands قرمز <10% / زرد <25% / سبز ≥25% replicate the owner's existing decision rules (worklog Task 4/5). These are *house policy*, not academic constants — documented here so future agents don't "fix" them.

### A7. FEFO — First-Expired-First-Out
FEFO = consume/sell the earliest-expiry stock first, regardless of arrival order — the recognized discipline for perishables (dairy, produce) that directly cuts food waste [17][18][19]. Today the platform enforces FEFO via receiving discipline and shelf ops guidance; product-level **lot/expiry tracking is not yet in the schema** — see backlog B6/B9 (needs data: expiry dates per lot).

### A8. Reconciliation & shrinkage guardrails
Three-way receiving match (order ↔ delivery ↔ accounting), stock-count commit transactions, and the shrinkage report (shrinkRate = shrink value ÷ sales, benchmark bands GOOD <1% / WARN <2.5% / BAD) follow standard loss-prevention practice: shrinkage's primary causes are theft, vendor fraud, and administrative error — exactly what receiving + audit-trail controls address [20][21].

**Core textbooks behind A1–A4/A8** (print; canonical references, no URLs): Silver, Pyke & Peterson, *Inventory Management and Production Planning and Scheduling*, 3rd ed., Wiley 1998 (EOQ, (s,S), service levels). Nahmias, *Production and Operations Analysis*, McGraw-Hill (EOQ, newsvendor, safety stock). Chopra & Meindl, *Supply Chain Management: Strategy, Planning, and Operation*, Pearson (safety stock, aggregation, transport).

---

## Part B — Expansion backlog (prioritized; formula + feature mapping + citation each)

**P1 = next 1–2 rounds, uses existing data. P2 = needs new fields/sensors. P3 = multi-branch/strategy.**

### B1. Newsvendor model for perishables — **P1**
Single-period order for items that expire (dairy, bread, produce): order-up-to **Q\* = F⁻¹(CR)** with critical ratio **CR = Cu/(Cu+Co)** = underage cost ÷ (underage + overage cost); with normal demand, Q\* = μ + z·σ [22][23][26]. Feature mapping: new «سفارش تازه‌ها» wizard mode per category; Cu = sellPrice − buyPrice, Co = buyPrice − salvage (عآخر روز discount). Sources: Wikipedia (formal statement) [22]; Lancaster Retail Analytics notes [23]; Nahmias ch. "Single-Period Models" [26].

### B2. ROP policy classes (s,Q) and (s,S) — **P1**
Generalize today's fixed-quantity reorder into policy classes: **(s,Q)** — order fixed Q when position ≤ s; **(s,S)** — order up to S when position ≤ s (optimal under fixed ordering cost; Silver 1978's recursion computes cost-minimal (s,S)) [24][25]. Feature mapping: per-item `policy` field (`EOQ`, `sQ`, `sS`) on Product; suggestions engine picks Q = EOQ and S = ROP + Q. Sources: Federgruen & Zipkin's efficient (r,Q) algorithm [24]; Rossi's stochastic-inventory review [25].

### B3. Checkout queueing (M/M/c) → staff scheduling — **P1**
Model checkout as **M/M/c**: arrival rate λ (customers/h from ProductSale), service rate μ per cashier, c open counters; utilization **ρ = λ/(cμ)** must stay <1; probability of waiting and expected wait follow Erlang C [27][28][29]. Feature mapping: counter-hourly sales → λ curve → recommend staffing per hour; ties directly into SPLH target-setting. Sources: Erlang C/A staff-optimization study [27]; Erlang C explainer [28]; call-center M/M/N modeling paper [29].

### B4. Planogram & category management (slotting, cross-space elasticity) — **P2 (partially present)**
Drèze, Hoch & Purk (1994, *Journal of Retailing* 70(4):301–326, cited by 1079) quantified shelf-location effects and cross-space elasticity — moving/facing changes lift demand of neighbors too [30][31]. Feature mapping: our Planogram section already tracks shelves/fill; add per-facing sales attribution and a slotting suggestion = rank by (margin × demand-lift) vs shelf cost. Sources: [30] ScienceDirect, [31] UPenn repository; joint price/display/shelf optimization [32].

### B5. Demand elasticity & promotion uplift measurement — **P2**
Log-log elasticity **ε = ΔlnQ / ΔlnP**; promotion uplift = actual − baseline forecast (SCA N-1); the SCAN*PRO multiplicative model estimates own-price elasticity + feature/display lift from store scanner data [33][34][35]. Feature mapping: platform `ProductSale` history is the scanner feed; a discount field on sales events enables uplift readouts per promotion. Sources: SCAN*PRO model docs [33]; FTC scanner-data methods paper [34]; uplift definitions [35].

### B6. Markdown optimization for near-expiry — **P2**
Jointly choose discount depth/timing for items approaching expiry to trade margin vs waste: maximize expected revenue minus waste cost over remaining shelf life; expiration-based (dynamic) markdown is the recognized waste-mitigation practice [36][37][38]. Feature mapping: needs B-lot expiry dates (B9); first version = rule-based two-step markdown (e.g. −30% at T-2d, −50% at T-1d) with waste-tracking feedback into the shrinkage report.

### B7. Shrinkage prediction (ML) — **P2**
Beyond today's descriptive shrinkage report [20][21]: predict per-category/per-shift shrink risk from count-history features (diff rate by counter, day-of-week, category) — a supervised classification on StockCountItem history. Formula: shrinkRate = (systemStock − countedQty)×buyPrice ÷ sales. **Needs data:** 6–12 months of count sessions.

### B8. Network/transport optimization (multi-store) — **P3**
When the chain scenario goes live: multi-depot VRP for store replenishment — minimize distance/cost subject to capacity & time windows; classic construction heuristics = Nearest Neighbor + Clarke-Wright Savings [39][40]. Feature mapping: per-branch orders (Branch model, worklog Task 14 roadmap) + route suggestion per day. Sources: Mogale et al. 2025 multi-depot VRP [39]; VRP heuristic study [40]; background Chopra & Meindl transport chapter [26].

### B9. Iranian-calendar seasonality indices — **P1**
**SI(month) = avg demand of month ÷ overall avg demand** (multiplicative decomposition), applied as forecast multiplier. Evidence base: Ramadan shifts purchasing substantially — panel-data estimates show purchase increases of ~40.6% during Ramadan and ~76.3% for Eid [41]; MENA retail is strongly promotion-driven in Ramadan (~76% of consumers respond to offers) [42]; Nowruz is the year's peak shopping window in Iran (markets bustling pre-Nowruz) [43][44]. Feature mapping: Jalali-month index table per category feeding the reorder engine + a Ramadan/Nowruz override on min-stock (the platform's holidays-data module already knows the dates). **Needs data:** 2 years of sales for stable indices.

### B10. Vendor-Managed Inventory (VMI) — **P3**
Vendor replenishes against agreed min/max using the retailer's stock data: benefits include fewer stockouts, faster turnover, lower carrying cost, better forecasts [45][46][47]. Feature mapping: Phase ≥1 of the Holoo integration gives trusted stock feeds; a "share stock window with supplier X" toggle + VMI agreements table. Sources: Adobe [45], Ivalua framework [46], Inbound Logistics [47].

### B11. RFM customer segmentation — **P1**
Score each customer on Recency, Frequency, Monetary (1–5 quintiles each; R×F×M classes drive retention offers); a standard of database marketing [48][49][50]. Feature mapping: Customer + CustomerOrder + ProductSale models already exist; new report = RFM quintile table + campaign list for the «باشگاه مشتریان» idea.

### B12. Cheque/treasury analytics — **P3 (formal)**
Today: due heatmap + holiday rule + split (worklog Tasks 2-a/10). Formal model: cash-flow scheduling as linear program over due dates, or simply aging buckets + expected-collection probability per counterparty history. Cite: Chopra & Meindl (working-capital coordination) [26]. **Needs data:** 1+ year of cheque outcomes.

---

## Priority summary

| Rank | Item | Why now |
|---|---|---|
| P1 | B1 Newsvendor, B2 (s,Q)/(s,S), B3 M/M/c staffing, B9 Seasonality, B11 RFM | All computable from existing ProductSale/Order/Staff data; each upgrades an existing surface (reorder engine, SPLH, customers) |
| P2 | B4 Slotting, B5 Elasticity/uplift, B6 Markdown, B7 Shrinkage ML | Need small schema additions (facing counts, discount flags, expiry lots, count history depth) |
| P3 | B8 VRP/multi-store, B10 VMI, B12 Treasury LP | Depend on multi-branch rollout and Holoo Phase ≥1 feeds |

---

## Sources (accessed 2026-09-15)

[1] Wikipedia — Economic order quantity: https://en.wikipedia.org/wiki/Economic_order_quantity
[2] Erlenkotter, D. (1990), "Ford Whitman Harris and the Economic Order Quantity Model" (Harris 1913 original in *Factory, The Magazine of Management*): https://pubsonline.informs.org (also https://www.jstor.org)
[3] Slimstock, "EOQ: What it is, how to calculate it" (Jan 12, 2026): https://www.slimstock.com
[4] NetSuite, "ABC Inventory Analysis & Management" (Sep 5, 2023): https://www.netsuite.com
[5] Finale Inventory, "ABC Analysis: Prioritize Your Inventory Management" (Jun 27, 2025): https://www.finaleinventory.com
[6] Platform worklog Tasks 4–5 (margin bands + reports xlsx) — internal reference
[7] MIT, "Understanding safety stock and mastering its equations": https://web.mit.edu
[8] ASCM, "Calculate Inventory with Precision — Even Amid Variability": https://www.ascm.org
[9] ABCSupplyChain, "Safety Stock Formula & Calculation: 6 best methods" (Apr 7, 2025): https://abcsupplychain.com (ROP = Safety Stock + Avg Sales × Lead Time)
[10] Hyndman & Athanasopoulos, *Forecasting: Principles and Practice*, §7.3 Holt-Winters' seasonal method: https://otexts.com
[11] Hyndman, "Initializing the Holt-Winters method" (Nov 30, 2010): https://robjhyndman.com
[12] Winters, P.R. (1960), "Forecasting Sales by Exponentially Weighted Moving Averages", *Management Science* 6(3) — print citation
[13] StoreForce, "Sales Per Labor Hour: Use It To Increase Revenue": https://storeforce.com
[14] TimeForge, "SPLH Definition, Formula, And How To Use It" (Jun 8, 2021): https://timeforge.com
[15] 7shifts, "Restaurant Sales Per Labor Hour: Complete Guide to SPLH" (Jan 13, 2026): https://www.7shifts.com (also Axonify SPMH, Nov 6, 2025: https://axonify.com)
[16] Bitrián, P. et al. (2024), "Gamification in workforce training: Improving employees' self-efficacy…": https://www.sciencedirect.com (also https://ideas.repec.org, https://zaguan.unizar.es)
[17] Food Manufacturing, "First Expired, First Out: What Is FEFO?" (Mar 31, 2026): https://www.foodmanufacturing.com
[18] ReFED Insights Engine, "Solution database: First Expired First Out": https://insights-engine.refed.org
[19] Inecta, "Understanding FEFO in the Food Industry" (Apr 18, 2023): https://www.inecta.com
[20] Appriss Retail, "How to Prevent & Identify Inventory Shrinkage in Retail" (Sep 5, 2024): https://apprissretail.com
[21] Infosys, "Smarter stores, smaller shrink" (Jan 22, 2026): https://www.infosys.com
[22] Wikipedia — Newsvendor model: https://en.wikipedia.org/wiki/Newsvendor_model
[23] Lancaster University, "RT2 — Retail Analytics" (newsvendor under cost-minimisation & service frameworks, 2022): https://www.lancaster.ac.uk
[24] Federgruen, A. & Zipkin, P., "An Efficient Algorithm for Computing an Optimal (r,Q) Policy": https://business.columbia.edu/sites/default/files-efs/pubfiles/4035/federgruen_efficientalgorithm.pdf
[25] Rossi, R., "Stochastic Inventory Control: A Literature Review" (Silver 1978 (s,S) formulae; Dec 14, 2018): https://gwr3n.github.io/chapters/Ma_MIM_2019.pdf ; survey of (s,S)-type optimality (Jun 15, 2022): https://papers.ssrn.com
[26] Print textbooks: Nahmias, *Production and Operations Analysis*; Chopra & Meindl, *Supply Chain Management*; Silver, Pyke & Peterson (1998); Kotler & Keller, *Marketing Management* (segmentation/promotion)
[27] IEEE (2018), "Evaluating Erlang C and Erlang A models for staff optimization — airline call center": http://ieeexplore.ieee.org/document/8289839
[28] WFM Labs, "Erlang C": https://wiki.wfmlabs.org/wiki/Erlang_C (calculator: https://metricgate.com/docs/erlang-c)
[29] "Evaluating the Performance of the Erlang Models for Call Centers": https://myweb.ecu.edu/robbinst/PDFs/Comparing%20Erlang%20A%20and%20Erlang%20C%20-%20WP.pdf
[30] Drèze, X., Hoch, S.J. & Purk, M.E. (1994), "Shelf Management and Space Elasticity", *Journal of Retailing* 70(4):301–326 (cited by 1079): https://www.sciencedirect.com
[31] Same paper, UPenn repository: https://repository.upenn.edu
[32] Murray, C.C. et al. (2010), "Joint Optimization of Product Price, Display Orientation and Shelf-Space Allocation" (cited by 200): https://www.sciencedirect.com
[33] MetricGate, "SCAN*PRO Promotion Response Model" (Jun 2, 2026): https://metricgate.com
[34] Tenn, S., "Estimating Promotional Effects with Retailer-Level Scanner Data" (FTC working paper): https://www.ftc.gov
[35] PrescientAI, "Sales Uplift: What It Is, How to Calculate It" (May 22, 2026): https://prescientai.com
[36] Riesenegger, L. et al. (2026), "Balancing profitability and waste reduction — expiration-based pricing/markdown optimization" (cited by 6): https://www.tandfonline.com
[37] "Dynamic Markdown Strategies for Perishable Products" (arXiv, Aug 24, 2026): https://arxiv.org
[38] Villa, G. et al. (2026), "An ILS-VND approach to dynamic pricing of perishables" (cited by 3): https://www.sciencedirect.com
[39] Mogale, D.G. et al. (2025), "Modelling and optimising a multi-depot vehicle routing problem" (cited by 14): https://www.sciencedirect.com
[40] Anggraito, H. (2025), "Distribution Optimization Using Nearest Neighbor and Saving Matrix (VRP)": https://ejeset.saintispub.com
[41] Hosen, M.Z. (2024), "Effect of Ramadan on purchasing behavior: a panel data analysis" (cited by 16; +40.6% Ramadan, +76.3% Eid): https://ideas.repec.org
[42] Grand View Research, "Understanding Seasonal Consumption Patterns in MENA" (76% promotion-driven in Ramadan): https://www.grandviewresearch.com
[43] BBC, "Nowruz: Iran prepares for Persian new year…" (Mar 20, 2026): https://www.bbc.com/news/articles/cvgkg8p7zlko
[44] Al Jazeera, "Iranians shop for Persian New Year essentials" (Mar 19, 2026): https://www.aljazeera.com
[45] Adobe Business, "Vendor managed inventory (VMI) — benefits, risks, best practices" (Jan 24, 2025): https://business.adobe.com
[46] Ivalua, "Vendor Managed Inventory: Benefits and Implementation Framework" (Apr 7, 2026): https://www.ivalua.com
[47] Inbound Logistics, "Vendor Managed Inventory: Definition, Benefits, Challenges" (Oct 11, 2024): https://www.inboundlogistics.com
[48] Wikipedia — RFM (market research): https://en.wikipedia.org/wiki/RFM_(market_research)
[49] Investopedia, "Understanding RFM: Recency, Frequency, and Monetary Value": https://www.investopedia.com
[50] Microsoft Learn, "Set up RFM analysis (Dynamics 365 Commerce)" (Jan 30, 2026): https://learn.microsoft.com
