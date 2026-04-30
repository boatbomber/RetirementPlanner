import type { StepProps } from "../types";
import { ExpensesEditor } from "@/components/editors";

export function ExpensesStep({ wizard }: StepProps) {
  const { scenario, updateActiveScenario } = wizard;
  if (!scenario) return null;
  return <ExpensesEditor scenario={scenario} onUpdate={updateActiveScenario} />;
}
