# RESTORE-3 — Dashboard Pages Restorer

## Task
Restaurar 9 páginas de dashboard eliminadas en force push:
1. `dashboard/clientes/page.tsx`
2. `dashboard/productos/page.tsx`
3. `dashboard/devoluciones/page.tsx`
4. `dashboard/finanzas/page.tsx`
5. `dashboard/inteligencia-ia/page.tsx`
6. `dashboard/alertas/page.tsx`
7. `dashboard/usuarios/page.tsx`
8. `dashboard/auditoria/page.tsx`
9. `dashboard/documentacion/page.tsx`

## What I did
- Leí el worklog y los archivos existentes (AppShell, KPI card, status badge, format helpers, dashboard/pedidos/guias/integraciones/impresion pages, schema Prisma).
- Verifiqué los endpoints API reales y alineé los query params y shapes de respuesta (ver worklog.md para detalles de cada API).
- Escribí las 9 páginas 'use client' con TanStack Query, sonner toast, next-auth/react, recharts, sin colores indigo/azul.
- `bun run lint` pasa sin errores.

## API integration notes for future agents
Los endpoints usan `?view=...` (no `?stats=true|star=true|metrics=true`):
- `/api/customers?stats=true&sortBy=&sortDir=&search=&classification=&limit=&offset=` → `{ customers, total, stats }` (combinado). Stats tiene `byClassification: {VIP, FRECUENTE, NUEVO, INACTIVO}`.
- `/api/analytics/products?view=star|stats|ranking&sortBy=&sortDir=&search=&limit=&offset=` → Star: `{ topByQuantity, topByRevenue, topByProfit }` (arrays). Stats: `{ totalProducts, activeProducts, totalUnitsSold, totalRevenue, avgMargin }`. Product tiene `costTotal` (no `cost`).
- `/api/analytics/returns?view=metrics|list` → Metrics: `{ count, totalOrders, rate, lostValue, topProduct, topCity, topProducts: [{id, label, count, lostValue}], topCities: [...] }`. List: `{ returns: [{ id, orderId, orderNumber, orderStatus, productTitle, productSku, reason, city, lostValue, status, createdAt }], total }` (NO trae customerName).
- `/api/analytics/profitability?view=period|trend|breakdown&period=&days=` → Period: `{ period, revenue, transportCollected, totalRevenue, costs, grossProfit, netProfit, margin, ordersCount }`. Trend: `[{ date, label, revenue, costs, profit, margin, ordersCount }]`.
- `/api/alerts?type=&severity=&resolved=&limit=&offset=` → `{ alerts, total, stats, filters }` (combinado, sin endpoint separado para stats).
- `/api/admin/users?stats=true&search=&role=&active=&limit=&offset=` → `{ users, total, stats }` (combinado). Stats: `{ total, active, inactive, byRole, recentLogins24h }` (sin `lastLoginAt`).
- `/api/admin/users` POST → retorna el user object directo. PUT `/api/admin/users/[id]` → retorna user. DELETE → `{ ok, deactivated }`.
- `/api/audit?stats=true&search=&action=&entity=&startDate=&endDate=&limit=&offset=` → `{ logs, total, stats }` (combinado). Stats: `{ total, recent24h, recent7d, byAction: [{action, count}], byEntity: [{entity, count}], topUsers }`. Log.metadata es `Record<string, unknown> | null` (ya parseado).
- `/api/ai/insights?type=&aiGenerated=&limit=&offset=` → `{ insights, total, stats, filters }` (combinado). Cada insight tiene `aiGenerated: boolean` top-level (no en metadata). Stats: `{ total, byType, aiGenerated, fallback, lastGeneratedAt }`.

## Files created
- `src/app/(dashboard)/dashboard/clientes/page.tsx`
- `src/app/(dashboard)/dashboard/productos/page.tsx`
- `src/app/(dashboard)/dashboard/devoluciones/page.tsx`
- `src/app/(dashboard)/dashboard/finanzas/page.tsx`
- `src/app/(dashboard)/dashboard/inteligencia-ia/page.tsx`
- `src/app/(dashboard)/dashboard/alertas/page.tsx`
- `src/app/(dashboard)/dashboard/usuarios/page.tsx`
- `src/app/(dashboard)/dashboard/auditoria/page.tsx`
- `src/app/(dashboard)/dashboard/documentacion/page.tsx`

## Lint status
`bun run lint` — passes without errors.
`tsc --noEmit --skipLibCheck` — no errors in my 9 new files (existing API files have errors that are NOT in scope of this task).
