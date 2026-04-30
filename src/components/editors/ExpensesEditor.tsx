import { useCallback, useEffect } from "react";
import { Plus, X } from "lucide-react";
import type { EditorProps } from "./types";
import type { Expense, ExpenseCategory } from "@/models";
import { FieldShell } from "@/components/primitives/Input/FieldShell";
import { TextInput } from "@/components/primitives/Input/TextInput";
import { Button } from "@/components/primitives/Button";
import { Card } from "@/components/primitives/Card";
import { formatCurrency } from "@/lib/format";

interface CategoryConfig {
  key: ExpenseCategory;
  label: string;
  defaultItem: string;
  // Default inflation rate by category. Healthcare gets a 2pp bump over
  // CPI to capture HealthView Services / RAND research showing retiree
  // medical costs grow ~5-6% annually.
  defaultInflationRate: number | null;
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: "essential",
    label: "Essential",
    defaultItem: "Basic living expenses",
    defaultInflationRate: null,
  },
  { key: "housing", label: "Housing", defaultItem: "Rent / Mortgage", defaultInflationRate: null },
  {
    key: "healthcare",
    label: "Healthcare",
    defaultItem: "Health insurance & medical",
    defaultInflationRate: 0.045,
  },
  {
    key: "discretionary",
    label: "Discretionary",
    defaultItem: "Travel, dining, entertainment",
    defaultInflationRate: null,
  },
];

function createExpense(
  category: ExpenseCategory,
  label: string,
  currentAge: number,
  defaultInflationRate: number | null = null,
): Expense {
  return {
    id: crypto.randomUUID(),
    label,
    category,
    annualAmount: 0,
    startAge: currentAge,
    endAge: null,
    inflationRate: defaultInflationRate,
  };
}

export function ExpensesEditor({ scenario, onUpdate }: EditorProps) {
  const currentAge = new Date().getFullYear() - scenario.profile.birthYear;

  useEffect(() => {
    if (scenario.expenses.length === 0) {
      const defaults = CATEGORIES.map((c) =>
        createExpense(c.key, c.defaultItem, currentAge, c.defaultInflationRate),
      );
      onUpdate({ expenses: defaults });
    }
    // We intentionally watch scenario.expenses here so switching to a freshly
    // empty scenario re-seeds the category defaults.
  }, [scenario.expenses, currentAge, onUpdate]);

  const totalSpending = scenario.expenses.reduce((sum, e) => sum + e.annualAmount, 0);

  const updateExpenses = useCallback(
    (expenses: Expense[]) => {
      onUpdate({ expenses });
    },
    [onUpdate],
  );

  const updateExpense = useCallback(
    (id: string, patch: Partial<Expense>) => {
      updateExpenses(scenario.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    },
    [scenario.expenses, updateExpenses],
  );

  const addExpense = useCallback(
    (category: ExpenseCategory) => {
      const cfg = CATEGORIES.find((c) => c.key === category);
      updateExpenses([
        ...scenario.expenses,
        createExpense(category, "", currentAge, cfg?.defaultInflationRate ?? null),
      ]);
    },
    [scenario.expenses, currentAge, updateExpenses],
  );

  const addOneTimeExpense = useCallback(() => {
    updateExpenses([...scenario.expenses, createExpense("one_time", "", currentAge)]);
  }, [scenario.expenses, currentAge, updateExpenses]);

  const removeExpense = useCallback(
    (id: string) => {
      updateExpenses(scenario.expenses.filter((e) => e.id !== id));
    },
    [scenario.expenses, updateExpenses],
  );

  return (
    <div className="flex flex-col gap-[var(--space-5)]">
      {CATEGORIES.map((cat) => {
        const items = scenario.expenses.filter((e) => e.category === cat.key);
        return (
          <div key={cat.key} className="flex flex-col gap-[var(--space-4)]">
            <h3 className="text-overline text-text-tertiary">{cat.label}</h3>
            {items.map((exp) => (
              <ExpenseRow
                key={exp.id}
                expense={exp}
                onUpdate={(patch) => updateExpense(exp.id, patch)}
                onRemove={() => removeExpense(exp.id)}
              />
            ))}
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => addExpense(cat.key)}
              icon={<Plus size={16} />}
            >
              Add {cat.label.toLowerCase()} expense
            </Button>
          </div>
        );
      })}

      {(() => {
        const oneTimeItems = scenario.expenses.filter((e) => e.category === "one_time");
        return (
          <div className="flex flex-col gap-[var(--space-4)]">
            <h3 className="text-overline text-text-tertiary">One-Time Expenses</h3>
            {oneTimeItems.map((exp) => (
              <ExpenseRow
                key={exp.id}
                expense={exp}
                onUpdate={(patch) => updateExpense(exp.id, patch)}
                onRemove={() => removeExpense(exp.id)}
                showAge
              />
            ))}
            <Button
              variant="secondary"
              className="self-start"
              onClick={addOneTimeExpense}
              icon={<Plus size={16} />}
            >
              Add one-time expense
            </Button>
          </div>
        );
      })()}

      <Card
        variant="sunken"
        className="sticky bottom-0 flex items-center justify-between px-[var(--space-5)] py-[var(--space-4)] text-body"
      >
        <span className="text-text-secondary">Total annual spending</span>
        <span className="font-semibold tabular-nums text-text-primary">{formatCurrency(totalSpending)}</span>
      </Card>
    </div>
  );
}

function ExpenseRow({
  expense,
  onUpdate,
  onRemove,
  showAge,
}: {
  expense: Expense;
  onUpdate: (patch: Partial<Expense>) => void;
  onRemove: () => void;
  showAge?: boolean;
}) {
  return (
    <Card variant="surface" className="relative flex flex-col gap-[var(--space-4)] p-[var(--space-5)]">
      <Button
        variant="icon-only"
        size="md"
        onClick={onRemove}
        className="absolute right-[var(--space-2)] top-[var(--space-2)]"
        aria-label="Remove expense"
        icon={<X size={16} />}
      />

      <div
        className={`grid grid-cols-1 gap-[var(--space-4)] ${showAge ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
      >
        <FieldShell label="Label">
          <TextInput
            value={expense.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="e.g., Groceries"
          />
        </FieldShell>
        <FieldShell label="Annual amount">
          <TextInput
            inputType="currency"
            value={expense.annualAmount || ""}
            onChange={(e) => {
              const val = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
              onUpdate({ annualAmount: isNaN(val) ? 0 : val });
            }}
            placeholder="0"
          />
        </FieldShell>
        {showAge && (
          <FieldShell label="Age">
            <TextInput
              inputType="number"
              value={String(expense.startAge)}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) onUpdate({ startAge: val });
              }}
            />
          </FieldShell>
        )}
      </div>

      {!showAge && (
        <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-3">
          <FieldShell label="Start age">
            <TextInput
              inputType="number"
              value={String(expense.startAge)}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) onUpdate({ startAge: val });
              }}
            />
          </FieldShell>
          <FieldShell label="End age" helper="Leave blank for lifetime">
            <TextInput
              inputType="number"
              value={expense.endAge != null ? String(expense.endAge) : ""}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value) : null;
                onUpdate({ endAge: val !== null && !isNaN(val) ? val : null });
              }}
              placeholder="Lifetime"
            />
          </FieldShell>
          <FieldShell label="Inflation override" helper="Leave blank for default CPI">
            <TextInput
              inputType="percent"
              value={expense.inflationRate != null ? String(expense.inflationRate * 100) : ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === "") {
                  onUpdate({ inflationRate: null });
                } else {
                  const num = parseFloat(v);
                  if (!isNaN(num)) onUpdate({ inflationRate: num / 100 });
                }
              }}
              placeholder="-"
            />
          </FieldShell>
        </div>
      )}
    </Card>
  );
}
