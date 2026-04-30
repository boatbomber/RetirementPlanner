import type { Scenario } from "@/models/scenario";
import type { SimulationResult } from "@/models/results";
import type { Age, Dollars, Rate } from "@/models/core";
import type { GoalQuestion, GoalTargets, SolverResult } from "@/models/goal";

// Default Monte Carlo iteration count during binary search. At p=0.85, n=1500
// the binomial stderr is ~0.9pp, fine-grained enough to bisect against a
// success-rate target while running ~6.7× faster than the default 10k.
export const SEARCH_ITERATIONS = 1500;

// Hard cap on binary-search steps. Q1 (integer ages over ~30 years) converges
// in ~5 steps; Q2/Q3 (continuous over ~10× range) typically in 8–10 steps.
// 12 leaves headroom without burning a noticeable amount of extra time.
const MAX_SEARCH_STEPS = 12;

// Convergence tolerances for non-integer searches.
const SAVINGS_TOLERANCE = 600; // ±$600/yr ≈ ±$50/mo
const SPEND_TOLERANCE = 600; // ±$50/mo

import { SEED_FALLBACK } from "./prng";

// What the user is asking the solver to figure out.
export interface SolveInput {
  question: GoalQuestion;
  targets: GoalTargets;
  // Override default search bounds. Defaults are picked so callers can omit
  // them; auto-solve does not pass these.
  earliestAge?: Age;
  latestAge?: Age;
}

// Solver dispatches each trial via this callback so the same algorithm can
// run against the synchronous main-thread `runSimulation` (in tests) or a
// worker-pool fan-out (in production).
export type TrialRunner = (
  scenario: Scenario,
  opts: { iterations: number; seed: number },
) => Promise<SimulationResult>;

export interface SolveOptions {
  // Defaults to scenario.simulationConfig.iterations.
  validationIterations?: number;
  // Defaults to SEARCH_ITERATIONS.
  searchIterations?: number;
  // Fired before each trial; useful for driving a progress bar.
  // `bestSoFar` is null until the search has identified a feasible value.
  onProgress?: (step: number, totalSteps: number, bestSoFar: number | null) => void;
  signal?: AbortSignal;
}

// ─── Solver fingerprint ────────────────────────────────────────────────────
// Bump when solver behavior changes in a way that should invalidate stored
// caches. The version is mixed into the hash so persisted goals from older
// builds are treated as stale and auto-solve re-runs them.
//   v2: Q1 floor lowered from 50 to currentAge so users targeting <50 get
//       a sensible answer.
//   v3: Q2 reframed as absolute minimum total contribution (was: additional
//       delta beyond current). SolverResult gains medianPortfolioAtRetirement.
//   v4: IncomeSource.endsAtRetirement replaces the implicit wage-like
//       retirement cutoff. Pre-v4 caches were computed under the old rule.
//   v5: Engine fixes. Self-owned contributions now stop at retirement (was
//       adding to balance from thin air); pre-retirement surplus is no
//       longer auto-saved to a cash sink. Both inflated success rates for
//       high-income scenarios under v4.
//   v6: SolverResult.wealthPath added (slim p25/p50/p75 by age from the
//       validation run). Caches without it would render the dashboard
//       GoalGapCard chart empty until re-solved.
//   v7: wealthPath band widened to p10/p90 so the dashboard chart shows
//       real downside exposure (p25/p75 hid the failure tail at the 90%
//       success target).
const SOLVER_VERSION = "v7";

// Hashes only the fields the solver actually depends on. Excludes
// scenario.goal (would self-invalidate the cache it lives in) and decorative
// fields (name, color, description, parentId, isBaseline, timestamps) that
// don't affect simulation outcomes.
export function solverFingerprint(s: Scenario): string {
  const subset = {
    profile: s.profile,
    accounts: s.accounts,
    incomeSources: s.incomeSources,
    expenses: s.expenses,
    lifeEvents: s.lifeEvents,
    socialSecurity: s.socialSecurity,
    withdrawalStrategy: s.withdrawalStrategy,
    withdrawalOrder: s.withdrawalOrder,
    simulationConfig: s.simulationConfig,
  };
  return djb2(SOLVER_VERSION + "|" + JSON.stringify(subset));
}

// Same algorithm as `fingerprint()` in useSimulation.ts:23. Kept inline here
// to avoid pulling that module's React dependencies into engine code.
function djb2(str: string): string {
  let h = 0 | 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

// ─── Scenario-mutation helpers ─────────────────────────────────────────────

function currentAge(scenario: Scenario, today = new Date()): Age {
  // Mirrors precompute()'s currentAge calculation so the solver and engine
  // agree on "where the user is today".
  return today.getFullYear() - scenario.profile.birthYear;
}

// Sum of expenses active at a given age (excluding one_time, which fire once
// and aren't part of the steady retirement spend). Used both as a baseline
// for spend-scaling and as the starting bound for sustainable_spend search.
function retirementBaselineSpend(scenario: Scenario, atAge: Age): Dollars {
  let total = 0;
  for (const e of scenario.expenses) {
    if (e.category === "one_time") continue;
    const startsBy = e.startAge <= atAge;
    const endsAfter = e.endAge == null || e.endAge >= atAge;
    if (startsBy && endsAfter) total += e.annualAmount;
  }
  return total;
}

// Scale retirement-period expenses uniformly so their sum at retirement age
// matches `targetSpend`. Pre-retirement expenses are untouched, since scaling
// them would corrupt the working-years savings rate, breaking the search
// premise.
// When the scenario has no retirement-period expenses yet, synthesize a
// single placeholder (essential category) so the engine sees the demand.
export function applyTargetSpend(scenario: Scenario, targetSpend: Dollars): Scenario {
  const refAge = scenario.profile.retirementAge;
  const baseline = retirementBaselineSpend(scenario, refAge);
  if (baseline <= 0) {
    return {
      ...scenario,
      expenses: [
        ...scenario.expenses,
        {
          id: "solver-target-spend",
          label: "Target spend (solver)",
          category: "essential",
          annualAmount: targetSpend,
          startAge: refAge,
          endAge: null,
          inflationRate: null,
        },
      ],
    };
  }
  const factor = targetSpend / baseline;
  return {
    ...scenario,
    expenses: scenario.expenses.map((e) => {
      if (e.category === "one_time") return e;
      const startsBy = e.startAge <= refAge;
      const endsAfter = e.endAge == null || e.endAge >= refAge;
      return startsBy && endsAfter ? { ...e, annualAmount: e.annualAmount * factor } : e;
    }),
  };
}

// Set retirementAge on profile and (when present) shift spouse's retirement
// in lockstep by the same delta. Searching only the user's age while pinning
// a spouse to an unrelated age produces nonsensical scenarios where one
// partner retires decades before the other.
function setRetirementAge(scenario: Scenario, age: Age): Scenario {
  const original = scenario.profile.retirementAge;
  const delta = age - original;
  return {
    ...scenario,
    profile: {
      ...scenario.profile,
      retirementAge: age,
      spouse: scenario.profile.spouse
        ? { ...scenario.profile.spouse, retirementAge: scenario.profile.spouse.retirementAge + delta }
        : null,
    },
  };
}

// Reset contribution-eligible accounts to a target absolute total annual
// contribution, distributing proportionally to current contributions (or
// evenly across eligible accounts when all current contributions are zero).
// Ineligible accounts (contributionEndAge < refAge) are untouched. Used by
// the required_savings solver to evaluate "what if total savings were X?"
// at each binary-search step.
export function setTotalContribution(scenario: Scenario, total: Dollars): Scenario {
  const refAge = scenario.profile.retirementAge;
  const eligible = scenario.accounts.filter((a) => a.contributionEndAge >= refAge);
  if (eligible.length === 0) return scenario;

  const eligibleIds = new Set(eligible.map((a) => a.id));
  const currentTotal = eligible.reduce((s, a) => s + a.annualContribution, 0);

  return {
    ...scenario,
    accounts: scenario.accounts.map((a) => {
      if (!eligibleIds.has(a.id)) return a;
      const newContribution =
        currentTotal > 0 ? total * (a.annualContribution / currentTotal) : total / eligible.length;
      return { ...a, annualContribution: newContribution };
    }),
  };
}

// ─── Trial scenario factory ────────────────────────────────────────────────

interface TrialContext {
  lo: number;
  hi: number;
  isInteger: boolean;
  // Higher x ⇒ higher success (true for Q1/Q2). False for Q3 (sustainable
  // spend), where a higher target spend reduces success.
  monotonicIncreasing: boolean;
  applyVar: (x: number) => Scenario;
}

function buildContext(scenario: Scenario, input: SolveInput): TrialContext {
  switch (input.question) {
    case "earliest_retirement_age": {
      const horizon = scenario.profile.planningHorizonAge;
      // Floor the search at currentAge. Anything earlier is in the past.
      // The caller-provided earliestAge is just a hint; it must not raise the
      // floor above the user's current age (a 35-year-old asking "when can I
      // retire?" should be able to learn the answer is 38 if it is).
      const minSearchAge = Math.max(currentAge(scenario), input.earliestAge ?? 0);
      const maxSearchAge = Math.min(horizon - 5, input.latestAge ?? 75);
      const withSpend = applyTargetSpend(scenario, input.targets.annualSpend);
      return {
        lo: minSearchAge,
        hi: Math.max(minSearchAge, maxSearchAge),
        isInteger: true,
        monotonicIncreasing: true,
        applyVar: (age) => setRetirementAge(withSpend, age),
      };
    }
    case "required_savings": {
      // Search over absolute total annual contribution. The result is the
      // minimum total savings that achieves the target, not the delta from
      // current. Lets the dashboard show the threshold even when the user
      // is over-saving (where a delta-based search would just return 0).
      const currentTotal = scenario.accounts.reduce((s, a) => s + a.annualContribution, 0);
      const withSpend = applyTargetSpend(scenario, input.targets.annualSpend);
      const withRA = setRetirementAge(withSpend, input.targets.retirementAge);
      return {
        lo: 0,
        hi: Math.max(200_000, currentTotal * 5),
        isInteger: false,
        monotonicIncreasing: true,
        applyVar: (total) => setTotalContribution(withRA, total),
      };
    }
    case "sustainable_spend": {
      const refAge = input.targets.retirementAge;
      const withRA = setRetirementAge(scenario, refAge);
      const baseline = retirementBaselineSpend(withRA, refAge);
      // Even when baseline is zero (no retirement expenses defined), we want
      // a sane upper bound. applyTargetSpend will synthesize an expense.
      const seed = baseline > 0 ? baseline : 50_000;
      return {
        lo: 10_000,
        hi: Math.max(500_000, seed * 3),
        isInteger: false,
        monotonicIncreasing: false,
        applyVar: (spend) => applyTargetSpend(withRA, spend),
      };
    }
  }
}

// ─── Main solve() entry ────────────────────────────────────────────────────

export async function solve(
  scenario: Scenario,
  input: SolveInput,
  runTrial: TrialRunner,
  opts: SolveOptions = {},
): Promise<SolverResult> {
  const seed = scenario.simulationConfig.seed ?? SEED_FALLBACK;
  const searchIters = opts.searchIterations ?? SEARCH_ITERATIONS;
  const validateIters = opts.validationIterations ?? scenario.simulationConfig.iterations;

  const ctx = buildContext(scenario, input);
  // Total reported steps in onProgress = search budget + 1 validation step.
  const totalReported = MAX_SEARCH_STEPS + 1;

  const trialAt = async (x: number): Promise<Rate> => {
    if (opts.signal?.aborted) throw new Error("Solver aborted");
    const trial = ctx.applyVar(x);
    const result = await runTrial(trial, { iterations: searchIters, seed });
    return result.successRate;
  };

  // Binary search.
  let lo = ctx.lo;
  let hi = ctx.hi;
  let best: number | null = null;
  let converged = false;
  let stepsTaken = 0;

  for (stepsTaken = 0; stepsTaken < MAX_SEARCH_STEPS; stepsTaken++) {
    if (opts.signal?.aborted) throw new Error("Solver aborted");
    if (ctx.isInteger) {
      if (lo > hi) {
        converged = true;
        break;
      }
    } else {
      const tol = input.question === "required_savings" ? SAVINGS_TOLERANCE : SPEND_TOLERANCE;
      if (hi - lo < tol) {
        converged = true;
        break;
      }
    }

    opts.onProgress?.(stepsTaken, totalReported, best);
    const mid = ctx.isInteger ? Math.floor((lo + hi) / 2) : (lo + hi) / 2;
    const sr = await trialAt(mid);
    const meetsTarget = sr >= input.targets.successRate;

    if (ctx.monotonicIncreasing) {
      // Higher x ⇒ higher success. We want the smallest x meeting target.
      if (meetsTarget) {
        best = mid;
        hi = ctx.isInteger ? mid - 1 : mid;
      } else {
        lo = ctx.isInteger ? mid + 1 : mid;
      }
    } else {
      // Higher x ⇒ lower success. We want the largest x meeting target.
      if (meetsTarget) {
        best = mid;
        lo = ctx.isInteger ? mid + 1 : mid;
      } else {
        hi = ctx.isInteger ? mid - 1 : mid;
      }
    }

    if (!ctx.isInteger && Math.abs(hi - lo) < 1) {
      // Numerical floor: treat sub-$1 ranges as converged regardless of
      // tolerance. Avoids infinite-bisect drift on degenerate scenarios.
      converged = true;
      break;
    }
  }

  // Fallback when no bracketed value met the target. Pick the bound closest
  // to "best feasible" given the question's monotonicity. Caller sees
  // converged=false in this case so the UI can warn.
  if (best === null) {
    best = ctx.monotonicIncreasing ? ctx.hi : ctx.lo;
    converged = false;
  }

  // Validation pass at full iterations on the solved value.
  opts.onProgress?.(MAX_SEARCH_STEPS, totalReported, best);
  const finalScenario = ctx.applyVar(best);
  const validated = await runTrial(finalScenario, { iterations: validateIters, seed });
  opts.onProgress?.(totalReported, totalReported, best);

  return {
    question: input.question,
    solvedValue: best,
    achievedSuccessRate: validated.successRate,
    converged,
    searchBoundsLo: ctx.lo,
    searchBoundsHi: ctx.hi,
    medianPortfolioAtRetirement: validated.medianPortfolioAtRetirement,
    wealthPath: validated.wealthByYear.map((d) => ({
      age: d.age,
      p10: d.p10,
      p50: d.p50,
      p90: d.p90,
    })),
  };
}
