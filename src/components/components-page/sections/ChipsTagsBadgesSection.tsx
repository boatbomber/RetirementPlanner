import { useState } from "react";
import { Chip, Tag, Badge, Button } from "@/components/primitives";

const accountTypes = ["Taxable", "Traditional", "Roth", "HSA", "Cash"];

export function ChipsTagsBadgesSection() {
  const [selected, setSelected] = useState<Set<string>>(new Set(["Roth", "HSA"]));

  const toggle = (label: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <section className="flex flex-col gap-[var(--space-7)]">
      <div>
        <h2 className="text-metric-lg font-semibold tracking-tight text-text-primary">Chips, Tags, Badges</h2>
        <p className="mt-1 text-body text-text-secondary">
          Filter chips (selectable), decorative tags, count badges.
        </p>
      </div>

      <div>
        <h4 className="mb-3 text-body font-semibold text-text-primary">Chips (selectable filter)</h4>
        <div className="flex flex-wrap gap-2" role="listbox" aria-label="Account types">
          {accountTypes.map((label) => (
            <Chip key={label} selected={selected.has(label)} onClick={() => toggle(label)}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-body font-semibold text-text-primary">Tags (decorative)</h4>
        <div className="flex flex-wrap gap-2">
          <Tag color="primary">Roth</Tag>
          <Tag color="success">In Budget</Tag>
          <Tag color="warning">IRMAA Tier 2</Tag>
          <Tag color="danger">Depleted</Tag>
          <Tag color="info">Tax-Deferred</Tag>
          <Tag color="neutral">Default</Tag>
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-body font-semibold text-text-primary">Badges (counts)</h4>
        <div className="flex items-center gap-6">
          <div className="relative inline-flex">
            <Button variant="ghost" aria-label="Notifications">
              Notifications
            </Button>
            <Badge count={3} className="absolute -top-1 -right-1" />
          </div>
          <div className="relative inline-flex">
            <Button variant="ghost" aria-label="Warnings">
              Warnings
            </Button>
            <Badge count={12} variant="danger" className="absolute -top-1 -right-1" />
          </div>
          <div className="relative inline-flex">
            <Button variant="ghost" aria-label="Updates">
              Updates
            </Button>
            <Badge count={150} variant="neutral" className="absolute -top-1 -right-1" />
          </div>
        </div>
      </div>
    </section>
  );
}
