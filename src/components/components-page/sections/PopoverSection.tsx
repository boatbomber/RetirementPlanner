import { Button, Popover, FieldShell, TextInput } from "@/components/primitives";

export function PopoverSection() {
  return (
    <section className="flex flex-col gap-[var(--space-7)]">
      <div>
        <h2 className="text-metric-lg font-semibold tracking-tight text-text-primary">Popover</h2>
        <p className="mt-1 text-body text-text-secondary">
          Click-triggered overlay for inline editing. Closes on outside click or Esc.
        </p>
      </div>

      <div>
        <Popover trigger={<Button variant="secondary">Edit assumption</Button>}>
          <div className="flex flex-col gap-4">
            <h4 className="text-body font-semibold text-text-primary">Inflation rate</h4>
            <FieldShell label="Annual inflation" helper="CPI-based, historical average 3.2%">
              <TextInput inputType="percent" defaultValue="2.5" />
            </FieldShell>
            <Button size="sm">Save</Button>
          </div>
        </Popover>
      </div>
    </section>
  );
}
