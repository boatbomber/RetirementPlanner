import type { WorkerRequest, WorkerResponse } from "./types";
import { runSimulation, runIterationsPacked, aggregateAcrossWorkersPacked } from "./simulation";
import { packedIterationsBuffers } from "./packed";

export type PostFn = (msg: WorkerResponse, transfer?: Transferable[]) => void;

export interface WorkerHandlers {
  handle: (req: WorkerRequest) => void;
  // Exposed for tests; production reads cancellation indirectly via CANCEL.
  isCancelled: () => boolean;
}

// Pure factory so the same dispatch logic can run in a real Web Worker
// (with `self.postMessage`) or in unit tests (with a mock post fn).
export function createWorkerHandlers(post: PostFn): WorkerHandlers {
  let cancelled = false;
  let runningScenarioId: string | null = null;

  function postError(scenarioId: string, err: unknown) {
    post({
      type: "ERROR",
      scenarioId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  function handleRunSimulation(req: Extract<WorkerRequest, { type: "RUN_SIMULATION" }>) {
    const { scenarioId, scenario } = req;
    runningScenarioId = scenarioId;
    cancelled = false;
    try {
      const result = runSimulation(scenario, (completed, total) => {
        if (cancelled) {
          // Throwing here unwinds runSimulation's loop; the error path below
          // posts an ERROR message that the host treats as a soft cancel.
          throw new Error("CANCELLED");
        }
        post({ type: "PROGRESS", scenarioId, completed, total });
      });
      post({ type: "RESULT", scenarioId, result });
    } catch (err) {
      postError(scenarioId, err);
    } finally {
      runningScenarioId = null;
      cancelled = false;
    }
  }

  function handleRunPartial(req: Extract<WorkerRequest, { type: "RUN_PARTIAL" }>) {
    const { scenarioId, scenario, partialIdx, count, seed } = req;
    runningScenarioId = scenarioId;
    cancelled = false;
    try {
      const { packed } = runIterationsPacked(scenario, count, seed, (completed) => {
        if (cancelled) throw new Error("CANCELLED");
        // Report THIS worker's local progress; the orchestrator sums across
        // workers via partialIdx so the global bar reflects actual completion
        // rather than an average of extrapolations.
        post({ type: "PROGRESS", scenarioId, completed, total: count, partialIdx });
      });

      // Final PROGRESS so the bar reaches 100% for this worker before
      // PARTIAL_RESULT fires. runIterations only fires the callback at every
      // 500-iter checkpoint, so a 1250-iter chunk never naturally pings 1250.
      post({ type: "PROGRESS", scenarioId, completed: count, total: count, partialIdx });

      // Transfer the underlying ArrayBuffers as a zero-copy ownership move
      // to the orchestrator. After this point, `packed`'s typed arrays are
      // detached in this context (we don't read them again).
      post({ type: "PARTIAL_RESULT", scenarioId, partialIdx, packed }, packedIterationsBuffers(packed));
    } catch (err) {
      postError(scenarioId, err);
    } finally {
      runningScenarioId = null;
      cancelled = false;
    }
  }

  function handleRunAggregate(req: Extract<WorkerRequest, { type: "RUN_AGGREGATE" }>) {
    const { scenarioId, scenario, partials, durationMs } = req;
    runningScenarioId = scenarioId;
    cancelled = false;
    try {
      const result = aggregateAcrossWorkersPacked(scenario, partials, durationMs);
      post({ type: "RESULT", scenarioId, result });
    } catch (err) {
      postError(scenarioId, err);
    } finally {
      runningScenarioId = null;
      cancelled = false;
    }
  }

  function handleCancel(req: Extract<WorkerRequest, { type: "CANCEL" }>) {
    if (req.scenarioId === runningScenarioId) cancelled = true;
  }

  return {
    handle: (req) => {
      switch (req.type) {
        case "RUN_SIMULATION":
          return handleRunSimulation(req);
        case "RUN_PARTIAL":
          return handleRunPartial(req);
        case "RUN_AGGREGATE":
          return handleRunAggregate(req);
        case "CANCEL":
          return handleCancel(req);
      }
    },
    isCancelled: () => cancelled,
  };
}
