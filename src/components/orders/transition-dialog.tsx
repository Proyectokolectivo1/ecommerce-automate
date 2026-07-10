'use client'

// ============================================================
// transition-dialog.tsx — Confirm dialog for order status transition
// ============================================================
// AlertDialog que pide confirmación antes de ejecutar una
// transición de estado del pedido. Permite añadir un `reason`
// opcional. Llama a `POST /api/orders/[id]/transition` con
// `{ toStatus, reason }`, muestra un toast y notifica al padre
// mediante `onSuccess()` para que invalide los queries.

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, AlertTriangle } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/shared/status-badge'
import { ORDER_STATE_LABELS } from '@/modules/orders/state-machine'

interface TransitionDialogProps {
  open: boolean
  onClose: () => void
  orderId: string
  orderNumber?: string
  currentStatus: string
  targetStatus: string
  onSuccess: () => void
  modal?: boolean
}

export function TransitionDialog({
  open,
  onClose,
  orderId,
  orderNumber,
  currentStatus,
  targetStatus,
  onSuccess,
  modal = true,
}: TransitionDialogProps) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const currentLabel =
    ORDER_STATE_LABELS[currentStatus as keyof typeof ORDER_STATE_LABELS] ??
    currentStatus
  const targetLabel =
    ORDER_STATE_LABELS[targetStatus as keyof typeof ORDER_STATE_LABELS] ??
    targetStatus

  async function handleConfirm() {
    setLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toStatus: targetStatus,
          reason: reason.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          data?.error ??
          (res.status === 409
            ? 'Transición no permitida'
            : 'No se pudo actualizar el estado')
        toast.error(msg)
        return
      }
      toast.success('Estado actualizado', {
        description: `${orderNumber ?? 'Pedido'} → ${targetLabel}`,
      })
      setReason('')
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(
        'Error de red: ' + (err instanceof Error ? err.message : 'unknown'),
      )
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      if (!loading) {
        setReason('')
        onClose()
      }
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange} modal={modal}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            ¿Confirmar cambio de estado?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Vas a mover el pedido{' '}
                <span className="font-medium text-foreground">
                  {orderNumber ?? orderId}
                </span>{' '}
                al siguiente estado. Esta acción quedará registrada en la
                bitácora del pedido.
              </p>
              <div className="flex items-center gap-2">
                <StatusBadge status={currentStatus} />
                <span aria-hidden>→</span>
                <StatusBadge status={targetStatus} />
              </div>
              <div className="text-xs text-muted-foreground">
                {currentLabel} → {targetLabel}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <label
            htmlFor="transition-reason"
            className="text-sm font-medium text-foreground"
          >
            Motivo <span className="text-muted-foreground">(opcional)</span>
          </label>
          <Textarea
            id="transition-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Pago confirmado por WOMPI, referencia TX-123"
            rows={3}
            disabled={loading}
            maxLength={500}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              void handleConfirm()
            }}
            disabled={loading}
            className="gap-2"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            Confirmar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ------------------------------------------------------------
// Mini-trigger button used by parent components (optional API)
// ------------------------------------------------------------

interface TransitionTriggerProps {
  orderNumber?: string
  orderId: string
  currentStatus: string
  targetStatus: string
  onSuccess: () => void
  children: React.ReactNode
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

export function TransitionTrigger({
  orderNumber,
  orderId,
  currentStatus,
  targetStatus,
  onSuccess,
  children,
  variant = 'outline',
  size = 'sm',
  className,
}: TransitionTriggerProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <TransitionDialog
        open={open}
        onClose={() => setOpen(false)}
        orderId={orderId}
        orderNumber={orderNumber}
        currentStatus={currentStatus}
        targetStatus={targetStatus}
        onSuccess={onSuccess}
      />
    </>
  )
}
