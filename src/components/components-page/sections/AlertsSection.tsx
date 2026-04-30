import { useState } from "react";
import { Alert, Button } from "@/components/primitives";

export function AlertsSection() {
  const [dismissed, setDismissed] = useState(false);

  return (
    <section className="flex flex-col gap-[var(--space-7)]">
      <div>
        <h2 className="text-metric-lg font-semibold tracking-tight text-text-primary">Alerts</h2>
        <p className="mt-1 text-body text-text-secondary">
          Inline callouts for all 4 semantic variants. Persistent or dismissible.
        </p>
      </div>

      <div className="flex max-w-2xl flex-col gap-4">
        <Alert variant="success">Plan passes with 85% probability across 10,000 simulated paths.</Alert>

        <Alert variant="warning">
          This inflation rate (12%) is above the historical 95th percentile. Are you sure?
        </Alert>

        <Alert variant="danger">Portfolio depletes by age 82 in over 30% of simulated scenarios.</Alert>

        <Alert
          variant="info"
          action={
            <Button variant="tertiary" size="sm">
              View
            </Button>
          }
        >
          CMAs reflect Vanguard 2024 estimates. Last updated Jan 15, 2026.
        </Alert>

        {!dismissed && (
          <Alert variant="warning" dismissible onDismiss={() => setDismissed(true)}>
            This is a dismissible alert. Click the X to remove it.
          </Alert>
        )}
      </div>
    </section>
  );
}
