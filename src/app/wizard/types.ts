import type { useWizard } from "./useWizard";

export type WizardContext = ReturnType<typeof useWizard>;

export interface StepProps {
  wizard: WizardContext;
}
