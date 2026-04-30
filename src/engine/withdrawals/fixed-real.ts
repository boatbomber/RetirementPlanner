import type { Dollars } from "@/models/core";
import type { WithdrawalStrategy, FixedRealParams } from "@/models/withdrawal";
import type { WithdrawalState } from "../types";

// Bengen (1994): withdraw a fixed % of the retirement-day portfolio,
// inflation-adjusted each year. Anchors on the balance at retirement, not the
// simulation start (those differ when the user runs accumulation years first).
export function fixedReal(
  _totalBalance: Dollars,
  state: WithdrawalState,
  strategy: WithdrawalStrategy,
): Dollars {
  const params = strategy.params as FixedRealParams;
  return state.retirementBalance * params.withdrawalRate * state.cumulativeInflation;
}
