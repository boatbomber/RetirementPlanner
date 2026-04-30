import { Tabs, TabContent } from "@/components/primitives";

export function TabsSection() {
  return (
    <section className="flex flex-col gap-[var(--space-7)]">
      <div>
        <h2 className="text-metric-lg font-semibold tracking-tight text-text-primary">Tabs</h2>
        <p className="mt-1 text-body text-text-secondary">
          Horizontal underline tabs with animated indicator. Vertical tabs for inspector-style panels.
        </p>
      </div>

      <div>
        <h4 className="mb-3 text-body font-semibold text-text-primary">Horizontal</h4>
        <Tabs
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "income", label: "Income" },
            { value: "spending", label: "Spending" },
            { value: "taxes", label: "Taxes" },
            { value: "disabled", label: "Locked", disabled: true },
          ]}
        >
          <TabContent value="overview">
            <p className="text-body text-text-secondary">
              Overview tab content. Shows portfolio summary and key metrics.
            </p>
          </TabContent>
          <TabContent value="income">
            <p className="text-body text-text-secondary">
              Income tab content. W-2, Social Security, pension, rental income.
            </p>
          </TabContent>
          <TabContent value="spending">
            <p className="text-body text-text-secondary">
              Spending tab content. Essential vs discretionary, healthcare, travel.
            </p>
          </TabContent>
          <TabContent value="taxes">
            <p className="text-body text-text-secondary">
              Taxes tab content. Federal, state, IRMAA, NIIT, capital gains.
            </p>
          </TabContent>
        </Tabs>
      </div>

      <div>
        <h4 className="mb-3 text-body font-semibold text-text-primary">Vertical (Inspector style)</h4>
        <div className="max-w-lg rounded-md border border-[var(--color-border-subtle)] bg-surface">
          <Tabs
            orientation="vertical"
            tabs={[
              { value: "assumptions", label: "Assumptions" },
              { value: "returns", label: "Returns" },
              { value: "inflation", label: "Inflation" },
            ]}
            className="min-h-[200px]"
          >
            <TabContent value="assumptions" className="flex-1 p-[var(--space-5)]">
              <p className="text-body text-text-secondary">
                Capital Market Assumptions panel. Edit expected returns, correlations, and mortality tables.
              </p>
            </TabContent>
            <TabContent value="returns" className="flex-1 p-[var(--space-5)]">
              <p className="text-body text-text-secondary">Expected real return by asset class.</p>
            </TabContent>
            <TabContent value="inflation" className="flex-1 p-[var(--space-5)]">
              <p className="text-body text-text-secondary">Inflation model parameters.</p>
            </TabContent>
          </Tabs>
        </div>
      </div>
    </section>
  );
}
