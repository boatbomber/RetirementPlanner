import type { Dollars } from "@/models/core";
import type { WithdrawalStrategy, VanguardDynamicParams } from "@/models/withdrawal";
import type { WithdrawalState } from "../types";

// Vanguard Dynamic Spending: apply current WR to balance, then collar changes
// Ceiling: spending can't increase more than +ceilingPercent in REAL terms
// Floor: spending can't decrease more than -floorPercent in REAL terms
// (Source: Vanguard "From Assets to Income". Collar is real, not nominal.)
export function vanguardDynamic(
  totalBalance: Dollars,
  state: WithdrawalState,
  strategy: WithdrawalStrategy,
): Dollars {
  const params = strategy.params as VanguardDynamicParams;

  if (state.yearsInRetirement === 0 || totalBalance <= 0) {
    // Anchor to retirement-day balance in real terms (Kitces convention) so
    // first-year spending is independent of any accumulation that happened
    // earlier in the same calendar year.
    if (totalBalance <= 0) return 0;
    return state.retirementBalance * params.initialRate * state.cumulativeInflation;
  }

  // Deflate prior nominal spending to real, collar in real, then re-inflate
  // to nominal current-year dollars.
  const priorReal = state.priorYearSpending / state.cumulativeInflation;
  const candidateReal = (totalBalance * params.initialRate) / state.cumulativeInflation;

  const maxReal = priorReal * (1 + params.ceilingPercent);
  const minReal = priorReal * (1 - params.floorPercent);
  const collaredReal = Math.max(minReal, Math.min(maxReal, candidateReal));

  return collaredReal * state.cumulativeInflation;
}
