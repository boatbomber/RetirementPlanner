import type { Dollars, Age } from "@/models/core";
import type { WithdrawalStrategy, RmdMethodParams } from "@/models/withdrawal";
import type { WithdrawalState } from "../types";
import { getUniformLifetimeDivisor } from "../rmd";

// Approximate remaining life expectancy for ages below 72, extending the IRS
// Uniform Lifetime Table downward. The UL table's local slope around age 72
// is roughly -0.9 per year (72→27.4, 73→26.5, 74→25.5, 75→24.6), so we
// extend backward at +0.9 per year as age decreases. Younger retirees thus
// get a larger divisor (smaller withdrawal fraction), matching the UL
// convention.
function preRmdLifeExpectancy(age: Age): number {
  if (age >= 72) return getUniformLifetimeDivisor(age);
  const yearsRemaining = 27.4 + (72 - age) * 0.9;
  return Math.min(50, Math.max(1, yearsRemaining));
}

// RMD-based withdrawal: divide balance by remaining life expectancy with
// optional smoothing. For pre-72 ages we extrapolate the Uniform Lifetime
// table downward rather than treating the missing divisor as "withdraw
// everything", which would drain a 50-year-old's portfolio in one year.
export function rmdMethod(
  totalBalance: Dollars,
  state: WithdrawalState,
  strategy: WithdrawalStrategy,
): Dollars {
  const params = strategy.params as RmdMethodParams;
  const age = state.currentAge;

  let divisor = getUniformLifetimeDivisor(age);
  if (divisor <= 0) divisor = preRmdLifeExpectancy(age);

  const rawWithdrawal = totalBalance / divisor;

  if (params.smoothingYears > 1 && state.yearsInRetirement > 0) {
    // Exponential moving average (EWMA) with smoothingYears as the time
    // constant. Equivalent to a low-pass filter with effective lookback of
    // params.smoothingYears. The prior term is COLA'd by currentYearInflation
    // first so the blend stays in nominal current-year dollars. Otherwise
    // steady-state spending lags inflation by ~1-1/N each year.
    const weight = 1 / params.smoothingYears;
    const priorInflated = state.priorYearSpending * (1 + state.currentYearInflation);
    return weight * rawWithdrawal + (1 - weight) * priorInflated;
  }

  return rawWithdrawal;
}
