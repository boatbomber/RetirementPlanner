import { useMemo } from "react";
import { RockingChair } from "lucide-react";
import type { LifeEvent } from "@/models/life-event";
import type { Age } from "@/models/core";
import { Tooltip } from "@/components/primitives";
import { formatCurrency } from "@/lib/format";
import { ChartFrame } from "./ChartFrame";
import {
  EVENT_COLORS,
  getEventIcon,
  LifeEventTooltipContent,
  RetirementTooltipContent,
} from "./lifeEventStyles";

export interface LifeEventTimelineProps {
  events: LifeEvent[];
  currentAge: Age;
  retirementAge: Age;
  endAge: Age;
  /** Optional override; defaults to "Life events". */
  title?: string;
  /** "framed" (default): full ChartFrame header. "bare": skip header but keep aria-region + table toggle. */
  framing?: "framed" | "bare";
  className?: string;
}

function formatChangeList(items: string[]): React.ReactNode {
  if (items.length === 0) return "-";
  return (
    <span className="flex flex-col gap-0.5 text-right">
      {items.map((s, i) => (
        <span key={i}>{s}</span>
      ))}
    </span>
  );
}

function LifeEventsTable({ events }: { events: LifeEvent[] }) {
  return (
    <div className="max-h-80 overflow-auto scroll-shadow-x">
      <table className="w-full text-caption tabular-nums">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-[var(--color-border-subtle)]">
            <th className="px-2 py-1 text-left text-text-tertiary font-medium">Age</th>
            <th className="px-2 py-1 text-left text-text-tertiary font-medium">Event</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">Inflow</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">Outflow</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">Income Δ</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">Expense Δ</th>
            <th className="px-2 py-1 text-right text-text-tertiary font-medium">Contributions Δ</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => {
            const incomeItems = e.financialImpact.incomeChanges
              .filter((ic) => ic.newIncome.annualAmount != null)
              .map((ic) =>
                ic.existingIncomeId
                  ? `→ ${formatCurrency(ic.newIncome.annualAmount ?? 0, { compact: true })}/yr`
                  : `+${formatCurrency(ic.newIncome.annualAmount ?? 0, { compact: true })}/yr`,
              );
            const expenseItems = e.financialImpact.expenseChanges
              .filter((ec) => ec.newExpense.annualAmount != null)
              .map((ec) => `+${formatCurrency(ec.newExpense.annualAmount ?? 0, { compact: true })}/yr`);
            const contribItems = e.financialImpact.contributionChanges.map(
              (cc) => `${formatCurrency(cc.newAnnualContribution, { compact: true })}/yr`,
            );
            return (
              <tr key={e.id} className="border-b border-[var(--color-border-subtle)] last:border-b-0">
                <td className="px-2 py-1 align-top text-text-primary">
                  {e.triggerAge}
                  {e.durationYears ? `–${e.triggerAge + e.durationYears - 1}` : ""}
                </td>
                <td className="px-2 py-1 align-top text-text-primary">{e.label}</td>
                <td className="px-2 py-1 align-top text-right text-text-secondary">
                  {e.financialImpact.oneTimeInflow > 0
                    ? formatCurrency(e.financialImpact.oneTimeInflow, { compact: true })
                    : "-"}
                </td>
                <td className="px-2 py-1 align-top text-right text-text-secondary">
                  {e.financialImpact.oneTimeOutflow > 0
                    ? formatCurrency(e.financialImpact.oneTimeOutflow, { compact: true })
                    : "-"}
                </td>
                <td className="px-2 py-1 align-top text-right text-text-secondary">
                  {formatChangeList(incomeItems)}
                </td>
                <td className="px-2 py-1 align-top text-right text-text-secondary">
                  {formatChangeList(expenseItems)}
                </td>
                <td className="px-2 py-1 align-top text-right text-text-secondary">
                  {formatChangeList(contribItems)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LifeEventTimeline({
  events,
  currentAge,
  retirementAge,
  endAge,
  title = "Life events",
  framing = "framed",
  className,
}: LifeEventTimelineProps) {
  const sorted = useMemo(() => [...events].sort((a, b) => a.triggerAge - b.triggerAge), [events]);

  if (sorted.length === 0) return null;

  const rangeStart = currentAge;
  const rangeEnd = endAge;
  const totalYears = rangeEnd - rangeStart;
  if (totalYears <= 0) return null;

  const pct = (age: Age) => Math.max(0, Math.min(100, ((age - rangeStart) / totalYears) * 100));

  const retirementPct = pct(retirementAge);
  const ariaLabel = `Timeline of ${sorted.length} life event${sorted.length === 1 ? "" : "s"} from age ${rangeStart} to ${rangeEnd}.`;

  return (
    <ChartFrame
      title={title}
      ariaLabel={ariaLabel}
      framing={framing}
      dataTable={<LifeEventsTable events={sorted} />}
      className={className}
    >
      <div className="relative h-10 rounded-md bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)]">
        {/* Retirement marker */}
        <Tooltip content={<RetirementTooltipContent age={retirementAge} />}>
          <div
            aria-label={`Retirement at age ${retirementAge}`}
            className="absolute top-1/2 z-20 flex items-center cursor-default"
            style={{ left: `${retirementPct}%`, transform: "translate(-50%, -50%)" }}
          >
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface shadow-1"
              style={{
                border: "2px solid var(--color-marker-goal)",
                color: "var(--color-marker-goal)",
              }}
            >
              <RockingChair size={16} />
            </div>
          </div>
        </Tooltip>

        {/* Event markers */}
        {sorted.map((event) => {
          const left = pct(event.triggerAge);
          const endEvt = event.durationYears ? event.triggerAge + event.durationYears : event.triggerAge;
          const width = pct(endEvt) - left;
          const color = EVENT_COLORS[event.type];

          return (
            <Tooltip key={event.id} content={<LifeEventTooltipContent event={event} />}>
              <div
                className="absolute top-1/2 -translate-y-1/2 flex items-center cursor-default"
                style={{ left: `${left}%` }}
              >
                {width > 0 && (
                  <div
                    className="absolute h-3 rounded-full opacity-30"
                    style={{
                      width: `${width}%`,
                      minWidth: "4px",
                      backgroundColor: color,
                      left: 0,
                    }}
                  />
                )}
                <div
                  className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-surface shadow-1"
                  style={{ borderColor: color, color }}
                >
                  {getEventIcon(event)}
                </div>
              </div>
            </Tooltip>
          );
        })}

        {/* Age labels */}
        <span className="absolute bottom-[-18px] left-0 text-overline tabular-nums text-text-tertiary">
          {rangeStart}
        </span>
        <span className="absolute bottom-[-18px] right-0 text-overline tabular-nums text-text-tertiary">
          {rangeEnd}
        </span>
      </div>
      <div className="h-3" />
    </ChartFrame>
  );
}
