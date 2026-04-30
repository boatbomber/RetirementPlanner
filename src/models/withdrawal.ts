import type { Rate } from "./core";
import type { AccountType } from "./account";

export type WithdrawalStrategyType =
  | "fixed_real"
  | "guyton_klinger"
  | "vanguard_dynamic"
  | "vpw"
  | "rmd_method"
  | "arva"
  | "kitces_ratchet"
  | "risk_based";

export interface FixedRealParams {
  withdrawalRate: Rate;
}

export interface GuytonKlingerParams {
  initialRate: Rate;
  ceilingMultiplier: Rate;
  floorMultiplier: Rate;
  adjustmentPercent: Rate;
}

export interface VanguardDynamicParams {
  initialRate: Rate;
  ceilingPercent: Rate;
  floorPercent: Rate;
}

export interface VpwParams {}

export interface RmdMethodParams {
  smoothingYears: number;
}

export interface ArvaParams {
  realDiscountRate: Rate;
}

export interface KitcesRatchetParams {
  initialRate: Rate;
  ratchetThreshold: Rate;
  ratchetIncrease: Rate;
  // Optional ceiling on the implied withdrawal rate. Kitces' original article
  // does not include a cap, so leave null to follow the source. Some users
  // may prefer a cap (e.g. 0.06) for prudent under-spending in strong markets.
  maxWithdrawalRate?: Rate | null;
}

export interface RiskBasedParams {
  targetSuccessLow: Rate;
  targetSuccessHigh: Rate;
  adjustmentStep: Rate;
  initialRate: Rate;
  // Optional CMA-derived overrides. When omitted, the engine derives
  // expected return and volatility from the scenario's allocation × CMA.
  expectedReturn?: Rate;
  volatility?: Rate;
}

export type StrategyParams =
  | FixedRealParams
  | GuytonKlingerParams
  | VanguardDynamicParams
  | VpwParams
  | RmdMethodParams
  | ArvaParams
  | KitcesRatchetParams
  | RiskBasedParams;

// Discriminated union by `type` so TypeScript can correlate `params` to the
// matching strategy. Plain interface variants (e.g., a `fixed_real` paired
// with `ArvaParams`) are no longer constructible.
export type WithdrawalStrategy =
  | { type: "fixed_real"; params: FixedRealParams; useSpendingSmile: boolean }
  | { type: "guyton_klinger"; params: GuytonKlingerParams; useSpendingSmile: boolean }
  | { type: "vanguard_dynamic"; params: VanguardDynamicParams; useSpendingSmile: boolean }
  | { type: "vpw"; params: VpwParams; useSpendingSmile: boolean }
  | { type: "rmd_method"; params: RmdMethodParams; useSpendingSmile: boolean }
  | { type: "arva"; params: ArvaParams; useSpendingSmile: boolean }
  | { type: "kitces_ratchet"; params: KitcesRatchetParams; useSpendingSmile: boolean }
  | { type: "risk_based"; params: RiskBasedParams; useSpendingSmile: boolean };

export type WithdrawalOrderType = "conventional" | "bracket_filling" | "roth_first" | "custom";

export interface WithdrawalOrder {
  type: WithdrawalOrderType;
  rothConversionEnabled: boolean;
  rothConversionTargetBracket: Rate;
  // Top of the marginal bracket (e.g. 0.12, 0.22) up to which a
  // bracket-filling withdrawal pulls Traditional dollars before switching to
  // Taxable for the residual. Ignored unless `type === "bracket_filling"`.
  bracketFillingTargetBracket: Rate;
  customOrder: AccountType[];
}
