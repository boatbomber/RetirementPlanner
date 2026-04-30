import type { UUID, Owner, Dollars, Age, Rate } from "./core";

export type IncomeType =
  | "salary"
  | "self_employment"
  | "bonus"
  | "pension"
  | "annuity"
  | "rental"
  | "part_time"
  | "royalty"
  | "other";

export interface IncomeSource {
  id: UUID;
  owner: Owner;
  label: string;
  type: IncomeType;
  annualAmount: Dollars;
  startAge: Age;
  endAge: Age | null;
  inflationAdjusted: boolean;
  growthRate: Rate;
  taxable: boolean;
  // When true, the income ends at the owner's retirement age (one year
  // before, i.e., last year is retirementAge - 1). Replaces the old
  // implicit "wage-like income auto-stops at retirement" rule with an
  // explicit per-source toggle, so the Q1 solver and the dashboard reflect
  // truthful "income stops when you retire" behavior across all types.
  // When false, the income honors `endAge` (or runs to the planning horizon
  // if endAge is null).
  endsAtRetirement: boolean;
}
