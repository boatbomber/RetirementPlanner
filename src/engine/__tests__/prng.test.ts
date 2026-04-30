import { describe, it, expect } from "vitest";
import { PRNG } from "../prng";

describe("PRNG", () => {
  it("produces deterministic output for same seed", () => {
    const a = new PRNG(42);
    const b = new PRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(a.nextFloat()).toBe(b.nextFloat());
    }
  });

  it("produces different output for different seeds", () => {
    const a = new PRNG(1);
    const b = new PRNG(2);
    const aVals = Array.from({ length: 10 }, () => a.nextFloat());
    const bVals = Array.from({ length: 10 }, () => b.nextFloat());
    expect(aVals).not.toEqual(bVals);
  });

  it("nextFloat returns values in [0, 1)", () => {
    const rng = new PRNG(123);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("nextFloat has approximately uniform distribution", () => {
    const rng = new PRNG(999);
    const n = 100_000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += rng.nextFloat();
    }
    const mean = sum / n;
    expect(mean).toBeCloseTo(0.5, 1);
  });

  it("nextGaussian has mean ≈ 0 and stddev ≈ 1", () => {
    const rng = new PRNG(777);
    const n = 100_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = rng.nextGaussian();
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(mean).toBeCloseTo(0, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(1, 1);
  });

  it("nextGaussian is deterministic across paired calls (Box-Muller spare)", () => {
    const a = new PRNG(55);
    const b = new PRNG(55);
    for (let i = 0; i < 50; i++) {
      expect(a.nextGaussian()).toBe(b.nextGaussian());
    }
  });

  it("nextGaussianArray returns correct length", () => {
    const rng = new PRNG(10);
    const arr = rng.nextGaussianArray(7);
    expect(arr).toHaveLength(7);
  });

  it("seed 0 does not produce all zeros", () => {
    const rng = new PRNG(0);
    const values = Array.from({ length: 10 }, () => rng.nextFloat());
    expect(values.some((v) => v > 0)).toBe(true);
  });
});
