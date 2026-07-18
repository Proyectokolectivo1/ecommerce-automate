'use client'

// ============================================================
// /dashboard/integraciones — Integrations configuration panel
// ============================================================
// Página de configuración de integraciones. Client component que:
//   1) Lista los 9 proveedores agrupados en 4 secciones (Ecommerce,
//      Logística, Pasarelas de pago, Notificaciones).
//   2) Para cada proveedor muestra: icono, label, estado (activo/
//      inactivo, configurado/sin configurar), Switch de activación
//      (solo ADMIN) y botones "Configurar" + "Probar" (solo ADMIN).
//   3) Abre un Dialog con el formulario de configuración por
//      proveedor. Los secretos se enmascaran al mostrarlos y se
//      envían como string vacío si el usuario no los rellena.
//   4) Muestra los webhook URLs relevantes al pie del dialog.
//
// Endpoints consumidos (ya construidos por Task F2.3):
//   GET    /api/integrations
//   PUT    /api/integrations                  (ADMIN)
//   PATCH  /api/integrations/[provider]       (ADMIN)
//   POST   /api/integrations/[provider]       (ADMIN) test de conexión

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ShoppingBag,
  Truck,
  CreditCard,
  MessageCircle,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  Zap,
  Settings2,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  Lock,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

type FieldType = 'text' | 'secret' | 'boolean' | 'select'

interface ProviderField {
  key: string
  label: string
  type: FieldType
  options?: { value: string; label: string }[]
  placeholder?: string
  required?: boolean
}

type ProviderKey =
  | 'SHOPIFY'
  | 'MASTERSHOP'
  | 'WOMPI'
  | 'PAYU'
  | 'MERCADOPAGO'
  | 'EPAYCO'
  | 'BOLD'
  | 'WHATSAPP'
  | 'EMAIL'
  | 'AI_LLM'

type SectionKey = 'ecommerce' | 'logistica' | 'pagos' | 'notificaciones' | 'ia'

interface ProviderMeta {
  key: ProviderKey
  label: string
  section: SectionKey
  icon: LucideIcon
  description: string
  fields: ProviderField[]
}

interface IntegrationItem {
  provider: string
  active: boolean
  configured: boolean
  config: Record<string, unknown> | null
  updatedAt: string | null
}

interface TestResult {
  ok: boolean
  message: string
  detail?: unknown
}

// ------------------------------------------------------------
// Providers metadata
// ------------------------------------------------------------

const CARRIER_OPTIONS = [
  { value: 'SERVIENTREGA', label: 'Servientrega' },
  { value: 'ENVIA', label: 'Envía' },
  { value: 'INTERRAPIDISIMO', label: 'Inter Rapidísimo' },
  { value: 'COORDINADORA', label: 'Coordinadora' },
  { value: 'TCC', label: 'TCC' },
]

const EMAIL_PROVIDER_OPTIONS = [
  { value: 'resend', label: 'Resend' },
  { value: 'sendgrid', label: 'SendGrid' },
  { value: 'ses', label: 'Amazon SES' },
  { value: 'smtp', label: 'SMTP' },
]

const PROVIDER_META: ProviderMeta[] = [
  {
    key: 'SHOPIFY',
    label: 'Shopify',
    section: 'ecommerce',
    icon: ShoppingBag,
    description:
      'Sincroniza pedidos, productos y webhooks desde tu tienda Shopify.',
    fields: [
      {
        key: 'shop',
        label: 'Shop domain',
        type: 'text',
        placeholder: 'mi-tienda.myshopify.com',
        required: true,
      },
      { key: 'accessToken', label: 'Access Token', type: 'secret', required: true },
      { key: 'apiSecret', label: 'API Secret', type: 'secret' },
      { key: 'apiKey', label: 'API Key', type: 'text' },
    ],
  },
  {
    key: 'MASTERSHOP',
    label: 'Mastershop',
    section: 'logistica',
    icon: Truck,
    description: 'Crea despachos y recibe callbacks de estado de guía.',
    fields: [
      {
        key: 'apiUrl',
        label: 'API URL',
        type: 'text',
        placeholder: 'https://api.mastershop.com',
        required: true,
      },
      { key: 'apiKey', label: 'API Key', type: 'secret', required: true },
      { key: 'merchantId', label: 'Merchant ID', type: 'text' },
      {
        key: 'defaultCarrier',
        label: 'Transportadora por defecto',
        type: 'select',
        options: CARRIER_OPTIONS,
      },
    ],
  },
  {
    key: 'WOMPI',
    label: 'Wompi',
    section: 'pagos',
    icon: CreditCard,
    description: 'Pasarela colombiana: tarjetas, PSE, Nequi y Efecty.',
    fields: [
      { key: 'publicKey', label: 'Public Key', type: 'secret', required: true },
      { key: 'privateKey', label: 'Private Key', type: 'secret', required: true },
      { key: 'integritySecret', label: 'Integrity Secret', type: 'secret' },
      { key: 'sandbox', label: 'Modo sandbox (pruebas)', type: 'boolean' },
    ],
  },
  {
    key: 'PAYU',
    label: 'PayU',
    section: 'pagos',
    icon: CreditCard,
    description: 'Pasarela con cobertura regional y métodos locales.',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'secret', required: true },
      { key: 'publicKey', label: 'Public Key', type: 'secret' },
      { key: 'merchantId', label: 'Merchant ID', type: 'text', required: true },
      { key: 'accountId', label: 'Account ID', type: 'text' },
      { key: 'sandbox', label: 'Modo sandbox (pruebas)', type: 'boolean' },
    ],
  },
  {
    key: 'MERCADOPAGO',
    label: 'Mercado Pago',
    section: 'pagos',
    icon: CreditCard,
    description: 'Pagos con Mercado Pago y Checkout Pro.',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'secret', required: true },
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'secret',
        required: true,
      },
      { key: 'secret', label: 'Webhook Secret', type: 'secret' },
      { key: 'sandbox', label: 'Modo sandbox (pruebas)', type: 'boolean' },
    ],
  },
  {
    key: 'EPAYCO',
    label: 'ePayco',
    section: 'pagos',
    icon: CreditCard,
    description: 'Pasarela colombiana con PSE, tarjetas y efectivo.',
    fields: [
      { key: 'publicKey', label: 'Public Key', type: 'secret', required: true },
      { key: 'privateKey', label: 'Private Key', type: 'secret', required: true },
      { key: 'merchantId', label: 'Merchant ID', type: 'text' },
      { key: 'secret', label: 'Webhook Secret', type: 'secret' },
      { key: 'sandbox', label: 'Modo sandbox (pruebas)', type: 'boolean' },
    ],
  },
  {
    key: 'BOLD',
    label: 'Bold',
    section: 'pagos',
    icon: CreditCard,
    description: 'Pasarela colombiana con link de pago y checkout Bold.',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'secret', required: true },
      { key: 'publicKey', label: 'Public Key', type: 'secret' },
      { key: 'secret', label: 'Webhook Secret', type: 'secret' },
      { key: 'sandbox', label: 'Modo sandbox (pruebas)', type: 'boolean' },
    ],
  },
  {
    key: 'WHATSAPP',
    label: 'WhatsApp',
    section: 'notificaciones',
    icon: MessageCircle,
    description: 'Envía notificaciones transaccionales por WhatsApp Cloud API.',
    fields: [
      {
        key: 'phoneNumberId',
        label: 'Phone Number ID',
        type: 'text',
        required: true,
      },
      { key: 'accessToken', label: 'Access Token', type: 'secret', required: true },
      {
        key: 'templateName',
        label: 'Template name',
        type: 'text',
        placeholder: 'pago_transporte',
      },
    ],
  },
  {
    key: 'EMAIL',
    label: 'Email',
    section: 'notificaciones',
    icon: Mail,
    description: 'Servidor transaccional para correos de pedido y envío.',
    fields: [
      {
        key: 'provider',
        label: 'Proveedor',
        type: 'select',
        options: EMAIL_PROVIDER_OPTIONS,
      },
      { key: 'apiKey', label: 'API Key', type: 'secret' },
      {
        key: 'fromAddress',
        label: 'From address',
        type: 'text',
        placeholder: 'no-reply@ecommerce.com',
        required: true,
      },
      {
        key: 'fromName',
        label: 'From name',
        type: 'text',
        placeholder: 'Ecommerce',
      },
    ],
  },
  {
    key: 'AI_LLM',
    label: 'IA — LLM API',
    section: 'ia',
    icon: Sparkles,
    description:
      'Configura tu API de LLM (OpenAI, Anthropic, o Z.ai SDK) para habilitar predicción de ventas, detección de anomalías, resumen mensual y análisis de productos con IA real. Sin configurar, se usa análisis estadístico local.',
    fields: [
      {
        key: 'provider',
        label: 'Proveedor',
        type: 'select',
        options: [
          { value: 'z-ai-sdk', label: 'Z.ai SDK (incluido, sin costo)' },
          { value: 'openai', label: 'OpenAI (GPT-4o, GPT-4o-mini)' },
          { value: 'anthropic', label: 'Anthropic (Claude 3.5 Sonnet)' },
          { value: 'custom', label: 'Custom (OpenAI-compatible API)' },
        ],
      },
      { key: 'apiKey', label: 'API Key', type: 'secret', placeholder: 'sk-...' },
      {
        key: 'apiUrl',
        label: 'API URL (solo Custom)',
        type: 'text',
        placeholder: 'https://api.tu-llm.com/v1',
      },
      {
        key: 'model',
        label: 'Modelo',
        type: 'text',
        placeholder: 'gpt-4o-mini (OpenAI) o claude-3-5-sonnet-20241022 (Anthropic)',
      },
    ],
  },
]

interface SectionMeta {
  key: SectionKey
  title: string
  description: string
}

const SECTIONS: SectionMeta[] = [
  {
    key: 'ecommerce',
    title: 'Ecommerce',
    description: 'Plataformas de origen de los pedidos.',
  },
  {
    key: 'logistica',
    title: 'Logística',
    description: 'Despachos y seguimiento de envíos.',
  },
  {
    key: 'pagos',
    title: 'Pasarelas de pago',
    description: 'Procesamiento de pagos online y COD.',
  },
  {
    key: 'notificaciones',
    title: 'Notificaciones',
    description: 'Comunicación con clientes y equipo.',
  },
  {
    key: 'ia',
    title: 'Inteligencia Artificial',
    description: 'API de LLM para predicciones, anomalías y análisis.',
  },
]

const PAYMENT_PROVIDERS = new Set<ProviderKey>([
  'WOMPI',
  'PAYU',
  'MERCADOPAGO',
  'EPAYCO',
  'BOLD',
])

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/** Detecta si un valor viene enmascarado desde la API (ej: "••••12ab"). */
function isMasked(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('••••')
}

/** Devuelve el valor "limpio" para mostrar en un input (vacío si está enmascarado). */
function displayValue(value: unknown): string {
  if (value == null) return ''
  if (isMasked(value)) return ''
  return String(value)
}

/** Devuelve la info de webhook a mostrar al pie del dialog, si aplica. */
function getWebhookInfo(
  provider: ProviderKey,
  origin: string,
): { title: string; url: string; note: string } | null {
  if (provider === 'SHOPIFY') {
    return {
      title: 'Webhook Shopify',
      url: `${origin}/api/webhooks/shopify`,
      note: 'Registra este URL en Shopify Admin → Settings → Notifications → Webhooks (eventos order/create, order/paid, fulfillment).',
    }
  }
  if (provider === 'MASTERSHOP') {
    return {
      title: 'Callback Mastershop',
      url: `${origin}/api/webhooks/mastershop`,
      note: 'Configúralo como URL de callback de estado de guía en el panel de Mastershop.',
    }
  }
  if (PAYMENT_PROVIDERS.has(provider)) {
    return {
      title: 'Webhook de pagos',
      url: `${origin}/api/webhooks/payments`,
      note: `Configura este URL en el panel de la pasarela. El receptor identifica el proveedor con el header HTTP: X-Payment-Provider: ${provider}.`,
    }
  }
  return null
}

/** Inicializa el estado del formulario a partir de la config del server. */
function initFormValues(
  meta: ProviderMeta,
  config: Record<string, unknown> | null,
): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {}
  for (const f of meta.fields) {
    const raw = config?.[f.key]
    if (f.type === 'boolean') {
      values[f.key] = raw === true || raw === 'true'
    } else {
      values[f.key] = displayValue(raw)
    }
  }
  return values
}

// ============================================================
// Page
// ============================================================

export default function IntegracionesPage() {
  const { data: session, status: sessionStatus } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const qc = useQueryClient()

  // ----------------------------------------------------------
  // Query: lista de integraciones
  // ----------------------------------------------------------
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await fetch('/api/integrations')
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err?.error ?? `Error ${res.status}`)
      }
      const json = (await res.json()) as { integrations: IntegrationItem[] }
      return json.integrations
    },
  })

  const integrations = data ?? []

  const integrationsByProvider = useMemo(() => {
    const map = new Map<string, IntegrationItem>()
    for (const i of integrations) map.set(i.provider, i)
    return map
  }, [integrations])

  const activeCount = integrations.filter((i) => i.active).length

  // ----------------------------------------------------------
  // Mutation: toggle active
  // ----------------------------------------------------------
  const toggleMutation = useMutation({
    mutationFn: async (vars: { provider: string; active: boolean }) => {
      const res = await fetch(`/api/integrations/${vars.provider}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: vars.active }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }
      if (!res.ok || !json.ok) {
        throw new Error(json?.error ?? `Error ${res.status}`)
      }
      return json
    },
    onSuccess: (_data, vars) => {
      toast.success(
        `${vars.provider}: ${vars.active ? 'Activado' : 'Desactivado'}`,
      )
      void qc.invalidateQueries({ queryKey: ['integrations'] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar')
    },
  })

  // ----------------------------------------------------------
  // Mutation: test connection
  // ----------------------------------------------------------
  const testMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(`/api/integrations/${provider}`, {
        method: 'POST',
      })
      const json = (await res.json().catch(() => ({}))) as TestResult
      return { provider, result: json }
    },
    onSuccess: ({ provider, result }) => {
      const detail =
        typeof result.detail === 'string' ? result.detail : undefined
      if (result.ok) {
        toast.success(`${provider}: ${result.message}`, {
          description: detail,
        })
      } else {
        toast.error(`${provider}: ${result.message}`, {
          description: detail,
        })
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Error en el test')
    },
  })

  // ----------------------------------------------------------
  // Mutation: save config (PUT)
  // ----------------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: async (vars: {
      provider: string
      config: Record<string, unknown>
    }) => {
      const res = await fetch('/api/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }
      if (!res.ok || !json.ok) {
        throw new Error(json?.error ?? `Error ${res.status}`)
      }
      return json
    },
    onSuccess: (_data, vars) => {
      toast.success('Configuración guardada', {
        description: vars.provider,
      })
      void qc.invalidateQueries({ queryKey: ['integrations'] })
      setOpenProvider(null)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    },
  })

  // ----------------------------------------------------------
  // Dialog state
  // ----------------------------------------------------------
  const [openProvider, setOpenProvider] = useState<ProviderKey | null>(null)

  const openMeta = openProvider
    ? PROVIDER_META.find((p) => p.key === openProvider) ?? null
    : null
  const openItem = openProvider
    ? integrationsByProvider.get(openProvider) ?? null
    : null

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Integraciones</h1>
          <p className="text-sm text-muted-foreground">
            Configura las conexiones con Shopify, Mastershop, pasarelas de
            pago y notificaciones.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge
            variant="outline"
            className="gap-1.5 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
          >
            <ShieldCheck className="size-3" />
            {activeCount} activas
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <Settings2 className="size-3" />
            {integrations.length || 9} proveedores
          </Badge>
          {sessionStatus === 'loading' ? null : !isAdmin ? (
            <Badge variant="outline" className="gap-1.5">
              <Lock className="size-3" />
              Solo lectura
            </Badge>
          ) : null}
        </div>
      </header>

      {/* Error banner */}
      {isError && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="size-4 shrink-0" />
            <span>No se pudo cargar la configuración de integraciones.</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
            className="gap-1.5 self-start sm:self-auto"
          >
            Reintentar
          </Button>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-8">
        {SECTIONS.map((section) => {
          const metas = PROVIDER_META.filter((m) => m.section === section.key)
          return (
            <section key={section.key} className="space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <h2 className="text-lg font-semibold tracking-tight">
                  {section.title}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {section.description}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {isLoading
                  ? Array.from({ length: metas.length }).map((_, i) => (
                      <IntegrationCardSkeleton key={`sk-${section.key}-${i}`} />
                    ))
                  : metas.map((meta) => {
                      const item = integrationsByProvider.get(meta.key)
                      return (
                        <IntegrationCard
                          key={meta.key}
                          meta={meta}
                          item={item}
                          isAdmin={isAdmin}
                          sessionLoading={sessionStatus === 'loading'}
                          isToggling={
                            toggleMutation.isPending &&
                            toggleMutation.variables?.provider === meta.key
                          }
                          isTesting={
                            testMutation.isPending &&
                            testMutation.variables === meta.key
                          }
                          onToggle={(active) =>
                            toggleMutation.mutate({
                              provider: meta.key,
                              active,
                            })
                          }
                          onConfigure={() => setOpenProvider(meta.key)}
                          onTest={() => testMutation.mutate(meta.key)}
                        />
                      )
                    })}
              </div>
            </section>
          )
        })}
      </div>

      {/* Config Dialog */}
      <ConfigDialog
        open={!!openProvider}
        onOpenChange={(o) => {
          if (!o) setOpenProvider(null)
        }}
        meta={openMeta}
        item={openItem}
        saving={saveMutation.isPending}
        onSave={(config) => {
          if (!openProvider) return
          saveMutation.mutate({ provider: openProvider, config })
        }}
      />
    </div>
  )
}

// ============================================================
// Integration Card
// ============================================================

interface IntegrationCardProps {
  meta: ProviderMeta
  item: IntegrationItem | undefined
  isAdmin: boolean
  sessionLoading: boolean
  isToggling: boolean
  isTesting: boolean
  onToggle: (active: boolean) => void
  onConfigure: () => void
  onTest: () => void
}

function IntegrationCard({
  meta,
  item,
  isAdmin,
  sessionLoading,
  isToggling,
  isTesting,
  onToggle,
  onConfigure,
  onTest,
}: IntegrationCardProps) {
  const Icon = meta.icon
  const active = item?.active ?? false
  const configured = item?.configured ?? false

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted text-foreground"
              aria-hidden
            >
              <Icon className="size-5" />
            </div>
            <div className="space-y-0.5">
              <CardTitle className="text-base">{meta.label}</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                {meta.description}
              </CardDescription>
            </div>
          </div>
          {active ? (
            <Badge className="gap-1 border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Activo
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="gap-1 bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              <span className="size-1.5 rounded-full bg-zinc-400" />
              Inactivo
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {configured ? (
            <>
              <Check className="size-3.5 text-emerald-500" />
              <span>Configurado</span>
              {item?.updatedAt && (
                <span className="text-muted-foreground/70">
                  · actualizado {formatRelative(item.updatedAt)}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="size-3.5 rounded-full border border-dashed border-muted-foreground/50" />
              <span>Sin configurar</span>
            </>
          )}
        </div>

        {/* Toggle (ADMIN only) */}
        {sessionLoading ? null : isAdmin ? (
          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
            <Label
              htmlFor={`toggle-${meta.key}`}
              className="cursor-pointer text-xs font-medium text-foreground"
            >
              Activar integración
            </Label>
            <div className="flex items-center gap-2">
              {isToggling && (
                <Loader2 className="size-3 animate-spin text-muted-foreground" />
              )}
              <Switch
                id={`toggle-${meta.key}`}
                checked={active}
                disabled={!configured || isToggling}
                onCheckedChange={(v) => onToggle(v)}
                aria-label={`Activar o desactivar ${meta.label}`}
              />
            </div>
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="gap-2 border-t bg-muted/30 py-3">
        {sessionLoading ? null : isAdmin ? (
          <>
            <Button
              size="sm"
              variant="default"
              className="gap-1.5"
              onClick={onConfigure}
            >
              <Settings2 className="size-4" />
              Configurar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={onTest}
              disabled={!configured || isTesting}
            >
              {isTesting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Zap className="size-4" />
              )}
              Probar
            </Button>
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" />
            Solo los administradores pueden editar la configuración.
          </p>
        )}
      </CardFooter>
    </Card>
  )
}

// ============================================================
// Skeleton
// ============================================================

function IntegrationCardSkeleton() {
  return (
    <Card className="gap-0">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-9 w-full rounded-md" />
      </CardContent>
      <CardFooter className="gap-2 border-t bg-muted/30 py-3">
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </CardFooter>
    </Card>
  )
}

// ============================================================
// Config Dialog
// ============================================================

interface ConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  meta: ProviderMeta | null
  item: IntegrationItem | null
  saving: boolean
  onSave: (config: Record<string, unknown>) => void
}

function ConfigDialog({
  open,
  onOpenChange,
  meta,
  item,
  saving,
  onSave,
}: ConfigDialogProps) {
  if (!meta) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="thin-scroll max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <meta.icon className="size-5 text-muted-foreground" />
            Configurar {meta.label}
          </DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>

        {/* El formulario se monta solo cuando el dialog está abierto
            para que el estado se reinicialice desde la config del server. */}
        {open && (
          <ConfigForm
            key={meta.key}
            meta={meta}
            item={item}
            saving={saving}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Config Form (inside the dialog)
// ============================================================

interface ConfigFormProps {
  meta: ProviderMeta
  item: IntegrationItem | null
  saving: boolean
  onSave: (config: Record<string, unknown>) => void
  onCancel: () => void
}

function ConfigForm({
  meta,
  item,
  saving,
  onSave,
  onCancel,
}: ConfigFormProps) {
  // Inicializa el estado desde la config del server (vacío si enmascarado).
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    initFormValues(meta, item?.config ?? null),
  )

  function setValue(key: string, value: string | boolean) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const config: Record<string, unknown> = {}
    for (const f of meta.fields) {
      const v = values[f.key]
      if (f.type === 'boolean') {
        config[f.key] = v === true
      } else {
        config[f.key] = typeof v === 'string' ? v : ''
      }
    }
    onSave(config)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Fields */}
      <div className="space-y-4">
        {meta.fields.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(v) => setValue(field.key, v)}
          />
        ))}
      </div>

      {/* Webhook info */}
      <WebhookInfo provider={meta.key} />

      {/* Footer */}
      <DialogFooter className="gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Guardar configuración
        </Button>
      </DialogFooter>
    </form>
  )
}

// ============================================================
// Field renderer
// ============================================================

interface FieldRendererProps {
  field: ProviderField
  value: string | boolean | undefined
  onChange: (value: string | boolean) => void
}

function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  if (field.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
        <div className="space-y-0.5">
          <Label
            htmlFor={field.key}
            className="cursor-pointer text-sm font-medium"
          >
            {field.label}
          </Label>
        </div>
        <Switch
          id={field.key}
          checked={value === true}
          onCheckedChange={(v) => onChange(v)}
        />
      </div>
    )
  }

  if (field.type === 'select') {
    const currentValue =
      typeof value === 'string' && value !== '' ? value : undefined
    return (
      <div className="space-y-1.5">
        <Label htmlFor={field.key} className="text-sm font-medium">
          {field.label}
        </Label>
        <Select
          value={currentValue}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger id={field.key} className="w-full">
            <SelectValue placeholder="Selecciona una opción…" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (field.type === 'secret') {
    return <SecretField field={field} value={value} onChange={onChange} />
  }

  // text
  const textValue = typeof value === 'string' ? value : ''
  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.key} className="text-sm font-medium">
        {field.label}
        {field.required ? (
          <span className="text-destructive" aria-hidden>
            {' '}
            *
          </span>
        ) : null}
      </Label>
      <Input
        id={field.key}
        type="text"
        value={textValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        autoComplete="off"
      />
    </div>
  )
}

// ============================================================
// Secret field (with show/hide toggle)
// ============================================================

interface SecretFieldProps {
  field: ProviderField
  value: string | boolean | undefined
  onChange: (value: string) => void
}

function SecretField({ field, value, onChange }: SecretFieldProps) {
  const [show, setShow] = useState(false)
  const raw = typeof value === 'string' ? value : ''
  const masked = isMasked(raw)
  const display = masked ? '' : raw
  const placeholder = masked
    ? '•••• (dejar vacío para mantener)'
    : (field.placeholder ?? '')

  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.key} className="text-sm font-medium">
        {field.label}
        {field.required ? (
          <span className="text-destructive" aria-hidden>
            {' '}
            *
          </span>
        ) : null}
      </Label>
      <div className="relative">
        <Input
          id={field.key}
          type={show ? 'text' : 'password'}
          value={display}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          className="absolute top-0 right-0 h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label={show ? 'Ocultar valor' : 'Mostrar valor'}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
      {masked ? (
        <p className="text-[11px] text-muted-foreground">
          Ya hay un valor guardado. Para reemplazarlo escribe uno nuevo.
        </p>
      ) : null}
    </div>
  )
}

// ============================================================
// Webhook info (read-only with copy button)
// ============================================================

interface WebhookInfoProps {
  provider: ProviderKey
}

function WebhookInfo({ provider }: WebhookInfoProps) {
  // El origin se resuelve al vuelo cuando se abre el dialog (post-mount,
  // siempre en cliente), por eso no hay riesgo de mismatch SSR.
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const info = getWebhookInfo(provider, origin)
  const [copied, setCopied] = useState(false)
  if (!info) return null

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(info!.url)
      setCopied(true)
      toast.success('URL copiada al portapapeles')
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('No se pudo copiar la URL')
    }
  }

  return (
    <div className="rounded-lg border border-dashed bg-muted/40 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <span className="inline-flex size-4 items-center justify-center rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          <Copy className="size-3" />
        </span>
        {info.title}
      </div>
      <div className="flex items-stretch gap-1.5">
        <Input
          readOnly
          value={info.url}
          className="h-8 bg-background font-mono text-xs"
          aria-label={info.title}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0 gap-1.5"
          onClick={() => void handleCopy()}
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-500" />
          ) : (
            <Copy className="size-3.5" />
          )}
          <span className="hidden sm:inline">
            {copied ? 'Copiado' : 'Copiar'}
          </span>
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {info.note}
      </p>
    </div>
  )
}

// ============================================================
// Utils
// ============================================================

/** Formatea una fecha ISO como tiempo relativo corto en español. */
function formatRelative(iso: string): string {
  try {
    const date = new Date(iso)
    const now = Date.now()
    const diffMs = now - date.getTime()
    const diffMin = Math.floor(diffMs / 60_000)
    if (diffMin < 1) return 'hace instantes'
    if (diffMin < 60) return `hace ${diffMin} min`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `hace ${diffH} h`
    const diffD = Math.floor(diffH / 24)
    if (diffD < 30) return `hace ${diffD} d`
    // Fallback: short date
    return date.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}
