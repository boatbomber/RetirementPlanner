import type { Dollars } from "@/models/core";
import type { WithdrawalStrategy, RiskBasedParams } from "@/models/withdrawal";
import type { WithdrawalState } from "../types";

// Risk-Based: Adjust spending to keep portfolio success probability in a target band
// Uses Milevsky (2005) analytical approximation for ruin probability:
//   P(ruin) ≈ Φ(-z) where z = (μ - w) × √T / σ
// Adjust spending up/down by adjustmentStep if implied success rate
// is outside [targetSuccessLow, targetSuccessHigh]

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-absX * absX) / 2);
  return 0.5 * (1 + sign * y);
}

export function estimateSuccessProbability(
  balance: Dollars,
  annualSpending: Dollars,
  yearsRemaining: number,
  expectedReturn: number,
  volatility: number,
): number {
  if (balance <= 0 || annualSpending <= 0) return balance > 0 ? 1 : 0;
  const withdrawalRate = annualSpending / balance;
  const mu = expectedReturn;
  const sigma = volatility;
  const T = yearsRemaining;

  if (sigma <= 0 || T <= 0) return withdrawalRate < mu ? 1 : 0;

  const z = ((mu - withdrawalRate) * Math.sqrt(T)) / sigma;
  return normalCDF(z);
}

export function riskBased(
  totalBalance: Dollars,
  state: WithdrawalState,
  strategy: WithdrawalStrategy,
): Dollars {
  const params = strategy.params as RiskBasedParams;
  const initialRate = params.initialRate ?? 0.04;

  if (state.yearsInRetirement === 0 || state.priorYearSpending <= 0) {
    // Anchor to retirement-day balance in real terms (Kitces convention) so
    // year-0 spending matches the user's intent regardless of intra-year
    // accumulation.
    return state.retirementBalance * initialRate * state.cumulativeInflation;
  }

  const yearsRemaining = Math.max(1, state.endAge - state.currentAge);
  // Prefer explicit overrides, then CMA-derived portfolio stats from state,
  // then conservative defaults.
  const mu = params.expectedReturn ?? state.portfolioExpectedReturn ?? 0.05;
  const sigma = params.volatility ?? state.portfolioVolatility ?? 0.12;

  // First apply COLA so the baseline holds real value; then adjust ± based on
  // implied success probability. Without the COLA step, real spending erodes
  // automatically by ~currentYearInflation each year.
  let spending = state.priorYearSpending * (1 + state.currentYearInflation);
  const successProb = estimateSuccessProbability(totalBalance, spending, yearsRemaining, mu, sigma);

  if (successProb > params.targetSuccessHigh) {
    spending *= 1 + params.adjustmentStep;
  } else if (successProb < params.targetSuccessLow) {
    spending *= 1 - params.adjustmentStep;
  }

  return spending;
}
