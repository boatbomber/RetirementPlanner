import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { createDefaultScenario } from "@/models/defaults";

function resetStore() {
  useAppStore.setState({
    scenarios: [],
    activeScenarioId: null,
    comparisonScenarioId: null,
    wizardCompleted: false,
    simulations: {},
  });
}

describe("scenarioSlice", () => {
  beforeEach(resetStore);

  it("adds a default scenario and sets it as active + baseline", () => {
    const s = useAppStore.getState().addScenario();
    const state = useAppStore.getState();

    expect(state.scenarios).toHaveLength(1);
    expect(state.activeScenarioId).toBe(s.id);
    expect(state.scenarios[0].isBaseline).toBe(true);
  });

  it("adds a custom scenario", () => {
    const custom = createDefaultScenario("Test Scenario");
    const s = useAppStore.getState().addScenario(custom);

    expect(s.name).toBe("Test Scenario");
    expect(useAppStore.getState().scenarios).toHaveLength(1);
  });

  it("second scenario does not override active", () => {
    const first = useAppStore.getState().addScenario();
    useAppStore.getState().addScenario();

    expect(useAppStore.getState().activeScenarioId).toBe(first.id);
    expect(useAppStore.getState().scenarios).toHaveLength(2);
  });

  it("updates a scenario by id", () => {
    const s = useAppStore.getState().addScenario();
    useAppStore.getState().updateScenario(s.id, { name: "Updated" });

    const updated = useAppStore.getState().scenarios.find((x) => x.id === s.id);
    expect(updated?.name).toBe("Updated");
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(s.createdAt).getTime());
  });

  it("deletes a scenario and reassigns active", () => {
    const first = useAppStore.getState().addScenario();
    const second = useAppStore.getState().addScenario();
    useAppStore.getState().setActiveScenario(first.id);

    useAppStore.getState().deleteScenario(first.id);

    const state = useAppStore.getState();
    expect(state.scenarios).toHaveLength(1);
    expect(state.activeScenarioId).toBe(second.id);
  });

  it("deletes the comparison scenario and nullifies it", () => {
    const first = useAppStore.getState().addScenario();
    const second = useAppStore.getState().addScenario();
    useAppStore.getState().setComparisonScenario(second.id);

    useAppStore.getState().deleteScenario(second.id);

    expect(useAppStore.getState().comparisonScenarioId).toBeNull();
    expect(useAppStore.getState().scenarios).toHaveLength(1);
    expect(useAppStore.getState().scenarios[0].id).toBe(first.id);
  });

  it("duplicates a scenario as an independent copy", () => {
    const original = useAppStore.getState().addScenario();
    useAppStore.getState().updateScenario(original.id, { name: "Original" });

    const clone = useAppStore.getState().duplicateScenario(original.id, "Clone");

    expect(clone).toBeDefined();
    expect(clone!.id).not.toBe(original.id);
    expect(clone!.name).toBe("Clone");
    expect(clone!.parentId).toBe(original.id);
    expect(clone!.isBaseline).toBe(false);
    expect(useAppStore.getState().scenarios).toHaveLength(2);

    // Mutating clone should not affect original
    useAppStore.getState().updateScenario(clone!.id, { description: "changed" });
    const orig = useAppStore.getState().scenarios.find((s) => s.id === original.id);
    expect(orig?.description).toBe("");
  });

  it("returns undefined when duplicating a non-existent scenario", () => {
    const result = useAppStore.getState().duplicateScenario("nonexistent");
    expect(result).toBeUndefined();
  });

  it("getActiveScenario returns the correct scenario", () => {
    const s = useAppStore.getState().addScenario();
    const active = useAppStore.getState().getActiveScenario();
    expect(active?.id).toBe(s.id);
  });

  it("getActiveScenario returns undefined when no active", () => {
    expect(useAppStore.getState().getActiveScenario()).toBeUndefined();
  });

  it("setBaseline unmarks previous baseline", () => {
    const first = useAppStore.getState().addScenario();
    const second = useAppStore.getState().addScenario();

    expect(useAppStore.getState().scenarios.find((s) => s.id === first.id)?.isBaseline).toBe(true);

    useAppStore.getState().setBaseline(second.id);

    const state = useAppStore.getState();
    expect(state.scenarios.find((s) => s.id === first.id)?.isBaseline).toBe(false);
    expect(state.scenarios.find((s) => s.id === second.id)?.isBaseline).toBe(true);
  });

  it("setActiveScenario changes the active id", () => {
    const first = useAppStore.getState().addScenario();
    const second = useAppStore.getState().addScenario();

    useAppStore.getState().setActiveScenario(second.id);
    expect(useAppStore.getState().activeScenarioId).toBe(second.id);

    useAppStore.getState().setActiveScenario(first.id);
    expect(useAppStore.getState().activeScenarioId).toBe(first.id);
  });
});
