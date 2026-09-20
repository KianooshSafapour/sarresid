"use client"

import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

/**
 * Tree-scan helpers mirroring ui/dialog.tsx — AlertDialog uses Radix Dialog
 * under the hood, so a missing Title/Description triggers console warnings.
 * We auto-inject sr-only fallbacks. CRITICAL: never descend into nested
 * Dialog/AlertDialog/Sheet ROOTs — their children live in separate portals
 * and would falsely satisfy this dialog's scan (see ui/dialog.tsx notes).
 */
const PORTAL_ROOT_NAMES = new Set(["Dialog", "AlertDialog", "Sheet"])
function isPortalHostingRoot(type: unknown): boolean {
  if (typeof type !== "function" && typeof type !== "object") return false
  return PORTAL_ROOT_NAMES.has((type as { displayName?: string }).displayName || "")
}

function containsAlertTitle(node: React.ReactNode): boolean {
  const arr = React.Children.toArray(node)
  for (const child of arr) {
    if (!React.isValidElement(child)) continue
    const type = child.type as unknown
    if (type === AlertDialogTitle || type === AlertDialogPrimitive.Title) return true
    if (isPortalHostingRoot(type)) continue
    const props = child.props as { children?: React.ReactNode } | undefined
    if (props?.children && containsAlertTitle(props.children)) return true
  }
  return false
}

function containsAlertDescription(node: React.ReactNode): boolean {
  const arr = React.Children.toArray(node)
  for (const child of arr) {
    if (!React.isValidElement(child)) continue
    const type = child.type as unknown
    if (type === AlertDialogDescription || type === AlertDialogPrimitive.Description) return true
    if (isPortalHostingRoot(type)) continue
    const props = child.props as { children?: React.ReactNode } | undefined
    if (props?.children && containsAlertDescription(props.children)) return true
  }
  return false
}

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}
AlertDialog.displayName = "AlertDialog"

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  const needsHiddenTitle = !containsAlertTitle(children)
  const needsHiddenDescription = !containsAlertDescription(children)
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        )}
        {...props}
      >
        {needsHiddenTitle && (
          <AlertDialogPrimitive.Title className="sr-only">هایپر زیتون</AlertDialogPrimitive.Title>
        )}
        {needsHiddenDescription && (
          <AlertDialogPrimitive.Description className="sr-only">
            رابط کاربری سامانه مدیریت هایپر زیتون
          </AlertDialogPrimitive.Description>
        )}
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(buttonVariants(), className)}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
