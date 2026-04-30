import type { IterationResult, PackedIterations } from "./types";

// ─── Packed (transferable) iteration buffers ──────────────────────────────
// Web workers structured-clone every postMessage payload, which costs
// 600–1500 ms per worker for a 10k-iter sim's IterationResult[]. By packing
// each worker's results into Float64/Int32 arrays whose `.buffer`s are listed
// in postMessage's transferList, the round-trip becomes near-zero-cost.
//
// Allocation, packing, and buffer extraction live here; the simulation
// module composes them with `runIterations` to produce the worker-side
// `runIterationsPacked` entry point.

export function createPackedIterations(
  numIters: number,
  numYears: number,
  numAccounts: number,
): PackedIterations {
  const snapShape = numIters * numYears;
  return {
    numIters,
    numYears,
    numAccounts,
    totalWealth: new Float64Array(snapShape),
    totalIncome: new Float64Array(snapShape),
    totalSpending: new Float64Array(snapShape),
    totalTax: new Float64Array(snapShape),
    earlyWithdrawalPenalty: new Float64Array(snapShape),
    ssIncome: new Float64Array(snapShape),
    withdrawals: new Float64Array(snapShape),
    contributions: new Float64Array(snapShape),
    rmdAmount: new Float64Array(snapShape),
    rothConversion: new Float64Array(snapShape),
    accountBalances: new Float64Array(snapShape * numAccounts),
    snapshotLength: new Int32Array(numIters),
    terminalWealth: new Float64Array(numIters),
    depletionAge: new Int32Array(numIters),
    maxSpendingCut: new Float64Array(numIters),
  };
}

// Returns the list of underlying ArrayBuffers for postMessage's transfer
// list. Keep in sync with the field set on PackedIterations. (TypedArray
// `.buffer` is typed as ArrayBufferLike, but we always allocate via `new
// Float64Array(n)` so the underlying buffer is a real ArrayBuffer; the cast
// makes that explicit for the postMessage transferList type.)
export function packedIterationsBuffers(p: PackedIterations): ArrayBuffer[] {
  return [
    p.totalWealth.buffer as ArrayBuffer,
    p.totalIncome.buffer as ArrayBuffer,
    p.totalSpending.buffer as ArrayBuffer,
    p.totalTax.buffer as ArrayBuffer,
    p.earlyWithdrawalPenalty.buffer as ArrayBuffer,
    p.ssIncome.buffer as ArrayBuffer,
    p.withdrawals.buffer as ArrayBuffer,
    p.contributions.buffer as ArrayBuffer,
    p.rmdAmount.buffer as ArrayBuffer,
    p.rothConversion.buffer as ArrayBuffer,
    p.accountBalances.buffer as ArrayBuffer,
    p.snapshotLength.buffer as ArrayBuffer,
    p.terminalWealth.buffer as ArrayBuffer,
    p.depletionAge.buffer as ArrayBuffer,
    p.maxSpendingCut.buffer as ArrayBuffer,
  ];
}

// Convert IterationResult[] (per-iter object trees) into the columnar packed
// layout. Single linear pass that touches each snapshot exactly once, no
// extra allocation beyond the destination Float64Arrays.
export function packIterations(
  results: IterationResult[],
  numYears: number,
  numAccounts: number,
): PackedIterations {
  const N = results.length;
  const p = createPackedIterations(N, numYears, numAccounts);
  for (let i = 0; i < N; i++) {
    const r = results[i];
    const snaps = r.snapshots;
    const len = snaps.length;
    p.snapshotLength[i] = len;
    p.terminalWealth[i] = r.terminalWealth;
    p.depletionAge[i] = r.depletionAge ?? -1;
    p.maxSpendingCut[i] = r.maxSpendingCut;
    const snapBase = i * numYears;
    const acctBase = snapBase * numAccounts;
    for (let y = 0; y < len; y++) {
      const s = snaps[y];
      const idx = snapBase + y;
      p.totalWealth[idx] = s.totalWealth;
      p.totalIncome[idx] = s.totalIncome;
      p.totalSpending[idx] = s.totalSpending;
      p.totalTax[idx] = s.totalTax;
      p.earlyWithdrawalPenalty[idx] = s.earlyWithdrawalPenalty;
      p.ssIncome[idx] = s.ssIncome;
      p.withdrawals[idx] = s.withdrawals;
      p.contributions[idx] = s.contributions;
      p.rmdAmount[idx] = s.rmdAmount;
      p.rothConversion[idx] = s.rothConversion;
      const balances = s.accountBalances;
      const off = acctBase + y * numAccounts;
      for (let a = 0; a < numAccounts; a++) {
        p.accountBalances[off + a] = balances[a] ?? 0;
      }
    }
  }
  return p;
}
