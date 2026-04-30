import type { StepProps } from "../types";
import { AccountsEditor } from "@/components/editors";

export function AccountsStep({ wizard }: StepProps) {
  const { scenario, updateActiveScenario } = wizard;
  if (!scenario) return null;
  return <AccountsEditor scenario={scenario} onUpdate={updateActiveScenario} />;
}
