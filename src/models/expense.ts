import type { UUID, Dollars, Age, Rate } from "./core";

export type ExpenseCategory = "essential" | "discretionary" | "healthcare" | "housing" | "one_time";

export interface Expense {
  id: UUID;
  label: string;
  category: ExpenseCategory;
  annualAmount: Dollars;
  startAge: Age;
  endAge: Age | null;
  inflationRate: Rate | null;
}
