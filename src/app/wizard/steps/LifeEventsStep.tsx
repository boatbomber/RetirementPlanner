import type { StepProps } from "../types";
import { LifeEventsEditor } from "@/components/editors";

export function LifeEventsStep({ wizard }: StepProps) {
  const { scenario, updateActiveScenario } = wizard;
  if (!scenario) return null;
  return <LifeEventsEditor scenario={scenario} onUpdate={updateActiveScenario} />;
}
