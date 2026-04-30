import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAppStore } from "@/store";
import { createDefaultScenario } from "@/models/defaults";
import { solverFingerprint } from "@/engine/solver";

// Mock Worker so the underlying runOnce path is inert; useAutoSolve gates
// its solver-trigger effect on simStatus === "complete", and we want to
// verify that gating without actually running solver iterations.
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(_msg: unknown) {}
  terminate() {}
}
vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);

import { useAutoSolve } from "../useAutoSolve";

beforeEach(() => {
  useAppStore.setState({
    scenarios: [],
    activeScenarioId: null,
    simulations: {},
    wizardCompleted: false,
  });
});

describe("useAutoSolve", () => {
  it("does nothing when scenario is undefined", () => {
    expect(() => renderHook(() => useAutoSolve(undefined))).not.toThrow();
  });

  it("does nothing when there are no retirement-period expenses", () => {
    // Without expenses, retirementSpend = 0 and shouldSolve is false.
    const scenario = createDefaultScenario("Empty");
    useAppStore.getState().addScenario(scenario);
    expect(() => renderHook(() => useAutoSolve(scenario))).not.toThrow();
    // No solver run → no goal cache write back.
    expect(useAppStore.getState().scenarios[0].goal).toBeUndefined();
  });

  it("waits for sim status === 'complete' before solving", () => {
    // Build a scenario with retirement-period expenses so retirementSpend > 0.
    const scenario = createDefaultScenario("Solver Trigger");
    scenario.expenses = [
      {
        id: "exp",
        label: "Living",
        category: "essential",
        annualAmount: 50_000,
        startAge: 65,
        endAge: null,
        inflationRate: null,
      },
    ];
    useAppStore.getState().addScenario(scenario);

    // sim entry exists but status is "running" — the gate should keep the
    // solver paused.
    useAppStore.setState({
      simulations: {
        [scenario.id]: {
          status: "running",
          progress: 0.5,
          result: null,
          error: null,
          fingerprint: solverFingerprint(scenario),
        },
      },
    });

    expect(() => renderHook(() => useAutoSolve(scenario))).not.toThrow();
    // Hook does not synchronously update the goal cache before the sim
    // completes. (The full async path is exercised by simulation/solver
    // integration tests; this verifies the gating logic.)
    expect(useAppStore.getState().scenarios[0].goal).toBeUndefined();
  });
});
