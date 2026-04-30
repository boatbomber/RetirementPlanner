import { useEffect, useRef, useCallback, useMemo } from "react";
import { useAppStore } from "@/store";
import { solverFingerprint } from "@/engine/solver";
import { SEED_FALLBACK } from "@/engine/prng";
import type { Scenario } from "@/models/scenario";
import type { SimulationResult } from "@/models/results";
import type { PackedIterations, WorkerRequest, WorkerResponse } from "@/engine/types";
import { packedIterationsBuffers } from "@/engine/packed";

// Debounce scenario edits before re-running the simulation so a burst of
// slider tweaks coalesces into one worker spin-up. 1000ms also gates the
// auto-solve loop in useAutoSolve (which runs after this completes), so
// the full "edit → settled" window is bounded.
const DEBOUNCE_MS = 1000;

// Pool size: clamp to [1, 8]. Beyond ~8 workers, marshaling overhead and
// per-worker fixed cost (precompute, JIT warmup) start outweighing the
// parallel speedup for our problem size (~10k iterations × ~70 years).
function poolSize(): number {
  const hw =
    typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number"
      ? navigator.hardwareConcurrency
      : 4;
  return Math.max(1, Math.min(8, hw));
}

// Single canonical fingerprint shared with the solver. Excluding `goal`,
// `updatedAt`, and decorative fields (name, color, description, parentId,
// isBaseline) means writing a fresh goal cache entry doesn't trigger a self-
// invalidating sim re-run.
const fingerprint = solverFingerprint;

// ─── Module-level worker pool ──────────────────────────────────────────────
// Workers outlive any individual component instance, so switching routes
// (Dashboard → Scenario → Comparisons) unmounts useSimulation, but we don't
// want the in-flight Monte Carlo run to be killed. Pool is created lazily on
// first run and persists for the page's lifetime.
let pool: Worker[] | null = null;
let activeRun: ActiveRun | null = null;

interface ActiveRun {
  scenarioId: string;
  scenario: Scenario;
  total: number;
  partialsRemaining: number;
  partials: PackedIterations[];
  // Per-worker iteration counts (indexed by partialIdx). Summed for true
  // global progress. Extrapolating from per-worker checkpoints overshoots
  // and pins the bar at 100% before all workers finish.
  perWorkerCompleted: Int32Array;
  // Wall-clock start, used so durationMs reflects the user's wait, not the
  // sum of per-worker compute time (which double-counts cores).
  startTime: number;
  // Set once we've dispatched RUN_AGGREGATE. We then wait for that worker's
  // RESULT message and ignore additional PARTIAL_RESULTs.
  awaitingAggregate: boolean;
  onProgress: (completed: number, total: number) => void;
  onComplete: (result: SimulationResult) => void;
  onError: (error: string) => void;
}

function ensurePool(): Worker[] {
  if (pool) return pool;
  const size = poolSize();
  pool = [];
  for (let i = 0; i < size; i++) {
    // Relative path is required: Vite's worker URL transform does not run
    // path-alias resolution on `new URL(...)` arguments, so an `@/` alias
    // is left as a literal directory in the resolved URL and 404s at runtime.
    const w = new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" });
    w.onmessage = handlePoolMessage;
    w.onerror = (err) => {
      // Cross-origin worker scripts have err.message scrubbed to "", so fall
      // back to filename:lineno so the user sees something actionable.
      const where = err.filename ? `${err.filename}:${err.lineno ?? "?"}` : "worker";
      const msg = err.message && err.message.length > 0 ? err.message : `Worker error at ${where}`;
      console.error("Worker error", err);
      if (activeRun) {
        activeRun.onError(msg);
      } else {
        // No active run owns this error (e.g. it fired between runs). Surface
        // it on the active scenario's slot so the UI doesn't sit in "complete"
        // with stale data and no signal that something failed.
        const state = useAppStore.getState();
        const id = state.activeScenarioId;
        if (id) state.setSimulationError(id, msg);
      }
    };
    pool.push(w);
  }
  return pool;
}

function handlePoolMessage(e: MessageEvent<WorkerResponse>) {
  const msg = e.data;
  if (!activeRun || msg.scenarioId !== activeRun.scenarioId) return;

  switch (msg.type) {
    case "PROGRESS": {
      // Worker sends its local-completed count plus its partialIdx. We keep
      // the most recent count per worker; summing across workers gives the
      // true global progress.
      if (typeof msg.partialIdx === "number") {
        activeRun.perWorkerCompleted[msg.partialIdx] = msg.completed;
      }
      let sum = 0;
      for (let i = 0; i < activeRun.perWorkerCompleted.length; i++) {
        sum += activeRun.perWorkerCompleted[i];
      }
      const completed = Math.min(activeRun.total, sum);
      activeRun.onProgress(completed, activeRun.total);
      break;
    }
    case "PARTIAL_RESULT": {
      activeRun.partials[msg.partialIdx] = msg.packed;
      activeRun.partialsRemaining -= 1;
      if (activeRun.partialsRemaining === 0 && !activeRun.awaitingAggregate) {
        // All packed partials arrived (each via zero-copy transfer). Hand
        // them off to one of the pool workers. By transferring again, the
        // main thread doesn't actually copy anything. Worker[0] runs the
        // aggregator on the typed-array buffers and posts back a small
        // SimulationResult (~tens of KB), so the main thread never blocks.
        activeRun.awaitingAggregate = true;
        const durationMs = performance.now() - activeRun.startTime;
        const aggReq: WorkerRequest = {
          type: "RUN_AGGREGATE",
          scenarioId: activeRun.scenarioId,
          scenario: activeRun.scenario,
          partials: activeRun.partials,
          durationMs,
        };
        if (pool && pool.length > 0) {
          const transfer: ArrayBuffer[] = [];
          for (const p of activeRun.partials) {
            for (const buf of packedIterationsBuffers(p)) transfer.push(buf);
          }
          pool[0].postMessage(aggReq, transfer);
        }
      }
      break;
    }
    case "RESULT": {
      const handler = activeRun.onComplete;
      activeRun = null;
      handler(msg.result);
      break;
    }
    case "ERROR":
      activeRun.onError(msg.error);
      break;
    default:
      break;
  }
}

function startPoolRun(
  scenario: Scenario,
  onProgress: (completed: number, total: number) => void,
  onComplete: (result: SimulationResult) => void,
  onError: (error: string) => void,
): void {
  const workers = ensurePool();
  const total = scenario.simulationConfig.iterations;
  // For very small iteration counts, don't spread thinly. Use min(total, N).
  const effective = Math.max(1, Math.min(workers.length, total));

  // Distribute iterations as evenly as possible (largest remainder first).
  const counts = new Array<number>(effective);
  const base = Math.floor(total / effective);
  const remainder = total - base * effective;
  for (let i = 0; i < effective; i++) counts[i] = base + (i < remainder ? 1 : 0);

  const baseSeed = scenario.simulationConfig.seed ?? SEED_FALLBACK;

  // Cancel any in-flight pool run before kicking off a new one. We notify
  // the previous owner via onError("Cancelled") so its Promise resolves.
  // Without this, a runOnce caller (the solver) preempted by a newer
  // startPoolRun would dangle forever. The store-writing UX flow in runSim
  // already calls cancelActivePoolRun first (which nulls activeRun), so the
  // branch below only fires for callers that bypass that helper.
  if (activeRun) {
    const previousOnError = activeRun.onError;
    for (const w of workers) {
      w.postMessage({ type: "CANCEL", scenarioId: activeRun.scenarioId } satisfies WorkerRequest);
    }
    try {
      previousOnError("Cancelled by newer pool run");
    } catch {
      // Swallow. A buggy listener mustn't abort the new run's setup.
    }
  }

  activeRun = {
    scenarioId: scenario.id,
    scenario,
    total,
    partialsRemaining: effective,
    partials: new Array(effective),
    perWorkerCompleted: new Int32Array(effective),
    startTime: performance.now(),
    awaitingAggregate: false,
    onProgress,
    onComplete,
    onError,
  };

  for (let i = 0; i < effective; i++) {
    // splitmix-style offset per worker keeps adjacent baseSeeds from producing
    // visibly correlated draws despite our PRNG already mixing the seed.
    const seed = ((baseSeed + Math.imul(i, 0x9e3779b9)) | 0) >>> 0;
    const req: WorkerRequest = {
      type: "RUN_PARTIAL",
      scenarioId: scenario.id,
      scenario,
      partialIdx: i,
      totalPartials: effective,
      count: counts[i],
      seed,
    };
    workers[i].postMessage(req);
  }
}

function cancelActivePoolRun() {
  if (!pool || !activeRun) return;
  const previousOnError = activeRun.onError;
  for (const w of pool) {
    w.postMessage({ type: "CANCEL", scenarioId: activeRun.scenarioId } satisfies WorkerRequest);
  }
  activeRun = null;
  // Notify after nulling so a re-entrant onError → startPoolRun doesn't see a
  // stale activeRun.
  try {
    previousOnError("Cancelled");
  } catch {
    // Swallow. A buggy listener mustn't poison cancellation.
  }
}

// ─── runOnce: promise-returning sibling for one-off sims ───────────────────
// Exposed for the goal solver: each binary-search trial runs through the
// pool but does NOT write to the store (the solver tracks its own state).
// Iteration count and seed are required so the solver can request 1500
// iterations during search and the full count for the validation pass.
export function runOnce(
  scenario: Scenario,
  opts: { iterations: number; seed: number; signal?: AbortSignal },
): Promise<SimulationResult> {
  return new Promise<SimulationResult>((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const trial: Scenario = {
      ...scenario,
      simulationConfig: {
        ...scenario.simulationConfig,
        iterations: opts.iterations,
        seed: opts.seed,
      },
    };

    const onAbort = () => {
      cancelActivePoolRun();
      // cancelActivePoolRun calls onError → reject below; the explicit reject
      // here covers the path where activeRun is already null (e.g., solver
      // aborted between trials).
      reject(new Error("Aborted"));
    };
    if (opts.signal) opts.signal.addEventListener("abort", onAbort, { once: true });

    const cleanup = () => {
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
    };

    startPoolRun(
      trial,
      () => {
        // No progress reporting at this layer. The solver reports per-step
        // progress (the trials themselves are uniform-ish in duration).
      },
      (result) => {
        cleanup();
        resolve(result);
      },
      (error) => {
        cleanup();
        reject(new Error(error));
      },
    );
  });
}

export function useSimulation(scenario: Scenario | undefined) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSimulationStatus = useAppStore((s) => s.setSimulationStatus);
  const setSimulationProgress = useAppStore((s) => s.setSimulationProgress);
  const setSimulationResult = useAppStore((s) => s.setSimulationResult);
  const setSimulationError = useAppStore((s) => s.setSimulationError);
  const setSimulationFingerprint = useAppStore((s) => s.setSimulationFingerprint);
  const updateScenario = useAppStore((s) => s.updateScenario);

  const cancelPendingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const runSim = useCallback(
    (s: Scenario) => {
      cancelPendingTimeout();

      // Idempotency: with auto-sim hoisted into AppShell *and* still active in
      // some pages (Dashboard's rerun button, ScenarioComparePage's pair of
      // sims), two useSimulation hooks may both schedule a debounce for the
      // same scenario. After the first one fires runSim, the second's call is
      // deduped here instead of preempting an in-flight run.
      const newFp = fingerprint(s);
      const entry = useAppStore.getState().simulations[s.id];
      if (entry?.fingerprint === newFp && (entry.status === "running" || entry.status === "complete")) {
        return;
      }

      cancelActivePoolRun();

      setSimulationFingerprint(s.id, newFp);
      setSimulationStatus(s.id, "running");
      setSimulationProgress(s.id, 0);

      startPoolRun(
        s,
        (completed, total) => {
          setSimulationProgress(s.id, completed / total);
        },
        (result) => {
          setSimulationResult(s.id, result);
        },
        (error) => {
          // Preemption (a newer pool run, or runOnce being aborted) is not a
          // user-visible failure. Clear the stored fingerprint so the next
          // render's auto-sim sees a mismatch and refires. Without this, the
          // cancelled-error state would stick until the user changed the
          // scenario again.
          if (/cancel/i.test(error) || /abort/i.test(error)) {
            setSimulationFingerprint(s.id, null);
            setSimulationStatus(s.id, "idle");
            return;
          }
          setSimulationError(s.id, error);
        },
      );
    },
    [
      cancelPendingTimeout,
      setSimulationStatus,
      setSimulationProgress,
      setSimulationResult,
      setSimulationError,
      setSimulationFingerprint,
    ],
  );

  const scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;

  const currentFingerprint = useMemo(() => (scenario ? fingerprint(scenario) : null), [scenario]);

  useEffect(() => {
    const s = scenarioRef.current;
    if (!s || !currentFingerprint) return;

    const stored = useAppStore.getState().simulations[s.id]?.fingerprint ?? null;
    if (currentFingerprint === stored) return;

    // If a sim is already running for a different scenario, kill it. We're
    // about to start a new one for the active scenario.
    if (activeRun && activeRun.scenarioId !== s.id) {
      cancelActivePoolRun();
    }

    timeoutRef.current = setTimeout(() => {
      runSim(s);
    }, DEBOUNCE_MS);

    return () => {
      // Only cancel the pending debounce; don't kill an already-running pool
      // just because this component unmounted (the user navigated away).
      cancelPendingTimeout();
    };
  }, [currentFingerprint, runSim, cancelPendingTimeout]);

  const rerun = useCallback(() => {
    if (!scenario) return;
    setSimulationFingerprint(scenario.id, null);
    // Force the goal cache to be treated as stale too. Without this,
    // auto-solve sees goal.fingerprint === solverFingerprint(scenario) and
    // skips re-solving. The user clicking rerun expects everything (sim AND
    // goal) to refresh.
    if (scenario.goal) {
      updateScenario(scenario.id, { goal: { ...scenario.goal, fingerprint: null } });
    }
    runSim(scenario);
  }, [scenario, runSim, setSimulationFingerprint, updateScenario]);

  return { rerun };
}

// Lightweight variant for pages that only need the manual rerun action and
// rely on AppShell's mounted useSimulation to handle auto-runs. Avoids
// scheduling redundant debounce timers when multiple pages are mounted.
export function useRerun(scenario: Scenario | undefined) {
  const setSimulationStatus = useAppStore((s) => s.setSimulationStatus);
  const setSimulationProgress = useAppStore((s) => s.setSimulationProgress);
  const setSimulationResult = useAppStore((s) => s.setSimulationResult);
  const setSimulationError = useAppStore((s) => s.setSimulationError);
  const setSimulationFingerprint = useAppStore((s) => s.setSimulationFingerprint);
  const updateScenario = useAppStore((s) => s.updateScenario);

  return useCallback(() => {
    if (!scenario) return;
    setSimulationFingerprint(scenario.id, null);
    if (scenario.goal) {
      updateScenario(scenario.id, { goal: { ...scenario.goal, fingerprint: null } });
    }
    cancelActivePoolRun();
    const newFp = fingerprint(scenario);
    setSimulationFingerprint(scenario.id, newFp);
    setSimulationStatus(scenario.id, "running");
    setSimulationProgress(scenario.id, 0);
    startPoolRun(
      scenario,
      (completed, total) => setSimulationProgress(scenario.id, completed / total),
      (result) => setSimulationResult(scenario.id, result),
      (error) => {
        if (/cancel/i.test(error) || /abort/i.test(error)) {
          setSimulationFingerprint(scenario.id, null);
          setSimulationStatus(scenario.id, "idle");
          return;
        }
        setSimulationError(scenario.id, error);
      },
    );
  }, [
    scenario,
    setSimulationStatus,
    setSimulationProgress,
    setSimulationResult,
    setSimulationError,
    setSimulationFingerprint,
    updateScenario,
  ]);
}
