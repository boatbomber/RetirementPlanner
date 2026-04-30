import type { UUID, Year, Age, Dollars, Rate } from "./core";
import type { SimulationConfig } from "./simulation-config";

export interface YearlyPercentiles {
  year: Year;
  age: Age;
  p5: Dollars;
  p10: Dollars;
  p25: Dollars;
  p50: Dollars;
  p75: Dollars;
  p90: Dollars;
  p95: Dollars;
}

export interface WealthBucket {
  min: Dollars;
  max: Dollars;
  count: number;
}

export interface DepletionAgeBucket {
  age: Age;
  count: number;
}

export interface AccountBalanceSeries {
  accountId: UUID;
  byYear: YearlyPercentiles[];
}

export interface SimulationResult {
  scenarioId: UUID;
  timestamp: string;
  configSnapshot: SimulationConfig;
  durationMs: number;

  successRate: Rate;
  medianTerminalWealth: Dollars;
  medianPortfolioAtRetirement: Dollars;
  estimatedRetirementAge: Age;
  confidenceAge: Age;

  wealthByYear: YearlyPercentiles[];
  incomeByYear: YearlyPercentiles[];
  spendingByYear: YearlyPercentiles[];
  taxByYear: YearlyPercentiles[];
  ssIncomeByYear: YearlyPercentiles[];
  withdrawalsByYear: YearlyPercentiles[];
  rmdByYear: YearlyPercentiles[];
  rothConversionByYear: YearlyPercentiles[];

  // Per-account balance series, one entry per Account.id in the scenario
  accountBalancesByYear: AccountBalanceSeries[];

  adjustmentProbability: Rate;
  medianMaxCutPercent: Rate;
  p90MaxCutPercent: Rate;

  terminalWealthBuckets: WealthBucket[];
  depletionAgeBuckets: DepletionAgeBucket[];

  // Engine-side data-quality warnings (e.g., correlation matrix not
  // positive-definite). Surfaced per-scenario so users see them on the
  // results page rather than buried in the browser console (and once-per-
  // process at that). Empty array when no warnings.
  warnings: string[];
}
