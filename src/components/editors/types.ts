import type { Scenario } from "@/models";

export interface EditorProps {
  scenario: Scenario;
  onUpdate: (patch: Partial<Scenario>) => void;
}
