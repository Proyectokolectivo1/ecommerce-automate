# Task ID: RESTORE-2 — AI Insights + Alerts backend

Agent: full-stack-developer (subagent for RESTORE-2)
Task: Recrear código backend de IA Insights + Alerts para plataforma ecommerce.

## Work Log

- Leí `worklog.md` y los archivos existentes: `src/lib/{db,logger,auth,realtime,audit,validation,cache,print-worker}.ts`, `prisma/schema.prisma`, `src/modules/analytics/{index,sales.metrics}.ts`, `src/app/api/{analytics,orders/stats,orders/[id]/dispatch}/route.ts`, `package.json` (z-ai-web-dev-sdk v0.0.18), README del SDK.
- Confirmé modelos Prisma disponibles: `AiInsight { type, title, content, metadata, createdAt }`, `Alert { type, severity, entity?, message, resolved, resolvedAt, createdAt }`.
- Confirmé tipos en `validation.ts`: `AiInsightType` (4 valores), `AlertType` (5 valores), `AlertSeverity` (3 valores), arrays `AI_INSIGHT_TYPES`, `ALERT_TYPES`, `ALERT_SEVERITIES`.

### Archivos creados (10 nuevos + 1 editado)

**Módulo AI** (`src/modules/ai/`):
1. `ai.service.ts` — Único punto de contacto con `z-ai-web-dev-sdk`:
   - `callLLM(systemPrompt, userPrompt)` → `string | null` (ZAI.create() → zai.chat.completions.create con `thinking: { type: 'disabled' }`). Devuelve null si falla (no lanza).
   - `saveInsight(input)` → persiste en `db.aiInsight`, metadata serializada a JSON con flag `aiGenerated` dentro.
   - `listInsights(filters)` → `{ insights, total }` con filtros type/aiGenerated/limit/offset. Filtro aiGenerated usa `metadata contains` (SQLite no tiene JSON queries nativos).
   - `getLatestInsight(type)` → DTO o null.
   - `getAiStats()` → `{ total, byType, aiGenerated, fallback, lastGeneratedAt }`.
   - Tipos: `AiInsightResult`, `SaveInsightInput`, `ListInsightsFilters`, `ListInsightsResult`, `AiStats`.

2. `predict-sales.ts`:
   - `calculatePrediction(history)` — FUNCIÓN PURA: regresión lineal (least squares) sobre serie diaria + media móvil 7d. Devuelve `{ forecast[7], avgDailyRevenue, trend, trendPercentage, totalProjected7d, confidence }`. Confianza inversamente proporcional al coeficiente de variación.
   - `getSalesHistory(days=30)` — trae serie diaria de `db.order` (excluye CANCELADO/DEVUELTO), rellena días vacíos con ceros.
   - `generateSalesPrediction()` — orquesta: si hay ≥5 días con ventas, llama al LLM; si no o falla, usa fallback tabular. Persiste insight con `aiGenerated` flag.

3. `detect-anomalies.ts`:
   - `detectAnomalies(history, returnsByDay, threshold=3)` — detector puro: spike si revenue > media+2σ, drop si < media−2σ, HIGH_RETURNS si día con >3 devoluciones.
   - `getReturnsByDay(days)` — agrupa `db.return` por día.
   - `generateAnomalyReport()` — orquesta LLM con fallback.

4. `monthly-summary.ts`:
   - `collectMonthlyKpis()` — Promise.all de getSalesKPIs('month'), getProfitability, getReturnsMetrics, getTopProducts(5).
   - `generateMonthlySummary()` — LLM con prompt estructurado (Highlight, KPIs, Rentabilidad, Top, Devoluciones, Recomendaciones). Fallback tabular.

5. `product-analysis.ts`:
   - `collectProductData(limit=10)` — getTopProducts + groupBy de returns por productId + inventario de `db.product`. Calcula margen ponderado.
   - `generateProductAnalysis()` — LLM con prompt Markdown. Fallback con insights por margen<15%, devoluciones≥2, inventario<10.

**Módulo Alerts** (`src/modules/alerts/`):
6. `alert-evaluators.ts`:
   - `AlertCondition` type: `{ type, severity, entity, message, metadata? }`.
   - 5 evaluadores puros:
     - `evaluateCodUnpaid()` — pedidos COD en PENDIENTE_PAGO_TRANSPORTE con placedAt > 24h. Severity WARNING.
     - `evaluateGuideError()` — pedidos ENVIADO sin Shipment o con guideNumber null. Severity CRITICAL.
     - `evaluateHighReturn()` — tasa global > 15% (count returns / total orders). Severity CRITICAL, entity=null.
     - `evaluateLowInventory()` — productos activos con inventoryQty < 10. CRITICAL si 0, WARNING si <10.
     - `evaluateSalesDrop()` — revenue semana actual vs semana previa, drop > 30%. CRITICAL, entity=null.
   - `ALERT_EVALUATORS` array (registry con name, type, run).
   - `ALERT_THRESHOLDS` constantes exportadas (COD_UNPAID_HOURS=24, LOW_INVENTORY_UNITS=10, HIGH_RETURN_RATE_PCT=15, SALES_DROP_PCT=30, SALES_DROP_WINDOW_DAYS=7).
   - `evaluateAllAlerts()` → `{ conditions, results }` con `Promise.allSettled` para tolerar fallos individuales. Cada `AlertEvaluatorResult` incluye `{ name, type, status, conditions, error?, durationMs }`.

7. `alert.service.ts`:
   - `createAlertIfNotExists(condition)` → busca alerta activa existente con mismo type+entity (entity null también deduplica correctamente). Si existe, devuelve existente sin crear. Si no, persiste + `emitAlert()` (realtime fire-and-forget).
   - `processAlertConditions(conditions)` → batch con concurrencia 5. Devuelve `{ evaluated, created, duplicates, createdIds }`.
   - `listAlerts(filters)` → paginado con filtros type/severity/resolved. Orden: resolved ASC, createdAt DESC (activas primero).
   - `resolveAlert(id)` → marca resolved=true + resolvedAt=now. Lanza `AlertNotFoundError` si no existe.
   - `getAlertStats()` → `{ total, active, resolved, byType, bySeverity, critical }` con groupBy de Prisma.

8. `alert-worker.ts`:
   - `runAlertWorkerTick()` — runner idempotente (flag `running` para evitar ticks superpuestos). Destructura `{ conditions }` de `evaluateAllAlerts` (como exige el task description) y llama `processAlertConditions`.
   - `startAlertWorker()` — setInterval 5min (300000ms) + primer tick diferido 10s. `timer.unref?.()` para no bloquear el shutdown del proceso.
   - `stopAlertWorker()` para tests/shutdown.
   - Auto-start: `if (typeof window === 'undefined') startAlertWorker()` al final del módulo.

**API routes** (`src/app/api/`):
9. `ai/insights/route.ts` — GET con `getCurrentUserOrFallback`. Query params: type, aiGenerated, limit, offset. Devuelve `{ insights, total, stats, filters }`.
10. `ai/predict/route.ts` — POST con `requireRole(getCurrentUser(), 'ADMIN', 'GERENCIA')`. Llama `generateSalesPrediction()`. 201 + insight.
11. `ai/anomalies/route.ts` — POST mismo auth. Llama `generateAnomalyReport()`.
12. `ai/summary/route.ts` — POST mismo auth. Llama `generateMonthlySummary()`.
13. `ai/products/route.ts` — POST mismo auth. Llama `generateProductAnalysis()`.
14. `alerts/route.ts` — GET con `getCurrentUserOrFallback` (lista + stats). POST con `requireRole(..., 'ADMIN')` + check `?evaluate=true` (defensivo). Devuelve `{ ok, evaluated, created, duplicates, createdIds, evaluatorResults, durationMs }`.
15. `alerts/[id]/resolve/route.ts` — POST con `requireRole(..., 'ADMIN', 'GERENCIA', 'SERVICIO')`. 200 + alert resolved, 404 si no existe.

**Editado (1 archivo existente)**:
- `src/app/(dashboard)/layout.tsx` — añadidos side-effect imports `import '@/lib/print-worker'` + `import '@/modules/alerts/alert-worker'` para que ambos workers arranquen al cargar el dashboard.

## Verificación end-to-end

Login admin (admin@demo.com/admin123) → cookie next-auth.session-token OK.

| Endpoint | Method | Status | Resultado |
|----------|--------|--------|-----------|
| /api/ai/insights | GET | 200 | Lista insights semilla + stats |
| /api/ai/predict | POST | 201 | LLM generated (14s), trend +51.4%, totalProjected $1.412.844 COP |
| /api/ai/anomalies | POST | 201 | LLM generated (5s), 1 anomalía detectada |
| /api/ai/summary | POST | 201 | LLM generated (12s), KPIs mensuales |
| /api/ai/products | POST | 201 | LLM generated (9s), top 7 productos, margen 54.15% |
| /api/alerts | GET | 200 | 4 alertas semilla + stats (total=4 active=3 resolved=1 critical=1) |
| /api/alerts?evaluate=true | POST | 200 | evaluated=5, created=5, duplicates=0 (5 condiciones: 3 COD_UNPAID + 2 LOW_INVENTORY) |
| /api/alerts?evaluate=true (2da vez) | POST | 200 | evaluated=5, created=0, duplicates=5 (dedup correcto) |
| /api/alerts/{id}/resolve | POST | 200 | resolved=true, resolvedAt set |
| /api/alerts/nonexistent/resolve | POST | 404 | "Alerta no encontrada: nonexistent-id" |
| /api/ai/predict (sin auth) | POST | 401 | "No autenticado" |

### Worker auto-start verificado
Tras cargar `/dashboard`:
```
[INFO] [app] print-worker.started {"intervalMs":15000}
[INFO] [app] alert-worker.started {"intervalMs":300000}
[INFO] [app] alert.evaluateAll done {"evaluators":5,"conditions":5,"rejected":0}
[INFO] [app] alert-worker.tick done {"evaluated":5,"created":0,"duplicates":5,"createdIds":[],"durationMs":14}
```

## Stage Summary
- Backend de IA + Alertas COMPLETO y verificado end-to-end.
- 10 archivos nuevos + 1 editado. z-ai-web-dev-sdk aislado en `ai.service.ts` (única importación del SDK en todo el repo).
- 4 tipos de insights funcionando con LLM real (predicción, anomalías, resumen mensual, análisis de productos) + fallback heurístico si el LLM falla.
- 5 evaluadores de alertas corriendo en paralelo con `Promise.allSettled` + dedup por (type+entity) + emisión realtime vía `emitAlert`.
- Worker periódico (5min) auto-arrancado al cargar el dashboard, con flag anti-reentrada.
- Lint: 0 errores en archivos propios. `bun run lint` global: exit 0.
