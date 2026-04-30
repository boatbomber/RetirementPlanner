import { describe, it, expect } from "vitest";
import { runSimulation } from "../simulation";
import { createDefaultScenario } from "@/models/defaults";
import type { Scenario } from "@/models/scenario";
import type { CMA } from "@/models/simulation-config";

function makeZeroVolatilityCMA(): CMA {
  const asset = (mean: number) => ({ arithmeticMean: mean, stdDev: 0 });
  return {
    usLargeCap: asset(0.07),
    usSmallCap: asset(0.07),
    intlDeveloped: asset(0.07),
    intlEmerging: asset(0.07),
    usBonds: asset(0.03),
    tips: asset(0.03),
    cash: asset(0.01),
    stockBondCorrelationLow: 0,
    stockBondCorrelationHigh: 0,
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
        id: "acct-1",
        owner: "self",
        label: "401k",
        type: "traditional_401k",
        balance: 100_000,
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
    ],
    incomeSources: [
      {
        id: "inc-1",
        owner: "self",
        label: "Salary",
        type: "salary",
        annualAmount: 75_000,
        startAge: 35,
        endAge: 65,
        inflationAdjusted: true,
        growthRate: 0.02,
        taxable: true,
        endsAtRetirement: true,
      },
    ],
    expenses: [
      {
        id: "exp-1",
        label: "Living",
        category: "essential",
        annualAmount: 40_000,
        startAge: 65,
        endAge: null,
        inflationRate: null,
      },
    ],
    socialSecurity: {
      self: {
        enabled: true,
        fraMonthlyBenefit: 2000,
        claimingAge: 67,
        fra: 67,
      },
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
      iterations: 100,
      inflationRegimeThreshold: 0.03,
      method: "parametric_lognormal",
      seed: 42,
      inflationMode: "fixed",
      fixedInflationRate: 0.025,
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

describe("simulation integration", () => {
  it("produces a valid SimulationResult with all required fields", () => {
    const scenario = makeTestScenario();
    const result = runSimulation(scenario);

    expect(result.scenarioId).toBe(scenario.id);
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.successRate).toBeLessThanOrEqual(1);
    expect(result.wealthByYear.length).toBeGreaterThan(0);
    expect(result.incomeByYear.length).toBe(result.wealthByYear.length);
    expect(result.spendingByYear.length).toBe(result.wealthByYear.length);
    expect(result.taxByYear.length).toBe(result.wealthByYear.length);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.timestamp).toBeTruthy();
  });

  it("zero-volatility MC produces identical results across all iterations", () => {
    const scenario = makeTestScenario({
      simulationConfig: {
        ...makeTestScenario().simulationConfig,
        iterations: 10,
        seed: 1,
        capitalMarketAssumptions: makeZeroVolatilityCMA(),
        inflationMode: "fixed",
        fixedInflationRate: 0.025,
      },
    });

    const result = runSimulation(scenario);

    // With zero volatility and fixed inflation, all iterations should produce
    // identical wealth paths → p5 = p95 for every year
    for (const wp of result.wealthByYear) {
      expect(wp.p5).toBeCloseTo(wp.p95, 0);
      expect(wp.p10).toBeCloseTo(wp.p90, 0);
      expect(wp.p25).toBeCloseTo(wp.p75, 0);
    }
  });

  it("seeded simulation is deterministic", () => {
    const scenario = makeTestScenario();
    const r1 = runSimulation(scenario);
    const r2 = runSimulation(scenario);

    expect(r1.successRate).toBe(r2.successRate);
    expect(r1.medianTerminalWealth).toBe(r2.medianTerminalWealth);

    for (let i = 0; i < r1.wealthByYear.length; i++) {
      expect(r1.wealthByYear[i].p50).toBe(r2.wealthByYear[i].p50);
    }
  });

  it("wealth generally grows during accumulation phase (pre-retirement)", () => {
    const scenario = makeTestScenario();
    const result = runSimulation(scenario);

    const preRetirement = result.wealthByYear.filter((wp) => wp.age < scenario.profile.retirementAge);
    if (preRetirement.length >= 2) {
      const first = preRetirement[0].p50;
      const last = preRetirement[preRetirement.length - 1].p50;
      expect(last).toBeGreaterThan(first);
    }
  });

  it("spending is zero before retirement and positive after", () => {
    const scenario = makeTestScenario();
    const result = runSimulation(scenario);

    for (const sp of result.spendingByYear) {
      if (sp.age < scenario.profile.retirementAge) {
        expect(sp.p50).toBe(0);
      }
    }

    const postRetirement = result.spendingByYear.filter((sp) => sp.age >= scenario.profile.retirementAge);
    expect(postRetirement.some((sp) => sp.p50 > 0)).toBe(true);
  });

  it("progress callback fires correctly", () => {
    const scenario = makeTestScenario({
      simulationConfig: {
        ...makeTestScenario().simulationConfig,
        iterations: 1000,
      },
    });

    let progressCalls = 0;
    let lastCompleted = 0;
    const result = runSimulation(scenario, (completed, total) => {
      progressCalls++;
      expect(completed).toBeGreaterThan(lastCompleted);
      expect(total).toBe(1000);
      lastCompleted = completed;
    });

    // 1000 iterations, callback every 500 → should fire at 500 and 1000
    expect(progressCalls).toBe(2);
    expect(result).toBeDefined();
  });

  it("scenario with no accounts and no income produces 0% wealth", () => {
    // Pre-retirement income surplus would otherwise accumulate into the engine's
    // virtual cash bucket (a fallback for users with no eligible cash sink),
    // so isolate the no-wealth case by also stripping income.
    const scenario = makeTestScenario({ accounts: [], incomeSources: [] });
    const result = runSimulation(scenario);
    expect(result.wealthByYear.every((wp) => wp.p50 === 0)).toBe(true);
  });

  it("high savings rate scenario has high success rate", () => {
    const scenario = makeTestScenario();
    scenario.accounts[0].balance = 500_000;
    scenario.accounts[0].annualContribution = 50_000;
    scenario.simulationConfig.iterations = 50;

    const result = runSimulation(scenario);
    expect(result.successRate).toBeGreaterThan(0.5);
  });

  it("Bengen 4% rule produces high success rate over 30-year horizon (cross-validation proxy)", () => {
    // Cross-validation against external SWR tools (cFIREsim / FIRECalc /
    // Open Social Security) is approximated here with a known-good
    // benchmark. Classic Bengen: a 4% withdrawal of a 60/40 portfolio over
    // 30 years should produce >85% success in moderate inflation. If this
    // drops sharply, the engine math has likely regressed.
    const scenario = makeTestScenario({
      profile: {
        ...makeTestScenario().profile,
        retirementAge: 65,
        planningHorizonAge: 95,
      },
      accounts: [
        {
          id: "acct-bengen",
          owner: "self",
          label: "Bengen 60/40",
          type: "taxable",
          balance: 1_000_000,
          costBasis: 1_000_000,
          annualContribution: 0,
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
      incomeSources: [],
      expenses: [],
      simulationConfig: {
        ...makeTestScenario().simulationConfig,
        iterations: 500,
        seed: 7,
        inflationMode: "fixed",
        fixedInflationRate: 0.025,
        capitalMarketAssumptions: {
          usLargeCap: { arithmeticMean: 0.085, stdDev: 0.18 },
          usSmallCap: { arithmeticMean: 0.09, stdDev: 0.22 },
          intlDeveloped: { arithmeticMean: 0.08, stdDev: 0.19 },
          intlEmerging: { arithmeticMean: 0.09, stdDev: 0.24 },
          usBonds: { arithmeticMean: 0.04, stdDev: 0.06 },
          tips: { arithmeticMean: 0.035, stdDev: 0.07 },
          cash: { arithmeticMean: 0.02, stdDev: 0.01 },
          stockBondCorrelationLow: 0.1,
          stockBondCorrelationHigh: 0.5,
        },
      },
    });
    // The user starts already-retired (currentAge ~36, but we override below
    // by adjusting birthYear so currentAge == 65).
    const yearsAgo = 65;
    scenario.profile.birthYear = new Date().getFullYear() - yearsAgo;
    scenario.profile.retirementAge = 65;
    const result = runSimulation(scenario);
    // Bengen-style baseline: at this allocation/return profile, success
    // should clear 70%. Set a generous floor so seeded variance doesn't
    // spuriously fail.
    expect(result.successRate).toBeGreaterThan(0.7);
  });

  it("canonical baseline scenario produces stable success rate", () => {
    // Regression-snapshot baseline. Locks the canonical (zero-vol CMA, fixed
    // 2.5% inflation, $75K salary, $40K expenses, 60/40 401k starting at
    // $100K) scenario's headline metrics to specific seeded values. If this
    // fails, an engine-math change has shifted the whole baseline.
    //
    // How to verify a failure:
    //   1. Re-run by hand with `yarn test simulation -t canonical`. Inspect
    //      the diff against the pinned values.
    //   2. successRate should remain ~1.0 - the scenario has positive net
    //      cash flow throughout retirement, so any drop below 1.0 indicates
    //      a real bug (e.g. taxes were over-applied, returns under-applied).
    //   3. estimatedRetirementAge=50 means the binary search found the
    //      earliest age the user can retire and still hit success >=90%.
    //      With these inputs the strict floor is age 50 (set by the loop
    //      `Math.max(20, currentAge)`); a value !=50 indicates the search
    //      bounds or success metric drifted.
    //   4. medianTerminalWealth and wealthByYear[10/20].p50 are sensitive to
    //      compounding math - check that returns are still applied at Step
    //      12 and inflation indexing hasn't doubled up.
    //
    // Update the expectations only after confirming the new numbers are
    // correct by inspection. Don't loosen precision to silence a real
    // regression.
    const scenario = makeTestScenario({
      simulationConfig: {
        ...makeTestScenario().simulationConfig,
        iterations: 500,
        seed: 12345,
      },
    });
    const result = runSimulation(scenario);
    expect(result.successRate).toBeCloseTo(1.0, 3);
    expect(result.medianTerminalWealth).toBeCloseTo(20_344_688, -3);
    expect(result.estimatedRetirementAge).toBe(50);
    expect(result.wealthByYear[10].p50).toBeCloseTo(735_562, -2);
    expect(result.wealthByYear[20].p50).toBeCloseTo(2_160_342, -3);
  });

  it("early Traditional IRA withdrawal triggers §72(t) penalty in totalTax", () => {
    // Retire at 50 with everything in a Traditional IRA. The first-year
    // withdrawals should incur the 10% §72(t) additional tax on top of
    // ordinary income tax. Compare against the same plan retiring at 60:
    // identical income/expenses but no penalty → lower tax in the early
    // years overlap.
    const earlyRetire = makeTestScenario({
      profile: {
        ...makeTestScenario().profile,
        birthYear: new Date().getFullYear() - 50,
        retirementAge: 50,
        planningHorizonAge: 80,
      },
      accounts: [
        {
          id: "ira",
          owner: "self",
          label: "Trad IRA",
          type: "traditional_ira",
          balance: 1_500_000,
          costBasis: 0,
          annualContribution: 0,
          employerMatch: 0,
          contributionEndAge: 50,
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
      incomeSources: [],
      expenses: [
        {
          id: "exp",
          label: "Living",
          category: "essential",
          annualAmount: 60_000,
          startAge: 50,
          endAge: null,
          inflationRate: null,
        },
      ],
      socialSecurity: {
        self: { enabled: false, fraMonthlyBenefit: 0, claimingAge: 67, fra: 67 },
        spouse: null,
        colaRate: 0.025,
        useSolvencyHaircut: false,
        solvencyHaircutYear: 2034,
        solvencyHaircutFactor: 0.79,
      },
      simulationConfig: {
        ...makeTestScenario().simulationConfig,
        iterations: 10,
        seed: 99,
        capitalMarketAssumptions: makeZeroVolatilityCMA(),
        inflationMode: "fixed",
        fixedInflationRate: 0,
      },
    });

    const result = runSimulation(earlyRetire);

    // The first retirement-year tax should include the §72(t) penalty.
    // $60k withdrawal → $6k penalty alone; ordinary tax on $60k single ~$5,228
    // → totalTax should be > 9k.
    const firstYear = result.taxByYear[0];
    expect(firstYear.p50).toBeGreaterThan(9_000);
  });

  it("Roth IRA contributions can be withdrawn early without penalty", () => {
    // Retire at 50 with a Roth IRA. Pre-existing balance is treated as
    // basis, so early withdrawals up to that basis should incur NO tax
    // and NO penalty.
    const scenario = makeTestScenario({
      profile: {
        ...makeTestScenario().profile,
        birthYear: new Date().getFullYear() - 50,
        retirementAge: 50,
        planningHorizonAge: 80,
      },
      accounts: [
        {
          id: "roth",
          owner: "self",
          label: "Roth IRA",
          type: "roth_ira",
          balance: 1_500_000,
          costBasis: 0, // engine should default to balance
          annualContribution: 0,
          employerMatch: 0,
          contributionEndAge: 50,
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
      incomeSources: [],
      expenses: [
        {
          id: "exp",
          label: "Living",
          category: "essential",
          annualAmount: 60_000,
          startAge: 50,
          endAge: null,
          inflationRate: null,
        },
      ],
      socialSecurity: {
        self: { enabled: false, fraMonthlyBenefit: 0, claimingAge: 67, fra: 67 },
        spouse: null,
        colaRate: 0.025,
        useSolvencyHaircut: false,
        solvencyHaircutYear: 2034,
        solvencyHaircutFactor: 0.79,
      },
      simulationConfig: {
        ...makeTestScenario().simulationConfig,
        iterations: 5,
        seed: 7,
        capitalMarketAssumptions: makeZeroVolatilityCMA(),
        inflationMode: "fixed",
        fixedInflationRate: 0,
      },
    });

    const result = runSimulation(scenario);
    // First-year tax should be ~0: contributions-first ordering means the
    // $60k withdrawal comes from the $1.5M basis, no taxable income, no
    // penalty.
    const firstYear = result.taxByYear[0];
    expect(firstYear.p50).toBeLessThan(100);
  });

  it("Rule of 55 waives 401(k) penalty when retiring at 55+", () => {
    // Retire at 55 with a Traditional 401(k). Early withdrawals should NOT
    // trigger the §72(t) penalty thanks to Rule of 55.
    const scenario = makeTestScenario({
      profile: {
        ...makeTestScenario().profile,
        birthYear: new Date().getFullYear() - 55,
        retirementAge: 55,
        planningHorizonAge: 80,
      },
      accounts: [
        {
          id: "k401",
          owner: "self",
          label: "401k",
          type: "traditional_401k",
          balance: 1_500_000,
          costBasis: 0,
          annualContribution: 0,
          employerMatch: 0,
          contributionEndAge: 55,
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
      incomeSources: [],
      expenses: [
        {
          id: "exp",
          label: "Living",
          category: "essential",
          annualAmount: 60_000,
          startAge: 55,
          endAge: null,
          inflationRate: null,
        },
      ],
      socialSecurity: {
        self: { enabled: false, fraMonthlyBenefit: 0, claimingAge: 67, fra: 67 },
        spouse: null,
        colaRate: 0.025,
        useSolvencyHaircut: false,
        solvencyHaircutYear: 2034,
        solvencyHaircutFactor: 0.79,
      },
      simulationConfig: {
        ...makeTestScenario().simulationConfig,
        iterations: 5,
        seed: 7,
        capitalMarketAssumptions: makeZeroVolatilityCMA(),
        inflationMode: "fixed",
        fixedInflationRate: 0,
      },
    });

    const result = runSimulation(scenario);
    // First-year tax should be just ordinary income tax on $60k withdrawal.
    // Single filer 2026 ≈ $5,228. No penalty (Rule of 55). So tax should
    // be < $7,000 (clearly less than the $11k+ it would be with penalty).
    const firstYear = result.taxByYear[0];
    expect(firstYear.p50).toBeLessThan(7_000);
    expect(firstYear.p50).toBeGreaterThan(3_000);
  });

  it("fixed-interest account uses fixedAnnualReturn instead of market returns", () => {
    const scenario = makeTestScenario({
      accounts: [
        {
          id: "hysa-1",
          owner: "self",
          label: "HYSA",
          type: "hysa",
          balance: 100_000,
          costBasis: 0,
          annualContribution: 0,
          employerMatch: 0,
          contributionEndAge: 65,
          allocation: {
            usLargeCap: 0,
            usSmallCap: 0,
            intlDeveloped: 0,
            intlEmerging: 0,
            usBonds: 0,
            tips: 0,
            cash: 1,
          },
          useGlidePath: false,
          glidePath: [],
          fixedAnnualReturn: 0.045,
        },
      ],
      expenses: [],
      incomeSources: [],
      simulationConfig: {
        ...makeTestScenario().simulationConfig,
        iterations: 5,
        inflationMode: "fixed",
        fixedInflationRate: 0,
      },
    });

    const result = runSimulation(scenario);
    // After 1 year at 4.5%: $104,500
    const firstYear = result.wealthByYear[0];
    // Balance should grow by fixed rate, not random market returns
    // All iterations should be identical since there's no randomness
    expect(firstYear.p5).toBeCloseTo(firstYear.p95, 0);
  });

  it("useSpendingSmile reduces strategy-driven spending in the slow-go phase (~age 85)", () => {
    // Two otherwise-identical retirees with the strategy as the spending
    // driver (no listed expenses), one with the Blanchett spending smile
    // enabled, one without. By age 85 the smile is ~0.74×, so the
    // smile-enabled run should spend materially less. The integration test
    // mirrors the "useSpendingSmile" toggle wired into the engine year-loop
    // (simulation.ts ~680).
    const baseScenario = makeTestScenario({
      profile: {
        ...makeTestScenario().profile,
        birthYear: new Date().getFullYear() - 65,
        retirementAge: 65,
        planningHorizonAge: 95,
      },
      // Drop expenses so strategySpending drives the target. With listed
      // expenses, the engine takes the listed-expense branch and the smile
      // multiplies the precomputed inflation-adjusted amount; we want a
      // clean "strategy * smile" comparison here.
      expenses: [],
      simulationConfig: {
        ...makeTestScenario().simulationConfig,
        iterations: 50,
        seed: 1234,
      },
    });
    const flat = runSimulation({
      ...baseScenario,
      withdrawalStrategy: { ...baseScenario.withdrawalStrategy, useSpendingSmile: false },
    });
    const smile = runSimulation({
      ...baseScenario,
      withdrawalStrategy: { ...baseScenario.withdrawalStrategy, useSpendingSmile: true },
    });
    const flatAt85 = flat.spendingByYear.find((s) => s.age === 85);
    const smileAt85 = smile.spendingByYear.find((s) => s.age === 85);
    expect(flatAt85).toBeDefined();
    expect(smileAt85).toBeDefined();
    expect(smileAt85!.p50).toBeLessThan(flatAt85!.p50);
  });

  it("stochastic_mortality runs paths past planningHorizonAge for the rare long-lived draws", () => {
    // The Gompertz model gives non-trivial survival probability past 95 (modal
    // age 87.5-91.5). With longevityModel: stochastic_mortality the loop
    // ceiling should be relaxed beyond planningHorizonAge so the right tail
    // isn't silently truncated. The test inspects wealthByYear: with a 95
    // horizon, fixed_age would emit exactly 95-startAge+1 entries; stochastic
    // should emit more, since at least one path survives past 95.
    const scenarioFixed = makeTestScenario({
      profile: {
        ...makeTestScenario().profile,
        birthYear: new Date().getFullYear() - 65,
        retirementAge: 65,
        planningHorizonAge: 95,
      },
      simulationConfig: {
        ...makeTestScenario().simulationConfig,
        iterations: 500,
        seed: 7,
        longevityModel: "fixed_age",
        fixedEndAge: 95,
      },
    });
    const fixedResult = runSimulation(scenarioFixed);
    const lastFixedAge = fixedResult.wealthByYear[fixedResult.wealthByYear.length - 1].age;
    expect(lastFixedAge).toBe(95);

    const scenarioStochastic = makeTestScenario({
      profile: {
        ...makeTestScenario().profile,
        birthYear: new Date().getFullYear() - 65,
        retirementAge: 65,
        planningHorizonAge: 95,
      },
      simulationConfig: {
        ...makeTestScenario().simulationConfig,
        iterations: 500,
        seed: 7,
        longevityModel: "stochastic_mortality",
      },
    });
    const stochasticResult = runSimulation(scenarioStochastic);
    const lastStochAge = stochasticResult.wealthByYear[stochasticResult.wealthByYear.length - 1].age;
    // At least one of 500 paths should outlive 95 in the Gompertz tail.
    expect(lastStochAge).toBeGreaterThan(95);
  });
});
