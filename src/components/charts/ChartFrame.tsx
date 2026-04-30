import { useState, type ReactNode } from "react";
import { Button } from "@/components/primitives/Button";
import { cn } from "@/lib/cn";
import type { Scenario } from "@/models/scenario";
import type { SimulationResult } from "@/models/results";

export interface ChartFrameProps {
  /** Plain-language description of what the chart shows. Max ~7 words. */
  title: string;
  /** One-line assumption provenance: CMA / mortality / inflation / iterations. */
  subCaption?: string;
  /** Screen-reader summary that includes the chart's key numbers. */
  ariaLabel: string;
  /** Optional pre-rendered table fallback. When provided, a "Show as table" toggle appears. */
  dataTable?: ReactNode;
  /** Reserved for future actions (export, copy-to-comparison). Renders right of the toggle. */
  actions?: ReactNode;
  /** "framed" (default): full header. "bare": skip header but keep aria-region + table toggle. */
  framing?: "framed" | "bare";
  children: ReactNode;
  className?: string;
}

/**
 * Wraps every standalone chart with shared anatomy: title, assumption
 * sub-caption, screen-reader region, and optional data-table fallback.
 *
 * Use `framing="bare"` when the parent surface (e.g. a Card with its own header)
 * already provides the title and sub-caption; ChartFrame still renders the
 * data-table toggle and the aria-labelled region.
 */
export function ChartFrame({
  title,
  subCaption,
  ariaLabel,
  dataTable,
  actions,
  framing = "framed",
  children,
  className,
}: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false);
  const hasToggle = dataTable != null;

  return (
    <div className={cn("flex flex-col gap-[var(--space-3)]", className)}>
      {framing === "framed" && (
        <div className="flex items-start justify-between gap-[var(--space-4)]">
          <div className="flex flex-col gap-[var(--space-1)]">
            <h3 className="text-heading-sm text-text-primary">{title}</h3>
            {subCaption && <p className="text-body-sm text-text-secondary">{subCaption}</p>}
          </div>
          <div className="flex items-center gap-[var(--space-2)]">
            {hasToggle && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTable((v) => !v)}
                aria-pressed={showTable}
              >
                {showTable ? "Show chart" : "Show as table"}
              </Button>
            )}
            {actions}
          </div>
        </div>
      )}
      {framing === "bare" && hasToggle && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
            {showTable ? "Show chart" : "Show as table"}
          </Button>
        </div>
      )}
      <div role="region" aria-label={ariaLabel}>
        {hasToggle && showTable ? dataTable : children}
      </div>
    </div>
  );
}

/**
 * Build the assumption-provenance sub-caption from the live scenario and (optional)
 * simulation result. The result's configSnapshot is preferred when available because
 * it reflects the assumptions actually used for the rendered chart, not the current
 * (potentially edited) ones.
 */
export function formatProvenance(scenario: Scenario, result?: SimulationResult | null): string {
  const config = result?.configSnapshot ?? scenario.simulationConfig;
  const parts: string[] = [];

  parts.push(`${config.iterations.toLocaleString()} iterations`);

  parts.push(
    `Inflation: ${
      config.inflationMode === "fixed" ? `${(config.fixedInflationRate * 100).toFixed(1)}%` : "stochastic"
    }`,
  );

  parts.push(
    `Longevity: ${
      config.longevityModel === "fixed_age" ? `to age ${config.fixedEndAge}` : "stochastic mortality"
    }`,
  );

  return parts.join(" · ");
}
