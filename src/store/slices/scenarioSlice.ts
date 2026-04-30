import type { StateCreator } from "zustand";
import type { Scenario, UUID } from "@/models";
import { createDefaultScenario, duplicateScenario, normalizeScenario } from "@/models/defaults";
import type { UiSlice } from "./uiSlice";

export interface ScenarioSlice {
  scenarios: Scenario[];
  activeScenarioId: UUID | null;
  comparisonScenarioId: UUID | null;

  getActiveScenario: () => Scenario | undefined;
  addScenario: (scenario?: Scenario) => Scenario;
  updateScenario: (id: UUID, patch: Partial<Scenario>) => void;
  deleteScenario: (id: UUID) => void;
  duplicateScenario: (id: UUID, newName?: string) => Scenario | undefined;
  setActiveScenario: (id: UUID) => void;
  setComparisonScenario: (id: UUID | null) => void;
  setBaseline: (id: UUID) => void;
}

// We intersect with UiSlice so `get()` exposes `defaultIterations` (read by
// `addScenario`). Declaring the dependency in the generic is more honest than
// the prior runtime cast, and any rename/removal of UiSlice fields surfaces as
// a compile error here instead of a silent `undefined`.
export const createScenarioSlice: StateCreator<ScenarioSlice & UiSlice, [], [], ScenarioSlice> = (
  set,
  get,
) => ({
  scenarios: [],
  activeScenarioId: null,
  comparisonScenarioId: null,

  getActiveScenario: () => {
    const { scenarios, activeScenarioId } = get();
    return scenarios.find((s) => s.id === activeScenarioId);
  },

  addScenario: (scenario) => {
    let s = scenario ?? createDefaultScenario();
    // Apply the user's preferred default iteration count from the UI slice if
    // the caller didn't pass an explicit scenario (which would already have
    // its own simulationConfig).
    if (!scenario) {
      const pref = get().defaultIterations;
      if (pref) {
        s = { ...s, simulationConfig: { ...s.simulationConfig, iterations: pref } };
      }
    }
    s = normalizeScenario(s);
    set((state) => {
      const isFirst = state.scenarios.length === 0;
      return {
        scenarios: [...state.scenarios, isFirst ? { ...s, isBaseline: true } : s],
        activeScenarioId: isFirst ? s.id : state.activeScenarioId,
      };
    });
    return s;
  },

  updateScenario: (id, patch) => {
    set((state) => ({
      scenarios: state.scenarios.map((s) =>
        s.id === id ? normalizeScenario({ ...s, ...patch, updatedAt: new Date().toISOString() }) : s,
      ),
    }));
  },

  deleteScenario: (id) => {
    set((state) => {
      const remaining = state.scenarios.filter((s) => s.id !== id);
      let { activeScenarioId, comparisonScenarioId } = state;

      if (activeScenarioId === id) {
        activeScenarioId = remaining[0]?.id ?? null;
      }
      if (comparisonScenarioId === id) {
        comparisonScenarioId = null;
      }

      return { scenarios: remaining, activeScenarioId, comparisonScenarioId };
    });
  },

  duplicateScenario: (id, newName) => {
    const source = get().scenarios.find((s) => s.id === id);
    if (!source) return undefined;
    const clone = duplicateScenario(source, newName);
    set((state) => ({ scenarios: [...state.scenarios, clone] }));
    return clone;
  },

  setActiveScenario: (id) => {
    set({ activeScenarioId: id });
  },

  setComparisonScenario: (id) => {
    set({ comparisonScenarioId: id });
  },

  setBaseline: (id) => {
    const now = new Date().toISOString();
    set((state) => ({
      scenarios: state.scenarios.map((s) => {
        const wasBaseline = s.isBaseline;
        const isBaseline = s.id === id;
        if (wasBaseline === isBaseline) return s;
        return { ...s, isBaseline, updatedAt: now };
      }),
    }));
  },
});
