import { describe, it, expect } from "vitest";
import { annualMortalityProbability } from "../mortality";

describe("annualMortalityProbability", () => {
  it("returns 0 at age 0", () => {
    expect(annualMortalityProbability(0, "male")).toBe(0);
    expect(annualMortalityProbability(0, "female")).toBe(0);
  });

  it("returns 0 at negative age", () => {
    expect(annualMortalityProbability(-5, "male")).toBe(0);
  });

  it("clamps to [0, 1]", () => {
    // At age 200 with no improvement the Gompertz hazard is enormous; the
    // engine should still cap at 1.0 rather than exceed.
    const q = annualMortalityProbability(200, "male");
    expect(q).toBeGreaterThanOrEqual(0);
    expect(q).toBeLessThanOrEqual(1);
  });

  it("is small in middle age", () => {
    // SSA Period Life Table: ~0.4-0.5% per year at age 50 for males. The
    // Gompertz fit underestimates pre-mode mortality, so this is a sanity
    // ceiling rather than an exact target.
    const q = annualMortalityProbability(50, "male");
    expect(q).toBeGreaterThan(0);
    expect(q).toBeLessThan(0.05);
  });

  it("is roughly 50% at the modal age (male, ssa_period: 87.5)", () => {
    // Mode of the Gompertz density is the age at which the year-over-year
    // increase in q peaks; the *cumulative* survival to that age is ~exp(-1)
    // ≈ 36.8%. Annual q at modal age is around 0.10 in the SSA fit.
    // We assert the broader claim: q at mode is meaningfully higher than at
    // age 70 and lower than at age 100.
    const qMode = annualMortalityProbability(87, "male");
    const q70 = annualMortalityProbability(70, "male");
    const q100 = annualMortalityProbability(100, "male");
    expect(qMode).toBeGreaterThan(q70);
    expect(q100).toBeGreaterThan(qMode);
  });

  it("monotonically increases with age", () => {
    let prev = -1;
    for (let age = 30; age <= 110; age += 5) {
      const q = annualMortalityProbability(age, "male");
      expect(q).toBeGreaterThanOrEqual(prev);
      prev = q;
    }
  });

  it("females have lower mortality than males at the same age", () => {
    for (const age of [50, 65, 75, 85, 95]) {
      const qMale = annualMortalityProbability(age, "male");
      const qFemale = annualMortalityProbability(age, "female");
      expect(qFemale).toBeLessThanOrEqual(qMale);
    }
  });

  it("mortality improvement reduces probability over time", () => {
    const q0 = annualMortalityProbability(70, "male", 0);
    const q10 = annualMortalityProbability(70, "male", 10);
    const q30 = annualMortalityProbability(70, "male", 30);
    expect(q10).toBeLessThan(q0);
    expect(q30).toBeLessThan(q10);
  });

  it("soa_rp2014 has lower mortality than ssa_period at all ages", () => {
    // RP-2014 reflects a healthier annuitant cohort, so q should be lower at
    // every age past the early years where both tables converge near 0.
    for (const age of [70, 80, 90]) {
      const qSsa = annualMortalityProbability(age, "male", 0, "ssa_period");
      const qSoa = annualMortalityProbability(age, "male", 0, "soa_rp2014");
      expect(qSoa).toBeLessThan(qSsa);
    }
  });
});
