import { type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

type SheetSide = "right" | "bottom";

interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: string;
  description?: string;
  side?: SheetSide;
  children: ReactNode;
}

const sideClasses: Record<SheetSide, string> = {
  right:
    "fixed right-0 top-0 z-50 h-full w-[480px] max-w-[90vw] data-[state=open]:motion-slide-from-right data-[state=closed]:motion-slide-to-right",
  bottom:
    "fixed bottom-0 left-0 right-0 z-50 max-h-[90vh] rounded-t-lg data-[state=open]:motion-slide-from-bottom",
};

export function Sheet({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  side = "right",
  children,
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-overlay)] backdrop-blur-[4px] data-[state=open]:motion-fade-in data-[state=closed]:motion-fade-out" />
        <Dialog.Content className={cn("bg-surface shadow-4 focus:outline-none", sideClasses[side])}>
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
                "rounded-sm p-1.5 text-text-tertiary",
                "hover:bg-[var(--color-surface-sunken)] hover:text-text-primary",
                "focus-visible:outline-none focus-visible:shadow-focus",
              )}
              aria-label="Close"
            >
              <X size={18} strokeWidth={1.75} />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-[var(--space-7)] pb-[var(--space-7)]">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
