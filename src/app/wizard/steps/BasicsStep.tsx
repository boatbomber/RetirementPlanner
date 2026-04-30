import type { StepProps } from "../types";
import { ProfileEditor } from "@/components/editors";

export function BasicsStep({ wizard }: StepProps) {
  const { scenario, updateActiveScenario } = wizard;
  if (!scenario) return null;
  return <ProfileEditor scenario={scenario} onUpdate={updateActiveScenario} />;
}
