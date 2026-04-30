import type { WorkerRequest, WorkerResponse } from "./types";
import { createWorkerHandlers } from "./worker-handlers";

const handlers = createWorkerHandlers((msg, transfer) => {
  if (transfer) self.postMessage(msg, transfer);
  else self.postMessage(msg);
});

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  handlers.handle(e.data);
};

// Re-exported so type-only imports of WorkerResponse keep working at the
// existing path. The handlers module is the testable seam.
export type { WorkerRequest, WorkerResponse };
