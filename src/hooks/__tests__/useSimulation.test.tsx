import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppStore } from "@/store";
import { createDefaultScenario } from "@/models/defaults";
import { solverFingerprint } from "@/engine/solver";

// Mock the Worker constructor so the hook can mount in jsdom without
// spinning up a real worker. Stubbed BEFORE importing the hook so it
// captures the fake at module-evaluation time.
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  posted: unknown[] = [];
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(msg: unknown) {
    this.posted.push(msg);
  }
  terminate() {}
}

vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);

// Imported after the global stub.
import { useSimulation, useRerun } from "../useSimulation";

function totalPostedCount(): number {
  return FakeWorker.all.reduce((n, w) => n + w.posted.length, 0);
}

beforeEach(() => {
  useAppStore.setState({
    scenarios: [],
    activeScenarioId: null,
    simulations: {},
    wizardCompleted: false,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSimulation", () => {
  it("returns a stable rerun function", () => {
    const scenario = createDefaultScenario("Test");
    const { result } = renderHook(() => useSimulation(scenario));
    expect(typeof result.current.rerun).toBe("function");
  });

  it("schedules a worker run on mount with a fresh scenario (after debounce)", () => {
    const scenario = createDefaultScenario("Run Me");
    useAppStore.getState().addScenario(scenario);
    const before = totalPostedCount();
    renderHook(() => useSimulation(scenario));
    // Hook's debounce is 1000ms before posting to a worker.
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    const after = totalPostedCount();
    expect(after).toBeGreaterThan(before);
    const allMessages = FakeWorker.all.flatMap((w) => w.posted);
    expect(allMessages.some((m) => (m as { type: string }).type === "RUN_PARTIAL")).toBe(true);
  });

  it("does not schedule a run when the scenario fingerprint matches the stored value", () => {
    const scenario = createDefaultScenario("Cached");
    useAppStore.getState().addScenario(scenario);
    useAppStore.setState({
      simulations: {
        [scenario.id]: {
          status: "complete",
          progress: 1,
          result: null,
          error: null,
          fingerprint: solverFingerprint(scenario),
        },
      },
    });

    const before = totalPostedCount();
    renderHook(() => useSimulation(scenario));
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    const after = totalPostedCount();
    // Auto-run effect short-circuits on fingerprint match. No new
    // RUN_PARTIAL for this scenario should be posted.
    const newMessages = FakeWorker.all.flatMap((w) => w.posted).slice(before);
    const newPartialsForScenario = newMessages.filter(
      (m) =>
        (m as { type: string }).type === "RUN_PARTIAL" &&
        (m as { scenarioId: string }).scenarioId === scenario.id,
    );
    expect(after - before).toBeLessThanOrEqual(newMessages.length);
    expect(newPartialsForScenario.length).toBe(0);
  });
});

describe("useRerun", () => {
  it("returns a callable function", () => {
    const scenario = createDefaultScenario("Manual");
    useAppStore.getState().addScenario(scenario);
    const { result } = renderHook(() => useRerun(scenario));
    expect(typeof result.current).toBe("function");
  });

  it("clears the stored fingerprint when invoked", () => {
    const scenario = createDefaultScenario("Manual");
    useAppStore.getState().addScenario(scenario);
    useAppStore.setState({
      simulations: {
        [scenario.id]: {
          status: "complete",
          progress: 1,
          result: null,
          error: null,
          fingerprint: "stale-fingerprint",
        },
      },
    });

    const { result } = renderHook(() => useRerun(scenario));
    act(() => {
      result.current();
    });
    // After rerun, the fingerprint should differ from the pre-seeded
    // stale-fingerprint - either reset to null or replaced with the fresh
    // solverFingerprint(scenario).
    const fp = useAppStore.getState().simulations[scenario.id]?.fingerprint;
    expect(fp).not.toBe("stale-fingerprint");
  });
});
