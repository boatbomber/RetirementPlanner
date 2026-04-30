import { describe, it, expect } from "vitest";
import { generateAnnualInflation } from "../inflation";
import { PRNG } from "../prng";
import type { SimulationConfig } from "@/models/simulation-config";
import { DEFAULT_SIMULATION_CONFIG } from "@/models/defaults";

function makeConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return { ...DEFAULT_SIMULATION_CONFIG, ...overrides };
}

describe("inflation model", () => {
  describe("fixed mode", () => {
    it("returns constant fixed rate regardless of previous inflation", () => {
      const config = makeConfig({
        inflationMode: "fixed",
        fixedInflationRate: 0.03,
      });
      const rng = new PRNG(1);
      for (let i = 0; i < 100; i++) {
        expect(generateAnnualInflation(0.05, config, rng)).toBe(0.03);
      }
    });

    it("ignores RNG in fixed mode", () => {
      const config = makeConfig({
        inflationMode: "fixed",
        fixedInflationRate: 0.025,
      });
      const rng1 = new PRNG(1);
      const rng2 = new PRNG(999);
      expect(generateAnnualInflation(0.01, config, rng1)).toBe(generateAnnualInflation(0.01, config, rng2));
    });
  });

  describe("stochastic mode (AR(1))", () => {
    it("long-run mean converges to longRunMean", () => {
      const config = makeConfig({
        inflationMode: "stochastic",
        stochasticInflation: { longRunMean: 0.025, phi: 0.5, sigma: 0.012 },
      });
      const rng = new PRNG(42);
      const n = 100_000;
      let prev = 0.025;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        prev = generateAnnualInflation(prev, config, rng);
        sum += prev;
      }
      const mean = sum / n;
      expect(mean).toBeCloseTo(0.025, 2);
    });

    it("is clamped between -5% and 20%", () => {
      const config = makeConfig({
        inflationMode: "stochastic",
        stochasticInflation: { longRunMean: 0.025, phi: 0.5, sigma: 0.1 },
      });
      const rng = new PRNG(12345);
      for (let i = 0; i < 50_000; i++) {
        const val = generateAnnualInflation(0.15, config, rng);
        expect(val).toBeGreaterThanOrEqual(-0.05);
        expect(val).toBeLessThanOrEqual(0.2);
      }
    });

    it("is deterministic for same seed", () => {
      const config = makeConfig({ inflationMode: "stochastic" });
      const a = new PRNG(100);
      const b = new PRNG(100);
      let prevA = 0.025;
      let prevB = 0.025;
      for (let i = 0; i < 50; i++) {
        prevA = generateAnnualInflation(prevA, config, a);
        prevB = generateAnnualInflation(prevB, config, b);
        expect(prevA).toBe(prevB);
      }
    });

    it("exhibits mean reversion (high inflation pulls back down)", () => {
      const config = makeConfig({
        inflationMode: "stochastic",
        stochasticInflation: { longRunMean: 0.025, phi: 0.5, sigma: 0.001 },
      });
      const rng = new PRNG(99);
      // Start with very high inflation
      const nextVal = generateAnnualInflation(0.15, config, rng);
      // With phi=0.5 and tiny sigma, should be about (0.025 + 0.5*(0.15 - 0.025)) ≈ 0.0875
      expect(nextVal).toBeLessThan(0.15);
      expect(nextVal).toBeGreaterThan(0.025);
    });
  });
});
