import type { Dollars } from "@/models/core";
import type { WithdrawalStrategy, WithdrawalStrategyType } from "@/models/withdrawal";
import type { WithdrawalState } from "../types";
import { fixedReal } from "./fixed-real";
import { guytonKlinger } from "./guyton-klinger";
import { vanguardDynamic } from "./vanguard-dynamic";
import { vpw } from "./vpw";
import { rmdMethod } from "./rmd-method";
import { arva } from "./arva";
import { kitcesRatchet } from "./kitces-ratchet";
import { riskBased } from "./risk-based";

export type SpendingFn = (
  totalBalance: Dollars,
  state: WithdrawalState,
  strategy: WithdrawalStrategy,
) => Dollars;

// Typed as Record<WithdrawalStrategyType, _> so TS catches a missing entry
// when a new strategy is added to the union.
const STRATEGY_MAP: Record<WithdrawalStrategyType, SpendingFn> = {
  fixed_real: fixedReal,
  guyton_klinger: guytonKlinger,
  vanguard_dynamic: vanguardDynamic,
  vpw: vpw,
  rmd_method: rmdMethod,
  arva: arva,
  kitces_ratchet: kitcesRatchet,
  risk_based: riskBased,
};

let warnedNegativeStrategy = false;

export function computeAnnualSpending(
  totalBalance: Dollars,
  state: WithdrawalState,
  strategy: WithdrawalStrategy,
): Dollars {
  const fn = STRATEGY_MAP[strategy.type];
  // Runtime safety net for data that bypassed the type system (e.g.,
  // hand-edited persisted state with an unknown strategy type).
  if (!fn) return 0;
  const raw = fn(totalBalance, state, strategy);
  if (raw < 0 && !warnedNegativeStrategy) {
    warnedNegativeStrategy = true;
    console.warn(
      `Withdrawal strategy ${strategy.type} returned a negative spending (${raw}). Clamping to 0; ` +
        `check the strategy parameters.`,
    );
  }
  return Math.max(0, raw);
}
