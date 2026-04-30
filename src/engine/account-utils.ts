import type { Dollars, Rate } from "@/models/core";
import type { AccountState, PrecomputedConfig } from "./types";
import type { AssetAllocation } from "@/models/account";
import { DEFAULT_FIXED_RATES } from "@/models/account";
import { isBrokerage, isFixedInterest } from "./simulation";

// Deep-clone the per-iteration scratch copy of the user's accounts. The sim
// mutates balance / costBasis / allocation in place, so each iteration needs
// its own private copy.
export function cloneAccounts(accounts: AccountState[]): AccountState[] {
  return accounts.map((a) => ({
    ...a,
    allocation: { ...a.allocation },
    baseAllocation: { ...a.baseAllocation },
    glidePath: a.glidePath.map((p) => ({ age: p.age, allocation: { ...p.allocation } })),
  }));
}

// APY for a fixed-interest account: user-configured value, else the type's
// default.
export function getFixedRate(acct: AccountState): Rate {
  if (acct.fixedAnnualReturn != null) return acct.fixedAnnualReturn;
  return DEFAULT_FIXED_RATES[acct.type] ?? 0;
}

// Add `amount` to an account. Brokerage deposits also raise cost basis (the
// money came from already-taxed cash, so future LTCG is computed on growth
// above this contribution).
export function depositToAccount(acct: AccountState, amount: Dollars): void {
  if (amount <= 0) return;
  acct.balance += amount;
  if (isBrokerage(acct.type)) {
    acct.costBasis += amount;
  }
}

export const ALLOCATION_KEYS: (keyof AssetAllocation)[] = [
  "usLargeCap",
  "usSmallCap",
  "intlDeveloped",
  "intlEmerging",
  "usBonds",
  "tips",
  "cash",
];

const EQUITY_KEYS_SET = new Set<keyof AssetAllocation>([
  "usLargeCap",
  "usSmallCap",
  "intlDeveloped",
  "intlEmerging",
]);

// Compute portfolio-weighted expected return and volatility from CMA × the
// effective allocation across all non-fixed-interest accounts. Used by the
// risk-based withdrawal strategy.
export function computePortfolioRiskStats(
  accounts: AccountState[],
  cma: PrecomputedConfig["simulationConfig"]["capitalMarketAssumptions"],
): { expectedReturn: number; volatility: number; equityWeight: number } {
  let totalRisk = 0;
  for (const a of accounts) {
    if (a.balance <= 0) continue;
    if (isFixedInterest(a.type)) continue;
    if (a.fixedAnnualReturn != null) continue;
    totalRisk += a.balance;
  }
  if (totalRisk <= 0) return { expectedReturn: 0.05, volatility: 0.12, equityWeight: 0.6 };

  const aggAlloc: Record<string, number> = {};
  for (const k of ALLOCATION_KEYS) aggAlloc[k] = 0;
  for (const a of accounts) {
    if (a.balance <= 0) continue;
    if (isFixedInterest(a.type)) continue;
    if (a.fixedAnnualReturn != null) continue;
    const w = a.balance / totalRisk;
    for (const k of ALLOCATION_KEYS) {
      aggAlloc[k] += w * (a.allocation[k] ?? 0);
    }
  }
  let mu = 0;
  let varSum = 0;
  let equityWeight = 0;
  for (const k of ALLOCATION_KEYS) {
    const w = aggAlloc[k];
    const cls = cma[k as keyof typeof cma] as { arithmeticMean: number; stdDev: number };
    mu += w * cls.arithmeticMean;
    varSum += w * w * cls.stdDev * cls.stdDev;
    if (EQUITY_KEYS_SET.has(k)) equityWeight += w;
  }
  return { expectedReturn: mu, volatility: Math.sqrt(Math.max(0, varSum)), equityWeight };
}
