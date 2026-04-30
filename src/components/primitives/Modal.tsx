import { type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

type ModalSize = "md" | "lg" | "xl";

interface ModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: string;
  description?: string;
  size?: ModalSize;
  children: ReactNode;
}

const sizeClasses: Record<ModalSize, string> = {
  md: "max-w-[560px]",
  lg: "max-w-[720px]",
  xl: "max-w-[960px]",
};

export function Modal({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  size = "md",
  children,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-overlay)] backdrop-blur-[4px] data-[state=open]:motion-fade-in data-[state=closed]:motion-fade-out" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2",
            "rounded-lg bg-surface shadow-4",
            "data-[state=open]:motion-zoom-in data-[state=closed]:motion-zoom-out",
            "focus:outline-none",
            sizeClasses[size],
          )}
        >
          <div className="flex items-start justify-between px-[var(--space-7)] pt-[var(--space-7)] pb-[var(--space-3)]">
            <div>
              <Dialog.Title className="text-heading-sm font-semibold leading-7 text-text-primary">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-body text-text-secondary">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-text-tertiary",
                "hover:bg-[var(--color-surface-sunken)] hover:text-text-primary",
                "focus-visible:outline-none focus-visible:shadow-focus",
              )}
              aria-label="Close"
            >
              <X size={18} strokeWidth={1.75} />
            </Dialog.Close>
          </div>
          <div className="px-[var(--space-7)] pb-[var(--space-7)]">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
