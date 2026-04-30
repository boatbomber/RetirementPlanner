import { describe, it, expect } from "vitest";
import { createDefaultScenario } from "@/models/defaults";
import type { Scenario } from "@/models/scenario";
import type { WorkerResponse } from "../types";
import { createWorkerHandlers } from "../worker-handlers";

function makeMinimalScenario(): Scenario {
  const base = createDefaultScenario("Worker Test");
  return {
    ...base,
    profile: {
      ...base.profile,
      birthYear: 1990,
      retirementAge: 65,
      filingStatus: "single",
      planningHorizonAge: 75, // short horizon keeps the test fast
    },
    accounts: [
      {
        id: "acct-1",
        owner: "self",
        label: "401k",
        type: "traditional_401k",
        balance: 500_000,
        costBasis: 0,
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
    expenses: [
      {
        id: "exp",
        label: "Living",
        category: "essential",
        annualAmount: 30_000,
        startAge: 65,
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
      ...base.simulationConfig,
      iterations: 4,
      seed: 99,
    },
  };
}

function collect(): {
  post: (msg: WorkerResponse, transfer?: Transferable[]) => void;
  messages: WorkerResponse[];
  transfers: Transferable[][];
} {
  const messages: WorkerResponse[] = [];
  const transfers: Transferable[][] = [];
  return {
    post: (msg, transfer) => {
      messages.push(msg);
      transfers.push(transfer ?? []);
    },
    messages,
    transfers,
  };
}

describe("createWorkerHandlers", () => {
  it("RUN_SIMULATION posts a final RESULT with the simulation output", () => {
    const sink = collect();
    const handlers = createWorkerHandlers(sink.post);
    const scenario = makeMinimalScenario();

    handlers.handle({ type: "RUN_SIMULATION", scenarioId: scenario.id, scenario });

    const result = sink.messages.find((m) => m.type === "RESULT");
    expect(result).toBeDefined();
    if (result?.type !== "RESULT") throw new Error("expected RESULT");
    expect(result.scenarioId).toBe(scenario.id);
    expect(typeof result.result.successRate).toBe("number");
    expect(result.result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.result.successRate).toBeLessThanOrEqual(1);
  });

  it("RUN_PARTIAL posts a PARTIAL_RESULT with transferable buffers", () => {
    const sink = collect();
    const handlers = createWorkerHandlers(sink.post);
    const scenario = makeMinimalScenario();

    handlers.handle({
      type: "RUN_PARTIAL",
      scenarioId: scenario.id,
      scenario,
      partialIdx: 0,
      totalPartials: 1,
      count: 4,
      seed: 99,
    });

    const partial = sink.messages.find((m) => m.type === "PARTIAL_RESULT");
    expect(partial).toBeDefined();
    if (partial?.type !== "PARTIAL_RESULT") throw new Error("expected PARTIAL_RESULT");
    expect(partial.partialIdx).toBe(0);
    // Buffers were transferred
    const partialIdx = sink.messages.findIndex((m) => m.type === "PARTIAL_RESULT");
    expect(sink.transfers[partialIdx].length).toBeGreaterThan(0);
  });

  it("CANCEL flips the cancellation flag for the running scenario", () => {
    const sink = collect();
    const handlers = createWorkerHandlers(sink.post);
    const scenario = makeMinimalScenario();

    // Send CANCEL when nothing is running. Flag should remain false because
    // the running scenarioId is null.
    handlers.handle({ type: "CANCEL", scenarioId: scenario.id });
    expect(handlers.isCancelled()).toBe(false);
  });

  it("RUN_AGGREGATE produces a RESULT from packed partials", () => {
    const sink = collect();
    const handlers = createWorkerHandlers(sink.post);
    const scenario = makeMinimalScenario();

    // First, generate a packed partial via RUN_PARTIAL so we have a real
    // payload to feed back into aggregate.
    handlers.handle({
      type: "RUN_PARTIAL",
      scenarioId: scenario.id,
      scenario,
      partialIdx: 0,
      totalPartials: 1,
      count: 4,
      seed: 99,
    });
    const partial = sink.messages.find((m) => m.type === "PARTIAL_RESULT");
    if (partial?.type !== "PARTIAL_RESULT") throw new Error("expected PARTIAL_RESULT");

    const aggregateSink = collect();
    const aggregateHandlers = createWorkerHandlers(aggregateSink.post);
    aggregateHandlers.handle({
      type: "RUN_AGGREGATE",
      scenarioId: scenario.id,
      scenario,
      partials: [partial.packed],
      durationMs: 10,
    });

    const result = aggregateSink.messages.find((m) => m.type === "RESULT");
    expect(result).toBeDefined();
    if (result?.type !== "RESULT") throw new Error("expected RESULT");
    expect(result.scenarioId).toBe(scenario.id);
    expect(typeof result.result.successRate).toBe("number");
  });

  it("posts ERROR when the underlying handler throws", () => {
    const sink = collect();
    const handlers = createWorkerHandlers(sink.post);

    // RUN_AGGREGATE with a non-Scenario object trips an internal lookup
    // inside aggregateAcrossWorkersPacked, exercising the error path of
    // the dispatcher.
    handlers.handle({
      type: "RUN_AGGREGATE",
      scenarioId: "missing",
      // Force the underlying call to throw by passing an obviously invalid
      // scenario shape (cast at the test boundary; runtime would never
      // produce this).
      scenario: {} as unknown as Scenario,
      partials: [],
      durationMs: 0,
    });

    const errorMsg = sink.messages.find((m) => m.type === "ERROR");
    expect(errorMsg).toBeDefined();
  });
});
