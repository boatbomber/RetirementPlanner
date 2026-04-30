// Run with: npx vitest run --config vitest.bench.config.ts
// Excluded from `yarn test` by vitest.config.ts → test.exclude.

import { describe, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { performance } from "node:perf_hooks";

import {
  runSimulation,
  runIterations,
  runIterationsPacked,
  aggregateAcrossWorkers,
  aggregateAcrossWorkersPacked,
} from "../src/engine/simulation";
import { precompute } from "../src/engine/precompute";
import { PRNG } from "../src/engine/prng";
import {
  buildCorrelationMatrix,
  choleskyDecomposition,
  generateCorrelatedReturns,
  applyReturnsToBalance,
} from "../src/engine/returns";
import { computeFederalTax, computeStandardDeduction } from "../src/engine/tax";
import { generateAnnualInflation } from "../src/engine/inflation";
import { interpolateGlidePath } from "../src/engine/glide-path";
import { computeRMD } from "../src/engine/rmd";
import { computeHouseholdSSIncome } from "../src/engine/social-security";
import { survivesYear } from "../src/engine/mortality";
import { computeAnnualSpending } from "../src/engine/withdrawals";
import { createDefaultScenario } from "../src/models/defaults";
import type { Scenario } from "../src/models/scenario";

// Personal scenario fixture is gitignored. Fall back to the default scenario
// so contributors without the private fixture can still run the benchmark.
const SCEN_PATH = ".claude/retirement-plan-2026-04-25.json";
const scenario: Scenario = existsSync(SCEN_PATH)
  ? (JSON.parse(readFileSync(SCEN_PATH, "utf8")) as { scenarios: Scenario[] }).scenarios[0]
  : createDefaultScenario("Bench Default");

function ms(n: number): string {
  return n.toFixed(1).padStart(8) + " ms";
}

function us(n: number): string {
  return (n * 1000).toFixed(2).padStart(8) + " µs";
}

function bench(label: string, runs: number, fn: () => void): { perRun: number; total: number } {
  // 1 untimed warmup
  fn();
  const start = performance.now();
  for (let i = 0; i < runs; i++) fn();
  const total = performance.now() - start;
  const perRun = total / runs;
  // eslint-disable-next-line no-console
  console.log(`  ${label.padEnd(40)} ${ms(total)}  (×${runs} → ${us(perRun)}/call)`);
  return { perRun, total };
}

describe("simulation benchmark", () => {
  it("end-to-end: full simulation with scenario from .claude/", () => {
    // eslint-disable-next-line no-console
    console.log(`\n=== Scenario summary ===`);
    // eslint-disable-next-line no-console
    console.log(`  iterations: ${scenario.simulationConfig.iterations}`);
    // eslint-disable-next-line no-console
    console.log(`  accounts:   ${scenario.accounts.length}`);
    // eslint-disable-next-line no-console
    console.log(`  expenses:   ${scenario.expenses.length}`);
    // eslint-disable-next-line no-console
    console.log(`  income:     ${scenario.incomeSources.length}`);
    const profile = scenario.profile;
    const cfg = precompute(scenario);
    const yearsPerIter = cfg.endAge - cfg.startAge + 1;
    // eslint-disable-next-line no-console
    console.log(`  startAge:   ${cfg.startAge}`);
    // eslint-disable-next-line no-console
    console.log(`  endAge:     ${cfg.endAge}`);
    // eslint-disable-next-line no-console
    console.log(`  yearsPerIter: ${yearsPerIter}`);
    // eslint-disable-next-line no-console
    console.log(`  filingStatus: ${profile.filingStatus}`);

    // Fix the seed so every benchmarked run uses identical PRNG state.
    const fixedSeed: Scenario = {
      ...scenario,
      simulationConfig: { ...scenario.simulationConfig, seed: 42 },
    };

    // === Top-level timings ===
    // eslint-disable-next-line no-console
    console.log(`\n=== Top-level timings ===`);

    // Warmup
    runSimulation({
      ...fixedSeed,
      simulationConfig: { ...fixedSeed.simulationConfig, iterations: 200 },
    });

    const TRIALS = 3;
    const fullTimes: number[] = [];
    let lastResult: ReturnType<typeof runSimulation> | null = null;
    for (let t = 0; t < TRIALS; t++) {
      const start = performance.now();
      lastResult = runSimulation(fixedSeed);
      fullTimes.push(performance.now() - start);
    }
    const fullMean = fullTimes.reduce((a, b) => a + b, 0) / fullTimes.length;
    const fullMin = Math.min(...fullTimes);
    // eslint-disable-next-line no-console
    console.log(
      `  runSimulation full           min=${fullMin.toFixed(0)}ms  mean=${fullMean.toFixed(0)}ms  trials=${fullTimes.map((t) => t.toFixed(0)).join(",")}`,
    );
    if (lastResult) {
      // eslint-disable-next-line no-console
      console.log(
        `    success=${(lastResult.successRate * 100).toFixed(1)}%  durationMs(reported)=${lastResult.durationMs.toFixed(0)}`,
      );
    }

    // Time precompute alone
    bench("precompute(scenario)", 50, () => {
      precompute(fixedSeed);
    });

    // Run with very few iterations to capture fixed setup cost (precompute +
    // aggregateResults overhead + estimateEarliestRetirementAge).
    // estimateEarliestRetirementAge does its own search (500 iters × ~log2(16)
    // trials), so its cost is amortized into the "fixed" bucket regardless of
    // user iteration count.
    const lowIter: Scenario = {
      ...fixedSeed,
      simulationConfig: { ...fixedSeed.simulationConfig, iterations: 10 },
    };
    runSimulation(lowIter); // warmup
    const lowStart = performance.now();
    for (let i = 0; i < 5; i++) runSimulation(lowIter);
    const lowAvg = (performance.now() - lowStart) / 5;
    // eslint-disable-next-line no-console
    console.log(`  runSimulation(N=10)          ${ms(lowAvg)} (≈ fixed cost incl. retirement-age search)`);

    const perIter = (fullMean - lowAvg) / (scenario.simulationConfig.iterations - 10);
    // eslint-disable-next-line no-console
    console.log(`  estimated per-iteration:     ${us(perIter)}`);
    // eslint-disable-next-line no-console
    console.log(`  estimated per-year-step:     ${us(perIter / yearsPerIter)}`);

    // === Per-function microbenchmarks ===
    // eslint-disable-next-line no-console
    console.log(`\n=== Per-function microbenchmarks ===`);
    const cma = scenario.simulationConfig.capitalMarketAssumptions;
    const corrLow = buildCorrelationMatrix(cma, false);
    const cholL = choleskyDecomposition(corrLow);
    const rng = new PRNG(123);

    bench("PRNG.nextFloat", 1_000_000, () => {
      rng.nextFloat();
    });
    bench("PRNG.nextGaussian", 1_000_000, () => {
      rng.nextGaussian();
    });
    bench("PRNG.nextU32", 1_000_000, () => {
      rng.nextU32();
    });

    bench("generateAnnualInflation (stochastic)", 100_000, () => {
      generateAnnualInflation(0.025, scenario.simulationConfig, rng);
    });
    bench("generateCorrelatedReturns", 100_000, () => {
      generateCorrelatedReturns(cma, cholL, rng);
    });

    const alloc = scenario.accounts[0].allocation;
    const sampleReturns = generateCorrelatedReturns(cma, cholL, rng);
    bench("applyReturnsToBalance", 1_000_000, () => {
      applyReturnsToBalance(100000, alloc, sampleReturns);
    });

    const gp = scenario.accounts[0].glidePath;
    bench("interpolateGlidePath (mid)", 1_000_000, () => {
      interpolateGlidePath(38, gp, alloc);
    });

    bench("computeRMD (age 80)", 1_000_000, () => {
      computeRMD(500_000, 80, 1990);
    });

    bench("computeHouseholdSSIncome", 500_000, () => {
      computeHouseholdSSIncome(scenario.socialSecurity, 70, 71, 2050, 1.5, 1.5, 3, 9);
    });

    bench("computeStandardDeduction", 500_000, () => {
      computeStandardDeduction("married_filing_jointly", 70, 71, 2050, 1.6, 200_000);
    });

    bench("computeFederalTax (retired married)", 200_000, () => {
      computeFederalTax({
        ordinaryIncome: 80_000,
        longTermCapGains: 20_000,
        ssIncome: 30_000,
        filingStatus: "married_filing_jointly",
        selfAge: 70,
        spouseAge: 71,
        year: 2050,
        cumulativeInflation: 1.6,
        stateOfResidence: "CA",
      });
    });

    bench("computeAnnualSpending (fixed_real)", 1_000_000, () => {
      computeAnnualSpending(
        1_500_000,
        {
          initialTotalBalance: 1_500_000,
          retirementBalance: 1_500_000,
          priorYearSpending: 60_000,
          priorYearReturn: 0.05,
          cumulativeInflation: 1.5,
          currentYearInflation: 0.025,
          yearsInRetirement: 5,
          currentAge: 65,
          endAge: 95,
          priorYearWithdrawalRate: 0.04,
          portfolioExpectedReturn: 0.05,
          portfolioVolatility: 0.12,
          portfolioEquityWeight: 0.6,
        },
        scenario.withdrawalStrategy,
      );
    });

    bench("survivesYear (age 70 male)", 500_000, () => {
      survivesYear(70, "male", 5, rng, "ssa_period");
    });

    // Aggregate-cost test: what does aggregateResults take alone?
    // Run a small simulation, capture the iteration set indirectly by
    // counting via runSimulation(N=200) twice.
    // eslint-disable-next-line no-console
    console.log(`\n=== Aggregation overhead ===`);
    const baseN: Scenario = {
      ...fixedSeed,
      simulationConfig: { ...fixedSeed.simulationConfig, iterations: 1000 },
    };
    const doubleN: Scenario = {
      ...fixedSeed,
      simulationConfig: { ...fixedSeed.simulationConfig, iterations: 2000 },
    };
    runSimulation(baseN); // warmup
    const t1 = performance.now();
    runSimulation(baseN);
    const dt1 = performance.now() - t1;
    const t2 = performance.now();
    runSimulation(doubleN);
    const dt2 = performance.now() - t2;
    // eslint-disable-next-line no-console
    console.log(`  runSimulation(N=1000):       ${ms(dt1)}`);
    // eslint-disable-next-line no-console
    console.log(`  runSimulation(N=2000):       ${ms(dt2)}`);
    // eslint-disable-next-line no-console
    console.log(
      `  per-iteration (1k→2k slope): ${us((dt2 - dt1) / 1000)}   (excludes precompute + aggregate)`,
    );

    // === Parallel projection (worker pool) ===
    // The browser uses a pool of N web workers (see src/engine/useSimulation.ts).
    // Node can't directly spawn TS web-workers, so we project the parallel
    // wall-clock by running each chunk sequentially in the same process.
    // Wall-clock for an ideally-parallel run = max(per-chunk time) + aggregate.
    // eslint-disable-next-line no-console
    console.log(`\n=== Parallel projection (8-worker pool) ===`);
    const N_WORKERS = 8;
    const ITER = scenario.simulationConfig.iterations;
    const base = Math.floor(ITER / N_WORKERS);
    const rem = ITER - base * N_WORKERS;
    const counts: number[] = [];
    for (let i = 0; i < N_WORKERS; i++) counts.push(base + (i < rem ? 1 : 0));
    const baseSeed = 42;

    // Warmup the iteration path.
    runIterations(scenario, 200, baseSeed);

    const partials: import("../src/engine/types").IterationResult[][] = [];
    let serialSum = 0;
    let maxWorkerTime = 0;
    let minWorkerTime = Infinity;
    for (let i = 0; i < N_WORKERS; i++) {
      const seed = ((baseSeed + Math.imul(i, 0x9e3779b9)) | 0) >>> 0;
      const t = performance.now();
      const { results } = runIterations(scenario, counts[i], seed);
      const elapsed = performance.now() - t;
      partials.push(results);
      serialSum += elapsed;
      if (elapsed > maxWorkerTime) maxWorkerTime = elapsed;
      if (elapsed < minWorkerTime) minWorkerTime = elapsed;
    }

    const aggStart = performance.now();
    const parallelResult = aggregateAcrossWorkers(scenario, partials, maxWorkerTime);
    const aggTime = performance.now() - aggStart;

    const projectedWallClock = maxWorkerTime + aggTime;
    // eslint-disable-next-line no-console
    console.log(`  N workers:                   ${N_WORKERS}`);
    // eslint-disable-next-line no-console
    console.log(`  per-worker iters:            ${counts[0]}–${counts[counts.length - 1]}`);
    // eslint-disable-next-line no-console
    console.log(`  per-worker time (min):       ${ms(minWorkerTime)}`);
    // eslint-disable-next-line no-console
    console.log(`  per-worker time (max):       ${ms(maxWorkerTime)}`);
    // eslint-disable-next-line no-console
    console.log(`  serial sum (1 thread):       ${ms(serialSum)}`);
    // eslint-disable-next-line no-console
    console.log(`  aggregate (after merge):     ${ms(aggTime)}`);
    // eslint-disable-next-line no-console
    console.log(`  projected parallel wall-clock: ${ms(projectedWallClock)}`);
    // eslint-disable-next-line no-console
    console.log(`  projected speedup vs single-threaded: ${(fullMean / projectedWallClock).toFixed(2)}x`);
    // eslint-disable-next-line no-console
    console.log(`  parallel success rate:       ${(parallelResult.successRate * 100).toFixed(1)}%`);

    // === Packed parallel projection (transferable buffers) ===
    // Mirrors the production flow: each "worker" produces PackedIterations
    // (Float64/Int32 columns), and aggregation reads from those directly.
    // In the browser, these buffers are transferred zero-copy; here in Node
    // we just pass references in-process. The headline metric is whether
    // packing changes per-worker compute and whether the packed aggregator
    // matches the legacy aggregator's wall-clock.
    // eslint-disable-next-line no-console
    console.log(`\n=== Packed parallel projection (transferable buffers) ===`);
    runIterationsPacked(scenario, 200, baseSeed); // warmup

    const packedPartials: import("../src/engine/types").PackedIterations[] = [];
    let pSerialSum = 0;
    let pMaxWorker = 0;
    let pMinWorker = Infinity;
    for (let i = 0; i < N_WORKERS; i++) {
      const seed = ((baseSeed + Math.imul(i, 0x9e3779b9)) | 0) >>> 0;
      const t = performance.now();
      const { packed } = runIterationsPacked(scenario, counts[i], seed);
      const elapsed = performance.now() - t;
      packedPartials.push(packed);
      pSerialSum += elapsed;
      if (elapsed > pMaxWorker) pMaxWorker = elapsed;
      if (elapsed < pMinWorker) pMinWorker = elapsed;
    }
    const pAggStart = performance.now();
    const packedResult = aggregateAcrossWorkersPacked(scenario, packedPartials, pMaxWorker);
    const pAggTime = performance.now() - pAggStart;
    const pProjected = pMaxWorker + pAggTime;
    // eslint-disable-next-line no-console
    console.log(`  per-worker time (min):       ${ms(pMinWorker)}`);
    // eslint-disable-next-line no-console
    console.log(`  per-worker time (max):       ${ms(pMaxWorker)}`);
    // eslint-disable-next-line no-console
    console.log(`  serial sum (1 thread):       ${ms(pSerialSum)}`);
    // eslint-disable-next-line no-console
    console.log(`  aggregate (packed):          ${ms(pAggTime)}`);
    // eslint-disable-next-line no-console
    console.log(`  projected parallel wall-clock: ${ms(pProjected)}`);
    // eslint-disable-next-line no-console
    console.log(`  packed success rate:         ${(packedResult.successRate * 100).toFixed(1)}%`);
    // Sanity check: the packed aggregator should produce the same metric
    // values as the legacy one (same iterations, just columnar reads).
    const matches =
      Math.abs(packedResult.successRate - parallelResult.successRate) < 1e-9 &&
      Math.abs(packedResult.medianTerminalWealth - parallelResult.medianTerminalWealth) < 1e-3;
    // eslint-disable-next-line no-console
    console.log(`  matches legacy aggregator:   ${matches ? "yes" : "NO. INVESTIGATE"}`);
  }, 600_000);
});
