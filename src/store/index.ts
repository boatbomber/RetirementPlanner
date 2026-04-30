import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { createScenarioSlice, type ScenarioSlice } from "./slices/scenarioSlice";
import { createSimulationSlice, type SimulationSlice } from "./slices/simulationSlice";
import { createUiSlice, type UiSlice } from "./slices/uiSlice";
import { normalizeScenario } from "@/models/defaults";

export type AppStore = ScenarioSlice & SimulationSlice & UiSlice;

// Persisted state is intentionally limited. comparisonScenarioId is
// UI-only and resets each session.
type PersistedState = Pick<
  AppStore,
  | "scenarios"
  | "activeScenarioId"
  | "wizardCompleted"
  | "sideNavCollapsed"
  | "tableDensity"
  | "defaultIterations"
  | "disclaimerAccepted"
>;

// IndexedDB key the persist middleware writes under. Exported so the Reset
// flow can synchronously delete it, avoiding the persist debounce window.
export const STORE_NAME = "retirement-planner-store";

// Persist middleware fires setItem on every state change, regardless of
// whether the partialized payload actually changed. During a sim run the
// store changes ~160 times for progress ticks alone, so we debounce so each
// burst coalesces into a single IDB write.
const PERSIST_DEBOUNCE_MS = 250;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistPending: { name: string; value: string } | null = null;

function scheduleWrite(name: string, value: string) {
  persistPending = { name, value };
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const p = persistPending;
    persistPending = null;
    persistTimer = null;
    if (p) void idbSet(p.name, p.value);
  }, PERSIST_DEBOUNCE_MS);
}

// Force-flush any pending write. Used by the Reset flow, which must
// guarantee the wipe lands before reload.
export function flushPersist(): Promise<void> {
  const p = persistPending;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  persistPending = null;
  return p ? idbSet(p.name, p.value) : Promise.resolve();
}

const idbStorage = createJSONStorage<PersistedState>(() => ({
  getItem: async (name) => {
    const val = await idbGet<string>(name);
    return val ?? null;
  },
  setItem: (name, value) => {
    scheduleWrite(name, value);
  },
  removeItem: async (name) => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    persistPending = null;
    await idbDel(name);
  },
}));

export const useAppStore = create<AppStore>()(
  persist(
    (...a) => ({
      ...createScenarioSlice(...a),
      ...createSimulationSlice(...a),
      ...createUiSlice(...a),
    }),
    {
      name: STORE_NAME,
      storage: idbStorage,
      // Bump on incompatible Scenario/SimulationConfig shape changes. The
      // persist middleware will call `migrate` (below) when the stored
      // version is older.
      //   v1 → initial release shape
      //   v2 → adds optional `goal` to Scenario (Goals feature)
      //   v3 → adds required `endsAtRetirement` to each IncomeSource. Old
      //        engines auto-stopped wage-like income at retirement
      //        implicitly; the toggle makes that explicit per-source.
      version: 3,
      migrate: (persistedState, version) => {
        if (version > 3) {
          // Forward-incompatible state from a newer build. Throwing causes
          // the persist middleware to fall back to the slice defaults rather
          // than continuing with the unmigrated payload (returning undefined
          // would silently keep the stale state).
          throw new Error(`Unknown persisted state version ${version}; resetting to defaults.`);
        }
        // Migrations run in order so any starting version reaches v3.
        let state = persistedState as PersistedState;
        // v1 → v2: `goal` is optional, no shape change required.
        // v2 → v3: backfill `endsAtRetirement` to preserve the implicit
        // "wage-like income stops at retirement" behavior the v2 engine
        // applied. The set is duplicated as a literal so the migration
        // doesn't depend on engine internals that may evolve. Catches v1
        // payloads as well since they pre-date the field.
        if (version <= 2) {
          const wageLike = new Set(["salary", "self_employment", "bonus", "part_time"]);
          state = {
            ...state,
            scenarios: state.scenarios.map((s) => ({
              ...s,
              incomeSources: s.incomeSources.map((inc) => ({
                ...inc,
                endsAtRetirement:
                  (inc as { endsAtRetirement?: boolean }).endsAtRetirement ?? wageLike.has(inc.type),
              })),
            })),
          };
        }
        // Always run cross-field normalization on persisted scenarios. This
        // covers legacy state that pre-dates a given invariant (e.g. an MFJ
        // scenario whose `socialSecurity.spouse` was never seeded), without
        // needing a dedicated version bump for each invariant added.
        state = {
          ...state,
          scenarios: state.scenarios.map(normalizeScenario),
        };
        return state;
      },
      partialize: (state): PersistedState => ({
        scenarios: state.scenarios,
        activeScenarioId: state.activeScenarioId,
        wizardCompleted: state.wizardCompleted,
        sideNavCollapsed: state.sideNavCollapsed,
        tableDensity: state.tableDensity,
        defaultIterations: state.defaultIterations,
        disclaimerAccepted: state.disclaimerAccepted,
      }),
    },
  ),
);
