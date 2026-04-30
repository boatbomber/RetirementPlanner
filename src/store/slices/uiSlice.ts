import type { StateCreator } from "zustand";

export type TableDensity = "comfortable" | "compact" | "dense";

export interface UiSlice {
  wizardCompleted: boolean;
  sideNavCollapsed: boolean;
  tableDensity: TableDensity;
  // User-preferred default Monte Carlo iteration count for newly created
  // scenarios. Existing scenarios keep whatever they were saved with.
  defaultIterations: number;
  // First-run legal disclaimer acknowledgement. The DisclaimerGate blocks
  // app use until the user checks every item in FIRST_RUN_DISCLAIMER_ITEMS
  // and clicks Accept, at which point this flips to true and persists.
  disclaimerAccepted: boolean;

  setWizardCompleted: (completed: boolean) => void;
  setSideNavCollapsed: (collapsed: boolean) => void;
  setTableDensity: (density: TableDensity) => void;
  setDefaultIterations: (n: number) => void;
  setDisclaimerAccepted: (accepted: boolean) => void;
}

export const createUiSlice: StateCreator<UiSlice, [], [], UiSlice> = (set) => ({
  wizardCompleted: false,
  sideNavCollapsed: false,
  tableDensity: "comfortable",
  defaultIterations: 10_000,
  disclaimerAccepted: false,

  setWizardCompleted: (completed) => set({ wizardCompleted: completed }),
  setSideNavCollapsed: (collapsed) => set({ sideNavCollapsed: collapsed }),
  setTableDensity: (density) => set({ tableDensity: density }),
  setDefaultIterations: (n) => set({ defaultIterations: n }),
  setDisclaimerAccepted: (accepted) => set({ disclaimerAccepted: accepted }),
});
