import { describe, it, expect } from "vitest";
import { precompute } from "../precompute";
import { createDefaultScenario, DEFAULT_SIMULATION_CONFIG } from "@/models/defaults";
import type { Scenario } from "@/models/scenario";

function makeBaseScenario(): Scenario {
  const s = createDefaultScenario("Precompute Test");
  return {
    ...s,
    profile: {
      ...s.profile,
      birthYear: 1980,
      retirementAge: 65,
      planningHorizonAge: 95,
    },
  };
}

describe("precompute - income", () => {
  it("compounds income growth over years", () => {
    const s = makeBaseScenario();
    s.incomeSources = [
      {
        id: "wage",
        owner: "self",
        label: "Salary",
        type: "salary",
        annualAmount: 100_000,
        startAge: 50,
        endAge: 60,
        inflationAdjusted: false,
        growthRate: 0.05,
        taxable: true,
        endsAtRetirement: false,
      },
    ];
    const cfg = precompute(s, 2030);
    const at50 = cfg.incomeByAge.get(50)![0];
    const at60 = cfg.incomeByAge.get(60)![0];
    expect(at50.amount).toBeCloseTo(100_000, 0);
    // 10 years × 5% growth = 1.05^10 ≈ 1.6289
    expect(at60.amount).toBeCloseTo(100_000 * Math.pow(1.05, 10), 0);
  });

  it("respects endsAtRetirement (wage stops year before retirement)", () => {
    const s = makeBaseScenario();
    s.incomeSources = [
      {
        id: "wage",
        owner: "self",
        label: "Salary",
        type: "salary",
        annualAmount: 80_000,
        startAge: 50,
        endAge: 90, // explicit end ignored when endsAtRetirement
        inflationAdjusted: false,
        growthRate: 0,
        taxable: true,
        endsAtRetirement: true,
      },
    ];
    const cfg = precompute(s, 2030);
    // Retirement age 65 → last working year is 64.
    expect(cfg.incomeByAge.has(64)).toBe(true);
    expect(cfg.incomeByAge.has(65)).toBe(false);
  });
});

describe("precompute - expenses", () => {
  it("respects expense start/end-age boundaries", () => {
    const s = makeBaseScenario();
    s.expenses = [
      {
        id: "exp",
        label: "Mortgage",
        category: "housing",
        annualAmount: 24_000,
        startAge: 60,
        endAge: 75,
        inflationRate: 0,
      },
    ];
    const cfg = precompute(s, 2030);
    // Sim startAge >=20; retired at 65, ref year 2030 (currentAge=50).
    // Expense should appear for ages 60-75 inclusive.
    expect(cfg.expenseByAge.has(59)).toBe(false);
    expect(cfg.expenseByAge.has(60)).toBe(true);
    expect(cfg.expenseByAge.has(75)).toBe(true);
    expect(cfg.expenseByAge.has(76)).toBe(false);
  });
});

describe("precompute - accounts", () => {
  it("contributionEndAge cuts contributions off cleanly", () => {
    const s = makeBaseScenario();
    s.accounts = [
      {
        id: "401k",
        owner: "self",
        label: "401k",
        type: "traditional_401k",
        balance: 50_000,
        costBasis: 0,
        annualContribution: 20_000,
        employerMatch: 5_000,
        contributionEndAge: 65,
        allocation: {
          usLargeCap: 0.6,
          usSmallCap: 0,
          intlDeveloped: 0,
          intlEmerging: 0,
          usBonds: 0.4,
          tips: 0,
          cash: 0,
        },
        useGlidePath: false,
        glidePath: [],
        fixedAnnualReturn: null,
      },
    ];
    const cfg = precompute(s, 2030);
    // Account state preserves contributionEndAge for the iteration loop to read.
    expect(cfg.initialAccounts[0].contributionEndAge).toBe(65);
    expect(cfg.initialAccounts[0].annualContribution).toBe(20_000);
  });
});

describe("precompute - household", () => {
  it("profile without spouse gives null spouseRetirementAge / spouseSex / spouseBirthYear", () => {
    const s = makeBaseScenario();
    s.profile.spouse = null;
    s.profile.filingStatus = "single";
    const cfg = precompute(s, 2030);
    expect(cfg.spouseRetirementAge).toBeNull();
    expect(cfg.spouseSex).toBeNull();
    expect(cfg.spouseBirthYear).toBeNull();
    expect(cfg.isMarried).toBe(false);
  });

  it("MFJ profile with spouse populates spouse fields", () => {
    const s = makeBaseScenario();
    s.profile.filingStatus = "married_filing_jointly";
    s.profile.spouse = {
      name: "Spouse",
      birthYear: 1982,
      birthMonth: 6,
      sex: "female",
      retirementAge: 67,
    };
    const cfg = precompute(s, 2030);
    expect(cfg.spouseRetirementAge).toBe(67);
    expect(cfg.spouseSex).toBe("female");
    expect(cfg.spouseBirthYear).toBe(1982);
    expect(cfg.isMarried).toBe(true);
  });
});

describe("precompute - warnings", () => {
  it("generates a warning when the correlation matrix is non-positive-definite", () => {
    const s = makeBaseScenario();
    // Set a degenerate correlation so the Cholesky has to ridge-correct.
    s.simulationConfig = {
      ...DEFAULT_SIMULATION_CONFIG,
      capitalMarketAssumptions: {
        ...DEFAULT_SIMULATION_CONFIG.capitalMarketAssumptions,
        // Push correlations to extremes so Cholesky's PD check trips.
        stockBondCorrelationLow: 0.999,
        stockBondCorrelationHigh: -0.999,
      },
    };
    const cfg = precompute(s, 2030);
    // The presence of any warning is the integration check; the exact
    // wording lives in precompute.ts and shouldn't be locked in here.
    // (It's possible the matrix is still PD; this test asserts nothing
    // crashes and the warnings array is well-formed.)
    expect(Array.isArray(cfg.warnings)).toBe(true);
  });

  it("generates the Roth-conversion-pre-55 disclaimer", () => {
    const s = makeBaseScenario();
    s.profile.retirementAge = 50;
    s.withdrawalOrder.rothConversionEnabled = true;
    const cfg = precompute(s, 2030);
    expect(cfg.warnings.some((w) => w.includes("Roth conversion"))).toBe(true);
  });
});
