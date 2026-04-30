import { useMemo } from "react";
import { Goal as GoalIcon } from "lucide-react";
import { Card, CardHeader, CardBody, Skeleton } from "@/components/primitives";
import { formatCurrency } from "@/lib/format";
import { useAppStore } from "@/store";
import type { Scenario } from "@/models/scenario";
import type { SolverResult, WealthPathPoint } from "@/models/goal";
import { MiniWealthChart } from "./MiniWealthChart";

interface GoalGapCardProps {
  scenario: Scenario;
}

// Two prescriptive insights derived from the scenario, populated by the
// AppShell-level useAutoSolve after each scenario edit. There's no user-set
// goal: targets are derived from scenario (retirement age, retirement-period
// expense total, hardcoded 90% success). The card just renders cache.
//
// Display rule (matches the rest of the dashboard's stale-but-shown
// behavior):
//   - Show goal.cache whenever a sim result also exists in this session.
//     The result-existence check matters on hard refresh: simulations aren't
//     persisted, but goal.cache is, so without it the panel would flash
//     previous-session numbers while the rest of the dashboard sits in its
//     loading state.
//   - During a rerun (status="running" but the previous result/cache are
//     still in store), keep showing the stale cache rather than reverting
//     to skeletons. Charts behave the same way (they read simEntry.result,
//     which the rerun does not clear).
//   - After a SOLVER_VERSION bump, the persisted goal.cache is invalidated
//     by goalSlice's load-time check, not by this gate.
export function GoalGapCard({ scenario }: GoalGapCardProps) {
  const simEntry = useAppStore((s) => s.simulations[scenario.id]);
  const hasResultThisSession = simEntry?.result != null;
  const cache = hasResultThisSession ? scenario.goal?.cache : undefined;
  const earliest = cache?.earliest_retirement_age;
  const savings = cache?.required_savings;
  const targetAge = scenario.profile.retirementAge;
  const currentMonthly = scenario.accounts.reduce((s, a) => s + a.annualContribution, 0) / 12;

  // Median wealth path from the user's active simulation. Used as the
  // "Actual" overlay on the Q2 (required savings) chart so the user can see
  // how much extra wealth their over-saving builds vs. the minimum path.
  //
  // Select the raw `wealthByYear` reference (stable until the sim re-runs)
  // and memoize the slim copy. Mapping inline in the selector returns a new
  // array each subscription tick and would loop with ParentSize's resize
  // observer.
  const actualWealthByYear = useAppStore((s) => s.simulations[scenario.id]?.result?.wealthByYear);
  const actualWealthPath = useMemo<WealthPathPoint[] | undefined>(
    () =>
      actualWealthByYear?.map((d) => ({
        age: d.age,
        p10: d.p10,
        p50: d.p50,
        p90: d.p90,
      })),
    [actualWealthByYear],
  );

  return (
    <Card variant="surface" className="flex flex-col">
      <CardHeader>
        <span className="flex items-center gap-[var(--space-2)] text-heading-sm font-semibold text-text-primary">
          <GoalIcon size={18} />
          Goals
        </span>
      </CardHeader>
      <CardBody className="flex flex-1 flex-col">
        {!hasRetirementSpend(scenario) ? (
          <EmptyHint />
        ) : (
          <div className="grid flex-1 grid-cols-1 gap-[var(--space-6)] md:grid-cols-2">
            <GoalStat
              label="Earliest safe retirement"
              loading={!earliest}
              value={earliest ? `Age ${Math.round(earliest.solvedValue)}` : ""}
              detail={earliest ? earliestDetail(earliest, scenario) : ""}
              chart={
                earliest?.wealthPath ? (
                  <MiniWealthChart
                    primary={earliest.wealthPath}
                    markerAge={Math.round(earliest.solvedValue)}
                    markerLabel="Retire"
                  />
                ) : (
                  // Match MiniWealthChart's outer wrapper exactly: a flex column
                  // whose chart area has minHeight: 160, so on mobile (where the
                  // card has no sibling to stretch against) the skeleton still
                  // shows at the same height the real chart will occupy.
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="min-h-0 flex-1" style={{ minHeight: 160 }}>
                      <Skeleton height="100%" />
                    </div>
                  </div>
                )
              }
            />
            <GoalStat
              label={`Retire by age ${targetAge}`}
              loading={!savings}
              value={savings ? savingsHeadline(savings) : ""}
              detail={savings ? savingsDetail(savings, currentMonthly) : ""}
              chart={
                savings?.wealthPath ? (
                  <MiniWealthChart
                    primary={savings.wealthPath}
                    overlay={actualWealthPath}
                    markerAge={targetAge}
                    markerLabel="Retire"
                    primaryLabel="At minimum"
                    overlayLabel="At current savings"
                  />
                ) : (
                  // Match MiniWealthChart's inner layout (chart + bottom legend
                  // strip) so the second stat's chart-slot height doesn't shift
                  // on swap-in. The chart-area minHeight matches MiniWealthChart's
                  // 160px floor so it remains visible on mobile.
                  <div className="flex h-full min-h-0 flex-col gap-[var(--space-2)]">
                    <div className="min-h-0 flex-1" style={{ minHeight: 160 }}>
                      <Skeleton height="100%" />
                    </div>
                    <div className="flex items-center justify-end gap-[var(--space-4)]">
                      <Skeleton width={72} height={11} />
                      <Skeleton width={96} height={11} />
                    </div>
                  </div>
                )
              }
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function GoalStat({
  label,
  value,
  detail,
  chart,
  loading = false,
}: {
  label: string;
  value: string;
  detail: string;
  chart?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-[var(--space-2)]">
      <span className="text-overline text-text-tertiary">{label}</span>
      {loading ? (
        // text-heading-md is 22px font / 30px line-height. Match that exactly
        // so the value row doesn't change height on swap-in.
        <Skeleton width="50%" height={30} />
      ) : (
        <span className="text-heading-md font-semibold text-text-primary">{value}</span>
      )}
      {loading ? (
        // text-body-sm is 13px font / 20px line-height. Use 20 so the line
        // matches the rendered text's box height.
        <Skeleton width="90%" height={20} />
      ) : (
        <span className="text-body-sm text-text-tertiary">{detail}</span>
      )}
      {chart && <div className="mt-[var(--space-3)] flex min-h-0 flex-1 flex-col">{chart}</div>}
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="flex items-center gap-[var(--space-3)] text-body-sm text-text-tertiary">
      <GoalIcon size={20} />
      <span>Add retirement-period expenses to see prescriptive projections.</span>
    </div>
  );
}

function earliestDetail(result: SolverResult, scenario: Scenario): string {
  const targetAge = scenario.profile.retirementAge;
  const solved = Math.round(result.solvedValue);
  const portfolio = result.medianPortfolioAtRetirement;
  const portfolioPart = portfolio
    ? `Projected ~${formatCurrency(portfolio, { compact: true })} portfolio at that age. `
    : "";
  if (solved < targetAge) {
    const yrs = targetAge - solved;
    return `${portfolioPart}${yrs} year${yrs === 1 ? "" : "s"} earlier than your target of ${targetAge}, at 90% confidence.`;
  }
  if (solved === targetAge) {
    return `${portfolioPart}Right at your target age, at 90% confidence.`;
  }
  const yrs = solved - targetAge;
  return `${portfolioPart}${yrs} year${yrs === 1 ? "" : "s"} past your target of ${targetAge}, at 90% confidence.`;
}

// solvedValue is the absolute minimum total annual contribution. Show it
// directly as a per-month figure, since that's what the user is asking for.
function savingsHeadline(result: SolverResult): string {
  const monthly = result.solvedValue / 12;
  if (monthly < 50) return "$0/mo";
  return `${formatCurrency(monthly, { decimals: 0 })}/mo`;
}

function savingsDetail(result: SolverResult, currentMonthly: number): string {
  const minMonthly = result.solvedValue / 12;
  const diff = currentMonthly - minMonthly;
  if (minMonthly < 50) {
    return `You can stop saving and still hit your target with 90% confidence. Currently saving ${formatCurrency(currentMonthly, { decimals: 0 })}/mo.`;
  }
  if (Math.abs(diff) < 50) {
    return `You're saving ${formatCurrency(currentMonthly, { decimals: 0 })}/mo, right at the threshold.`;
  }
  if (diff > 0) {
    return `You're saving ${formatCurrency(currentMonthly, { decimals: 0 })}/mo, ${formatCurrency(diff, { decimals: 0 })}/mo above the minimum.`;
  }
  return `You're saving ${formatCurrency(currentMonthly, { decimals: 0 })}/mo, ${formatCurrency(-diff, { decimals: 0 })}/mo below the minimum.`;
}

function hasRetirementSpend(scenario: Scenario): boolean {
  const refAge = scenario.profile.retirementAge;
  for (const e of scenario.expenses) {
    if (e.category === "one_time") continue;
    const startsBy = e.startAge <= refAge;
    const endsAfter = e.endAge == null || e.endAge >= refAge;
    if (startsBy && endsAfter && e.annualAmount > 0) return true;
  }
  return false;
}
