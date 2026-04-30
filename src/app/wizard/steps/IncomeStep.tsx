import type { StepProps } from "../types";
import { IncomeEditor } from "@/components/editors";

export function IncomeStep({ wizard }: StepProps) {
  const { scenario, updateActiveScenario } = wizard;
  if (!scenario) return null;
  return <IncomeEditor scenario={scenario} onUpdate={updateActiveScenario} />;
}
