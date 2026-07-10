# Task 7 — Executive Dashboard Builder

## Work Record

**Status:** Completed successfully.

## Files Created (9)

1. `src/modules/analytics/sales.metrics.ts` — Server-side analytics functions: `getSalesKPIs(period)`, `getSalesTrend(days)`, `getOrdersByStatus()`, `getOrdersByPaymentMethod()`, `getTopProducts(limit)`, `getReturnsMetrics()`, `getProfitability()`.
2. `src/modules/analytics/index.ts` — Barrel export.
3. `src/app/api/analytics/route.ts` — GET with auth + 60s cache. Payload: `{ sales, trend, ordersByStatus, ordersByPaymentMethod, topProducts, returns, profitability, recentOrders, generatedAt }`.
4. `src/components/charts/sales-trend-chart.tsx` — Recharts AreaChart with dual YAxis.
5. `src/components/charts/orders-status-chart.tsx` — Recharts horizontal BarChart for 8 states.
6. `src/components/charts/profitability-chart.tsx` — Recharts BarChart with 3 bars (Ingresos, Costos, Utilidad Neta).
7. `src/components/shared/kpi-card.tsx` — Card with title, value, subtitle, icon, trend (▲▼), loading skeleton.
8. `src/components/shared/status-badge.tsx` — Badge using `ORDER_STATE_COLORS`/`ORDER_STATE_LABELS`. **Reusable for Task 8 (orders page)**.
9. `src/app/(dashboard)/dashboard/page.tsx` — Server component, full executive dashboard.

## Key Decisions

- **Cache TTL**: 60s on `/api/analytics` (key `'api:analytics:combined'`). Verified ~4x speedup.
- **CostEntry filter**: Used `periodEnd >= (today - 30d)` instead of `periodStart >= ...` to capture seed entries whose `periodStart` falls exactly on the 30-day boundary.
- **Product cost calculation**: Fetch OrderItem rows and reduce `unitCost * quantity` in memory (Prisma `_sum(unitCost) * _sum(quantity)` gives wrong result when items have different unit costs).
- **Profitability product cost**: Prefer CostEntry.PRODUCT for the period (authoritative); fall back to OrderItem calculation only if CostEntry is missing.
- **Sales exclusion**: `EXCLUDED_SALES_STATUSES = [CANCELADO, DEVUELTO]` — applied to KPIs, trend, payment method, top products.
- **Chart colors**: All use CSS vars `var(--chart-1..5)`. No indigo/blue.
- **Status colors mapping**: NUEVO=chart-4, PENDIENTE_PAGO_TRANSPORTE=chart-5, PAGO_TRANSPORTE_CONFIRMADO=chart-3, PREPARANDO/ENVIADO/ENTREGADO=chart-2, DEVUELTO/CANCELADO=chart-1.
- **Active orders**: total - terminal (ENTREGADO + DEVUELTO + CANCELADO).

## Verification

- `bun run lint` → 0 errors in my code (transient errors in `src/components/orders/*` were from a concurrent Task 8 agent, not mine).
- Dev server running on port 3000, healthy.
- `curl http://localhost:3000/api/analytics` without auth → 401 `{"error":"No autenticado"}`.
- `curl` with auth cookie → 200, full payload with all 11 metrics computed correctly.
- `GET /dashboard` with cookie → 200, 240KB HTML, all 17 expected section strings present.
- Cache: 134ms (miss) → 34ms (hit) on identical request.
- dev.log shows no runtime errors from my code.

## Data Sanity (with seed)

- 15 orders total: 2 NUEVO, 3 PENDIENTE_PAGO_TRANSPORTE, 2 PAGO_TRANSPORTE_CONFIRMADO, 2 PREPARANDO, 3 ENVIADO, 2 ENTREGADO, 1 DEVUELTO, 0 CANCELADO.
- Sales (excl. CANCELADO/DEVUELTO) = 14 orders, $2,084,800 total.
- Day (today) = 1 order, $97,900. Week = 9 orders, $1.34M. Month/Year = 14 orders, $2.08M.
- Returns: 1 return (Smartwatch Deportivo, Pereira), rate 6.67%, lostValue $26,490.
- Profitability: revenue $2.08M, costs $25M (CostEntries del seed), margin -1099% (demo data: costos fijos $25M >> revenue de 15 pedidos $2M; comportamiento esperado).
- Top 5 products: Auriculares ($629k), Smartwatch ($480k), Altavoz ($260k), Power Bank ($240k), Cargador ($200k). Margins 49-56%.

## Reusable for Future Tasks

- **`StatusBadge`** (`src/components/shared/status-badge.tsx`) — Task 8 (orders page) should use this for status badges. Import: `import { StatusBadge } from '@/components/shared/status-badge'`.
- **`KPICard`** (`src/components/shared/kpi-card.tsx`) — Generic KPI card, accepts `loading` prop for client-side refetch.
- **3 chart components** — Reusable for other BI pages.
- **`/api/analytics`** — Combined payload, can be consumed by client-side TanStack Query if needed.
- **Analytics service functions** — All exportable from `@/modules/analytics` for direct server-side use.

## Dashboard Layout

1. Header — "Dashboard" + "Resumen ejecutivo · Hola, {name} ({role})" + "Últimos 30 días" badge.
2. Row 1 — 4 KPI cards (1/2/4 cols responsive): Ventas día, Ventas mes, Pedidos totales (con "X activos"), Ticket promedio mes.
3. Row 2 — Sales trend chart (2/3 width on lg) + Payment method card with 2 progress bars.
4. Row 3 — Orders by status chart + Profitability card with chart + dl + Progress bar of margin.
5. Row 4 — Top 5 products table (full width, max-h-96 scroll).
6. Row 5 — Returns card (count, rate, lostValue, topProduct, topCity, alerta >5%) + Recent orders list (5 items, link to /dashboard/pedidos).
