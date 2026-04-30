import type { Dollars, Rate } from "@/models/core";
import type { AccountState } from "./types";
import { FEDERAL_BRACKETS } from "./data";
import { isTraditional, isRoth, isBrokerage, isFixedInterest } from "./simulation";

// Pre-sort the account list by withdrawal-strategy priority. Per-iteration
// caller invokes this once at iteration start and reuses the result every
// retirement year (balance>0 is checked inline in the consuming loop).
export function sortAccountsForWithdrawalOrder(
  accounts: AccountState[],
  orderType: string,
  customOrder?: string[],
): AccountState[] {
  const out = accounts.slice();
  switch (orderType) {
    case "roth_first":
      out.sort((a, b) => {
        const aOrder = isRoth(a.type) ? 0 : isBrokerage(a.type) || isFixedInterest(a.type) ? 1 : 2;
        const bOrder = isRoth(b.type) ? 0 : isBrokerage(b.type) || isFixedInterest(b.type) ? 1 : 2;
        return aOrder - bOrder;
      });
      return out;
    case "bracket_filling":
      out.sort((a, b) => {
        const aOrder = isTraditional(a.type) ? 0 : isBrokerage(a.type) || isFixedInterest(a.type) ? 1 : 2;
        const bOrder = isTraditional(b.type) ? 0 : isBrokerage(b.type) || isFixedInterest(b.type) ? 1 : 2;
        return aOrder - bOrder;
      });
      return out;
    case "custom": {
      if (customOrder && customOrder.length > 0) {
        out.sort((a, b) => {
          const aIdx = customOrder.indexOf(a.type);
          const bIdx = customOrder.indexOf(b.type);
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        });
        return out;
      }
      // No custom list ⇒ same as conventional ordering.
      out.sort(byConventionalWithdrawalOrder);
      return out;
    }
    case "conventional":
    default:
      out.sort(byConventionalWithdrawalOrder);
      return out;
  }
}

function byConventionalWithdrawalOrder(a: AccountState, b: AccountState): number {
  const aOrder = isBrokerage(a.type) || isFixedInterest(a.type) ? 0 : isTraditional(a.type) ? 1 : 2;
  const bOrder = isBrokerage(b.type) || isFixedInterest(b.type) ? 0 : isTraditional(b.type) ? 1 : 2;
  return aOrder - bOrder;
}

// Tax-pay liquidation order: brokerage → fixed-interest (excl. i_bonds) →
// Roth → Traditional. Pre-sorted once per iteration.
export function sortAccountsForTaxPay(accounts: AccountState[]): AccountState[] {
  const out = accounts.slice();
  out.sort((a, b) => priorityForTaxPay(a) - priorityForTaxPay(b));
  return out;
}

function priorityForTaxPay(a: AccountState): number {
  if (isBrokerage(a.type)) return 0;
  if (isFixedInterest(a.type) && a.type !== "i_bonds") return 1;
  if (isRoth(a.type)) return 2;
  if (isTraditional(a.type)) return 3;
  return 4; // i_bonds, hsa, 529 - last
}

// Life-event outflow drain order: brokerage → fixed-interest → traditional →
// Roth. Pre-sorted once per iteration.
export function sortAccountsForLifeEventDrain(accounts: AccountState[]): AccountState[] {
  const out = accounts.slice();
  out.sort((a, b) => priorityForLifeEventDrain(a) - priorityForLifeEventDrain(b));
  return out;
}

function priorityForLifeEventDrain(a: AccountState): number {
  if (isBrokerage(a.type)) return 0;
  if (isFixedInterest(a.type)) return 1;
  if (isTraditional(a.type)) return 2;
  if (isRoth(a.type)) return 3;
  return 4; // hsa, 529 - last
}

// Convert a tax-bracket rate into the income threshold (in nominal dollars)
// at which a bracket-filling strategy should stop pulling Traditional money.
// Used by the bracket_filling withdrawal strategy and the optional Roth
// conversion logic.
export function getTargetBracketIncome(
  targetRate: Rate,
  cumulativeInflation: number,
  isMarried: boolean,
): Dollars {
  const filingStatus = isMarried ? ("married_filing_jointly" as const) : ("single" as const);
  const brackets = FEDERAL_BRACKETS[filingStatus];

  for (let i = 0; i < brackets.length; i++) {
    if (brackets[i].rate === targetRate && i + 1 < brackets.length) {
      return brackets[i + 1].threshold * cumulativeInflation;
    }
  }
  const last = brackets[brackets.length - 1];
  return last.threshold * cumulativeInflation;
}
