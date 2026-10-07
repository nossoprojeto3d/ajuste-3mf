"use client"

import { CheckCircle, CircleNotch, Info, Warning, WarningOctagon } from "@phosphor-icons/react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/* Mudanças sobre o original: sem next-themes (theme="dark") e ícones do Phosphor. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CheckCircle weight="duotone" className="size-4 text-add" />,
        info: <Info weight="duotone" className="size-4" />,
        warning: <Warning weight="duotone" className="size-4 text-warn" />,
        error: <WarningOctagon weight="duotone" className="size-4 text-destructive" />,
        loading: <CircleNotch className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "calc(var(--radius) + 4px)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
