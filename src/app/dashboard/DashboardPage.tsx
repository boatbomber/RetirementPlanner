import { useNavigate } from "react-router-dom";
import { BarChart3, ChartLine, Milestone, OctagonX, RefreshCw, Wallet } from "lucide-react";
import { useAppStore } from "@/store";
import { useRerun } from "@/hooks/useSimulation";
import {
  Alert,
  Card,
  CardHeader,
  CardBody,
  LinearProgress,
  EmptyState,
  Button,
  MetricCard,
  Skeleton,
} from "@/components/primitives";
import { PageHeader } from "@/components/layout/PageHeader";
import { FanChart } from "@/components/charts/FanChart";
import { SuccessRateGauge } from "@/components/charts/SuccessRateGauge";
import { LifeEventTimeline } from "@/components/charts/LifeEventTimeline";
import { HistogramChart } from "@/components/charts/HistogramChart";
import { IncomeCompositionChart } from "@/components/charts/IncomeCompositionChart";
import { formatProvenance } from "@/components/charts/ChartFrame";
import { ChartFrameSkeleton } from "@/components/charts/ChartFrameSkeleton";
import { GoalGapCard } from "@/components/dashboard/GoalGapCard";
import { formatCurrency, formatPercent, formatPercent5pp } from "@/lib/format";
import { getCurrentAge } from "@/lib/age";
import { cn } from "@/lib/cn";
import {
  NOMINAL_DOLLARS_DISCLAIMER,
  TAX_MODELING_DISCLAIMER,
  ENGINE_SIMPLIFICATIONS_DISCLAIMER,
  MARKET_MODELING_DISCLAIMER,
} from "@/lib/disclaimers";
import type { SimulationResult } from "@/models/results";
import type { Scenario } from "@/models/scenario";

export function DashboardPage() {
  const navigate = useNavigate();
  const scenario = useAppStore((s) => s.getActiveScenario());
  const simEntry = useAppStore((s) => (scenario ? s.simulations[scenario.id] : undefined));

  // AppShell mounts useSimulation for auto-runs; this page only needs the
  // manual rerun action to power the "Refresh" button.
  const rerun = useRerun(scenario);

  if (!scenario) {
    return (
      <EmptyState
        icon={<BarChart3 size={40} />}
        title="No scenario"
        description="Create a scenario in the wizard to see your retirement projections."
        action={<Button onClick={() => navigate("/wizard")}>Start wizard</Button>}
      />
    );
  }

  const isRunning = simEntry?.status === "running";
  const result = simEntry?.result ?? null;
  const progress = simEntry?.progress ?? 0;
  const error = simEntry?.error ?? null;
  const provenance = formatProvenance(scenario, result);

  return (
    <div className="flex flex-col gap-[var(--space-7)]">
      <PageHeader
        title="Dashboard"
        subtitle={scenario.name}
        actions={
          <>
            <Button
              variant="icon-only"
              size="md"
              onClick={rerun}
              disabled={isRunning}
              aria-label="Re-run simulation"
              icon={<RefreshCw size={16} className={isRunning ? "animate-spin" : ""} />}
            />
            <Button variant="secondary" onClick={() => navigate("/scenario")}>
              Edit scenario
            </Button>
          </>
        }
      />

      {/*
        Collapse the progress slot smoothly instead of popping in/out.
        - `grid-template-rows` 0fr → 1fr animates the inner row's height.
        - Negative top margin equals the parent's `gap-7` so the collapsed
          slot contributes zero space (and zero gap) to the column.
      */}
      <div
        aria-hidden={!isRunning}
        className={cn(
          "grid overflow-hidden",
          "transition-[grid-template-rows,margin-top,opacity]",
          "duration-[var(--motion-standard)] ease-[var(--ease-out)]",
          isRunning ? "mt-0 grid-rows-[1fr] opacity-100" : "-mt-[var(--space-7)] grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="flex min-h-0 items-center gap-[var(--space-4)]">
          <span className="text-caption text-text-tertiary">Simulating…</span>
          <LinearProgress value={progress * 100} label="Simulation progress" className="flex-1" />
          <span className="text-caption tabular-nums text-text-tertiary">{Math.round(progress * 100)}%</span>
        </div>
      </div>

      {error && <Alert variant="danger">Simulation error: {error}</Alert>}

      <MetricRow result={result} />

      <div className="grid grid-cols-1 gap-[var(--space-7)] lg:grid-cols-2">
        <GoalGapCard scenario={scenario} />

        <Card variant="surface">
          <CardHeader>
            <span className="flex items-center gap-[var(--space-2)] text-heading-sm font-semibold text-text-primary">
              <ChartLine size={18} />
              Portfolio Projection
            </span>
          </CardHeader>
          <CardBody>
            {result ? (
              <FanChart
                data={result.wealthByYear}
                retirementAge={scenario.profile.retirementAge}
                currentAge={getCurrentAge(scenario)}
                events={scenario.lifeEvents}
                framing="bare"
                subCaption={provenance}
              />
            ) : (
              <ChartFrameSkeleton height={(w) => Math.min(400, Math.max(280, w * 0.45))} />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-[var(--space-7)] lg:grid-cols-2">
        <Card variant="surface">
          <CardHeader>
            <span className="flex items-center gap-[var(--space-2)] text-heading-sm font-semibold text-text-primary">
              <Wallet size={18} />
              Cash Flow Composition
            </span>
          </CardHeader>
          <CardBody>
            {result ? (
              <IncomeCompositionChart
                income={result.incomeByYear}
                spending={result.spendingByYear}
                tax={result.taxByYear}
                retirementAge={scenario.profile.retirementAge}
                events={scenario.lifeEvents}
                framing="bare"
              />
            ) : (
              <ChartFrameSkeleton
                height={(w) => Math.min(320, Math.max(220, w * 0.38))}
                footer={
                  <div className="mt-[var(--space-1)] flex items-center justify-center gap-[var(--space-4)]">
                    <Skeleton width={72} height={16} />
                    <Skeleton width={64} height={16} />
                    <Skeleton width={52} height={16} />
                  </div>
                }
              />
            )}
          </CardBody>
        </Card>

        <Card variant="surface">
          <CardHeader>
            <span className="flex items-center gap-[var(--space-2)] text-heading-sm font-semibold text-text-primary">
              <OctagonX size={18} />
              Terminal Wealth Distribution
            </span>
          </CardHeader>
          <CardBody>
            {result ? (
              <HistogramChart
                data={result.terminalWealthBuckets}
                totalIterations={scenario.simulationConfig.iterations}
                framing="bare"
              />
            ) : (
              <ChartFrameSkeleton height={(w) => Math.min(300, Math.max(200, w * 0.35))} />
            )}
          </CardBody>
        </Card>
      </div>

      {scenario.lifeEvents.length > 0 && (
        <Card variant="surface">
          <CardHeader>
            <span className="flex items-center gap-[var(--space-2)] text-heading-sm font-semibold text-text-primary">
              <Milestone size={18} />
              Life Events
            </span>
          </CardHeader>
          <CardBody>
            {result ? (
              <LifeEventTimeline
                events={scenario.lifeEvents}
                currentAge={getCurrentAge(scenario)}
                retirementAge={scenario.profile.retirementAge}
                endAge={scenario.simulationConfig.fixedEndAge}
                framing="bare"
              />
            ) : (
              <ChartFrameSkeleton height={() => 40} footer={<div className="h-3" />} />
            )}
          </CardBody>
        </Card>
      )}

      <ScenarioSummary scenario={scenario} />

      <AssumptionProvenance scenario={scenario} result={result} />
    </div>
  );
}

function MetricRow({ result }: { result: SimulationResult | null }) {
  // Loaded values render in a div with `leading-8` (32px line-height); match
  // that height so the row doesn't shift when text replaces the placeholder.
  const metricSkeleton = <Skeleton width="60%" height={32} />;
  return (
    <Card variant="surface" className="grid grid-cols-2 lg:grid-cols-5">
      <MetricCard
        bare
        size="md"
        label="Success Rate"
        value={result ? formatPercent5pp(result.successRate) : metricSkeleton}
        icon={
          result ? (
            <SuccessRateGauge value={result.successRate} size={32} />
          ) : (
            <Skeleton width={32} height={32} radius="9999px" />
          )
        }
      />
      <MetricCard
        bare
        size="md"
        label="Median Portfolio"
        value={
          result ? formatCurrency(result.medianPortfolioAtRetirement, { compact: true }) : metricSkeleton
        }
        sub="At retirement"
        className="border-l border-[var(--color-border-subtle)]"
      />
      <MetricCard
        bare
        size="md"
        label="Adjustment Risk"
        value={result ? formatPercent(result.adjustmentProbability, 0) : metricSkeleton}
        sub="Chance of spending cut"
        className="border-[var(--color-border-subtle)] max-lg:border-t lg:border-l"
      />
      <MetricCard
        bare
        size="md"
        label="Worst Cut"
        value={result ? formatPercent(result.p90MaxCutPercent, 0) : metricSkeleton}
        sub="p90 cut when one occurs"
        className="border-l border-[var(--color-border-subtle)] max-lg:border-t"
      />
      <MetricCard
        bare
        size="md"
        label="Confidence Age"
        value={result ? `${result.confidenceAge}` : metricSkeleton}
        sub="95% solvent through"
        className="border-[var(--color-border-subtle)] max-lg:col-span-2 max-lg:border-t lg:border-l"
      />
    </Card>
  );
}

function ScenarioSummary({ scenario }: { scenario: Scenario }) {
  const profile = scenario.profile;
  const totalBalance = scenario.accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <Card variant="sunken">
      <CardBody className="py-[var(--space-5)]">
        <div className="grid grid-cols-2 gap-x-[var(--space-8)] gap-y-[var(--space-3)] text-body-sm md:grid-cols-4">
          <SummaryItem label="Retirement age" value={`${profile.retirementAge}`} />
          <SummaryItem label="Planning horizon" value={`Age ${profile.planningHorizonAge}`} />
          <SummaryItem label="Total balance" value={formatCurrency(totalBalance, { compact: true })} />
          <SummaryItem label="Filing status" value={profile.filingStatus.replace(/_/g, " ")} />
          <SummaryItem
            label="Withdrawal strategy"
            value={scenario.withdrawalStrategy.type.replace(/_/g, " ")}
          />
          <SummaryItem label="Accounts" value={`${scenario.accounts.length}`} />
          <SummaryItem label="Income sources" value={`${scenario.incomeSources.length}`} />
          <SummaryItem
            label="Iterations"
            value={`${scenario.simulationConfig.iterations.toLocaleString()}`}
          />
        </div>
      </CardBody>
    </Card>
  );
}

function AssumptionProvenance({ scenario, result }: { scenario: Scenario; result: SimulationResult | null }) {
  return (
    <Card variant="sunken">
      <CardBody className="py-[var(--space-4)]">
        <div className="flex flex-col gap-[var(--space-2)]">
          <span className="text-overline text-text-tertiary">Assumptions</span>
          {result ? <ProvenanceContent scenario={scenario} result={result} /> : <ProvenanceSkeleton />}
        </div>
      </CardBody>
    </Card>
  );
}

function ProvenanceSkeleton() {
  // Five paragraphs of `text-caption leading-relaxed` (12px / 19.5px line-height)
  // typically wrap to 2 / 3 / 4 / 4 / 4 lines at dashboard widths. Render line-shaped
  // skeletons at 12px height with a 7.5px gap so each row matches the real
  // line-height, and the total block lands at the same height as the text.
  return (
    <>
      <SkeletonParagraph widths={["100%", "62%"]} />
      <SkeletonParagraph widths={["100%", "100%", "78%"]} />
      <SkeletonParagraph widths={["100%", "100%", "100%", "44%"]} />
      <SkeletonParagraph widths={["100%", "100%", "100%", "58%"]} />
      <SkeletonParagraph widths={["100%", "100%", "100%", "70%"]} />
    </>
  );
}

function SkeletonParagraph({ widths }: { widths: string[] }) {
  return (
    <div className="flex flex-col gap-[7.5px]">
      {widths.map((w, i) => (
        <Skeleton key={i} width={w} height={12} />
      ))}
    </div>
  );
}

function ProvenanceContent({ scenario, result }: { scenario: Scenario; result: SimulationResult }) {
  const config = result.configSnapshot;
  const withdrawalType = scenario.withdrawalStrategy.type.replace(/_/g, " ");
  const inflationMode =
    config.inflationMode === "stochastic"
      ? `Stochastic AR(1), μ=${(config.stochasticInflation.longRunMean * 100).toFixed(1)}%`
      : `Fixed ${(config.fixedInflationRate * 100).toFixed(1)}%`;
  const longevity =
    config.longevityModel === "fixed_age"
      ? `Fixed to age ${config.fixedEndAge}`
      : `${config.mortalityTable} table`;

  return (
    <>
      <p className="text-caption leading-relaxed text-text-tertiary">
        {scenario.simulationConfig.iterations.toLocaleString()} Monte Carlo iterations · {withdrawalType}{" "}
        withdrawal · Inflation: {inflationMode}· Longevity: {longevity}· Computed in{" "}
        {result.durationMs < 1000
          ? `${Math.round(result.durationMs)}ms`
          : `${(result.durationMs / 1000).toFixed(1)}s`}
      </p>
      <p className="text-caption leading-relaxed text-text-tertiary">{NOMINAL_DOLLARS_DISCLAIMER}</p>
      <p className="text-caption leading-relaxed text-text-tertiary">{TAX_MODELING_DISCLAIMER}</p>
      <p className="text-caption leading-relaxed text-text-tertiary">{ENGINE_SIMPLIFICATIONS_DISCLAIMER}</p>
      <p className="text-caption leading-relaxed text-text-tertiary">{MARKET_MODELING_DISCLAIMER}</p>
      {result.warnings.length > 0 && (
        <div className="flex flex-col gap-[var(--space-2)] rounded-md border border-[var(--color-border-subtle)] bg-warning-soft p-[var(--space-3)]">
          <span className="text-overline text-text-secondary">Engine warnings</span>
          {result.warnings.map((w) => (
            <p key={w} className="text-caption leading-relaxed text-text-secondary">
              {w}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-overline text-text-tertiary">{label}</span>
      <span className="text-text-primary capitalize">{value}</span>
    </div>
  );
}
