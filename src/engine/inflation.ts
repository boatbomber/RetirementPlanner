import type { Rate } from "@/models/core";
import type { SimulationConfig } from "@/models/simulation-config";
import type { PRNG } from "./prng";

// AR(1) inflation generator. Bounds [-5%, +20%] keep pathological draws from
// crashing the rest of the engine (hyperinflation overflows compounding,
// large deflation breaks expense indexing). Reflection at the boundaries
// preserves the AR(1) variance better than a hard clamp - which would pile
// mass at the cap and bias the realized distribution downward at high sigma.
const INFL_LOWER = -0.05;
const INFL_UPPER = 0.2;

function reflectIntoBand(x: number, lo: number, hi: number): number {
  // Repeated reflection until value is in-band. Almost always 0 or 1
  // iterations at default sigma=1.2%; the loop bounds the worst-case at
  // a handful of bounces for outlier shocks at high sigma.
  let v = x;
  const span = hi - lo;
  if (span <= 0) return lo;
  while (v < lo || v > hi) {
    if (v < lo) v = lo + (lo - v);
    else if (v > hi) v = hi - (v - hi);
  }
  return v;
}

export function generateAnnualInflation(prevInflation: Rate, config: SimulationConfig, rng: PRNG): Rate {
  if (config.inflationMode === "fixed") {
    return config.fixedInflationRate;
  }

  const { longRunMean, phi, sigma } = config.stochasticInflation;
  const shock = rng.nextGaussian() * sigma;
  const raw = longRunMean + phi * (prevInflation - longRunMean) + shock;
  return reflectIntoBand(raw, INFL_LOWER, INFL_UPPER);
}
