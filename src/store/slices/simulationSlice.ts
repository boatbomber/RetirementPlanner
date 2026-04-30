import type { StateCreator } from "zustand";
import type { UUID } from "@/models";
import type { SimulationResult } from "@/models/results";

export type SimulationStatus = "idle" | "running" | "complete" | "error";

export interface SimulationEntry {
  status: SimulationStatus;
  progress: number;
  result: SimulationResult | null;
  error: string | null;
  fingerprint: string | null;
}

export interface SimulationSlice {
  simulations: Record<UUID, SimulationEntry>;

  setSimulationStatus: (scenarioId: UUID, status: SimulationStatus) => void;
  setSimulationProgress: (scenarioId: UUID, progress: number) => void;
  setSimulationResult: (scenarioId: UUID, result: SimulationResult) => void;
  setSimulationError: (scenarioId: UUID, error: string) => void;
  setSimulationFingerprint: (scenarioId: UUID, fingerprint: string | null) => void;
  clearSimulation: (scenarioId: UUID) => void;
}

const EMPTY_ENTRY: SimulationEntry = {
  status: "idle",
  progress: 0,
  result: null,
  error: null,
  fingerprint: null,
};

export const createSimulationSlice: StateCreator<SimulationSlice, [], [], SimulationSlice> = (set) => ({
  simulations: {},

  setSimulationStatus: (scenarioId, status) => {
    set((state) => ({
      simulations: {
        ...state.simulations,
        [scenarioId]: {
          ...(state.simulations[scenarioId] ?? EMPTY_ENTRY),
          status,
          ...(status === "running" ? { progress: 0, error: null } : {}),
        },
      },
    }));
  },

  setSimulationProgress: (scenarioId, progress) => {
    set((state) => {
      const entry = state.simulations[scenarioId] ?? EMPTY_ENTRY;
      // Worker checkpoints arrive ~160 times per 10K-iteration run; suppress
      // tick-level noise so the store version (and every selector subscribed
      // to `simulations`) doesn't churn for sub-1% movements. The 1.0
      // terminal value is always written via setSimulationResult, so capping
      // here can't strand the bar at 99%.
      if (Math.abs(progress - entry.progress) < 0.005) return state;
      return {
        simulations: {
          ...state.simulations,
          [scenarioId]: { ...entry, progress },
        },
      };
    });
  },

  setSimulationResult: (scenarioId, result) => {
    set((state) => ({
      simulations: {
        ...state.simulations,
        [scenarioId]: {
          ...(state.simulations[scenarioId] ?? EMPTY_ENTRY),
          status: "complete",
          progress: 1,
          result,
          error: null,
        },
      },
    }));
  },

  setSimulationError: (scenarioId, error) => {
    set((state) => ({
      simulations: {
        ...state.simulations,
        [scenarioId]: {
          ...(state.simulations[scenarioId] ?? EMPTY_ENTRY),
          status: "error",
          error,
        },
      },
    }));
  },

  setSimulationFingerprint: (scenarioId, fingerprint) => {
    set((state) => ({
      simulations: {
        ...state.simulations,
        [scenarioId]: {
          ...(state.simulations[scenarioId] ?? EMPTY_ENTRY),
          fingerprint,
        },
      },
    }));
  },

  clearSimulation: (scenarioId) => {
    set((state) => {
      const { [scenarioId]: _, ...rest } = state.simulations;
      return { simulations: rest };
    });
  },
});
