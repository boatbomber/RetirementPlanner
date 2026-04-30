import type { Dollars } from "@/models/core";
import type { WithdrawalStrategy, ArvaParams } from "@/models/withdrawal";
import type { WithdrawalState } from "../types";

// Annually Recalculated Virtual Annuity (ARVA)
// Spending = PMT(realDiscountRate, yearsRemaining, real balance), then
// re-inflated to nominal. Treats portfolio as if purchasing a new annuity
// each year. Mixing a real discount rate with a nominal balance would be
// dimensionally incoherent, so we deflate the balance, compute the real
// payment, then re-inflate to current nominal dollars.
export function arva(totalBalance: Dollars, state: WithdrawalState, strategy: WithdrawalStrategy): Dollars {
  const params = strategy.params as ArvaParams;
  const yearsRemaining = Math.max(1, state.endAge - state.currentAge);
  const r = params.realDiscountRate;

  if (totalBalance <= 0) return 0;

  const realBalance = totalBalance / state.cumulativeInflation;

  if (r <= 0) {
    return (realBalance / yearsRemaining) * state.cumulativeInflation;
  }

  // PMT = PV × r / (1 - (1 + r)^-n)
  const pmtReal = (realBalance * r) / (1 - Math.pow(1 + r, -yearsRemaining));

  return pmtReal * state.cumulativeInflation;
}
