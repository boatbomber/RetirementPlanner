import type { UUID, Dollars, Rate, Age, Year, Sex } from "@/models/core";
import type { AccountType, AssetAllocation, GlidePathPoint } from "@/models/account";
import type { Owner } from "@/models/core";
import type { SimulationResult } from "@/models/results";
import type { Scenario } from "@/models/scenario";

export interface AccountState {
  id: UUID;
  owner: Owner;
  type: AccountType;
  balance: Dollars;
  costBasis: Dollars;
  annualContribution: Dollars;
  employerMatch: Dollars;
  contributionEndAge: Age;
  allocation: AssetAllocation;
  baseAllocation: AssetAllocation;
  useGlidePath: boolean;
  glidePath: GlidePathPoint[];
  fixedAnnualReturn: Rate | null;
}

export interface AnnualSnapshot {
  age: Age;
  year: Year;
  totalWealth: Dollars;
  totalIncome: Dollars;
  totalSpending: Dollars;
  totalTax: Dollars;
  // Portion of totalTax attributable to IRC §72(t) / §223(f)(4) / §530(d)(4)
  // additional taxes on premature account distributions. Always ≤ totalTax.
  earlyWithdrawalPenalty: Dollars;
  ssIncome: Dollars;
  withdrawals: Dollars;
  contributions: Dollars;
  rmdAmount: Dollars;
  rothConversion: Dollars;
  // Per-account balances, indexed by position in `PrecomputedConfig.initialAccounts`
  // (NOT keyed by account UUID, since keeping a Float64Array drops 720k+
  // object allocations and 720k+ string-keyed lookups across a typical
  // 10k-iter sim). Aggregation maps positions back to UUIDs when
  // materializing the result.
  accountBalances: Float64Array;
  isRuined: boolean;
}

export interface IterationResult {
  snapshots: AnnualSnapshot[];
  terminalWealth: Dollars;
  depletionAge: Age | null;
  maxSpendingCut: Rate;
}

// Transferable, columnar layout of one worker's iteration set. Replaces the
// IterationResult[] structured-clone payload, since transferring 15 typed-
// array buffers is near-zero-cost, while structured-cloning ~21 MB of nested
// IterationResult objects costs 600–1500 ms per worker on Chrome. Layouts are
// row-major with iterIdx as the outer dimension so a worker's contribution
// to one (metric × year) cell is a contiguous slice.
//
// All buffer fields are Float64Array | Int32Array so each `.buffer` slot can
// be passed in postMessage's transfer list.
export interface PackedIterations {
  numIters: number;
  numYears: number;
  numAccounts: number;

  // Per-snapshot scalars, [iterIdx * numYears + year]:
  totalWealth: Float64Array;
  totalIncome: Float64Array;
  totalSpending: Float64Array;
  totalTax: Float64Array;
  earlyWithdrawalPenalty: Float64Array;
  ssIncome: Float64Array;
  withdrawals: Float64Array;
  contributions: Float64Array;
  rmdAmount: Float64Array;
  rothConversion: Float64Array;

  // Per-account balances, [iterIdx * numYears * numAccounts + year * numAccounts + acctIdx]:
  accountBalances: Float64Array;

  // Per-iteration scalars:
  snapshotLength: Int32Array; // mortality may end an iter early
  terminalWealth: Float64Array;
  depletionAge: Int32Array; // -1 sentinel = null (Age otherwise)
  maxSpendingCut: Float64Array;
}

export interface AssetReturns {
  usLargeCap: Rate;
  usSmallCap: Rate;
  intlDeveloped: Rate;
  intlEmerging: Rate;
  usBonds: Rate;
  tips: Rate;
  cash: Rate;
}

export interface PrecomputedIncome {
  sourceId: UUID;
  amount: Dollars;
  taxable: boolean;
  owner: Owner;
  inflationAdjusted: boolean;
  // Wage-like sources stop at the owner's retirement age (salary, self-
  // employment, bonus, part-time). Non-wage sources (pension, annuity, rental,
  // royalty, other) continue regardless.
  isWageLike: boolean;
}

export interface PrecomputedExpense {
  expenseId: UUID;
  amount: Dollars;
  inflationRate: Rate | null;
  // Age at which the expense amount is denominated. The amount is in dollars
  // of the year at this age; subsequent inflation is layered on top.
  baseAge: Age;
  // Used by the engine to apply category-specific behavior (e.g. healthcare
  // gets a 2× CPI bump for ages 85+).
  category: string;
}

export interface PrecomputedConfig {
  startAge: Age;
  endAge: Age;
  startYear: Year;
  birthYear: Year;
  retirementAge: Age;
  // The spouse's individual retirement age. Engine uses it to cap spouse-owned
  // income earnings and account contributions at the spouse's transition.
  // Null when not married.
  spouseRetirementAge: Age | null;
  isMarried: boolean;
  selfSex: Sex;
  spouseSex: Sex | null;
  spouseBirthYear: Year | null;
  selfBirthMonth: number;
  spouseBirthMonth: number | null;
  choleskyLow: number[][];
  choleskyHigh: number[][];
  incomeByAge: Map<Age, PrecomputedIncome[]>;
  expenseByAge: Map<Age, PrecomputedExpense[]>;
  contributionOverridesByAge: Map<Age, Map<UUID, Dollars>>;
  lifeEventsByAge: Map<Age, Scenario["lifeEvents"]>;
  initialAccounts: AccountState[];
  // Pre-interpolated glide-path allocations indexed by [accountIdx][y].
  // y = age - startAge. Built once in `precompute()`; the iteration loop
  // reads this instead of running interpolateGlidePath per account per year.
  allocationsByAccountAge: AssetAllocation[][];
  ssConfig: Scenario["socialSecurity"];
  withdrawalStrategy: Scenario["withdrawalStrategy"];
  withdrawalOrder: Scenario["withdrawalOrder"];
  simulationConfig: Scenario["simulationConfig"];
  // Engine-side data-quality warnings produced during precompute (e.g.,
  // correlation matrix not positive-definite). Carried into SimulationResult.
  warnings: string[];
  // US state abbreviation, used for simplified flat-rate state income tax.
  // Empty string ⇒ no state tax modeled.
  stateOfResidence: string;
}

export interface WithdrawalState {
  initialTotalBalance: Dollars;
  // Total balance snapped at the start of retirement (yearsInRetirement === 0).
  // Distinct from initialTotalBalance, which is the simulation-start balance.
  // For users running pre-retirement years, those differ. Strategies whose
  // anchor is the retirement-day portfolio (Bengen, Kitces ratchet) read this.
  retirementBalance: Dollars;
  priorYearSpending: Dollars;
  priorYearReturn: Rate;
  cumulativeInflation: number;
  currentYearInflation: Rate;
  yearsInRetirement: number;
  currentAge: Age;
  endAge: Age;
  priorYearWithdrawalRate: Rate;
  // Portfolio-level expected return / volatility derived from CMA × current
  // weighted allocation. Used by risk-based strategy as a fallback when
  // explicit overrides are not supplied.
  portfolioExpectedReturn: Rate;
  portfolioVolatility: Rate;
  // Aggregate weight in equity asset classes (US large/small + intl
  // developed/emerging) across all risk-bearing account balances. Used by
  // VPW to look up the right column of the table without inferring from
  // expected return.
  portfolioEquityWeight: Rate;
}

export type WorkerRequest =
  | {
      type: "RUN_SIMULATION";
      scenarioId: UUID;
      scenario: Scenario;
    }
  | {
      // Partial-execution mode used by the worker pool: each pool worker runs
      // `count` iterations with seed `baseSeed + partialIdx`, returns just
      // the iteration set (no aggregation). Orchestrator merges + aggregates.
      type: "RUN_PARTIAL";
      scenarioId: UUID;
      scenario: Scenario;
      partialIdx: number;
      totalPartials: number;
      count: number;
      seed: number;
    }
  | {
      // Aggregate mode: one of the pool workers receives all partials and
      // produces the final SimulationResult. The orchestrator transfers each
      // worker's PackedIterations buffers (zero-copy), so the main thread
      // stays responsive throughout.
      type: "RUN_AGGREGATE";
      scenarioId: UUID;
      scenario: Scenario;
      partials: PackedIterations[];
      durationMs: number;
    }
  | { type: "CANCEL"; scenarioId: UUID };

export type WorkerResponse =
  | {
      type: "PROGRESS";
      scenarioId: UUID;
      completed: number;
      total: number;
      // Identifies which pool worker the report is from, so the orchestrator
      // can track per-worker progress and sum (not average) for an accurate
      // global "completed / total" without overshoot.
      partialIdx?: number;
    }
  | {
      // Per-pool-worker iteration result for an in-flight RUN_PARTIAL.
      // `packed` is sent with a transfer list of all underlying buffers so
      // the postMessage is zero-copy.
      type: "PARTIAL_RESULT";
      scenarioId: UUID;
      partialIdx: number;
      packed: PackedIterations;
    }
  | {
      type: "RESULT";
      scenarioId: UUID;
      result: SimulationResult;
    }
  | {
      type: "ERROR";
      scenarioId: UUID;
      error: string;
    };
