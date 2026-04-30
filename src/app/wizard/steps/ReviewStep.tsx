import type { StepProps } from "../types";
import { Card, CardBody, LinearProgress, MetricCard } from "@/components/primitives";
import { formatCurrency, formatPercent5pp } from "@/lib/format";
import { useSimulation } from "@/hooks/useSimulation";
import { useAppStore } from "@/store";
import { FanChart } from "@/components/charts/FanChart";
import { SummarySection, SummaryRow } from "./SummarySection";
import { cn } from "@/lib/cn";

export function ReviewStep({ wizard }: StepProps) {
  const { scenario } = wizard;
  const s = scenario!;
  const p = s.profile;
  const isMarried = p.filingStatus === "married_filing_jointly";

  // Auto-run the simulation when the user reaches the review step
  useSimulation(s);
  const sim = useAppStore((state) => state.simulations[s.id]);
  const status = sim?.status ?? "idle";
  const progress = sim?.progress ?? 0;
  const result = sim?.result ?? null;

  const totalBalance = s.accounts.reduce((sum, a) => sum + a.balance, 0);
  const totalContributions = s.accounts.reduce((sum, a) => sum + a.annualContribution + a.employerMatch, 0);
  const totalIncome = s.incomeSources.reduce((sum, i) => sum + i.annualAmount, 0);
  const totalSpending = s.expenses.reduce((sum, e) => sum + e.annualAmount, 0);

  const filingLabels: Record<string, string> = {
    single: "Single",
    married_filing_jointly: "Married Filing Jointly",
    married_filing_separately: "Married Filing Separately",
    head_of_household: "Head of Household",
  };

  return (
    <div className="flex flex-col gap-[var(--space-5)]">
      <p className="text-body-sm text-text-tertiary">Review your plan details.</p>

      {/* Live preview */}
      <Card variant="sunken" className="overflow-hidden">
        <div className="flex items-center justify-between px-[var(--space-5)] pt-[var(--space-4)] pb-[var(--space-2)]">
          <span className="text-overline text-text-tertiary">Preview Simulation</span>
          <span
            className={cn(
              "inline-flex items-center gap-[var(--space-2)] rounded-full px-[var(--space-3)] py-[2px] text-caption font-medium uppercase tracking-wide",
              status === "running" && "bg-primary-soft text-primary",
              status === "complete" && "bg-success-soft text-success",
              status === "error" && "bg-danger-soft text-danger",
              status === "idle" && "bg-[var(--color-surface-sunken)] text-text-tertiary",
            )}
          >
            {status === "running" && (
              <span className="inline-block size-[6px] animate-pulse rounded-full bg-current" />
            )}
            {status}
          </span>
        </div>
        <CardBody className="flex flex-col gap-[var(--space-4)] px-[var(--space-5)] pb-[var(--space-4)]">
          {status === "running" && (
            <div className="flex flex-col gap-[var(--space-2)]">
              <LinearProgress value={progress * 100} label="Simulation progress" />
              <span className="text-caption text-text-tertiary">
                Running {Math.round(progress * 100)}% of simulation iterations…
              </span>
            </div>
          )}
          {status === "complete" && result && (
            <div className="flex flex-col gap-[var(--space-5)]">
              <div className="grid grid-cols-2 gap-[var(--space-3)] sm:grid-cols-4">
                <MetricCard
                  bare
                  size="md"
                  label="Success rate"
                  value={formatPercent5pp(result.successRate)}
                  className="p-[var(--space-3)]"
                />
                <MetricCard
                  bare
                  size="md"
                  label="Median portfolio at retirement"
                  value={formatCurrency(result.medianPortfolioAtRetirement, { compact: true })}
                  className="p-[var(--space-3)]"
                />
                <MetricCard
                  bare
                  size="md"
                  label="Median terminal wealth"
                  value={formatCurrency(result.medianTerminalWealth, { compact: true })}
                  className="p-[var(--space-3)]"
                />
                <MetricCard
                  bare
                  size="md"
                  label="Confidence age"
                  value={String(result.confidenceAge)}
                  className="p-[var(--space-3)]"
                />
              </div>
              <FanChart
                data={result.wealthByYear}
                retirementAge={p.retirementAge}
                currentAge={new Date().getFullYear() - p.birthYear}
                events={s.lifeEvents}
              />
            </div>
          )}
          {status === "error" && (
            <span className="text-body-sm text-danger">Simulation error: {sim?.error ?? "unknown"}</span>
          )}
          {status === "idle" && <span className="text-body-sm text-text-tertiary">Waiting to start…</span>}
        </CardBody>
      </Card>

      <SummarySection title="Personal" editStep="basics">
        <SummaryRow label="Name" value={p.name || "Not set"} />
        <SummaryRow label="Age" value={`${new Date().getFullYear() - p.birthYear} (born ${p.birthYear})`} />
        <SummaryRow label="Filing status" value={filingLabels[p.filingStatus] ?? p.filingStatus} />
        <SummaryRow label="Retirement age" value={String(p.retirementAge)} />
        <SummaryRow label="State" value={p.stateOfResidence || "Not set"} />
        {isMarried && p.spouse && (
          <SummaryRow
            label="Spouse"
            value={`${p.spouse.name || "Not named"}, age ${new Date().getFullYear() - p.spouse.birthYear}, retire at ${p.spouse.retirementAge}`}
          />
        )}
      </SummarySection>

      <SummarySection title="Income" editStep="income">
        {s.incomeSources.length === 0 ? (
          <span className="text-body-sm text-text-tertiary">No income sources added</span>
        ) : (
          s.incomeSources.map((inc) => (
            <SummaryRow
              key={inc.id}
              label={inc.label || inc.type}
              value={`${formatCurrency(inc.annualAmount)}/yr`}
            />
          ))
        )}
        {totalIncome > 0 && (
          <div className="mt-[var(--space-1)] border-t border-[var(--color-border-subtle)] pt-[var(--space-2)]">
            <SummaryRow label="Total income" value={`${formatCurrency(totalIncome)}/yr`} />
          </div>
        )}
        {s.socialSecurity.self.enabled && s.socialSecurity.self.fraMonthlyBenefit > 0 && (
          <SummaryRow
            label="Social Security"
            value={`${formatCurrency(s.socialSecurity.self.fraMonthlyBenefit)}/mo at FRA, claiming at ${s.socialSecurity.self.claimingAge}`}
          />
        )}
      </SummarySection>

      <SummarySection title="Accounts" editStep="accounts">
        {s.accounts.length === 0 ? (
          <span className="text-body-sm text-text-tertiary">No accounts added</span>
        ) : (
          <>
            {s.accounts.map((acct) => (
              <SummaryRow
                key={acct.id}
                label={acct.label || acct.type}
                value={formatCurrency(acct.balance)}
              />
            ))}
            <div className="mt-[var(--space-1)] border-t border-[var(--color-border-subtle)] pt-[var(--space-2)]">
              <SummaryRow label="Total balance" value={formatCurrency(totalBalance)} />
              {totalContributions > 0 && (
                <SummaryRow label="Annual contributions" value={`${formatCurrency(totalContributions)}/yr`} />
              )}
            </div>
          </>
        )}
      </SummarySection>

      <SummarySection title="Spending" editStep="expenses">
        {s.expenses.length === 0 ? (
          <span className="text-body-sm text-text-tertiary">No expenses added</span>
        ) : (
          <>
            {s.expenses
              .filter((e) => e.annualAmount > 0)
              .map((exp) => (
                <SummaryRow
                  key={exp.id}
                  label={exp.label || exp.category}
                  value={`${formatCurrency(exp.annualAmount)}/yr`}
                />
              ))}
            <div className="mt-[var(--space-1)] border-t border-[var(--color-border-subtle)] pt-[var(--space-2)]">
              <SummaryRow label="Total spending" value={`${formatCurrency(totalSpending)}/yr`} />
            </div>
          </>
        )}
      </SummarySection>

      <SummarySection title="Life Events" editStep="events">
        {s.lifeEvents.length === 0 ? (
          <span className="text-body-sm text-text-tertiary">None added</span>
        ) : (
          s.lifeEvents
            .slice()
            .sort((a, b) => a.triggerAge - b.triggerAge)
            .map((ev) => (
              <SummaryRow
                key={ev.id}
                label={ev.label}
                value={`Age ${ev.triggerAge}${ev.durationYears ? ` (${ev.durationYears}yr)` : ""}`}
              />
            ))
        )}
      </SummarySection>

      <SummarySection title="Assumptions">
        <span className="text-body-sm text-text-tertiary">
          Using default assumptions (10,000 iterations, stochastic inflation, fixed-real 4% withdrawal)
        </span>
      </SummarySection>
    </div>
  );
}
