import { describe, it, expect } from "vitest";
import {
  choleskyDecomposition,
  buildCorrelationMatrix,
  generateCorrelatedReturns,
  applyReturnsToBalance,
} from "../returns";
import { PRNG } from "../prng";
import { DEFAULT_CMA, DEFAULT_ALLOCATION } from "@/models/defaults";

describe("Cholesky decomposition", () => {
  it("L × L^T reconstructs the original matrix within floating-point epsilon", () => {
    const C = buildCorrelationMatrix(DEFAULT_CMA, false);
    const L = choleskyDecomposition(C);
    const n = C.length;

    // Reconstruct: R = L × L^T
    const R: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += L[i][k] * L[j][k];
        }
        R[i][j] = sum;
      }
    }

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        expect(R[i][j]).toBeCloseTo(C[i][j], 10);
      }
    }
  });

  it("L × L^T reconstructs high-inflation correlation matrix", () => {
    const C = buildCorrelationMatrix(DEFAULT_CMA, true);
    const L = choleskyDecomposition(C);
    const n = C.length;

    const R: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += L[i][k] * L[j][k];
        }
        R[i][j] = sum;
      }
    }

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        expect(R[i][j]).toBeCloseTo(C[i][j], 10);
      }
    }
  });

  it("L is lower triangular", () => {
    const C = buildCorrelationMatrix(DEFAULT_CMA, false);
    const L = choleskyDecomposition(C);
    const n = C.length;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        expect(L[i][j]).toBe(0);
      }
    }
  });

  it("diagonal of L is positive", () => {
    const C = buildCorrelationMatrix(DEFAULT_CMA, false);
    const L = choleskyDecomposition(C);

    for (let i = 0; i < L.length; i++) {
      expect(L[i][i]).toBeGreaterThan(0);
    }
  });

  it("identity matrix decomposes to identity", () => {
    const I = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const L = choleskyDecomposition(I);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(L[i][j]).toBeCloseTo(I[i][j], 10);
      }
    }
  });
});

describe("correlation matrix", () => {
  it("diagonal is all 1.0", () => {
    const C = buildCorrelationMatrix(DEFAULT_CMA, false);
    for (let i = 0; i < C.length; i++) {
      expect(C[i][i]).toBe(1.0);
    }
  });

  it("is symmetric", () => {
    const C = buildCorrelationMatrix(DEFAULT_CMA, false);
    for (let i = 0; i < C.length; i++) {
      for (let j = 0; j < C.length; j++) {
        expect(C[i][j]).toBe(C[j][i]);
      }
    }
  });

  it("low-inflation regime uses negative stock-bond correlation", () => {
    const C = buildCorrelationMatrix(DEFAULT_CMA, false);
    // stock (0) vs bond (4)
    expect(C[0][4]).toBe(-0.3);
  });

  it("high-inflation regime uses positive stock-bond correlation", () => {
    const C = buildCorrelationMatrix(DEFAULT_CMA, true);
    expect(C[0][4]).toBe(0.5);
  });
});

describe("generateCorrelatedReturns", () => {
  it("is deterministic for same seed", () => {
    const L = choleskyDecomposition(buildCorrelationMatrix(DEFAULT_CMA, false));
    const a = new PRNG(42);
    const b = new PRNG(42);
    const ra = generateCorrelatedReturns(DEFAULT_CMA, L, a);
    const rb = generateCorrelatedReturns(DEFAULT_CMA, L, b);
    expect(ra).toEqual(rb);
  });

  it("sample arithmetic mean of lognormal draws converges to input mean", () => {
    const L = choleskyDecomposition(buildCorrelationMatrix(DEFAULT_CMA, false));
    const rng = new PRNG(12345);
    const n = 100_000;
    let sum = 0;

    for (let i = 0; i < n; i++) {
      const r = generateCorrelatedReturns(DEFAULT_CMA, L, rng);
      sum += r.usLargeCap;
    }

    const sampleMean = sum / n;
    // US large cap arithmetic mean is 5.5%
    expect(sampleMean).toBeCloseTo(0.055, 1);
  });

  it("geometric mean is approximately σ²/2 below arithmetic mean", () => {
    const L = choleskyDecomposition(buildCorrelationMatrix(DEFAULT_CMA, false));
    const rng = new PRNG(99999);
    const n = 100_000;
    let logSum = 0;
    let arithSum = 0;

    for (let i = 0; i < n; i++) {
      const r = generateCorrelatedReturns(DEFAULT_CMA, L, rng);
      logSum += Math.log(1 + r.usLargeCap);
      arithSum += r.usLargeCap;
    }

    const geoMean = Math.exp(logSum / n) - 1;
    const arithMean = arithSum / n;
    const sigma = DEFAULT_CMA.usLargeCap.stdDev;
    const expectedGap = (sigma * sigma) / 2;

    // Geometric mean should be ~σ²/2 below arithmetic mean
    const actualGap = arithMean - geoMean;
    expect(actualGap).toBeCloseTo(expectedGap, 1);
  });
});

describe("applyReturnsToBalance", () => {
  it("100% cash allocation uses only cash return", () => {
    const allCash = {
      usLargeCap: 0,
      usSmallCap: 0,
      intlDeveloped: 0,
      intlEmerging: 0,
      usBonds: 0,
      tips: 0,
      cash: 1,
    };
    const returns = {
      usLargeCap: 0.1,
      usSmallCap: 0.12,
      intlDeveloped: 0.08,
      intlEmerging: 0.15,
      usBonds: 0.03,
      tips: 0.02,
      cash: 0.005,
    };
    const result = applyReturnsToBalance(100_000, allCash, returns);
    expect(result).toBeCloseTo(100_500, 0);
  });

  it("60/40 portfolio applies weighted returns", () => {
    const returns = {
      usLargeCap: 0.1,
      usSmallCap: 0.1,
      intlDeveloped: 0.1,
      intlEmerging: 0.1,
      usBonds: 0.03,
      tips: 0.03,
      cash: 0.01,
    };
    // DEFAULT_ALLOCATION: 56% large, 12% small, 12% intl, 0% emerging, 17% bonds, 3% tips, 0% cash
    // Weighted: 0.56*0.10 + 0.12*0.10 + 0.12*0.10 + 0 + 0.17*0.03 + 0.03*0.03 + 0
    //         = 0.056 + 0.012 + 0.012 + 0.0051 + 0.0009 = 0.0860
    const result = applyReturnsToBalance(100_000, DEFAULT_ALLOCATION, returns);
    expect(result).toBeCloseTo(108_600, 0);
  });

  it("zero balance returns zero", () => {
    const returns = {
      usLargeCap: 0.1,
      usSmallCap: 0.1,
      intlDeveloped: 0.1,
      intlEmerging: 0.1,
      usBonds: 0.03,
      tips: 0.03,
      cash: 0.01,
    };
    expect(applyReturnsToBalance(0, DEFAULT_ALLOCATION, returns)).toBe(0);
  });

  it("negative returns reduce balance", () => {
    const returns = {
      usLargeCap: -0.2,
      usSmallCap: -0.2,
      intlDeveloped: -0.2,
      intlEmerging: -0.2,
      usBonds: -0.05,
      tips: -0.05,
      cash: 0,
    };
    const result = applyReturnsToBalance(100_000, DEFAULT_ALLOCATION, returns);
    expect(result).toBeLessThan(100_000);
  });
});
