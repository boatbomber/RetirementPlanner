import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAppStore } from "@/store";
import { useSimulation } from "@/hooks/useSimulation";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/primitives";
import { RadioGroup } from "@/components/primitives/Input/RadioGroup";
import { PageHeader } from "@/components/layout/PageHeader";
import { FanChart } from "@/components/charts/FanChart";
import { formatCurrency, formatPercent, formatPercent5pp } from "@/lib/format";
import { getCurrentAge } from "@/lib/age";
import type { SimulationResult } from "@/models/results";
import type { Scenario } from "@/models";
import { cn } from "@/lib/cn";

const VIEW_MODES = [
  { value: "side-by-side", label: "Side by side" },
  { value: "overlaid", label: "Overlaid" },
];

export function ScenarioComparePage() {
  const navigate = useNavigate();
  const scenarios = useAppStore((s) => s.scenarios);
  const activeScenarioId = useAppStore((s) => s.activeScenarioId);
  const comparisonScenarioId = useAppStore((s) => s.comparisonScenarioId);
  const setActiveScenario = useAppStore((s) => s.setActiveScenario);
  const setComparisonScenario = useAppStore((s) => s.setComparisonScenario);

  const baseScenario = scenarios.find((s) => s.id === activeScenarioId);
  const compScenario = scenarios.find((s) => s.id === comparisonScenarioId);

  // AppShell already runs useSimulation for the active scenario so only mount
  // one here for the comparison scenario. This avoids racing debounce timers
  // on the active side.
  useSimulation(compScenario);

  // Subscribe per-scenario rather than to the whole `simulations` record so a
  // progress tick on one scenario doesn't re-render this page.
  const baseResult = useAppStore((s) =>
    baseScenario ? (s.simulations[baseScenario.id]?.result ?? null) : null,
  );
  const compResult = useAppStore((s) =>
    compScenario ? (s.simulations[compScenario.id]?.result ?? null) : null,
  );

  const scenarioOptions = scenarios.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  const handleBaseChange = useCallback((id: string) => setActiveScenario(id), [setActiveScenario]);

  const handleCompChange = useCallback((id: string) => setComparisonScenario(id), [setComparisonScenario]);

  const [viewMode, setViewMode] = useState<"side-by-side" | "overlaid">("side-by-side");

  return (
    <div className="flex flex-col gap-[var(--space-7)]">
      <div className="flex flex-col gap-[var(--space-3)]">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/comparisons")}
          icon={<ArrowLeft size={16} />}
          className="self-start -ml-[var(--space-3)]"
        >
          Comparisons
        </Button>
        <PageHeader title="Compare Scenarios" subtitle="Side-by-side projections for any two scenarios" />
      </div>

      <div className="grid grid-cols-1 gap-[var(--space-3)] sm:grid-cols-2 sm:gap-[var(--space-5)]">
        <Select
          value={activeScenarioId ?? ""}
          onValueChange={handleBaseChange}
          options={scenarioOptions}
          placeholder="Select base scenario"
        />
        <Select
          value={comparisonScenarioId ?? ""}
          onValueChange={handleCompChange}
          options={scenarioOptions}
          placeholder="Select comparison scenario"
        />
      </div>

      {baseResult && compResult && <DeltaMetrics base={baseResult} comp={compResult} />}

      {baseResult && compResult && (
        <div className="flex items-center justify-end gap-[var(--space-3)]">
          <span className="text-caption text-text-tertiary">View</span>
          <RadioGroup
            value={viewMode}
            onValueChange={(v) => setViewMode(v as "side-by-side" | "overlaid")}
            options={VIEW_MODES}
            orientation="horizontal"
          />
        </div>
      )}

      {viewMode === "overlaid" && baseScenario && compScenario && baseResult && compResult ? (
        <Card variant="surface">
          <CardHeader>
            <span className="text-heading-sm font-semibold text-text-primary">
              Overlaid projections (median lines)
            </span>
          </CardHeader>
          <CardBody>
            <OverlaidMedianChart
              baseData={baseResult.wealthByYear}
              compData={compResult.wealthByYear}
              baseLabel={baseScenario.name}
              compLabel={compScenario.name}
            />
          </CardBody>
        </Card>
      ) : null}

      {baseScenario && compScenario && <ParameterDiff base={baseScenario} comp={compScenario} />}

      <div
        className={cn(
          "grid grid-cols-1 gap-[var(--space-5)]",
          viewMode === "side-by-side" && "lg:grid-cols-2",
          viewMode === "overlaid" && "hidden",
        )}
      >
        <Card variant="surface">
          <CardHeader>
            <span className="text-heading-sm font-semibold text-text-primary">
              {baseScenario?.name ?? "Select a scenario"}
            </span>
          </CardHeader>
          <CardBody>
            {baseResult && baseScenario ? (
              <FanChart
                data={baseResult.wealthByYear}
                retirementAge={baseScenario.profile.retirementAge}
                currentAge={getCurrentAge(baseScenario)}
                events={baseScenario.lifeEvents}
                framing="bare"
              />
            ) : (
              <div className="flex h-64 items-center justify-center text-text-tertiary text-body-sm">
                {baseScenario ? "Waiting for simulation..." : "Select a base scenario"}
              </div>
            )}
          </CardBody>
        </Card>

        <Card variant="surface">
          <CardHeader>
            <span className="text-heading-sm font-semibold text-text-primary">
              {compScenario?.name ?? "Select a scenario"}
            </span>
          </CardHeader>
          <CardBody>
            {compResult && compScenario ? (
              <FanChart
                data={compResult.wealthByYear}
                retirementAge={compScenario.profile.retirementAge}
                currentAge={getCurrentAge(compScenario)}
                events={compScenario.lifeEvents}
                framing="bare"
              />
            ) : (
              <div className="flex h-64 items-center justify-center text-text-tertiary text-body-sm">
                {compScenario ? "Waiting for simulation..." : "Select a comparison scenario"}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function OverlaidMedianChart({
  baseData,
  compData,
  baseLabel,
  compLabel,
}: {
  baseData: SimulationResult["wealthByYear"];
  compData: SimulationResult["wealthByYear"];
  baseLabel: string;
  compLabel: string;
}) {
  // Lightweight overlaid chart: just two median lines on a simple SVG. Avoids
  // pulling in the full FanChart's band machinery for the overlay view, but
  // mirrors its axis labelling so the Y values are readable.
  const W = 720;
  const H = 260;
  const PAD_LEFT = 64;
  const PAD_RIGHT = 24;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 36;
  const allValues = [...baseData.map((d) => d.p50), ...compData.map((d) => d.p50)];
  const yMax = Math.max(1, ...allValues) * 1.05;
  const ages = [...baseData.map((d) => d.age), ...compData.map((d) => d.age)];
  const xMin = Math.min(...ages);
  const xMax = Math.max(...ages);
  const innerW = W - PAD_LEFT - PAD_RIGHT;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const x = (a: number) => PAD_LEFT + ((a - xMin) / Math.max(1, xMax - xMin)) * innerW;
  const y = (v: number) => PAD_TOP + innerH - (v / yMax) * innerH;
  const path = (data: SimulationResult["wealthByYear"]) =>
    data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(d.age)} ${y(d.p50)}`).join(" ");

  // 5 evenly-spaced ticks for both axes, matching FanChart density.
  const yTicks = Array.from({ length: 5 }, (_, i) => (yMax * i) / 4);
  const xStep = Math.max(1, Math.round((xMax - xMin) / 5));
  const xTicks: number[] = [];
  for (let a = xMin; a <= xMax; a += xStep) xTicks.push(a);

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-3xl"
        role="img"
        aria-label={`Median wealth comparison: ${baseLabel} versus ${compLabel}, ages ${xMin} to ${xMax}, peak ${formatCurrency(Math.max(...allValues), { compact: true })}`}
      >
        {/* Y-axis */}
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP}
          x2={PAD_LEFT}
          y2={PAD_TOP + innerH}
          stroke="var(--color-marker-reference)"
        />
        {/* X-axis */}
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP + innerH}
          x2={PAD_LEFT + innerW}
          y2={PAD_TOP + innerH}
          stroke="var(--color-marker-reference)"
        />
        {yTicks.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={PAD_LEFT - 4}
              y1={y(v)}
              x2={PAD_LEFT}
              y2={y(v)}
              stroke="var(--color-marker-reference)"
            />
            <text
              x={PAD_LEFT - 8}
              y={y(v)}
              dy="0.32em"
              textAnchor="end"
              fontSize={11}
              fontFamily="var(--font-sans)"
              fill="var(--color-text-tertiary)"
            >
              {formatCurrency(v, { compact: true })}
            </text>
          </g>
        ))}
        {xTicks.map((a) => (
          <g key={`x-${a}`}>
            <line
              x1={x(a)}
              y1={PAD_TOP + innerH}
              x2={x(a)}
              y2={PAD_TOP + innerH + 4}
              stroke="var(--color-marker-reference)"
            />
            <text
              x={x(a)}
              y={PAD_TOP + innerH + 18}
              textAnchor="middle"
              fontSize={11}
              fontFamily="var(--font-sans)"
              fill="var(--color-text-tertiary)"
            >
              {a}
            </text>
          </g>
        ))}
        <text
          x={PAD_LEFT + innerW / 2}
          y={H - 4}
          textAnchor="middle"
          fontSize={12}
          fontFamily="var(--font-sans)"
          fill="var(--color-text-secondary)"
        >
          Age
        </text>
        <path d={path(baseData)} stroke="var(--viz-1)" strokeWidth={2} fill="none" />
        <path d={path(compData)} stroke="var(--viz-2)" strokeWidth={2} fill="none" />
      </svg>
      <div className="flex gap-[var(--space-5)] text-caption">
        <span className="flex items-center gap-2">
          <span className="inline-block h-[2px] w-4 bg-[var(--viz-1)]" />
          {baseLabel}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-[2px] w-4 bg-[var(--viz-2)]" />
          {compLabel}
        </span>
      </div>
    </div>
  );
}

function ParameterDiff({ base, comp }: { base: Scenario; comp: Scenario }) {
  // Side-by-side parameter values for the most-asked-about scenario fields.
  // Highlights rows that differ so the user can quickly see what's changed.
  const rows: Array<{ label: string; base: string; comp: string }> = [
    {
      label: "Retirement age",
      base: String(base.profile.retirementAge),
      comp: String(comp.profile.retirementAge),
    },
    {
      label: "Planning horizon",
      base: `Age ${base.profile.planningHorizonAge}`,
      comp: `Age ${comp.profile.planningHorizonAge}`,
    },
    {
      label: "Filing status",
      base: base.profile.filingStatus.replace(/_/g, " "),
      comp: comp.profile.filingStatus.replace(/_/g, " "),
    },
    {
      label: "Withdrawal strategy",
      base: base.withdrawalStrategy.type.replace(/_/g, " "),
      comp: comp.withdrawalStrategy.type.replace(/_/g, " "),
    },
    {
      label: "Withdrawal order",
      base: base.withdrawalOrder.type.replace(/_/g, " "),
      comp: comp.withdrawalOrder.type.replace(/_/g, " "),
    },
    {
      label: "Iterations",
      base: base.simulationConfig.iterations.toLocaleString(),
      comp: comp.simulationConfig.iterations.toLocaleString(),
    },
    {
      label: "Inflation mode",
      base:
        base.simulationConfig.inflationMode === "fixed"
          ? `Fixed ${(base.simulationConfig.fixedInflationRate * 100).toFixed(1)}%`
          : "Stochastic",
      comp:
        comp.simulationConfig.inflationMode === "fixed"
          ? `Fixed ${(comp.simulationConfig.fixedInflationRate * 100).toFixed(1)}%`
          : "Stochastic",
    },
  ];

  return (
    <Card variant="sunken">
      <CardHeader>
        <span className="text-heading-sm font-semibold text-text-primary">Parameter differences</span>
      </CardHeader>
      <CardBody>
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Field</TableHeaderCell>
              <TableHeaderCell>{base.name}</TableHeaderCell>
              <TableHeaderCell>{comp.name}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const differs = r.base !== r.comp;
              return (
                <TableRow key={r.label} className={cn(differs && "bg-[var(--color-primary-soft)]/15")}>
                  <TableCell className="text-text-secondary">{r.label}</TableCell>
                  <TableCell>{r.base}</TableCell>
                  <TableCell>{r.comp}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}

function DeltaMetrics({ base, comp }: { base: SimulationResult; comp: SimulationResult }) {
  const deltas = [
    {
      label: "Success Rate",
      baseVal: formatPercent5pp(base.successRate),
      compVal: formatPercent5pp(comp.successRate),
      diff: comp.successRate - base.successRate,
      formatDiff: (d: number) => `${d > 0 ? "+" : ""}${formatPercent(d, 0)}`,
    },
    {
      label: "Median Portfolio",
      baseVal: formatCurrency(base.medianPortfolioAtRetirement, {
        compact: true,
      }),
      compVal: formatCurrency(comp.medianPortfolioAtRetirement, {
        compact: true,
      }),
      diff: comp.medianPortfolioAtRetirement - base.medianPortfolioAtRetirement,
      formatDiff: (d: number) => `${d > 0 ? "+" : ""}${formatCurrency(d, { compact: true })}`,
    },
    {
      label: "Confidence Age",
      baseVal: `${base.confidenceAge}`,
      compVal: `${comp.confidenceAge}`,
      diff: comp.confidenceAge - base.confidenceAge,
      formatDiff: (d: number) => `${d > 0 ? "+" : ""}${d} year${Math.abs(d) !== 1 ? "s" : ""}`,
    },
    {
      label: "Adjustment Risk",
      baseVal: formatPercent(base.adjustmentProbability, 0),
      compVal: formatPercent(comp.adjustmentProbability, 0),
      diff: comp.adjustmentProbability - base.adjustmentProbability,
      formatDiff: (d: number) => `${d > 0 ? "+" : ""}${formatPercent(d, 0)}`,
      invertColor: true,
    },
  ];

  return (
    <Card variant="surface" className="grid grid-cols-2 lg:grid-cols-4">
      {deltas.map((d, i) => {
        const isPositive = d.invertColor ? d.diff < 0 : d.diff > 0;
        const isNegative = d.invertColor ? d.diff > 0 : d.diff < 0;

        return (
          <div
            key={d.label}
            className={cn(
              "flex flex-col gap-[var(--space-2)] px-[var(--space-5)] py-[var(--space-5)]",
              i > 0 &&
                "border-l border-[var(--color-border-subtle)] max-lg:odd:border-l-0 max-lg:[&:nth-child(2)]:border-l-0 max-lg:[&:nth-child(3)]:border-t max-lg:[&:nth-child(4)]:border-t",
            )}
          >
            <span className="text-overline text-text-tertiary">{d.label}</span>
            <div className="flex items-baseline gap-[var(--space-3)] text-body-sm tabular-nums">
              <span className="text-text-secondary">{d.baseVal}</span>
              <span className="text-text-disabled">vs</span>
              <span className="text-text-secondary">{d.compVal}</span>
            </div>
            <span
              className={cn(
                "text-body font-semibold tabular-nums",
                isPositive && "text-[var(--color-success)]",
                isNegative && "text-[var(--color-danger)]",
                d.diff === 0 && "text-text-tertiary",
              )}
            >
              {d.diff === 0 ? "No change" : d.formatDiff(d.diff)}
            </span>
          </div>
        );
      })}
    </Card>
  );
}
