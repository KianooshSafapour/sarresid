"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}
Dialog.displayName = "Dialog"

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

/**
 * Tree-scan helpers. CRITICAL: the scan must NOT descend into nested
 * Dialog/AlertDialog/Sheet ROOT components — those render their children into
 * their own separate portals (only when open), so a Title/Description found in
 * their JSX does NOT exist inside THIS dialog's DOM. Descending into them
 * previously fooled the check and caused Radix a11y warnings (see worklog).
 * Detection uses explicit displayName (set on our wrappers below) and is
 * therefore minification-safe.
 */
const PORTAL_ROOT_NAMES = new Set(["Dialog", "AlertDialog", "Sheet"])
function isPortalHostingRoot(type: unknown): boolean {
  if (typeof type !== "function" && typeof type !== "object") return false
  return PORTAL_ROOT_NAMES.has((type as { displayName?: string }).displayName || "")
}

function containsDialogTitle(node: React.ReactNode): boolean {
  const arr = React.Children.toArray(node)
  for (const child of arr) {
    if (!React.isValidElement(child)) continue
    const type = child.type as unknown
    if (
      type === DialogTitle ||
      type === DialogPrimitive.Title ||
      (typeof type === "function" && (type as { displayName?: string }).displayName === "DialogTitle")
    ) {
      return true
    }
    if (isPortalHostingRoot(type)) continue
    const props = child.props as { children?: React.ReactNode } | undefined
    if (props?.children && containsDialogTitle(props.children)) return true
  }
  return false
}

/** Same tree-scan as containsDialogTitle but for DialogDescription. */
function containsDialogDescription(node: React.ReactNode): boolean {
  const arr = React.Children.toArray(node)
  for (const child of arr) {
    if (!React.isValidElement(child)) continue
    const type = child.type as unknown
    if (
      type === DialogDescription ||
      type === DialogPrimitive.Description ||
      (typeof type === "function" && (type as { displayName?: string }).displayName === "DialogDescription")
    ) {
      return true
    }
    if (isPortalHostingRoot(type)) continue
    const props = child.props as { children?: React.ReactNode } | undefined
    if (props?.children && containsDialogDescription(props.children)) return true
  }
  return false
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const needsHiddenTitle = !containsDialogTitle(children)
  const needsHiddenDescription = !containsDialogDescription(children)
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        )}
        {...props}
      >
        {needsHiddenTitle && (
          <DialogPrimitive.Title className="sr-only">هایپر زیتون</DialogPrimitive.Title>
        )}
        {needsHiddenDescription && (
          <DialogPrimitive.Description className="sr-only">
            رابط کاربری سامانه مدیریت هایپر زیتون
          </DialogPrimitive.Description>
        )}
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}
DialogDescription.displayName = "DialogDescription"

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
