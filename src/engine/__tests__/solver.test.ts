import { describe, it, expect } from "vitest";
import { runSimulation } from "../simulation";
import {
  solve,
  solverFingerprint,
  applyTargetSpend,
  setTotalContribution,
  type TrialRunner,
} from "../solver";
import { createDefaultScenario } from "@/models/defaults";
import type { Scenario } from "@/models/scenario";

// Tests use a small, well-funded scenario so the solver converges quickly
// even with reduced Monte Carlo iterations. The exact answers don't matter.
// We assert *properties* (monotonicity, convergence, determinism) rather
// than specific numbers, which would be brittle against engine math tweaks.

function makeFundedScenario(): Scenario {
  const base = createDefaultScenario("Solver Test");
  return {
    ...base,
    profile: {
      ...base.profile,
      birthYear: 1990,
      retirementAge: 65,
      planningHorizonAge: 95,
    },
    accounts: [
      {
        id: "acct-1",
        owner: "self",
        label: "401k",
        type: "traditional_401k",
        balance: 750_000,
        costBasis: 0,
        annualContribution: 22_000,
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
        annualAmount: 95_000,
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
        annualAmount: 50_000,
        startAge: 65,
        endAge: null,
        inflationRate: null,
      },
    ],
    simulationConfig: {
      ...base.simulationConfig,
      iterations: 800, // small for fast tests; solver overrides per-trial
      seed: 42,
    },
  };
}

// Wraps runSimulation to satisfy the TrialRunner interface. Tests run on the
// main thread (no workers); production wires this through useSimulation's
// runOnce in step 3.
const trialRunner: TrialRunner = async (scenario, opts) => {
  const trialScenario: Scenario = {
    ...scenario,
    simulationConfig: { ...scenario.simulationConfig, iterations: opts.iterations, seed: opts.seed },
  };
  return runSimulation(trialScenario);
};

describe("solverFingerprint", () => {
  it("is stable when only decorative fields differ", () => {
    const a = makeFundedScenario();
    const b = structuredClone(a);
    b.name = "Different Name";
    b.color = "#000000";
    b.description = "edited";
    b.createdAt = "2020-01-01";
    b.updatedAt = "2024-01-01";
    b.parentId = "some-parent";
    b.isBaseline = !a.isBaseline;
    expect(solverFingerprint(a)).toBe(solverFingerprint(b));
  });

  it("changes when expenses change", () => {
    const a = makeFundedScenario();
    const b = structuredClone(a);
    b.expenses[0].annualAmount = 60_000;
    expect(solverFingerprint(a)).not.toBe(solverFingerprint(b));
  });

  it("changes when retirement age changes", () => {
    const a = makeFundedScenario();
    const b = structuredClone(a);
    b.profile.retirementAge = 67;
    expect(solverFingerprint(a)).not.toBe(solverFingerprint(b));
  });

  it("ignores changes to scenario.goal (would self-invalidate the cache)", () => {
    const a = makeFundedScenario();
    const b = structuredClone(a);
    b.goal = {
      cache: {},
      fingerprint: null,
      lastSolvedAt: null,
    };
    expect(solverFingerprint(a)).toBe(solverFingerprint(b));
  });
});

describe("applyTargetSpend", () => {
  it("scales retirement-active expenses to match target", () => {
    const s = makeFundedScenario();
    const scaled = applyTargetSpend(s, 75_000);
    const newTotal = scaled.expenses
      .filter((e) => e.startAge <= 65 && (e.endAge == null || e.endAge >= 65))
      .reduce((sum, e) => sum + e.annualAmount, 0);
    expect(newTotal).toBeCloseTo(75_000, 0);
  });

  it("synthesizes an expense when no retirement expenses exist", () => {
    const s = makeFundedScenario();
    s.expenses = [];
    const scaled = applyTargetSpend(s, 60_000);
    expect(scaled.expenses).toHaveLength(1);
    expect(scaled.expenses[0].annualAmount).toBe(60_000);
    expect(scaled.expenses[0].category).toBe("essential");
  });
});

describe("setTotalContribution", () => {
  it("scales eligible accounts proportionally to hit the target total", () => {
    const s = makeFundedScenario();
    const result = setTotalContribution(s, 33_000);
    const newTotal = result.accounts
      .filter((a) => a.contributionEndAge >= s.profile.retirementAge)
      .reduce((sum, a) => sum + a.annualContribution, 0);
    expect(newTotal).toBeCloseTo(33_000, 0);
  });

  it("zeros out contributions when target is zero", () => {
    const s = makeFundedScenario();
    const result = setTotalContribution(s, 0);
    const newTotal = result.accounts.reduce((sum, a) => sum + a.annualContribution, 0);
    expect(newTotal).toBe(0);
  });
});

describe("solve()", () => {
  it("Q1: solves earliest_retirement_age, integer-valued and within bounds", async () => {
    const s = makeFundedScenario();
    const result = await solve(
      s,
      {
        question: "earliest_retirement_age",
        targets: { retirementAge: 65, annualSpend: 50_000, successRate: 0.7 },
      },
      trialRunner,
      { searchIterations: 600, validationIterations: 800 },
    );

    expect(result.question).toBe("earliest_retirement_age");
    expect(Number.isInteger(result.solvedValue)).toBe(true);
    expect(result.solvedValue).toBeGreaterThanOrEqual(result.searchBoundsLo);
    expect(result.solvedValue).toBeLessThanOrEqual(result.searchBoundsHi);
    expect(result.achievedSuccessRate).toBeGreaterThanOrEqual(0);
    expect(result.achievedSuccessRate).toBeLessThanOrEqual(1);
  }, 30_000);

  it("Q2: solves required_savings as absolute minimum total; result is non-negative", async () => {
    const s = makeFundedScenario();
    const result = await solve(
      s,
      {
        question: "required_savings",
        targets: { retirementAge: 65, annualSpend: 50_000, successRate: 0.85 },
      },
      trialRunner,
      { searchIterations: 600, validationIterations: 800 },
    );

    expect(result.question).toBe("required_savings");
    expect(result.solvedValue).toBeGreaterThanOrEqual(0);
    expect(result.solvedValue).toBeLessThanOrEqual(result.searchBoundsHi);
    expect(result.medianPortfolioAtRetirement).toBeGreaterThan(0);
  }, 30_000);

  it("Q3: solves sustainable_spend; result is positive", async () => {
    const s = makeFundedScenario();
    const result = await solve(
      s,
      {
        question: "sustainable_spend",
        targets: { retirementAge: 65, annualSpend: 0, successRate: 0.85 },
      },
      trialRunner,
      { searchIterations: 600, validationIterations: 800 },
    );

    expect(result.question).toBe("sustainable_spend");
    expect(result.solvedValue).toBeGreaterThan(0);
  }, 30_000);

  it("is deterministic: same scenario + same input → same solvedValue", async () => {
    const s = makeFundedScenario();
    const input = {
      question: "earliest_retirement_age" as const,
      targets: { retirementAge: 65, annualSpend: 50_000, successRate: 0.75 },
    };
    const r1 = await solve(s, input, trialRunner, {
      searchIterations: 600,
      validationIterations: 800,
    });
    const r2 = await solve(s, input, trialRunner, {
      searchIterations: 600,
      validationIterations: 800,
    });
    expect(r1.solvedValue).toBe(r2.solvedValue);
    expect(r1.achievedSuccessRate).toBe(r2.achievedSuccessRate);
  }, 60_000);

  it("respects abort signal", async () => {
    const s = makeFundedScenario();
    const ac = new AbortController();
    ac.abort();
    await expect(
      solve(
        s,
        {
          question: "earliest_retirement_age",
          targets: { retirementAge: 65, annualSpend: 50_000, successRate: 0.75 },
        },
        trialRunner,
        { searchIterations: 600, validationIterations: 800, signal: ac.signal },
      ),
    ).rejects.toThrow(/aborted/i);
  });

  it("calls onProgress with monotonically non-decreasing step numbers", async () => {
    const s = makeFundedScenario();
    const steps: number[] = [];
    await solve(
      s,
      {
        question: "earliest_retirement_age",
        targets: { retirementAge: 65, annualSpend: 50_000, successRate: 0.75 },
      },
      trialRunner,
      {
        searchIterations: 400,
        validationIterations: 600,
        onProgress: (step) => steps.push(step),
      },
    );
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
    }
  }, 30_000);
});
