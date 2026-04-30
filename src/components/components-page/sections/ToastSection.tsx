import { Button, useToast } from "@/components/primitives";

export function ToastSection() {
  const { toast } = useToast();

  return (
    <section className="flex flex-col gap-[var(--space-7)]">
      <div>
        <h2 className="text-metric-lg font-semibold tracking-tight text-text-primary">Toast</h2>
        <p className="mt-1 text-body text-text-secondary">
          Bottom-right stack, max 3 visible. 4s auto-dismiss (10s for danger).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() =>
            toast({
              variant: "success",
              title: "Scenario saved",
              description: '"Retire at 65" has been saved.',
            })
          }
        >
          Success toast
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast({
              variant: "warning",
              title: "High withdrawal rate",
              description: "Your 5.2% withdrawal rate exceeds the 4% SWR guideline.",
            })
          }
        >
          Warning toast
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast({
              variant: "danger",
              title: "Simulation failed",
              description: "Could not complete 10,000 paths. Please try again.",
            })
          }
        >
          Danger toast
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast({
              variant: "info",
              title: "CMAs updated",
              description: "Vanguard 2025 assumptions now available.",
              action: { label: "View changes", onClick: () => {} },
            })
          }
        >
          Info toast (with action)
        </Button>
      </div>
    </section>
  );
}
