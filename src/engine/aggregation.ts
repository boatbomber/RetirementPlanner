import type { UUID, Age } from "@/models/core";
import type {
  SimulationResult,
  YearlyPercentiles,
  WealthBucket,
  DepletionAgeBucket,
  AccountBalanceSeries,
} from "@/models/results";
import type { SimulationConfig } from "@/models/simulation-config";
import type { IterationResult, PackedIterations, PrecomputedConfig } from "./types";

// Percentile lookup against a SORTED Float64Array. The caller is responsible
// for sorting once per slice; this just does the linear interpolation between
// the two flanking samples.
export function percentileSorted(sorted: Float64Array | number[], p: number): number {
  const len = sorted.length;
  if (len === 0) return 0;
  const idx = (p / 100) * (len - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function fillPercentiles(sorted: Float64Array, year: number, age: number): YearlyPercentiles {
  return {
    year,
    age,
    p5: percentileSorted(sorted, 5),
    p10: percentileSorted(sorted, 10),
    p25: percentileSorted(sorted, 25),
    p50: percentileSorted(sorted, 50),
    p75: percentileSorted(sorted, 75),
    p90: percentileSorted(sorted, 90),
    p95: percentileSorted(sorted, 95),
  };
}

// Read one metric out of every iteration's snapshot grid into a single
// Float64Array of size N×Y, then sort each year's slice in place and emit
// percentiles. Typed sorts use native numeric compare and we avoid building
// a fresh array for every percentile call.
function aggregateMetric(
  iterations: IterationResult[],
  numYears: number,
  startAge: Age,
  birthYear: number,
  read: (snap: IterationResult["snapshots"][number]) => number,
): YearlyPercentiles[] {
  const N = iterations.length;
  const buf = new Float64Array(numYears * N);
  // Track per-year valid count (mortality may end an iteration early). When a
  // path is shorter than numYears, its missing trailing rows stay 0; we use
  // counts[y] to slice only the valid prefix when sorting.
  const counts = new Int32Array(numYears);
  for (let i = 0; i < N; i++) {
    const snaps = iterations[i].snapshots;
    const len = snaps.length;
    for (let y = 0; y < len; y++) {
      buf[y * N + counts[y]] = read(snaps[y]);
      counts[y]++;
    }
  }
  const out: YearlyPercentiles[] = new Array(numYears);
  for (let y = 0; y < numYears; y++) {
    const c = counts[y];
    if (c === 0) {
      out[y] = {
        year: birthYear + startAge + y,
        age: startAge + y,
        p5: 0,
        p10: 0,
        p25: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
      };
      continue;
    }
    const slice = buf.subarray(y * N, y * N + c);
    slice.sort();
    out[y] = fillPercentiles(slice, birthYear + startAge + y, startAge + y);
  }
  return out;
}

export function aggregateResults(
  scenarioId: UUID,
  iterations: IterationResult[],
  config: PrecomputedConfig,
  simConfig: SimulationConfig,
  durationMs: number,
): SimulationResult {
  const n = iterations.length;
  if (n === 0) {
    return emptyResult(scenarioId, simConfig, durationMs);
  }

  const numYears = config.endAge - config.startAge + 1;

  // Per-metric percentile bands. Each call takes one sequential pass over all
  // snapshot grids and emits a sorted Float64Array internally.
  const wealthByYear = aggregateMetric(
    iterations,
    numYears,
    config.startAge,
    config.birthYear,
    (s) => s.totalWealth,
  );
  const incomeByYear = aggregateMetric(
    iterations,
    numYears,
    config.startAge,
    config.birthYear,
    (s) => s.totalIncome,
  );
  const spendingByYear = aggregateMetric(
    iterations,
    numYears,
    config.startAge,
    config.birthYear,
    (s) => s.totalSpending,
  );
  const taxByYear = aggregateMetric(
    iterations,
    numYears,
    config.startAge,
    config.birthYear,
    (s) => s.totalTax,
  );
  const ssIncomeByYear = aggregateMetric(
    iterations,
    numYears,
    config.startAge,
    config.birthYear,
    (s) => s.ssIncome,
  );
  const withdrawalsByYear = aggregateMetric(
    iterations,
    numYears,
    config.startAge,
    config.birthYear,
    (s) => s.withdrawals,
  );
  const rmdByYear = aggregateMetric(
    iterations,
    numYears,
    config.startAge,
    config.birthYear,
    (s) => s.rmdAmount,
  );
  const rothConversionByYear = aggregateMetric(
    iterations,
    numYears,
    config.startAge,
    config.birthYear,
    (s) => s.rothConversion,
  );

  // Per-account balance percentiles. Snapshot.accountBalances is a
  // Float64Array indexed by config.initialAccounts position; map each
  // position to its UUID when emitting the result.
  const accountIds = config.initialAccounts.map((a) => a.id);
  const numAccounts = accountIds.length;
  const accountBalancesByYear: AccountBalanceSeries[] = new Array(numAccounts);
  if (numAccounts > 0) {
    // Single buffer for all accounts × all years × all iterations to amortize
    // allocation across accounts. Layout: [accountIdx][y][iterIdx] flattened.
    const acctBuf = new Float64Array(numAccounts * numYears * n);
    const acctCounts = new Int32Array(numAccounts * numYears);
    for (let i = 0; i < n; i++) {
      const snaps = iterations[i].snapshots;
      const len = snaps.length;
      for (let y = 0; y < len; y++) {
        const balances = snaps[y].accountBalances;
        for (let a = 0; a < numAccounts; a++) {
          const cellIdx = a * numYears + y;
          const off = cellIdx * n + acctCounts[cellIdx];
          acctBuf[off] = balances[a] ?? 0;
          acctCounts[cellIdx]++;
        }
      }
    }
    for (let a = 0; a < numAccounts; a++) {
      const series: YearlyPercentiles[] = new Array(numYears);
      for (let y = 0; y < numYears; y++) {
        const cellIdx = a * numYears + y;
        const c = acctCounts[cellIdx];
        const year = config.birthYear + config.startAge + y;
        const age = config.startAge + y;
        if (c === 0) {
          series[y] = { year, age, p5: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0 };
          continue;
        }
        const sliceStart = cellIdx * n;
        const slice = acctBuf.subarray(sliceStart, sliceStart + c);
        slice.sort();
        series[y] = fillPercentiles(slice, year, age);
      }
      accountBalancesByYear[a] = { accountId: accountIds[a], byYear: series };
    }
  }

  // Survival rate: iterations where the portfolio never fully depleted.
  // Note this does NOT require unimpaired spending. A path that survived to
  // age 95 with 50% real spending cuts still counts as "successful" here.
  // The companion `adjustmentProbability` and `*MaxCutPercent` metrics
  // surface the spending-quality side of the picture so the dashboard can
  // distinguish "survived" from "lived well".
  let successCount = 0;
  for (let i = 0; i < n; i++) if (iterations[i].depletionAge === null) successCount++;
  const successRate = successCount / n;

  // Terminal wealth uses a single sorted Float64Array, shared by the
  // percentile and the buildWealthBuckets call (which needs an ordered view).
  const terminalSorted = new Float64Array(n);
  for (let i = 0; i < n; i++) terminalSorted[i] = iterations[i].terminalWealth;
  terminalSorted.sort();
  const medianTerminalWealth = percentileSorted(terminalSorted, 50);

  // Portfolio at retirement. For already-retired users (retirementAge <
  // startAge), the retirement-day balance is in the past, so fall back to
  // the first-year (sim-start) balance. That way the dashboard shows a
  // meaningful value rather than $0.
  const retirementIdx = Math.max(0, config.retirementAge - config.startAge);
  const retirementSorted = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const snaps = iterations[i].snapshots;
    retirementSorted[i] = retirementIdx < snaps.length ? snaps[retirementIdx].totalWealth : 0;
  }
  retirementSorted.sort();
  const medianPortfolioAtRetirement = percentileSorted(retirementSorted, 50);

  // Confidence age: youngest age where >5% of iterations have depleted by
  // that age. Tally depletions by age once (O(N)), then sweep ages with a
  // running sum (O(Y)). Matches aggregatePackedBatches and avoids an
  // O(N×Y) scan.
  const depletionThreshold = 0.05;
  const depletionsAtAge = new Int32Array(numYears);
  for (let i = 0; i < n; i++) {
    const da = iterations[i].depletionAge;
    if (da === null) continue;
    const idx = da - config.startAge;
    if (idx >= 0 && idx < numYears) depletionsAtAge[idx]++;
  }
  let confidenceAge: Age = config.endAge;
  let cumulativeDepleted = 0;
  for (let y = 0; y < numYears; y++) {
    cumulativeDepleted += depletionsAtAge[y];
    if (cumulativeDepleted / n > depletionThreshold) {
      confidenceAge = config.startAge + y;
      break;
    }
  }

  // Adjustment probability: fraction of paths with any >2% real spending cut.
  // The 2% threshold filters out cosmetic year-over-year wobble from
  // dynamic strategies.
  const ADJUSTMENT_THRESHOLD = 0.02;
  let adjustmentCount = 0;
  for (let i = 0; i < n; i++) {
    if (iterations[i].maxSpendingCut > ADJUSTMENT_THRESHOLD) adjustmentCount++;
  }
  const adjustmentProbability = adjustmentCount / n;

  // Cut depth metrics are conditional on actually taking a cut. They answer
  // "if you have a cut, how bad does it get" rather than mixing in cut-free
  // paths. Mixing them produces a p90 that can sit inside the cut-free
  // mass and render as 0%, contradicting adjustmentProbability.
  const cutsAffected: number[] = [];
  for (let i = 0; i < n; i++) {
    if (iterations[i].maxSpendingCut > ADJUSTMENT_THRESHOLD) {
      cutsAffected.push(iterations[i].maxSpendingCut);
    }
  }
  cutsAffected.sort((a, b) => a - b);
  const cutsAffectedArr = Float64Array.from(cutsAffected);
  const medianMaxCutPercent = cutsAffectedArr.length > 0 ? percentileSorted(cutsAffectedArr, 50) : 0;
  const p90MaxCutPercent = cutsAffectedArr.length > 0 ? percentileSorted(cutsAffectedArr, 90) : 0;

  // Terminal wealth buckets reuse the already-sorted terminal array.
  const terminalWealthBuckets = buildWealthBucketsFromSorted(terminalSorted);

  // Depletion age buckets
  const depletionAges: Age[] = [];
  for (let i = 0; i < n; i++) {
    const da = iterations[i].depletionAge;
    if (da !== null) depletionAges.push(da);
  }
  const depletionAgeBuckets = buildDepletionBuckets(depletionAges, config.startAge, config.endAge);

  return {
    scenarioId,
    timestamp: new Date().toISOString(),
    configSnapshot: simConfig,
    durationMs,
    successRate,
    medianTerminalWealth,
    medianPortfolioAtRetirement,
    estimatedRetirementAge: config.retirementAge,
    confidenceAge,
    wealthByYear,
    incomeByYear,
    spendingByYear,
    taxByYear,
    ssIncomeByYear,
    withdrawalsByYear,
    rmdByYear,
    rothConversionByYear,
    accountBalancesByYear,
    adjustmentProbability,
    medianMaxCutPercent,
    p90MaxCutPercent,
    terminalWealthBuckets,
    depletionAgeBuckets,
    warnings: config.warnings,
  };
}

function buildWealthBucketsFromSorted(sorted: Float64Array): WealthBucket[] {
  const len = sorted.length;
  if (len === 0) return [];

  // 20 quantile-based bins so high-net-worth tails get proper resolution.
  // Build boundaries from the empirical distribution: each boundary is the
  // value at the next 5th-percentile mark.
  const NUM_BINS = 20;
  const boundaries: number[] = new Array(NUM_BINS + 1);
  for (let i = 0; i <= NUM_BINS; i++) {
    const idx = (i / NUM_BINS) * (len - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    boundaries[i] = lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }
  // Make boundaries strictly increasing by collapsing degenerate bins. This
  // avoids empty slots when the distribution clusters (e.g., lots of zeros).
  for (let i = 1; i < boundaries.length; i++) {
    if (boundaries[i] <= boundaries[i - 1]) boundaries[i] = boundaries[i - 1] + 0.01;
  }
  boundaries[boundaries.length - 1] = Infinity;

  // Counts come from a single linear scan of the sorted array. Values are
  // monotonic so we advance the bucket pointer in lockstep, O(len + bins).
  const counts = new Int32Array(NUM_BINS);
  let bin = 0;
  for (let k = 0; k < len; k++) {
    const v = sorted[k];
    while (bin < NUM_BINS - 1 && v >= boundaries[bin + 1]) bin++;
    counts[bin]++;
  }

  const buckets: WealthBucket[] = new Array(NUM_BINS);
  for (let i = 0; i < NUM_BINS; i++) {
    buckets[i] = { min: boundaries[i], max: boundaries[i + 1], count: counts[i] };
  }
  return buckets;
}

function buildDepletionBuckets(depletionAges: Age[], startAge: Age, endAge: Age): DepletionAgeBucket[] {
  const buckets: DepletionAgeBucket[] = [];
  // Single pass: tally per age, then emit non-empty buckets.
  const tally = new Int32Array(endAge - startAge + 1);
  for (const a of depletionAges) {
    if (a >= startAge && a <= endAge) tally[a - startAge]++;
  }
  for (let i = 0; i < tally.length; i++) {
    if (tally[i] > 0) buckets.push({ age: startAge + i, count: tally[i] });
  }
  return buckets;
}

function emptyResult(scenarioId: UUID, simConfig: SimulationConfig, durationMs: number): SimulationResult {
  return {
    scenarioId,
    timestamp: new Date().toISOString(),
    configSnapshot: simConfig,
    durationMs,
    successRate: 0,
    medianTerminalWealth: 0,
    medianPortfolioAtRetirement: 0,
    estimatedRetirementAge: 0,
    confidenceAge: 0,
    wealthByYear: [],
    incomeByYear: [],
    spendingByYear: [],
    taxByYear: [],
    ssIncomeByYear: [],
    withdrawalsByYear: [],
    rmdByYear: [],
    rothConversionByYear: [],
    accountBalancesByYear: [],
    adjustmentProbability: 0,
    medianMaxCutPercent: 0,
    p90MaxCutPercent: 0,
    terminalWealthBuckets: [],
    depletionAgeBuckets: [],
    warnings: [],
  };
}

// ─── Packed (typed-array) aggregator ──────────────────────────────────────
// Reads directly from PackedIterations[] without ever materializing
// IterationResult / AnnualSnapshot objects. Same percentile math as
// `aggregateResults` above; the difference is that the per-metric column
// extraction is a positional read out of contiguous Float64Arrays instead of
// a chain of object property lookups.

// Read one snapshot scalar field out of every batch into a single
// Float64Array(numYears * totalIters), then sort each year-slice in place.
function aggregatePackedMetric(
  batches: PackedIterations[],
  totalIters: number,
  numYears: number,
  startAge: Age,
  birthYear: number,
  pick: (batch: PackedIterations) => Float64Array,
): YearlyPercentiles[] {
  const buf = new Float64Array(numYears * totalIters);
  const counts = new Int32Array(numYears);
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const arr = pick(batch);
    const Y = batch.numYears;
    const N = batch.numIters;
    const lengths = batch.snapshotLength;
    for (let i = 0; i < N; i++) {
      const len = lengths[i];
      const baseIn = i * Y;
      for (let y = 0; y < len; y++) {
        buf[y * totalIters + counts[y]] = arr[baseIn + y];
        counts[y]++;
      }
    }
  }
  const out: YearlyPercentiles[] = new Array(numYears);
  for (let y = 0; y < numYears; y++) {
    const c = counts[y];
    const year = birthYear + startAge + y;
    const age = startAge + y;
    if (c === 0) {
      out[y] = { year, age, p5: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0 };
      continue;
    }
    const slice = buf.subarray(y * totalIters, y * totalIters + c);
    slice.sort();
    out[y] = fillPercentiles(slice, year, age);
  }
  return out;
}

export function aggregatePackedBatches(
  scenarioId: UUID,
  batches: PackedIterations[],
  config: PrecomputedConfig,
  simConfig: SimulationConfig,
  durationMs: number,
): SimulationResult {
  let totalIters = 0;
  for (let i = 0; i < batches.length; i++) totalIters += batches[i].numIters;
  if (totalIters === 0) return emptyResult(scenarioId, simConfig, durationMs);

  const numYears = config.endAge - config.startAge + 1;

  const wealthByYear = aggregatePackedMetric(
    batches,
    totalIters,
    numYears,
    config.startAge,
    config.birthYear,
    (b) => b.totalWealth,
  );
  const incomeByYear = aggregatePackedMetric(
    batches,
    totalIters,
    numYears,
    config.startAge,
    config.birthYear,
    (b) => b.totalIncome,
  );
  const spendingByYear = aggregatePackedMetric(
    batches,
    totalIters,
    numYears,
    config.startAge,
    config.birthYear,
    (b) => b.totalSpending,
  );
  const taxByYear = aggregatePackedMetric(
    batches,
    totalIters,
    numYears,
    config.startAge,
    config.birthYear,
    (b) => b.totalTax,
  );
  const ssIncomeByYear = aggregatePackedMetric(
    batches,
    totalIters,
    numYears,
    config.startAge,
    config.birthYear,
    (b) => b.ssIncome,
  );
  const withdrawalsByYear = aggregatePackedMetric(
    batches,
    totalIters,
    numYears,
    config.startAge,
    config.birthYear,
    (b) => b.withdrawals,
  );
  const rmdByYear = aggregatePackedMetric(
    batches,
    totalIters,
    numYears,
    config.startAge,
    config.birthYear,
    (b) => b.rmdAmount,
  );
  const rothConversionByYear = aggregatePackedMetric(
    batches,
    totalIters,
    numYears,
    config.startAge,
    config.birthYear,
    (b) => b.rothConversion,
  );

  // Per-account balance percentiles. Each batch's accountBalances buffer is
  // [iterIdx * numYears * numAccounts + year * numAccounts + acctIdx]; we
  // walk that once per (account × year) and emit percentiles.
  const accountIds = config.initialAccounts.map((a) => a.id);
  const numAccounts = accountIds.length;
  const accountBalancesByYear: AccountBalanceSeries[] = new Array(numAccounts);
  if (numAccounts > 0) {
    const acctBuf = new Float64Array(numAccounts * numYears * totalIters);
    const acctCounts = new Int32Array(numAccounts * numYears);
    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      const batch = batches[bIdx];
      const Y = batch.numYears;
      const A = batch.numAccounts;
      const N = batch.numIters;
      const balances = batch.accountBalances;
      const lengths = batch.snapshotLength;
      for (let i = 0; i < N; i++) {
        const len = lengths[i];
        const iterBase = i * Y * A;
        for (let y = 0; y < len; y++) {
          const yearBase = iterBase + y * A;
          for (let a = 0; a < A; a++) {
            const cellIdx = a * numYears + y;
            const off = cellIdx * totalIters + acctCounts[cellIdx];
            acctBuf[off] = balances[yearBase + a];
            acctCounts[cellIdx]++;
          }
        }
      }
    }
    for (let a = 0; a < numAccounts; a++) {
      const series: YearlyPercentiles[] = new Array(numYears);
      for (let y = 0; y < numYears; y++) {
        const cellIdx = a * numYears + y;
        const c = acctCounts[cellIdx];
        const year = config.birthYear + config.startAge + y;
        const age = config.startAge + y;
        if (c === 0) {
          series[y] = { year, age, p5: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0 };
          continue;
        }
        const sliceStart = cellIdx * totalIters;
        const slice = acctBuf.subarray(sliceStart, sliceStart + c);
        slice.sort();
        series[y] = fillPercentiles(slice, year, age);
      }
      accountBalancesByYear[a] = { accountId: accountIds[a], byYear: series };
    }
  }

  // Per-iteration scalar metrics, calculated as a single linear scan across batches.
  let successCount = 0;
  let adjustmentCount = 0;
  const ADJUSTMENT_THRESHOLD = 0.02;
  const terminalSorted = new Float64Array(totalIters);
  const retirementSorted = new Float64Array(totalIters);
  const retirementIdx = Math.max(0, config.retirementAge - config.startAge);
  const depletionAges: Age[] = [];
  // Cut depth metrics are conditional on actually taking a cut (see the
  // single-aggregation path above for rationale). Collect only cuts above
  // the adjustment threshold; p50/p90 over an empty set falls back to 0.
  const cutsAffected: number[] = [];
  let writeIdx = 0;
  // Pre-walk depletion-by-age too (we want a per-age tally).
  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const batch = batches[bIdx];
    const N = batch.numIters;
    const Y = batch.numYears;
    const lengths = batch.snapshotLength;
    const tw = batch.totalWealth;
    for (let i = 0; i < N; i++) {
      const da = batch.depletionAge[i];
      if (da === -1) successCount++;
      else depletionAges.push(da);
      if (batch.maxSpendingCut[i] > ADJUSTMENT_THRESHOLD) {
        adjustmentCount++;
        cutsAffected.push(batch.maxSpendingCut[i]);
      }
      terminalSorted[writeIdx] = batch.terminalWealth[i];
      retirementSorted[writeIdx] = retirementIdx < lengths[i] ? tw[i * Y + retirementIdx] : 0;
      writeIdx++;
    }
  }
  terminalSorted.sort();
  retirementSorted.sort();
  cutsAffected.sort((a, b) => a - b);
  const cutsAffectedArr = Float64Array.from(cutsAffected);

  const successRate = successCount / totalIters;
  const adjustmentProbability = adjustmentCount / totalIters;
  const medianTerminalWealth = percentileSorted(terminalSorted, 50);
  const medianPortfolioAtRetirement = percentileSorted(retirementSorted, 50);
  const medianMaxCutPercent = cutsAffectedArr.length > 0 ? percentileSorted(cutsAffectedArr, 50) : 0;
  const p90MaxCutPercent = cutsAffectedArr.length > 0 ? percentileSorted(cutsAffectedArr, 90) : 0;

  // Confidence age: youngest age where >5% of iterations have depleted.
  const depletionThreshold = 0.05;
  let confidenceAge: Age = config.endAge;
  // Cumulative count of depletions at-or-before each age, computed incrementally.
  const tallyByAge = new Int32Array(config.endAge - config.startAge + 1);
  for (const a of depletionAges) {
    if (a >= config.startAge && a <= config.endAge) tallyByAge[a - config.startAge]++;
  }
  let cumulative = 0;
  for (let y = 0; y < tallyByAge.length; y++) {
    cumulative += tallyByAge[y];
    if (cumulative / totalIters > depletionThreshold) {
      confidenceAge = config.startAge + y;
      break;
    }
  }

  const terminalWealthBuckets = buildWealthBucketsFromSorted(terminalSorted);
  const depletionAgeBuckets = buildDepletionBuckets(depletionAges, config.startAge, config.endAge);

  return {
    scenarioId,
    timestamp: new Date().toISOString(),
    configSnapshot: simConfig,
    durationMs,
    successRate,
    medianTerminalWealth,
    medianPortfolioAtRetirement,
    estimatedRetirementAge: config.retirementAge,
    confidenceAge,
    wealthByYear,
    incomeByYear,
    spendingByYear,
    taxByYear,
    ssIncomeByYear,
    withdrawalsByYear,
    rmdByYear,
    rothConversionByYear,
    accountBalancesByYear,
    adjustmentProbability,
    medianMaxCutPercent,
    p90MaxCutPercent,
    terminalWealthBuckets,
    depletionAgeBuckets,
    warnings: config.warnings,
  };
}
