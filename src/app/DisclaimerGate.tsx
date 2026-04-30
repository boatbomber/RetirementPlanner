import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAppStore } from "@/store";
import { Button } from "@/components/primitives/Button";
import { Checkbox } from "@/components/primitives/Input/Checkbox";
import { cn } from "@/lib/cn";
import { FIRST_RUN_DISCLAIMER_ITEMS } from "@/lib/disclaimers";

// Blocking first-run disclaimer. Renders an undismissable dialog over whatever
// route the user landed on until every item is checked and Accept is clicked.
// Unlike the shared Modal primitive, this uses Radix Dialog directly so we
// can suppress escape, outside-click, and the close button: the user must
// affirmatively acknowledge before continuing.
export function DisclaimerGate() {
  const [hydrated, setHydrated] = useState(() => useAppStore.persist.hasHydrated());
  const accepted = useAppStore((s) => s.disclaimerAccepted);
  const setAccepted = useAppStore((s) => s.setDisclaimerAccepted);

  const [checks, setChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (hydrated) return;
    return useAppStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  if (!hydrated || accepted) return null;

  const allChecked = FIRST_RUN_DISCLAIMER_ITEMS.every((item) => checks[item.id]);

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-[var(--color-overlay)] backdrop-blur-[4px] data-[state=open]:motion-fade-in" />
        <Dialog.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            "fixed left-1/2 top-1/2 z-[100] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[640px]",
            "-translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-surface shadow-4",
            "data-[state=open]:motion-zoom-in",
            "focus:outline-none",
          )}
        >
          <div className="px-[var(--space-7)] pt-[var(--space-7)] pb-[var(--space-3)]">
            <Dialog.Title className="text-heading-sm font-semibold leading-7 text-text-primary">
              Before you start
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-body text-text-secondary">
              RetirementPlanner is a personal modeling tool. Please confirm you understand the following
              before continuing.
            </Dialog.Description>
          </div>
          <div className="flex-1 overflow-y-auto px-[var(--space-7)] pt-[var(--space-2)] pb-[var(--space-3)]">
            <ul className="flex flex-col gap-[var(--space-4)]">
              {FIRST_RUN_DISCLAIMER_ITEMS.map((item) => {
                const inputId = `disclaimer-${item.id}`;
                const checked = !!checks[item.id];
                return (
                  <li key={item.id} className="flex items-start gap-[var(--space-3)]">
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      onCheckedChange={(next) => setChecks((prev) => ({ ...prev, [item.id]: next === true }))}
                      className="mt-[3px]"
                    />
                    <label htmlFor={inputId} className="flex flex-1 cursor-pointer flex-col gap-1">
                      <span className="text-body font-medium leading-5 text-text-primary">{item.label}</span>
                      <span className="text-body-sm text-text-secondary">{item.body}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex items-center justify-end gap-[var(--space-3)] border-t border-[var(--color-border-subtle)] px-[var(--space-7)] py-[var(--space-4)]">
            <Button variant="primary" size="md" disabled={!allChecked} onClick={() => setAccepted(true)}>
              Accept and continue
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
