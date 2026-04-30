import type { Dollars } from "@/models/core";
import type { WithdrawalStrategy, GuytonKlingerParams } from "@/models/withdrawal";
import type { WithdrawalState } from "../types";

// Guyton-Klinger (2006): Guardrails with ±adjustment triggers
// - Prosperity rule: if current WR < initial WR × (1 - floorMultiplier), increase spend by adjustmentPercent
// - Capital preservation rule: if current WR > initial WR × (1 + ceilingMultiplier), decrease spend by adjustmentPercent
// - Modified COLA rule: skip inflation adjustment after a negative return year
export function guytonKlinger(
  totalBalance: Dollars,
  state: WithdrawalState,
  strategy: WithdrawalStrategy,
): Dollars {
  const params = strategy.params as GuytonKlingerParams;

  if (state.yearsInRetirement === 0) {
    // Anchor to retirement-day balance in real terms, then re-inflate. Same
    // convention as Kitces ratchet so dynamic strategies don't silently
    // overshoot when accumulation/contributions happened earlier in the
    // first retirement year.
    return state.retirementBalance * params.initialRate * state.cumulativeInflation;
  }

  if (totalBalance <= 0) return 0;

  // Modified COLA (Guyton-Klinger 2006): skip inflation only when BOTH the
  // prior year had a negative return AND the current withdrawal rate exceeds
  // the initial WR. Skipping on negative return alone is too punitive. A
  // retiree drawing well under the initial rate keeps real value during dips.
  const skipCola = state.priorYearReturn < 0 && state.priorYearWithdrawalRate > params.initialRate;
  let spending = skipCola
    ? state.priorYearSpending
    : state.priorYearSpending * (1 + state.currentYearInflation);

  const currentWR = spending / totalBalance;

  // Capital preservation: WR exceeds ceiling → cut spending
  const ceiling = params.initialRate * (1 + params.ceilingMultiplier);
  if (currentWR > ceiling) {
    spending *= 1 - params.adjustmentPercent;
  }

  // Prosperity: WR below floor → increase spending
  const floor = params.initialRate * (1 - params.floorMultiplier);
  if (currentWR < floor) {
    spending *= 1 + params.adjustmentPercent;
  }

  return spending;
}
