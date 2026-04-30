import type { Rate } from "@/models/core";
import type { AssetAllocation } from "@/models/account";
import type { CMA } from "@/models/simulation-config";
import type { AssetReturns } from "./types";
import type { PRNG } from "./prng";

const ASSET_KEYS: (keyof AssetReturns)[] = [
  "usLargeCap",
  "usSmallCap",
  "intlDeveloped",
  "intlEmerging",
  "usBonds",
  "tips",
  "cash",
];

export function buildCorrelationMatrix(cma: CMA, highInflation: boolean): number[][] {
  // Per-class stock-bond correlation factors. US large/small at the
  // user-set rho; international developed slightly below; emerging slightly
  // below that. In high-inflation regime the wedge widens (large +0.50,
  // small +0.45, intlDev/Em +0.40), represented as a multiplicative scaler
  // so the user-set rho still drives the magnitude.
  const rhoBase = highInflation ? cma.stockBondCorrelationHigh : cma.stockBondCorrelationLow;
  const stockBondScalers = highInflation
    ? [1.0, 0.9, 0.8, 0.8] // high regime: 0.50 / 0.45 / 0.40 / 0.40 around rho=0.50
    : [1.0, 1.0, 0.9, 0.8];

  const n = 7;
  const C: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  // Stocks: indices 0-3 (usLargeCap, usSmallCap, intlDeveloped, intlEmerging)
  // Bonds: indices 4-5 (usBonds, tips)
  // Cash: index 6

  // Stock-stock correlations
  const stockCorr = [
    [1.0, 0.85, 0.75, 0.65],
    [0.85, 1.0, 0.7, 0.6],
    [0.75, 0.7, 1.0, 0.75],
    [0.65, 0.6, 0.75, 1.0],
  ];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      C[i][j] = stockCorr[i][j];
    }
  }

  // Bond-bond correlation
  C[4][4] = 1.0;
  C[5][5] = 1.0;
  C[4][5] = 0.7;
  C[5][4] = 0.7;

  // Stock-bond cross correlations. Per-class scaling captures the empirical
  // pattern that international stocks decouple from US bonds more than US
  // stocks do. TIPS-stock is regime-dependent: in low-inflation regimes TIPS
  // hedge inflation and decorrelate from equity (~half of nominal bond-stock
  // correlation), but in HIGH-inflation regimes TIPS lose their
  // diversification benefit because real-yield shocks hit both legs (e.g.
  // 2022 sell-off). So we use a 0.5× scaler in low-inflation but a 0.9×
  // scaler in high-inflation, where TIPS track nominal bonds more closely.
  const tipsStockScaler = highInflation ? 0.9 : 0.5;
  for (let i = 0; i < 4; i++) {
    const r = rhoBase * stockBondScalers[i];
    C[i][4] = r;
    C[4][i] = r;
    const tipsR = r * tipsStockScaler;
    C[i][5] = tipsR;
    C[5][i] = tipsR;
  }

  // Cash: ~uncorrelated with stocks (rate-driven, not equity-driven) but
  // strongly correlated with bonds (both move with short-rate cycles).
  C[6][6] = 1.0;
  // Cash-stock pairs: near zero
  for (let i = 0; i < 4; i++) {
    C[i][6] = 0.05;
    C[6][i] = 0.05;
  }
  // Cash-bond pairs: 0.50 (rates move together)
  C[4][6] = 0.5;
  C[6][4] = 0.5;
  C[5][6] = 0.5;
  C[6][5] = 0.5;

  return C;
}

export interface CholeskyResult {
  L: number[][];
  nonPD: boolean;
}

export function choleskyDecomposition(matrix: number[][]): number[][] {
  return choleskyDecompositionWithDiagnostic(matrix).L;
}

export function choleskyDecompositionWithDiagnostic(matrix: number[][]): CholeskyResult {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  let nonPD = false;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        const diag = matrix[i][i] - sum;
        if (diag < -1e-9) nonPD = true;
        // Add a tiny ridge (1e-8) before clamping to keep the matrix usable
        // when user-supplied correlations are slightly inconsistent.
        L[i][j] = Math.sqrt(Math.max(0, diag + 1e-12));
      } else {
        L[i][j] = L[j][j] === 0 ? 0 : (matrix[i][j] - sum) / L[j][j];
      }
    }
  }

  return { L, nonPD };
}

// Module-level scratch buffers, reused across calls. The hot loop in
// `runIteration` invokes this 720k+ times for a typical 10k-iter sim, so
// re-allocating two 7-element arrays per call dominates GC pressure. JS is
// single-threaded inside a worker; concurrent callers share workers, not this
// module, so the shared scratch is safe.
const _z = new Array<number>(7);
const _correlated = new Array<number>(7);

export function generateCorrelatedReturns(
  cma: CMA,
  choleskyL: number[][],
  rng: PRNG,
  out: AssetReturns = makeAssetReturns(),
): AssetReturns {
  const n = 7;
  for (let i = 0; i < n; i++) _z[i] = rng.nextGaussian();

  for (let i = 0; i < n; i++) {
    let sum = 0;
    const row = choleskyL[i];
    for (let j = 0; j <= i; j++) {
      sum += row[j] * _z[j];
    }
    _correlated[i] = sum;
  }

  for (let i = 0; i < n; i++) {
    const key = ASSET_KEYS[i];
    const classParams = cma[key as keyof CMA] as {
      arithmeticMean: Rate;
      stdDev: Rate;
    };
    const mu = classParams.arithmeticMean;
    const sigmaArith = classParams.stdDev;
    // ln(1+r) ~ N(muLog, sigmaLog). User-supplied stdDev is the arithmetic
    // standard deviation of (1+R); convert it to the log-space sigma to keep
    // realized volatility matching the input. Closed-form:
    //   sigmaLog² = ln(1 + sigmaArith² / (1 + mu)²)
    const sigmaLog = Math.sqrt(Math.log(1 + (sigmaArith * sigmaArith) / ((1 + mu) * (1 + mu))));
    const muLog = Math.log(1 + mu) - (sigmaLog * sigmaLog) / 2;
    const logReturn = muLog + sigmaLog * _correlated[i];
    out[key] = Math.exp(logReturn) - 1;
  }

  return out;
}

export function makeAssetReturns(): AssetReturns {
  return {
    usLargeCap: 0,
    usSmallCap: 0,
    intlDeveloped: 0,
    intlEmerging: 0,
    usBonds: 0,
    tips: 0,
    cash: 0,
  };
}

export function applyReturnsToBalance(
  balance: number,
  allocation: AssetAllocation,
  returns: AssetReturns,
): number {
  let totalWeight = 0;
  let weightedReturn = 0;
  for (const key of ASSET_KEYS) {
    const weight = allocation[key as keyof AssetAllocation] ?? 0;
    totalWeight += weight;
    weightedReturn += weight * returns[key];
  }
  // Normalize so allocations that don't sum to exactly 1.0 (UI warns but
  // doesn't block) still apply a single year's return to the full balance.
  // Without this, an allocation summing to 0.9 would silently grow the
  // account at 90% of the weighted return (and 1.1 at 110%).
  if (totalWeight > 0 && Math.abs(totalWeight - 1) > 1e-9) {
    weightedReturn /= totalWeight;
  }
  return balance * (1 + weightedReturn);
}
