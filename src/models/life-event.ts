import type { UUID, Dollars, Age } from "./core";
import type { IncomeSource } from "./income";
import type { Expense } from "./expense";

export type LifeEventType =
  | "career_change"
  | "major_expense"
  | "education"
  | "health_event"
  | "family_change"
  | "inheritance"
  | "relocation"
  | "windfall"
  | "part_time_work"
  | "insurance_change"
  | "custom";

export interface IncomeChange {
  existingIncomeId: UUID | null;
  newIncome: Partial<IncomeSource>;
}

export interface ExpenseChange {
  existingExpenseId: UUID | null;
  newExpense: Partial<Expense>;
}

export interface ContributionChange {
  accountId: UUID;
  newAnnualContribution: Dollars;
}

export interface FinancialImpact {
  oneTimeInflow: Dollars;
  oneTimeOutflow: Dollars;
  targetAccountId: UUID | null;
  incomeChanges: IncomeChange[];
  expenseChanges: ExpenseChange[];
  contributionChanges: ContributionChange[];
}

export interface LifeEvent {
  id: UUID;
  type: LifeEventType;
  label: string;
  description: string;
  triggerAge: Age;
  durationYears: number | null;
  financialImpact: FinancialImpact;
  /** Stable identifier of the editor template the event was created from. Used to keep
   *  the icon consistent across the editor, life-event timeline, and chart markers even
   *  if the user renames the event. Optional for legacy scenarios. */
  iconKey?: string;
}
