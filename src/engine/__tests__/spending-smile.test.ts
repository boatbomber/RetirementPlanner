import { describe, it, expect } from "vitest";
import { blanchettSpendingMultiplier } from "../spending-smile";

describe("blanchettSpendingMultiplier", () => {
  it("is 1.0 at and below age 65", () => {
    expect(blanchettSpendingMultiplier(50, 50)).toBe(1.0);
    expect(blanchettSpendingMultiplier(60, 60)).toBe(1.0);
    expect(blanchettSpendingMultiplier(65, 65)).toBe(1.0);
  });

  it("declines through the go-go phase (65-75)", () => {
    const at65 = blanchettSpendingMultiplier(65, 65);
    const at70 = blanchettSpendingMultiplier(70, 65);
    const at75 = blanchettSpendingMultiplier(75, 65);
    expect(at70).toBeLessThan(at65);
    expect(at75).toBeLessThan(at70);
    // 1%/yr × 5 years compounded ≈ 0.951
    expect(at70).toBeCloseTo(Math.pow(0.99, 5), 3);
  });

  it("declines faster through the slow-go phase (75-85)", () => {
    const at75 = blanchettSpendingMultiplier(75, 65);
    const at85 = blanchettSpendingMultiplier(85, 65);
    expect(at85).toBeLessThan(at75);
    // 1%/yr for 10 years × 2%/yr for 10 years
    const expected = Math.pow(0.99, 10) * Math.pow(0.98, 10);
    expect(at85).toBeCloseTo(expected, 3);
  });

  it("rises through the no-go phase (85+)", () => {
    const at85 = blanchettSpendingMultiplier(85, 65);
    const at95 = blanchettSpendingMultiplier(95, 65);
    expect(at95).toBeGreaterThan(at85);
  });

  it("clamps to [0.5, 1.2]", () => {
    // Force-test extremes: at age 200, even the no-go uplift cannot exceed
    // 1.2 in the model.
    const ext = blanchettSpendingMultiplier(200, 65);
    expect(ext).toBeLessThanOrEqual(1.2);
    expect(ext).toBeGreaterThanOrEqual(0.5);
  });

  it("is anchored to age 65, not years-since-retirement", () => {
    // Two scenarios: one retires at 50, one at 65, both observed at 70.
    // Per Blanchett, both should see the same multiplier (anchored to age).
    expect(blanchettSpendingMultiplier(70, 50)).toBe(blanchettSpendingMultiplier(70, 65));
  });
});
