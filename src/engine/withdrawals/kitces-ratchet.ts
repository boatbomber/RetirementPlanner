import type { Dollars } from "@/models/core";
import type { WithdrawalStrategy, KitcesRatchetParams } from "@/models/withdrawal";
import type { WithdrawalState } from "../types";

// Kitces ratchet (Kitces, 2015): start at initialRate × retirement-day balance.
// Each year, increase spending by inflation. If real portfolio value has
// grown more than ratchetThreshold above the retirement-day real value, bump
// spending by ratchetIncrease. Never reduce. The original article does not
// impose a withdrawal-rate cap, so the cap here is opt-in via params.
//
// Source: https://www.kitces.com/blog/the-ratcheting-safe-withdrawal-rate/
export function kitcesRatchet(
  totalBalance: Dollars,
  state: WithdrawalState,
  strategy: WithdrawalStrategy,
): Dollars {
  const params = strategy.params as KitcesRatchetParams;

  if (state.yearsInRetirement === 0) {
    // retirementBalance is in real (sim-start) dollars; multiply by
    // cumulativeInflation to get nominal first-year spending.
    return state.retirementBalance * params.initialRate * state.cumulativeInflation;
  }

  // Inflation-adjusted floor. Never cut below this in nominal terms.
  const inflatedPrior = state.priorYearSpending * (1 + state.currentYearInflation);

  // Real portfolio value vs. real retirement-day portfolio value (both in
  // sim-start dollars).
  const realPortfolio =
    state.cumulativeInflation > 0 ? totalBalance / state.cumulativeInflation : totalBalance;
  const portfolioGrowth =
    state.retirementBalance > 0 ? (realPortfolio - state.retirementBalance) / state.retirementBalance : 0;

  let target = inflatedPrior;
  if (portfolioGrowth >= params.ratchetThreshold) {
    target = inflatedPrior * (1 + params.ratchetIncrease);
  }

  // Optional ceiling on implied withdrawal rate (not in source).
  if (params.maxWithdrawalRate != null && totalBalance > 0) {
    target = Math.min(target, totalBalance * params.maxWithdrawalRate);
  }

  // Never below inflation-adjusted floor
  return Math.max(inflatedPrior, target);
}
