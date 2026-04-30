import type { Rate, Age } from "./core";

export interface AssetClassCMA {
  arithmeticMean: Rate;
  stdDev: Rate;
}

export interface CMA {
  usLargeCap: AssetClassCMA;
  usSmallCap: AssetClassCMA;
  intlDeveloped: AssetClassCMA;
  intlEmerging: AssetClassCMA;
  usBonds: AssetClassCMA;
  tips: AssetClassCMA;
  cash: AssetClassCMA;
  stockBondCorrelationLow: Rate;
  stockBondCorrelationHigh: Rate;
}

export type SimulationMethod = "parametric_lognormal";

export type InflationMode = "fixed" | "stochastic";

export interface StochasticInflationConfig {
  longRunMean: Rate;
  phi: Rate;
  sigma: Rate;
}

export type LongevityModel = "fixed_age" | "stochastic_mortality";

export type MortalityTable = "ssa_period" | "soa_rp2014";

export interface SimulationConfig {
  iterations: number;
  method: SimulationMethod;
  seed: number | null;
  inflationMode: InflationMode;
  fixedInflationRate: Rate;
  stochasticInflation: StochasticInflationConfig;
  // Annual-inflation threshold above which the high-inflation correlation
  // regime activates (uses cma.stockBondCorrelationHigh). Spec default 3.0%.
  inflationRegimeThreshold: Rate;
  capitalMarketAssumptions: CMA;
  longevityModel: LongevityModel;
  fixedEndAge: Age;
  mortalityTable: MortalityTable;
  mortalityImprovement: boolean;
}
