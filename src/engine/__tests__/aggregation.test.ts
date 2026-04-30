import { describe, it, expect } from "vitest";
import { aggregateResults } from "../aggregation";
import type { IterationResult, PrecomputedConfig, AnnualSnapshot } from "../types";
import { DEFAULT_SIMULATION_CONFIG } from "@/models/defaults";

function makeSnapshot(age: number, overrides: Partial<AnnualSnapshot> = {}): AnnualSnapshot {
  return {
    age,
    year: 1990 + age,
    totalWealth: 1_000_000,
    totalIncome: 50_000,
    totalSpending: 40_000,
    totalTax: 10_000,
    earlyWithdrawalPenalty: 0,
    ssIncome: 0,
    withdrawals: 40_000,
    contributions: 0,
    rmdAmount: 0,
    rothConversion: 0,
    accountBalances: new Float64Array(0),
    isRuined: false,
    ...overrides,
  };
}

function makeIteration(overrides: Partial<IterationResult> = {}): IterationResult {
  return {
    snapshots: [makeSnapshot(65), makeSnapshot(66), makeSnapshot(67)],
    terminalWealth: 1_000_000,
    depletionAge: null,
    maxSpendingCut: 0,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<PrecomputedConfig> = {}): PrecomputedConfig {
  return {
    startAge: 65,
    endAge: 67,
    startYear: 2055,
    birthYear: 1990,
    retirementAge: 65,
    spouseRetirementAge: null,
    isMarried: false,
    selfSex: "male",
    spouseSex: null,
    spouseBirthYear: null,
    selfBirthMonth: 1,
    spouseBirthMonth: null,
    choleskyLow: [],
    choleskyHigh: [],
    incomeByAge: new Map(),
    expenseByAge: new Map(),
    contributionOverridesByAge: new Map(),
    lifeEventsByAge: new Map(),
    initialAccounts: [],
    allocationsByAccountAge: [],
    ssConfig: {} as any,
    withdrawalStrategy: {} as any,
    withdrawalOrder: {} as any,
    simulationConfig: DEFAULT_SIMULATION_CONFIG,
    warnings: [],
    stateOfResidence: "",
    ...overrides,
  };
}

describe("aggregateResults", () => {
  it("100% success rate when no iterations are ruined", () => {
    const iterations = Array.from({ length: 100 }, () => makeIteration());
    const result = aggregateResults("test", iterations, makeConfig(), DEFAULT_SIMULATION_CONFIG, 100);
    expect(result.successRate).toBe(1.0);
  });

  it("correct success rate with some failures", () => {
    const good = Array.from({ length: 75 }, () => makeIteration());
    const bad = Array.from({ length: 25 }, () => makeIteration({ depletionAge: 80, terminalWealth: 0 }));
    const result = aggregateResults("test", [...good, ...bad], makeConfig(), DEFAULT_SIMULATION_CONFIG, 100);
    expect(result.successRate).toBeCloseTo(0.75, 2);
  });

  it("0% success rate when all iterations fail", () => {
    const iterations = Array.from({ length: 100 }, () =>
      makeIteration({ depletionAge: 70, terminalWealth: 0 }),
    );
    const result = aggregateResults("test", iterations, makeConfig(), DEFAULT_SIMULATION_CONFIG, 100);
    expect(result.successRate).toBe(0);
  });

  it("percentiles are correctly ordered (p5 ≤ p25 ≤ p50 ≤ p75 ≤ p95)", () => {
    const iterations = Array.from({ length: 1000 }, (_, i) =>
      makeIteration({
        snapshots: [
          makeSnapshot(65, { totalWealth: 500_000 + i * 1_000 }),
          makeSnapshot(66, { totalWealth: 600_000 + i * 1_000 }),
          makeSnapshot(67, { totalWealth: 700_000 + i * 1_000 }),
        ],
        terminalWealth: 700_000 + i * 1_000,
      }),
    );
    const result = aggregateResults("test", iterations, makeConfig(), DEFAULT_SIMULATION_CONFIG, 100);

    for (const wp of result.wealthByYear) {
      expect(wp.p5).toBeLessThanOrEqual(wp.p25);
      expect(wp.p25).toBeLessThanOrEqual(wp.p50);
      expect(wp.p50).toBeLessThanOrEqual(wp.p75);
      expect(wp.p75).toBeLessThanOrEqual(wp.p95);
    }
  });

  it("median terminal wealth is the 50th percentile", () => {
    const iterations = Array.from({ length: 101 }, (_, i) => makeIteration({ terminalWealth: i * 10_000 }));
    const result = aggregateResults("test", iterations, makeConfig(), DEFAULT_SIMULATION_CONFIG, 100);
    // Median of 0, 10k, 20k, ..., 1M → 500k
    expect(result.medianTerminalWealth).toBeCloseTo(500_000, -3);
  });

  it("wealthByYear has correct number of entries", () => {
    const config = makeConfig({ startAge: 65, endAge: 95 });
    const expandedIter = makeIteration({
      snapshots: Array.from({ length: 31 }, (_, i) => makeSnapshot(65 + i)),
    });
    const result = aggregateResults("test", [expandedIter], config, DEFAULT_SIMULATION_CONFIG, 100);
    expect(result.wealthByYear).toHaveLength(31);
  });

  it("empty iterations → zero result", () => {
    const result = aggregateResults("test", [], makeConfig(), DEFAULT_SIMULATION_CONFIG, 100);
    expect(result.successRate).toBe(0);
    expect(result.medianTerminalWealth).toBe(0);
    expect(result.wealthByYear).toHaveLength(0);
  });

  it("adjustment probability reflects spending cuts", () => {
    const noAdj = Array.from({ length: 50 }, () => makeIteration({ maxSpendingCut: 0 }));
    const withAdj = Array.from({ length: 50 }, () => makeIteration({ maxSpendingCut: 0.15 }));
    const result = aggregateResults(
      "test",
      [...noAdj, ...withAdj],
      makeConfig(),
      DEFAULT_SIMULATION_CONFIG,
      100,
    );
    expect(result.adjustmentProbability).toBeCloseTo(0.5, 2);
  });

  it("depletion age buckets count correctly", () => {
    const iterations = [
      makeIteration({ depletionAge: 80 }),
      makeIteration({ depletionAge: 80 }),
      makeIteration({ depletionAge: 85 }),
      makeIteration({ depletionAge: null }),
    ];
    const config = makeConfig({ startAge: 65, endAge: 95 });
    const result = aggregateResults("test", iterations, config, DEFAULT_SIMULATION_CONFIG, 100);
    const age80 = result.depletionAgeBuckets.find((b) => b.age === 80);
    const age85 = result.depletionAgeBuckets.find((b) => b.age === 85);
    expect(age80?.count).toBe(2);
    expect(age85?.count).toBe(1);
  });

  it("scenarioId is preserved", () => {
    const result = aggregateResults(
      "my-scenario-id",
      [makeIteration()],
      makeConfig(),
      DEFAULT_SIMULATION_CONFIG,
      100,
    );
    expect(result.scenarioId).toBe("my-scenario-id");
  });

  it("durationMs is preserved", () => {
    const result = aggregateResults(
      "test",
      [makeIteration()],
      makeConfig(),
      DEFAULT_SIMULATION_CONFIG,
      456.7,
    );
    expect(result.durationMs).toBe(456.7);
  });
});
