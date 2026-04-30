import { describe, it, expect } from "vitest";
import { createDefaultScenario, duplicateScenario } from "@/models/defaults";
import { importSchema } from "@/store/schema";

describe("persistence round-trip", () => {
  it("scenario survives JSON serialization", () => {
    const original = createDefaultScenario("Round Trip Test");
    const json = JSON.stringify(original);
    const restored = JSON.parse(json);

    expect(restored.id).toBe(original.id);
    expect(restored.name).toBe(original.name);
    expect(restored.profile.birthYear).toBe(original.profile.birthYear);
    expect(restored.simulationConfig.iterations).toBe(10_000);
    expect(restored.withdrawalStrategy.type).toBe("fixed_real");
    expect(restored.socialSecurity.solvencyHaircutFactor).toBe(0.79);
  });

  it("full store payload survives round-trip and validates", () => {
    const s1 = createDefaultScenario("Plan A");
    const s2 = createDefaultScenario("Plan B");

    const payload = {
      scenarios: [s1, s2],
      activeScenarioId: s1.id,
      wizardCompleted: true,
    };

    const json = JSON.stringify(payload);
    const restored = JSON.parse(json);
    const result = importSchema.safeParse(restored);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scenarios).toHaveLength(2);
      expect(result.data.activeScenarioId).toBe(s1.id);
      expect(result.data.wizardCompleted).toBe(true);
    }
  });

  it("duplicated scenario is fully independent after serialization", () => {
    const original = createDefaultScenario("Original");
    const clone = duplicateScenario(original, "Clone");

    const serializedOriginal = JSON.stringify(original);
    const serializedClone = JSON.stringify(clone);

    const restoredOriginal = JSON.parse(serializedOriginal);
    const restoredClone = JSON.parse(serializedClone);

    expect(restoredClone.id).not.toBe(restoredOriginal.id);
    expect(restoredClone.profile.id).not.toBe(restoredOriginal.profile.id);
    expect(restoredClone.parentId).toBe(restoredOriginal.id);

    // Mutating the restored clone should not affect the restored original
    restoredClone.name = "Mutated";
    expect(restoredOriginal.name).toBe("Original");
  });

  it("nested objects are deeply independent in duplicated scenarios", () => {
    const original = createDefaultScenario("Deep Test");
    original.simulationConfig.capitalMarketAssumptions.usLargeCap.arithmeticMean = 0.06;

    const clone = duplicateScenario(original);

    clone.simulationConfig.capitalMarketAssumptions.usLargeCap.arithmeticMean = 0.1;

    expect(original.simulationConfig.capitalMarketAssumptions.usLargeCap.arithmeticMean).toBe(0.06);
  });
});
