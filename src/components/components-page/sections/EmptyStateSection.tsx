import { EmptyState, Button } from "@/components/primitives";
import { Layers, BarChart3, Users } from "lucide-react";

export function EmptyStateSection() {
  return (
    <section className="flex flex-col gap-[var(--space-7)]">
      <div>
        <h2 className="text-metric-lg font-semibold tracking-tight text-text-primary">Empty States</h2>
        <p className="mt-1 text-body text-text-secondary">
          Icon (64px tertiary) + explanation + action. No stock illustrations.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-md border border-[var(--color-border-subtle)] bg-surface">
          <EmptyState
            icon={<Layers size={64} strokeWidth={1.25} />}
            title="No scenarios yet"
            description="Create one to compare retirement timing, spending levels, or tax strategies."
            action={<Button size="sm">Create scenario</Button>}
          />
        </div>

        <div className="rounded-md border border-[var(--color-border-subtle)] bg-surface">
          <EmptyState
            icon={<BarChart3 size={64} strokeWidth={1.25} />}
            title="No simulation results"
            description="Run a simulation to see projected outcomes across thousands of paths."
            action={<Button size="sm">Run simulation</Button>}
          />
        </div>

        <div className="rounded-md border border-[var(--color-border-subtle)] bg-surface">
          <EmptyState
            icon={<Users size={64} strokeWidth={1.25} />}
            title="No accounts added"
            description="Add your investment accounts to start building your plan."
            action={<Button size="sm">Add account</Button>}
          />
        </div>
      </div>
    </section>
  );
}
