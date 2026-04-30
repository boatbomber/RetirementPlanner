import type { UUID, Owner, Dollars, Rate, Age } from "./core";

export type AccountType =
  | "taxable"
  | "traditional_ira"
  | "traditional_401k"
  | "roth_ira"
  | "roth_401k"
  | "hsa"
  | "hysa"
  | "cd"
  | "money_market"
  | "i_bonds"
  | "529";

export interface AssetAllocation {
  usLargeCap: Rate;
  usSmallCap: Rate;
  intlDeveloped: Rate;
  intlEmerging: Rate;
  usBonds: Rate;
  tips: Rate;
  cash: Rate;
}

export interface GlidePathPoint {
  age: Age;
  allocation: AssetAllocation;
}

export interface Account {
  id: UUID;
  owner: Owner;
  label: string;
  type: AccountType;
  balance: Dollars;
  costBasis: Dollars;
  annualContribution: Dollars;
  employerMatch: Dollars;
  contributionEndAge: Age;
  allocation: AssetAllocation;
  useGlidePath: boolean;
  glidePath: GlidePathPoint[];
  fixedAnnualReturn: Rate | null;
}

export const FIXED_INTEREST_TYPES: ReadonlySet<AccountType> = new Set([
  "hysa",
  "cd",
  "money_market",
  "i_bonds",
]);

export const DEFAULT_FIXED_RATES: Partial<Record<AccountType, Rate>> = {
  hysa: 0.045,
  cd: 0.04,
  money_market: 0.04,
  i_bonds: 0.025,
};
