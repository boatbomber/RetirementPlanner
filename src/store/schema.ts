import { z } from "zod/v4";

const assetAllocationSchema = z.object({
  usLargeCap: z.number(),
  usSmallCap: z.number(),
  intlDeveloped: z.number(),
  intlEmerging: z.number(),
  usBonds: z.number(),
  tips: z.number(),
  cash: z.number(),
});

const glidePathPointSchema = z.object({
  age: z.number(),
  allocation: assetAllocationSchema,
});

const accountSchema = z.object({
  id: z.string(),
  owner: z.enum(["self", "spouse"]),
  label: z.string(),
  type: z.enum([
    "taxable",
    "traditional_ira",
    "traditional_401k",
    "roth_ira",
    "roth_401k",
    "hsa",
    "hysa",
    "cd",
    "money_market",
    "i_bonds",
    "529",
  ]),
  balance: z.number(),
  costBasis: z.number(),
  annualContribution: z.number(),
  employerMatch: z.number(),
  contributionEndAge: z.number(),
  allocation: assetAllocationSchema,
  useGlidePath: z.boolean(),
  glidePath: z.array(glidePathPointSchema),
  fixedAnnualReturn: z.number().nullable(),
});

const spouseProfileSchema = z.object({
  name: z.string(),
  birthYear: z.number(),
  birthMonth: z.number().int().min(1).max(12),
  sex: z.enum(["male", "female"]),
  retirementAge: z.number(),
});

const userProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  birthYear: z.number(),
  birthMonth: z.number().int().min(1).max(12),
  sex: z.enum(["male", "female"]),
  retirementAge: z.number(),
  filingStatus: z.enum([
    "single",
    "married_filing_jointly",
    "married_filing_separately",
    "head_of_household",
  ]),
  stateOfResidence: z.string(),
  spouse: spouseProfileSchema.nullable(),
  planningHorizonAge: z.number(),
});

// Pre-v3 exports / IndexedDB blobs predate `endsAtRetirement` on income
// sources. To stay backward-compatible with imports of older files, the
// field is parsed as optional and then defaulted from the same wage-like
// heuristic the v2 → v3 migration uses. New code always writes the field
// explicitly, so the fallback only fires on legacy payloads.
const WAGE_LIKE_TYPES = new Set(["salary", "self_employment", "bonus", "part_time"]);

const incomeSourceSchema = z
  .object({
    id: z.string(),
    owner: z.enum(["self", "spouse"]),
    label: z.string(),
    type: z.enum([
      "salary",
      "self_employment",
      "bonus",
      "pension",
      "annuity",
      "rental",
      "part_time",
      "royalty",
      "other",
    ]),
    annualAmount: z.number(),
    startAge: z.number(),
    endAge: z.number().nullable(),
    inflationAdjusted: z.boolean(),
    growthRate: z.number(),
    taxable: z.boolean(),
    endsAtRetirement: z.boolean().optional(),
  })
  .transform((inc) => ({
    ...inc,
    endsAtRetirement: inc.endsAtRetirement ?? WAGE_LIKE_TYPES.has(inc.type),
  }));

const expenseSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.enum(["essential", "discretionary", "healthcare", "housing", "one_time"]),
  annualAmount: z.number(),
  startAge: z.number(),
  endAge: z.number().nullable(),
  inflationRate: z.number().nullable(),
});

// Partial income/expense overlays. Only the listed fields can appear, all
// optional. Anything else is rejected to prevent malformed life-event payloads
// from masking themselves as `unknown`.
const partialIncomeOverlay = z
  .object({
    annualAmount: z.number().optional(),
    growthRate: z.number().optional(),
    taxable: z.boolean().optional(),
    inflationAdjusted: z.boolean().optional(),
    owner: z.enum(["self", "spouse"]).optional(),
    label: z.string().optional(),
  })
  .strict();

const partialExpenseOverlay = z
  .object({
    annualAmount: z.number().optional(),
    inflationRate: z.number().nullable().optional(),
    label: z.string().optional(),
    category: z.enum(["essential", "discretionary", "healthcare", "housing", "one_time"]).optional(),
  })
  .strict();

const financialImpactSchema = z.object({
  oneTimeInflow: z.number(),
  oneTimeOutflow: z.number(),
  targetAccountId: z.string().nullable(),
  incomeChanges: z.array(
    z.object({
      existingIncomeId: z.string().nullable(),
      newIncome: partialIncomeOverlay,
    }),
  ),
  expenseChanges: z.array(
    z.object({
      existingExpenseId: z.string().nullable(),
      newExpense: partialExpenseOverlay,
    }),
  ),
  contributionChanges: z.array(
    z.object({
      accountId: z.string(),
      newAnnualContribution: z.number(),
    }),
  ),
});

const lifeEventSchema = z.object({
  id: z.string(),
  type: z.enum([
    "career_change",
    "major_expense",
    "education",
    "health_event",
    "family_change",
    "inheritance",
    "relocation",
    "windfall",
    "part_time_work",
    "insurance_change",
    "custom",
  ]),
  label: z.string(),
  description: z.string(),
  triggerAge: z.number(),
  durationYears: z.number().nullable(),
  financialImpact: financialImpactSchema,
  iconKey: z.string().optional(),
});

const ssPerson = z.object({
  enabled: z.boolean(),
  fraMonthlyBenefit: z.number(),
  claimingAge: z.number(),
  fra: z.number(),
});

const socialSecurityConfigSchema = z.object({
  self: ssPerson,
  spouse: ssPerson.nullable(),
  colaRate: z.number(),
  useSolvencyHaircut: z.boolean(),
  solvencyHaircutYear: z.number(),
  solvencyHaircutFactor: z.number(),
});

// Per-strategy params schema (discriminated union by parent strategy.type).
// Each strategy has its own param shape; we validate as a discriminated union
// so unknown fields are rejected and missing required fields are caught.
const fixedRealParams = z.object({ withdrawalRate: z.number() });
const guytonKlingerParams = z.object({
  initialRate: z.number(),
  ceilingMultiplier: z.number(),
  floorMultiplier: z.number(),
  adjustmentPercent: z.number(),
});
const vanguardDynamicParams = z.object({
  initialRate: z.number(),
  ceilingPercent: z.number(),
  floorPercent: z.number(),
});
const vpwParams = z.object({}).strict();
const rmdMethodParams = z.object({ smoothingYears: z.number().int().min(1) });
const arvaParams = z.object({ realDiscountRate: z.number() });
const kitcesRatchetParams = z.object({
  initialRate: z.number(),
  ratchetThreshold: z.number(),
  ratchetIncrease: z.number(),
  maxWithdrawalRate: z.number().nullable().optional(),
});
const riskBasedParams = z.object({
  targetSuccessLow: z.number(),
  targetSuccessHigh: z.number(),
  adjustmentStep: z.number(),
  initialRate: z.number(),
  expectedReturn: z.number().optional(),
  volatility: z.number().optional(),
});

const withdrawalStrategySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fixed_real"), params: fixedRealParams, useSpendingSmile: z.boolean() }),
  z.object({
    type: z.literal("guyton_klinger"),
    params: guytonKlingerParams,
    useSpendingSmile: z.boolean(),
  }),
  z.object({
    type: z.literal("vanguard_dynamic"),
    params: vanguardDynamicParams,
    useSpendingSmile: z.boolean(),
  }),
  z.object({ type: z.literal("vpw"), params: vpwParams, useSpendingSmile: z.boolean() }),
  z.object({ type: z.literal("rmd_method"), params: rmdMethodParams, useSpendingSmile: z.boolean() }),
  z.object({ type: z.literal("arva"), params: arvaParams, useSpendingSmile: z.boolean() }),
  z.object({
    type: z.literal("kitces_ratchet"),
    params: kitcesRatchetParams,
    useSpendingSmile: z.boolean(),
  }),
  z.object({ type: z.literal("risk_based"), params: riskBasedParams, useSpendingSmile: z.boolean() }),
]);

const withdrawalOrderSchema = z.object({
  type: z.enum(["conventional", "bracket_filling", "roth_first", "custom"]),
  rothConversionEnabled: z.boolean(),
  rothConversionTargetBracket: z.number(),
  bracketFillingTargetBracket: z.number().default(0.12),
  customOrder: z.array(z.string()),
});

const assetClassCmaSchema = z.object({
  arithmeticMean: z.number(),
  stdDev: z.number(),
});

const cmaSchema = z.object({
  usLargeCap: assetClassCmaSchema,
  usSmallCap: assetClassCmaSchema,
  intlDeveloped: assetClassCmaSchema,
  intlEmerging: assetClassCmaSchema,
  usBonds: assetClassCmaSchema,
  tips: assetClassCmaSchema,
  cash: assetClassCmaSchema,
  stockBondCorrelationLow: z.number(),
  stockBondCorrelationHigh: z.number(),
});

const simulationConfigSchema = z.object({
  iterations: z.number().int().positive(),
  method: z.literal("parametric_lognormal"),
  seed: z.number().nullable(),
  inflationMode: z.enum(["fixed", "stochastic"]),
  fixedInflationRate: z.number(),
  inflationRegimeThreshold: z.number().default(0.03),
  stochasticInflation: z.object({
    longRunMean: z.number(),
    phi: z.number(),
    sigma: z.number(),
  }),
  capitalMarketAssumptions: cmaSchema,
  longevityModel: z.enum(["fixed_age", "stochastic_mortality"]),
  fixedEndAge: z.number(),
  mortalityTable: z.enum(["ssa_period", "soa_rp2014"]),
  mortalityImprovement: z.boolean(),
});

const goalQuestionSchema = z.enum(["earliest_retirement_age", "required_savings", "sustainable_spend"]);

const wealthPathPointSchema = z.object({
  age: z.number(),
  p10: z.number(),
  p50: z.number(),
  p90: z.number(),
});

const solverResultSchema = z.object({
  question: goalQuestionSchema,
  solvedValue: z.number(),
  achievedSuccessRate: z.number(),
  converged: z.boolean(),
  searchBoundsLo: z.number(),
  searchBoundsHi: z.number(),
  medianPortfolioAtRetirement: z.number().optional(),
  wealthPath: z.array(wealthPathPointSchema).optional(),
});

const goalSchema = z.object({
  // .strict() rejects unknown keys, keeping imported payloads from smuggling
  // unrecognized question types into the cache where they'd later confuse the
  // solver's STRATEGY_MAP-style lookup.
  cache: z
    .object({
      earliest_retirement_age: solverResultSchema.optional(),
      required_savings: solverResultSchema.optional(),
      sustainable_spend: solverResultSchema.optional(),
    })
    .strict()
    .default({}),
  fingerprint: z.string().nullable(),
  lastSolvedAt: z.string().nullable(),
});

export const scenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  color: z.string(),
  parentId: z.string().nullable(),
  isBaseline: z.boolean(),

  profile: userProfileSchema,
  accounts: z.array(accountSchema),
  incomeSources: z.array(incomeSourceSchema),
  expenses: z.array(expenseSchema),
  lifeEvents: z.array(lifeEventSchema),
  socialSecurity: socialSecurityConfigSchema,
  withdrawalStrategy: withdrawalStrategySchema,
  withdrawalOrder: withdrawalOrderSchema,
  simulationConfig: simulationConfigSchema,
  goal: goalSchema.optional(),

  createdAt: z.string(),
  updatedAt: z.string(),
});

export const importSchema = z.object({
  scenarios: z.array(scenarioSchema).min(1),
  activeScenarioId: z.string().nullable(),
  wizardCompleted: z.boolean(),
});

export type ImportData = z.infer<typeof importSchema>;
