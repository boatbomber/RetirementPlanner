import { Button, Tooltip, RichTooltip } from "@/components/primitives";
import { Info } from "lucide-react";

export function TooltipsSection() {
  return (
    <section className="flex flex-col gap-[var(--space-7)]">
      <div>
        <h2 className="text-metric-lg font-semibold tracking-tight text-text-primary">Tooltips</h2>
        <p className="mt-1 text-body text-text-secondary">
          Compact (≤12 words) and rich (body + learn-more link) variants.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <Tooltip content="Safe withdrawal rate adjusted for sequence risk">
          <Button variant="secondary">Hover me (compact)</Button>
        </Tooltip>

        <Tooltip
          content="This is the probability that your plan succeeds across all simulated paths."
          side="right"
        >
          <Button variant="ghost" aria-label="Info">
            <Info size={18} strokeWidth={1.75} />
          </Button>
        </Tooltip>

        <RichTooltip
          content="Arithmetic mean (AAGR) is what Monte Carlo engines consume. It's higher than the geometric mean (CAGR) you see in most fund fact sheets."
          learnMoreHref="#"
        >
          <Button variant="tertiary">Hover me (rich)</Button>
        </RichTooltip>
      </div>
    </section>
  );
}
