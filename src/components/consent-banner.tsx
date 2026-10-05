import { useState } from "react"
import { Button } from "@/components/ui/button"
import { analyticsEnabled, getConsent, setConsent } from "@/lib/analytics"

export function ConsentBanner() {
  const [open, setOpen] = useState(() => analyticsEnabled() && getConsent() === null)
  if (!open) return null

  function choose(value: "granted" | "denied") {
    setConsent(value)
    setOpen(false)
  }

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border bg-popover p-4 shadow-lg sm:flex-row sm:items-center sm:gap-5 sm:p-5"
    >
      <p className="text-sm leading-relaxed text-muted-foreground sm:flex-1">
        Usamos o Google Analytics para contar quantas pessoas usam o site e em que etapa elas param.
        O seu arquivo 3MF nunca é enviado. Você pode recusar e usar tudo normalmente.
      </p>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" onClick={() => choose("denied")} className="flex-1 sm:flex-none">
          Recusar
        </Button>
        <Button onClick={() => choose("granted")} className="flex-1 sm:flex-none">
          Aceitar
        </Button>
      </div>
    </div>
  )
}
