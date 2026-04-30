import type { Age, Dollars, Rate } from "./core";

// Which canned solver question produced the result.
//   - earliest_retirement_age: free var = retirementAge
//   - required_savings:        free var = minimum total annual contribution
//                              (across all contribution-eligible accounts)
//   - sustainable_spend:       free var = annual spend (multiplier on expenses)
export type GoalQuestion = "earliest_retirement_age" | "required_savings" | "sustainable_spend";

// Solver inputs (target retirement age, target spend, target success rate).
// Derived from the scenario at solve time; not user-edited or persisted.
export interface GoalTargets {
  retirementAge: Age;
  annualSpend: Dollars;
  successRate: Rate;
}

// Slim per-year wealth summary captured from the solver's validation run.
// Drives the small chart on the dashboard's GoalGapCard. Stores p10/p50/p90,
// wider than p25/p75 so the band honestly conveys the downside risk
// (with a 90% success target, ~10% of paths fail; a p25 floor would hide
// that and make scenarios look safer than they are).
export interface WealthPathPoint {
  age: Age;
  p10: Dollars;
  p50: Dollars;
  p90: Dollars;
}

// One run of the binary-search solver. Cached per question so the dashboard
// can render values without re-solving on every navigation.
export interface SolverResult {
  question: GoalQuestion;
  // Semantics depend on `question`:
  //   earliest_retirement_age → Age (years)
  //   required_savings        → Dollars (minimum total annual contribution)
  //   sustainable_spend       → Dollars (annual spend)
  solvedValue: number;
  // Empirical success rate of the solved configuration at full iterations.
  achievedSuccessRate: Rate;
  converged: boolean;
  searchBoundsLo: number;
  searchBoundsHi: number;
  // Median portfolio balance at the retirement age used in the validation
  // run. For Q1 this is the projected wealth at the solved earliest age;
  // for Q2/Q3 it's at the user's target retirement age.
  medianPortfolioAtRetirement?: Dollars;
  // Validation-run wealth path (p25/p50/p75 by age). For Q1 this is the
  // path under the solved early-retirement age; for Q2 it's the path under
  // the minimum required savings level at the user's target retirement age.
  wealthPath?: WealthPathPoint[];
}

// Cached solver outputs for the active scenario. Auto-solve refreshes this
// whenever the scenario changes; the dashboard reads from it directly.
export interface Goal {
  cache: Partial<Record<GoalQuestion, SolverResult>>;
  // Hash of solver-relevant scenario fields at the time the cache was
  // produced. Compared against a freshly computed hash to detect stale cache;
  // null until auto-solve has populated the cache at least once.
  fingerprint: string | null;
  lastSolvedAt: string | null;
}
