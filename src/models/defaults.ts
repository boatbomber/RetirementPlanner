import type { AssetAllocation } from "./account";
import type { SocialSecurityPerson, SocialSecurityConfig } from "./social-security";
import type { WithdrawalStrategy, WithdrawalOrder, FixedRealParams } from "./withdrawal";
import type { CMA, SimulationConfig } from "./simulation-config";
import type { UserProfile } from "./profile";
import type { Scenario } from "./scenario";
import type { Year, Age } from "./core";

// SSA Full Retirement Age by birth year, official schedule.
// Source: https://www.ssa.gov/retirement/full-retirement-age
export function fraForBirthYear(birthYear: Year): Age {
  if (birthYear <= 1937) return 65;
  if (birthYear <= 1942) return 65 + (birthYear - 1937) * (2 / 12);
  if (birthYear <= 1954) return 66;
  if (birthYear <= 1959) return 66 + (birthYear - 1954) * (2 / 12);
  return 67;
}

export const DEFAULT_ALLOCATION: AssetAllocation = {
  usLargeCap: 0.56,
  usSmallCap: 0.12,
  intlDeveloped: 0.12,
  intlEmerging: 0,
  usBonds: 0.17,
  tips: 0.03,
  cash: 0,
};

// All-cash allocation, used as the implicit allocation for cash-like fixed-
// interest accounts (HYSA / CD / Money Market) where the user shouldn't have
// to specify an asset mix.
export const CASH_ALLOCATION: AssetAllocation = {
  usLargeCap: 0,
  usSmallCap: 0,
  intlDeveloped: 0,
  intlEmerging: 0,
  usBonds: 0,
  tips: 0,
  cash: 1,
};

export const DEFAULT_CMA: CMA = {
  usLargeCap: { arithmeticMean: 0.055, stdDev: 0.185 },
  usSmallCap: { arithmeticMean: 0.065, stdDev: 0.22 },
  intlDeveloped: { arithmeticMean: 0.065, stdDev: 0.19 },
  intlEmerging: { arithmeticMean: 0.075, stdDev: 0.24 },
  usBonds: { arithmeticMean: 0.0175, stdDev: 0.065 },
  tips: { arithmeticMean: 0.018, stdDev: 0.05 },
  cash: { arithmeticMean: 0.005, stdDev: 0.02 },
  stockBondCorrelationLow: -0.3,
  stockBondCorrelationHigh: 0.5,
};

export const DEFAULT_SS_PERSON: SocialSecurityPerson = {
  enabled: true,
  fraMonthlyBenefit: 0,
  claimingAge: 67,
  fra: 67,
};

export function makeSsPersonForBirthYear(birthYear: Year): SocialSecurityPerson {
  const fra = fraForBirthYear(birthYear);
  return {
    enabled: true,
    fraMonthlyBenefit: 0,
    claimingAge: Math.max(67, Math.ceil(fra)),
    fra,
  };
}

export const DEFAULT_SS_CONFIG: SocialSecurityConfig = {
  self: { ...DEFAULT_SS_PERSON },
  spouse: null,
  colaRate: 0.025,
  useSolvencyHaircut: false,
  solvencyHaircutYear: 2034,
  solvencyHaircutFactor: 0.79,
};

export const DEFAULT_WITHDRAWAL_STRATEGY: WithdrawalStrategy = {
  type: "fixed_real",
  params: { withdrawalRate: 0.04 } satisfies FixedRealParams,
  useSpendingSmile: false,
};

export const DEFAULT_WITHDRAWAL_ORDER: WithdrawalOrder = {
  type: "conventional",
  rothConversionEnabled: false,
  rothConversionTargetBracket: 0.22,
  bracketFillingTargetBracket: 0.12,
  customOrder: [],
};

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  iterations: 10_000,
  method: "parametric_lognormal",
  seed: null,
  inflationMode: "stochastic",
  fixedInflationRate: 0.025,
  stochasticInflation: {
    longRunMean: 0.025,
    phi: 0.5,
    sigma: 0.012,
  },
  inflationRegimeThreshold: 0.03,
  capitalMarketAssumptions: DEFAULT_CMA,
  longevityModel: "fixed_age",
  fixedEndAge: 95,
  mortalityTable: "ssa_period",
  mortalityImprovement: true,
};

// Mirrors the data-viz palette tokens (`--viz-1` .. `--viz-8`).
const SCENARIO_COLORS = [
  "#2A9D8F", // teal
  "#264653", // dark slate
  "#E9C46A", // gold
  "#F4A261", // soft orange
  "#606C38", // olive
  "#023047", // deep navy
  "#9D6CD5", // violet
  "#1F77B4", // steel blue
];

// Pick a color deterministically from a UUID-like string by hashing it. Avoids
// the prior global mutable colorIndex (non-deterministic in tests, leaks across
// scenarios, and recycles after 8).
function pickColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % SCENARIO_COLORS.length;
  return SCENARIO_COLORS[idx];
}

// Iteration count picker, shared by AssumptionsEditor and SettingsPage.
export const ITERATION_OPTIONS: { value: string; label: string }[] = [
  { value: "1000", label: "1,000 (fast)" },
  { value: "5000", label: "5,000" },
  { value: "10000", label: "10,000 (default)" },
  { value: "50000", label: "50,000" },
  { value: "100000", label: "100,000 (slow, best for tail percentiles)" },
];

export function createDefaultProfile(): UserProfile {
  return {
    id: crypto.randomUUID(),
    name: "",
    birthYear: 1990,
    birthMonth: 1,
    sex: "male",
    retirementAge: 65,
    filingStatus: "single",
    stateOfResidence: "",
    spouse: null,
    planningHorizonAge: 95,
  };
}

export function createDefaultScenario(name = "My Scenario"): Scenario {
  const now = new Date().toISOString();
  const profile = createDefaultProfile();
  return {
    id: crypto.randomUUID(),
    name,
    description: "",
    color: pickColor(crypto.randomUUID()),
    parentId: null,
    isBaseline: false,

    profile,
    accounts: [],
    incomeSources: [],
    expenses: [],
    lifeEvents: [],
    socialSecurity: { ...DEFAULT_SS_CONFIG, self: makeSsPersonForBirthYear(profile.birthYear) },
    withdrawalStrategy: { ...DEFAULT_WITHDRAWAL_STRATEGY },
    withdrawalOrder: { ...DEFAULT_WITHDRAWAL_ORDER },
    simulationConfig: structuredClone(DEFAULT_SIMULATION_CONFIG),

    createdAt: now,
    updatedAt: now,
  };
}

export function duplicateScenario(source: Scenario, newName?: string): Scenario {
  const clone = structuredClone(source);
  clone.id = crypto.randomUUID();
  clone.name = newName ?? `Copy of ${source.name}`;
  clone.parentId = source.id;
  clone.isBaseline = false;
  clone.color = pickColor(clone.id);
  clone.profile.id = crypto.randomUUID();

  // Re-key nested entities so deletes/edits in the copy don't dangle into
  // life-event references in the original (or vice versa).
  const accountIdMap = new Map<string, string>();
  for (const a of clone.accounts) {
    const newId = crypto.randomUUID();
    accountIdMap.set(a.id, newId);
    a.id = newId;
  }
  for (const inc of clone.incomeSources) inc.id = crypto.randomUUID();
  const expenseIdMap = new Map<string, string>();
  for (const exp of clone.expenses) {
    const newId = crypto.randomUUID();
    expenseIdMap.set(exp.id, newId);
    exp.id = newId;
  }
  for (const ev of clone.lifeEvents) {
    ev.id = crypto.randomUUID();
    if (ev.financialImpact.targetAccountId) {
      ev.financialImpact.targetAccountId =
        accountIdMap.get(ev.financialImpact.targetAccountId) ?? ev.financialImpact.targetAccountId;
    }
    for (const cc of ev.financialImpact.contributionChanges) {
      cc.accountId = accountIdMap.get(cc.accountId) ?? cc.accountId;
    }
    for (const ec of ev.financialImpact.expenseChanges) {
      if (ec.existingExpenseId) {
        ec.existingExpenseId = expenseIdMap.get(ec.existingExpenseId) ?? ec.existingExpenseId;
      }
    }
  }

  const now = new Date().toISOString();
  clone.createdAt = now;
  clone.updatedAt = now;
  return clone;
}

// Enforce cross-field invariants on a scenario. Pure and idempotent. Run on
// every store write and on persistence load so editors can safely assume
// consistent state. Add new invariants here rather than scattering defensive
// useEffects across editors.
//
// Invariant 1 (MFJ implies spouse SS object exists): the various editors
// gate spouse-related UI on `socialSecurity.spouse` being non-null. The
// Profile editor only seeds it on filing-status change to MFJ or on spouse
// birth-year change, so any other path that lands on MFJ + profile.spouse
// (legacy persisted scenarios, scenario import, partial edits) leaves
// `socialSecurity.spouse` null and silently hides the spouse fields.
export function normalizeScenario(scenario: Scenario): Scenario {
  const profileSpouse = scenario.profile.spouse;
  const isMarried = scenario.profile.filingStatus === "married_filing_jointly";
  const ssSpouseMissing = scenario.socialSecurity.spouse == null;

  if (isMarried && profileSpouse && ssSpouseMissing) {
    return {
      ...scenario,
      socialSecurity: {
        ...scenario.socialSecurity,
        spouse: makeSsPersonForBirthYear(profileSpouse.birthYear),
      },
    };
  }
  return scenario;
}
