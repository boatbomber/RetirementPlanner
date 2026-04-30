import { FanChart } from "@/components/charts/FanChart";
import { HistogramChart } from "@/components/charts/HistogramChart";
import { IncomeCompositionChart } from "@/components/charts/IncomeCompositionChart";
import { SuccessRateGauge } from "@/components/charts/SuccessRateGauge";
import type { YearlyPercentiles, WealthBucket } from "@/models/results";

// Synthetic projection so the showcase doesn't require a live simulation.
function makeWealthSeries(): YearlyPercentiles[] {
  return Array.from({ length: 35 }, (_, i) => {
    const age = 35 + i;
    const base = 100_000 * Math.pow(1.07, i);
    return {
      year: 2026 + i,
      age,
      p5: base * 0.5,
      p10: base * 0.65,
      p25: base * 0.8,
      p50: base,
      p75: base * 1.25,
      p90: base * 1.5,
      p95: base * 1.85,
    };
  });
}

function makeIncomeSeries(): YearlyPercentiles[] {
  return Array.from({ length: 35 }, (_, i) => {
    const age = 35 + i;
    const v = age < 65 ? 90_000 + i * 1500 : 60_000 + (age - 65) * 1000;
    return {
      year: 2026 + i,
      age,
      p5: v * 0.85,
      p10: v * 0.9,
      p25: v * 0.95,
      p50: v,
      p75: v * 1.05,
      p90: v * 1.1,
      p95: v * 1.15,
    };
  });
}

function makeSpendingSeries(): YearlyPercentiles[] {
  return Array.from({ length: 35 }, (_, i) => {
    const age = 35 + i;
    const v = age < 65 ? 0 : 60_000 + (age - 65) * 800;
    return {
      year: 2026 + i,
      age,
      p5: v * 0.85,
      p10: v * 0.9,
      p25: v * 0.95,
      p50: v,
      p75: v * 1.05,
      p90: v * 1.1,
      p95: v * 1.15,
    };
  });
}

function makeTaxSeries(): YearlyPercentiles[] {
  return Array.from({ length: 35 }, (_, i) => {
    const age = 35 + i;
    const v = age < 65 ? 18_000 + i * 200 : 8_000 + (age - 65) * 100;
    return {
      year: 2026 + i,
      age,
      p5: v * 0.85,
      p10: v * 0.9,
      p25: v * 0.95,
      p50: v,
      p75: v * 1.05,
      p90: v * 1.1,
      p95: v * 1.15,
    };
  });
}

function makeBuckets(): WealthBucket[] {
  return [
    { min: 0, max: 100_000, count: 50 },
    { min: 100_000, max: 250_000, count: 150 },
    { min: 250_000, max: 500_000, count: 350 },
    { min: 500_000, max: 1_000_000, count: 280 },
    { min: 1_000_000, max: 2_500_000, count: 130 },
    { min: 2_500_000, max: Infinity, count: 40 },
  ];
}

export function ChartsSection() {
  const wealth = makeWealthSeries();
  const income = makeIncomeSeries();
  const spending = makeSpendingSeries();
  const tax = makeTaxSeries();
  const buckets = makeBuckets();

  return (
    <section className="flex flex-col gap-[var(--space-7)]">
      <div>
        <h2 className="text-metric-lg font-semibold tracking-tight text-text-primary">Charts</h2>
        <p className="mt-1 text-body text-text-secondary">
          visx-based theme-sensitive charts. All read viz tokens (--viz-1..8) so they re-color when the theme
          changes.
        </p>
      </div>

      <div className="flex flex-col gap-[var(--space-7)]">
        <div className="flex items-center gap-[var(--space-5)]">
          <span className="text-body-sm text-text-secondary">SuccessRateGauge</span>
          <SuccessRateGauge value={0.92} size={48} />
          <SuccessRateGauge value={0.7} size={48} />
          <SuccessRateGauge value={0.4} size={48} />
        </div>

        <FanChart data={wealth} retirementAge={65} currentAge={35} events={[]} />
        <IncomeCompositionChart
          income={income}
          spending={spending}
          tax={tax}
          retirementAge={65}
          events={[]}
        />
        <HistogramChart data={buckets} totalIterations={1000} />
      </div>
    </section>
  );
}
