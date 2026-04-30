import { describe, it, expect } from "vitest";
import { runSimulation } from "../simulation";
import { precompute } from "../precompute";
import { createDefaultScenario } from "@/models/defaults";
import type { Scenario } from "@/models/scenario";
import type { CMA } from "@/models/simulation-config";
import type { LifeEvent, FinancialImpact } from "@/models/life-event";

function makeZeroVolatilityCMA(): CMA {
  const asset = (mean: number) => ({ arithmeticMean: mean, stdDev: 0 });
  return {
    usLargeCap: asset(0.05),
    usSmallCap: asset(0.05),
    intlDeveloped: asset(0.05),
    intlEmerging: asset(0.05),
    usBonds: asset(0.02),
    tips: asset(0.02),
    cash: asset(0.01),
    stockBondCorrelationLow: 0,
    stockBondCorrelationHigh: 0,
  };
}

function emptyImpact(): FinancialImpact {
  return {
    oneTimeInflow: 0,
    oneTimeOutflow: 0,
    targetAccountId: null,
    incomeChanges: [],
    expenseChanges: [],
    contributionChanges: [],
  };
}

function makeTestScenario(overrides: Partial<Scenario> = {}): Scenario {
  const base = createDefaultScenario("Test");
  return {
    ...base,
    profile: {
      ...base.profile,
      birthYear: 1990,
      retirementAge: 65,
      filingStatus: "single",
      planningHorizonAge: 95,
    },
    accounts: [
      {
        id: "acct-taxable",
        owner: "self",
        label: "Brokerage",
        type: "taxable",
        balance: 500_000,
        costBasis: 300_000,
        annualContribution: 10_000,
        employerMatch: 0,
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
    ],
    incomeSources: [
      {
        id: "inc-salary",
        owner: "self",
        label: "Salary",
        type: "salary",
        annualAmount: 100_000,
        startAge: 30,
        endAge: 65,
        inflationAdjusted: true,
        growthRate: 0.02,
        taxable: true,
        endsAtRetirement: true,
      },
    ],
    expenses: [
      {
        id: "exp-living",
        label: "Living",
        category: "essential",
        annualAmount: 50_000,
        startAge: 65,
        endAge: null,
        inflationRate: null,
      },
    ],
    lifeEvents: [],
    socialSecurity: {
      self: { enabled: false, fraMonthlyBenefit: 0, claimingAge: 67, fra: 67 },
      spouse: null,
      colaRate: 0.025,
      useSolvencyHaircut: false,
      solvencyHaircutYear: 2034,
      solvencyHaircutFactor: 0.79,
    },
    withdrawalStrategy: {
      type: "fixed_real",
      params: { withdrawalRate: 0.04 },
      useSpendingSmile: false,
    },
    withdrawalOrder: {
      type: "conventional",
      rothConversionEnabled: false,
      rothConversionTargetBracket: 0.22,
      bracketFillingTargetBracket: 0.12,
      customOrder: [],
    },
    simulationConfig: {
      iterations: 10,
      method: "parametric_lognormal",
      seed: 42,
      inflationRegimeThreshold: 0.03,
      inflationMode: "fixed",
      fixedInflationRate: 0,
      stochasticInflation: { longRunMean: 0.025, phi: 0.5, sigma: 0.012 },
      capitalMarketAssumptions: makeZeroVolatilityCMA(),
      longevityModel: "fixed_age",
      fixedEndAge: 95,
      mortalityTable: "ssa_period",
      mortalityImprovement: true,
    },
    ...overrides,
  };
}

describe("life event precompute", () => {
  it("spreads events with durationYears across multiple ages", () => {
    const event: LifeEvent = {
      id: "ev-1",
      type: "education",
      label: "College",
      description: "",
      triggerAge: 50,
      durationYears: 4,
      financialImpact: { ...emptyImpact(), oneTimeOutflow: 40_000 },
    };

    const scenario = makeTestScenario({ lifeEvents: [event] });
    const config = precompute(scenario, 2026);

    for (let age = 50; age <= 53; age++) {
      const events = config.lifeEventsByAge.get(age);
      expect(events).toBeDefined();
      expect(events!.length).toBe(1);
      expect(events![0].id).toBe("ev-1");
    }
    expect(config.lifeEventsByAge.get(54)).toBeUndefined();
  });

  it("does not spread events without durationYears", () => {
    const event: LifeEvent = {
      id: "ev-1",
      type: "major_expense",
      label: "Home Purchase",
      description: "",
      triggerAge: 40,
      durationYears: null,
      financialImpact: { ...emptyImpact(), oneTimeOutflow: 500_000 },
    };

    const scenario = makeTestScenario({ lifeEvents: [event] });
    const config = precompute(scenario, 2026);

    expect(config.lifeEventsByAge.get(40)).toBeDefined();
    expect(config.lifeEventsByAge.get(41)).toBeUndefined();
  });

  it("applies income changes to incomeByAge map for modify-existing", () => {
    const event: LifeEvent = {
      id: "ev-raise",
      type: "career_change",
      label: "Raise",
      description: "",
      triggerAge: 40,
      durationYears: null,
      financialImpact: {
        ...emptyImpact(),
        incomeChanges: [
          {
            existingIncomeId: "inc-salary",
            newIncome: { annualAmount: 150_000 },
          },
        ],
      },
    };

    const scenario = makeTestScenario({ lifeEvents: [event] });
    const config = precompute(scenario, 2026);

    // Before trigger age, should have original salary
    const at39 = config.incomeByAge.get(39)!;
    const salaryAt39 = at39.find((i) => i.sourceId === "inc-salary");
    expect(salaryAt39).toBeDefined();
    expect(salaryAt39!.amount).toBeLessThan(150_000);

    // At trigger age, should have new amount
    const at40 = config.incomeByAge.get(40)!;
    const salaryAt40 = at40.find((i) => i.sourceId === "inc-salary");
    expect(salaryAt40).toBeDefined();
    expect(salaryAt40!.amount).toBeCloseTo(150_000, 0);

    // Later ages should have new base amount with growth
    const at41 = config.incomeByAge.get(41)!;
    const salaryAt41 = at41.find((i) => i.sourceId === "inc-salary");
    expect(salaryAt41).toBeDefined();
    expect(salaryAt41!.amount).toBeCloseTo(150_000 * 1.02, 0);
  });

  it("applies income changes with duration (temporary)", () => {
    const event: LifeEvent = {
      id: "ev-sabbatical",
      type: "career_change",
      label: "Sabbatical",
      description: "",
      triggerAge: 45,
      durationYears: 1,
      financialImpact: {
        ...emptyImpact(),
        incomeChanges: [
          {
            existingIncomeId: "inc-salary",
            newIncome: { annualAmount: 0 },
          },
        ],
      },
    };

    const scenario = makeTestScenario({ lifeEvents: [event] });
    const config = precompute(scenario, 2026);

    // At age 45, income should be 0
    const at45 = config.incomeByAge.get(45)!;
    const salaryAt45 = at45.find((i) => i.sourceId === "inc-salary");
    expect(salaryAt45).toBeDefined();
    expect(salaryAt45!.amount).toBe(0);

    // At age 46, should revert to original growth trajectory
    const at46 = config.incomeByAge.get(46)!;
    const salaryAt46 = at46.find((i) => i.sourceId === "inc-salary");
    expect(salaryAt46).toBeDefined();
    expect(salaryAt46!.amount).toBeGreaterThan(0);
  });

  it("adds new income from life event", () => {
    const event: LifeEvent = {
      id: "ev-parttime",
      type: "part_time_work",
      label: "Consulting",
      description: "",
      triggerAge: 65,
      durationYears: 5,
      financialImpact: {
        ...emptyImpact(),
        incomeChanges: [
          {
            existingIncomeId: null,
            newIncome: {
              annualAmount: 30_000,
              taxable: true,
              inflationAdjusted: true,
              growthRate: 0,
            } as any,
          },
        ],
      },
    };

    const scenario = makeTestScenario({ lifeEvents: [event] });
    const config = precompute(scenario, 2026);

    // New income should exist at ages 65-69
    for (let age = 65; age <= 69; age++) {
      const incomes = config.incomeByAge.get(age)!;
      const consulting = incomes.find((i) => i.amount === 30_000);
      expect(consulting).toBeDefined();
      expect(consulting!.taxable).toBe(true);
    }

    // Should not exist at age 70
    const at70 = config.incomeByAge.get(70);
    const consulting = at70?.find((i) => i.amount === 30_000);
    expect(consulting).toBeUndefined();
  });

  it("applies expense changes from life events", () => {
    const event: LifeEvent = {
      id: "ev-childcare",
      type: "family_change",
      label: "Child born",
      description: "",
      triggerAge: 32,
      durationYears: 18,
      financialImpact: {
        ...emptyImpact(),
        expenseChanges: [
          {
            existingExpenseId: null,
            newExpense: { annualAmount: 15_000 },
          },
        ],
      },
    };

    const scenario = makeTestScenario({ lifeEvents: [event] });
    const config = precompute(scenario, 2026);

    for (let age = 32; age <= 49; age++) {
      const expenses = config.expenseByAge.get(age)!;
      const childcare = expenses.find((e) => e.amount === 15_000);
      expect(childcare).toBeDefined();
    }
    const at50 = config.expenseByAge.get(50);
    const childcare = at50?.find((e) => e.amount === 15_000);
    expect(childcare).toBeUndefined();
  });

  it("applies contribution changes from life events", () => {
    const event: LifeEvent = {
      id: "ev-sabb",
      type: "career_change",
      label: "Sabbatical",
      description: "",
      triggerAge: 45,
      durationYears: 1,
      financialImpact: {
        ...emptyImpact(),
        contributionChanges: [
          {
            accountId: "acct-taxable",
            newAnnualContribution: 0,
          },
        ],
      },
    };

    const scenario = makeTestScenario({ lifeEvents: [event] });
    const config = precompute(scenario, 2026);

    const at45 = config.contributionOverridesByAge.get(45);
    expect(at45).toBeDefined();
    expect(at45!.get("acct-taxable")).toBe(0);

    expect(config.contributionOverridesByAge.get(44)).toBeUndefined();
    expect(config.contributionOverridesByAge.get(46)).toBeUndefined();
  });
});

describe("life event simulation integration", () => {
  it("home purchase reduces portfolio by outflow amount", () => {
    const baseScenario = makeTestScenario();
    const baseResult = runSimulation(baseScenario);

    const withPurchase = makeTestScenario({
      lifeEvents: [
        {
          id: "ev-home",
          type: "major_expense",
          label: "Home Purchase",
          description: "",
          triggerAge: 37,
          durationYears: null,
          financialImpact: { ...emptyImpact(), oneTimeOutflow: 200_000 },
        },
      ],
    });
    const purchaseResult = runSimulation(withPurchase);

    // At age 37, portfolio should be lower by ~$200k (with some drift from returns/taxes)
    const baseWealth37 = baseResult.wealthByYear.find((w) => w.age === 37)!.p50;
    const purchaseWealth37 = purchaseResult.wealthByYear.find((w) => w.age === 37)!.p50;
    const diff = baseWealth37 - purchaseWealth37;
    expect(diff).toBeGreaterThan(150_000);
    expect(diff).toBeLessThan(250_000);
  });

  it("inheritance increases portfolio by inflow amount", () => {
    const baseScenario = makeTestScenario();
    const baseResult = runSimulation(baseScenario);

    const withInheritance = makeTestScenario({
      lifeEvents: [
        {
          id: "ev-inherit",
          type: "inheritance",
          label: "Inheritance",
          description: "",
          triggerAge: 50,
          durationYears: null,
          financialImpact: { ...emptyImpact(), oneTimeInflow: 200_000 },
        },
      ],
    });
    const inheritResult = runSimulation(withInheritance);

    const baseWealth50 = baseResult.wealthByYear.find((w) => w.age === 50)!.p50;
    const inheritWealth50 = inheritResult.wealthByYear.find((w) => w.age === 50)!.p50;
    const diff = inheritWealth50 - baseWealth50;
    expect(diff).toBeGreaterThan(150_000);
    expect(diff).toBeLessThan(250_000);
  });

  it("multi-year outflow (college) deducts each year of duration", () => {
    const baseScenario = makeTestScenario();
    const baseResult = runSimulation(baseScenario);

    const withCollege = makeTestScenario({
      lifeEvents: [
        {
          id: "ev-college",
          type: "education",
          label: "College",
          description: "",
          triggerAge: 50,
          durationYears: 4,
          financialImpact: { ...emptyImpact(), oneTimeOutflow: 40_000 },
        },
      ],
    });
    const collegeResult = runSimulation(withCollege);

    // After 4 years of $40k outflow, portfolio should be lower by ~$160k+
    const baseWealth54 = baseResult.wealthByYear.find((w) => w.age === 54)!.p50;
    const collegeWealth54 = collegeResult.wealthByYear.find((w) => w.age === 54)!.p50;
    const diff = baseWealth54 - collegeWealth54;
    expect(diff).toBeGreaterThan(120_000);
  });

  it("sabbatical with income change stops salary for 1 year", () => {
    const baseScenario = makeTestScenario();
    const baseResult = runSimulation(baseScenario);

    const withSabbatical = makeTestScenario({
      lifeEvents: [
        {
          id: "ev-sabb",
          type: "career_change",
          label: "Sabbatical",
          description: "",
          triggerAge: 45,
          durationYears: 1,
          financialImpact: {
            ...emptyImpact(),
            incomeChanges: [
              {
                existingIncomeId: "inc-salary",
                newIncome: { annualAmount: 0 },
              },
            ],
            contributionChanges: [
              {
                accountId: "acct-taxable",
                newAnnualContribution: 0,
              },
            ],
          },
        },
      ],
    });
    const sabbResult = runSimulation(withSabbatical);

    // Income at age 45 should be near 0 (sabbatical year)
    const baseIncome45 = baseResult.incomeByYear.find((w) => w.age === 45)!.p50;
    const sabbIncome45 = sabbResult.incomeByYear.find((w) => w.age === 45)!.p50;
    expect(sabbIncome45).toBeLessThan(baseIncome45 * 0.1);

    // Income at age 46 should recover
    const baseIncome46 = baseResult.incomeByYear.find((w) => w.age === 46)!.p50;
    const sabbIncome46 = sabbResult.incomeByYear.find((w) => w.age === 46)!.p50;
    expect(sabbIncome46).toBeGreaterThan(baseIncome46 * 0.8);
  });

  it("career change raise increases income permanently", () => {
    const baseScenario = makeTestScenario();
    const baseResult = runSimulation(baseScenario);

    const withRaise = makeTestScenario({
      lifeEvents: [
        {
          id: "ev-raise",
          type: "career_change",
          label: "Big Raise",
          description: "",
          triggerAge: 40,
          durationYears: null,
          financialImpact: {
            ...emptyImpact(),
            incomeChanges: [
              {
                existingIncomeId: "inc-salary",
                newIncome: { annualAmount: 200_000 },
              },
            ],
          },
        },
      ],
    });
    const raiseResult = runSimulation(withRaise);

    // Income should be higher from age 40 onward
    for (let age = 41; age <= 50; age++) {
      const baseIncome = baseResult.incomeByYear.find((w) => w.age === age)!.p50;
      const raiseIncome = raiseResult.incomeByYear.find((w) => w.age === age)!.p50;
      expect(raiseIncome).toBeGreaterThan(baseIncome * 1.5);
    }
  });

  it("part-time work adds income during retirement", () => {
    const baseScenario = makeTestScenario();
    const baseResult = runSimulation(baseScenario);

    const withPartTime = makeTestScenario({
      lifeEvents: [
        {
          id: "ev-parttime",
          type: "part_time_work",
          label: "Consulting",
          description: "",
          triggerAge: 65,
          durationYears: 5,
          financialImpact: {
            ...emptyImpact(),
            incomeChanges: [
              {
                existingIncomeId: null,
                newIncome: {
                  annualAmount: 40_000,
                  taxable: true,
                  inflationAdjusted: true,
                  growthRate: 0,
                } as any,
              },
            ],
          },
        },
      ],
    });
    const ptResult = runSimulation(withPartTime);

    // Income should be higher at ages 65-69
    for (let age = 65; age <= 69; age++) {
      const baseIncome = baseResult.incomeByYear.find((w) => w.age === age)!.p50;
      const ptIncome = ptResult.incomeByYear.find((w) => w.age === age)!.p50;
      expect(ptIncome).toBeGreaterThan(baseIncome + 20_000);
    }

    // Income at age 70 should be same as base (consulting ended)
    const baseIncome70 = baseResult.incomeByYear.find((w) => w.age === 70)!.p50;
    const ptIncome70 = ptResult.incomeByYear.find((w) => w.age === 70)!.p50;
    expect(Math.abs(ptIncome70 - baseIncome70)).toBeLessThan(5_000);
  });

  it("expense change adds recurring cost during life event", () => {
    const baseScenario = makeTestScenario();
    const baseResult = runSimulation(baseScenario);

    // Use a healthcare amount that meaningfully exceeds the strategy's
    // spending floor (strategy = retirementBalance × 4% can already be in
    // the $200K range with this scenario's accumulated wealth).
    const withHealthcare = makeTestScenario({
      lifeEvents: [
        {
          id: "ev-health",
          type: "health_event",
          label: "Long-term care",
          description: "",
          triggerAge: 80,
          durationYears: 3,
          financialImpact: {
            ...emptyImpact(),
            expenseChanges: [
              {
                existingExpenseId: null,
                newExpense: { annualAmount: 500_000, inflationRate: null },
              },
            ],
          },
        },
      ],
    });
    const healthResult = runSimulation(withHealthcare);

    // Spending should be higher during ages 80-82
    for (let age = 80; age <= 82; age++) {
      const baseSpending = baseResult.spendingByYear.find((w) => w.age === age)!.p50;
      const healthSpending = healthResult.spendingByYear.find((w) => w.age === age)!.p50;
      expect(healthSpending).toBeGreaterThan(baseSpending + 50_000);
    }
  });
});
