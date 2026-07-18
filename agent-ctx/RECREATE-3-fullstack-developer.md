# RECREATE-3 — Customers / Admin / Audit APIs & pages

## Context
- Read `/home/z/my-project/worklog.md` for project history.
- Stack: Next.js 16 App Router + TypeScript + Tailwind CSS 4 + shadcn/ui + Prisma (SQLite) + TanStack Query.

## What was created

### 1. Admin services (2 files)

**`src/modules/admin/user.service.ts`**
- `listUsers(filters)` → `{ users: SafeUser[], total }` — `SafeUser` is `Omit<User, 'passwordHash'>`; supports filters role/search/active/sortBy/sortOrder/limit/offset.
- `getUserById(id)` → `SafeUser | null`.
- `createUser(input)` → hashes password with `hashPassword`, validates email uniqueness.
- `updateUser(id, input, actorId)` → protection: throws `UserError('USER_CANNOT_CHANGE_OWN_ROLE')` if actor tries to change own role.
- `deleteUser(id, actorId)` → protection: throws `UserError('USER_CANNOT_DELETE_SELF')` if self. Unlinks `AuditLog.userId` and `Notification.userId` to null before delete (preserves history).
- `getUserStats()` → `{ total, active, inactive, byRole, lastLoginAt }`.
- `UserError` class with `code: UserErrorCode` and `statusCode`.

**`src/modules/admin/audit.service.ts`**
- `listAuditLogs(filters)` → `{ logs: AuditLogWithUser[], total }` — includes `user` relation (id/name/email/role). Filters: action/entity/userId/search/startDate/endDate/limit/offset.
- `getAuditStats()` → `{ total, byAction[], byEntity[], today, last24h, last7d }`.
- `getDistinctActions()` / `getDistinctEntities()` → `string[]` (for UI select filters).

### 2. API routes (5 files)

- `src/app/api/customers/route.ts` — `GET` returns `{ customers, total, stats }` (any authenticated). Validates `classification` against `CUSTOMER_CLASSIFICATIONS`.
- `src/app/api/customers/[id]/route.ts` — `GET` returns customer with last 50 orders (`id, orderNumber, status, paymentMethod, total, placedAt, city, _count.items`).
- `src/app/api/admin/users/route.ts` — `GET` (list+stats) and `POST` (create) — ADMIN only, Zod validation (`createUserSchema`).
- `src/app/api/admin/users/[id]/route.ts` — `GET`, `PUT` (update), `DELETE` — ADMIN only, Zod validation (`updateUserSchema`); maps `UserError` to HTTP code; logs `USER_CREATED`/`USER_UPDATED`/`USER_DELETED` to audit.
- `src/app/api/audit/route.ts` — `GET` returns `{ logs, total, stats, actions, entities }` (any authenticated). Filters parsed from query params.

### 3. Pages (4 files)

**`src/app/(dashboard)/dashboard/clientes/page.tsx`** (`'use client'`)
- KPIs (5): Total clientes, VIP, Frecuentes, Ticket promedio, Nuevos este mes.
- Filters: search (debounced 300ms), classification select (ALL/VIP/FRECUENTE/NUEVO/INACTIVO), sort by (lastOrderAt/totalSpent/ordersCount/name/createdAt), sort order (asc/desc).
- Table: Cliente (avatar+name+email), Teléfono, Ciudad, Clasificación (badge — VIP=amber, FRECUENTE=emerald, NUEVO=zinc, INACTIVO=rose), Pedidos, Total gastado, Último pedido, Acciones.
- Detail drawer (Sheet) with: contacto (email/tel/ciudad/dirección/fecha alta), estadísticas (4 mini-cards: pedidos/total/ticket promedio/último pedido), historial de pedidos con `StatusBadge` + items count + payment method.
- Pagination (15/page), skeletons, empty state, error retry.

**`src/app/(dashboard)/dashboard/usuarios/page.tsx`** (`'use client'`)
- Access control: if role !== ADMIN → AccessDenied card with amber Lock icon.
- KPIs (4): Total usuarios, Activos, Inactivos, Último login.
- Filters: search (debounced), role select, active status select.
- Table: Usuario (Avatar+name+"Tú" badge if self), Rol (badge — ADMIN=amber, GERENCIA=emerald, BODEGA=teal, SERVICIO=zinc), Estado (emerald Activo / rose Inactivo), 2FA status (ShieldCheck emerald / ShieldAlert zinc), Último login, Creado, Acciones (Editar / Eliminar).
- Self-row highlighted with amber background; delete disabled for self.
- Create/Edit Dialog: form mounted only when open (with `key` for remount). Email, Name, Password (with show/hide toggle), Role select, Active switch. Async fetch for edit mode with skeleton loading.
- Delete AlertDialog: separate `DeleteUserDialogContent` component keyed by `target.id` (remounts on each open → no `setState in effect`); requires email confirmation match; explains AuditLog/Notification preservation.
- Refactored to avoid `react-hooks/set-state-in-effect` lint errors: split dialogs into outer (controls open state) + inner (mounted only when open) components.

**`src/app/(dashboard)/dashboard/auditoria/page.tsx`** (`'use client'`)
- KPIs (4): Total eventos, Hoy, Últimas 24h, Últimos 7 días.
- 2 bar charts (Recharts `BarChart` layout="vertical"):
  - "Acciones más frecuentes" → teal (#14b8a6), top 8 by count.
  - "Entidades más auditadas" → violet (#8b5cf6), top 8 by count.
  - Custom tooltips with formatted numbers.
- Filters: search (debounced), action select (populated from `getDistinctActions`), entity select (from `getDistinctEntities`), date range (two `<input type="date">`).
- Table with expandable rows: click row to expand → reveals ID/Entity ID/User ID + metadata JSON in `<pre>`. Each row: Fecha, Acción (badge colored by entity), Entidad (with truncated entity ID), Usuario (avatar+name+role or "system"), IP (mono).
- Pagination (20/page), skeletons, empty state.

**`src/app/(dashboard)/dashboard/documentacion/page.tsx`** (`'use client'`)
- Tabs (shadcn): "Manual de Usuario" + "Manual Técnico".
- **Manual de Usuario (9 sections)**: Introducción, Roles y permisos, Navegación, Gestión de pedidos, Flujo COD, Dashboard ejecutivo, Inteligencia IA, Alertas operativas, FAQ. Each as a Card with icon, badges (role cards with proper colors — ADMIN=amber, GERENCIA=emerald, BODEGA=teal, SERVICIO=zinc), code blocks for the COD flow, FAQ accordion (`<details>`).
- **Manual Técnico (11 sections)**: Arquitectura (file tree), Stack tecnológico (mapping table), Modelos de datos (17 models list), FSM (8-state diagram), Integraciones (9 providers), Webhooks (3 receivers + idempotency), Realtime (socket.io patterns), Seguridad, Workers, Limitaciones, Comandos. Each with `<pre>` blocks for code/diagrams, Note components (info/warning variants).
- All content faithful to the actual platform — based on ESTADO_PROYECTO.md, schema.prisma, state-machine.ts, and existing code structure.

## Technical decisions

- **No `setState in effect`**: refactored dialogs in `usuarios` page to use the "mount only when open with `key`" pattern (same approach used in `integraciones/page.tsx`). Async fetches use `setState` inside `.then()` callbacks (allowed by lint rule `react-hooks/set-state-in-effect`).
- **SafeUser type**: `Omit<User, 'passwordHash'>` + Prisma `select` that omits `passwordHash` — defense in depth.
- **Delete user safety**: unlink `AuditLog.userId` and `Notification.userId` to null via `updateMany` before delete, so audit history is preserved.
- **Self-protections**: `updateUser` rejects role change when `id === actorId`; `deleteUser` rejects when `id === actorId`. Both throw `UserError` with specific codes (`USER_CANNOT_CHANGE_OWN_ROLE` / `USER_CANNOT_DELETE_SELF`, HTTP 403).
- **Audit logging**: every create/update/delete of a User logs to `AuditLog` via `audit.log()` with metadata describing the change (but never the password).
- **Recharts charts**: bar charts use `layout="vertical"` (horizontal bars), single color per chart (teal/violet per spec — no indigo/blue), custom tooltips with formatNumber.
- **Responsive**: all tables use `overflow-x-auto` + `max-h-[640px] overflow-auto` for both axes; columns hidden at sm/md/lg breakpoints by priority; KPI grids `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (or 5 for clientes); drawer full-width on mobile, `sm:max-w-xl md:max-w-2xl` on desktop.
- **Accessibility**: aria-labels on Search inputs, role="button" + tabIndex on clickable rows, sr-only SheetTitle for drawer, AlertDialogDescription for delete confirmation.

## Verification

- `bun run lint` → 0 errors after fixing `react-hooks/set-state-in-effect` violations.
- All 4 pages return HTTP 200 with admin session cookie.
- API endpoints verified end-to-end:
  - `GET /api/customers?limit=3` → 200 with `{ customers, total: 10, stats: { byClassification: { VIP: 2, FRECUENTE: 3, NUEVO: 4, INACTIVO: 1 }, avgTicket: 719694.12, newThisMonth: 10 } }`.
  - `GET /api/customers/[id]` → 200 with customer + orders array.
  - `GET /api/admin/users?limit=3` → 200 with `{ users, total: 4, stats: { byRole: { ADMIN:1, BODEGA:1, GERENCIA:1, SERVICIO:1 } } }`.
  - `POST /api/admin/users` → 201 (created test user; audit log `USER_CREATED` registered).
  - `DELETE /api/admin/users/[id]` → 200 (deleted test user; audit log `USER_DELETED` registered).
  - `GET /api/audit?limit=3` → 200 with `{ logs, total: 15, stats: { byAction: [...], byEntity: [...] }, actions: [...], entities: [...] }`.
- Dev.log shows successful compilation of all 4 pages (`/dashboard/clientes`, `/dashboard/usuarios`, `/dashboard/auditoria`, `/dashboard/documentacion`) with 200 responses and no runtime errors.

## Files created (11 total)

```
src/modules/admin/user.service.ts        (~290 lines)
src/modules/admin/audit.service.ts       (~190 lines)
src/app/api/customers/route.ts           (~95 lines)
src/app/api/customers/[id]/route.ts      (~55 lines)
src/app/api/admin/users/route.ts         (~150 lines)
src/app/api/admin/users/[id]/route.ts    (~210 lines)
src/app/api/audit/route.ts               (~85 lines)
src/app/(dashboard)/dashboard/clientes/page.tsx        (~750 lines)
src/app/(dashboard)/dashboard/usuarios/page.tsx        (~1180 lines)
src/app/(dashboard)/dashboard/auditoria/page.tsx       (~700 lines)
src/app/(dashboard)/dashboard/documentacion/page.tsx   (~620 lines)
```

No existing files modified (other than the `usuarios/page.tsx` self-refactor after lint).
