import { describe, it, expect } from "vitest";
import { claimingAdjustment, computeAnnualSSBenefit, computeHouseholdSSIncome } from "../social-security";
import type { SocialSecurityConfig, SocialSecurityPerson } from "@/models/social-security";

describe("claimingAdjustment", () => {
  const fra = 67;

  // Source: SSA.gov "Effect of Early or Delayed Retirement on Retirement Benefits"
  it("at FRA returns 1.0", () => {
    expect(claimingAdjustment(67, fra)).toBeCloseTo(1.0, 4);
  });

  it("at 62 returns 0.70 (30% reduction)", () => {
    // 60 months early = 36 × 5/900 + 24 × 5/1200 = 0.20 + 0.10 = 0.30
    expect(claimingAdjustment(62, fra)).toBeCloseTo(0.7, 4);
  });

  it("at 63 returns 0.75 (25% reduction)", () => {
    // 48 months early = 36 × 5/900 + 12 × 5/1200 = 0.20 + 0.05 = 0.25
    expect(claimingAdjustment(63, fra)).toBeCloseTo(0.75, 4);
  });

  it("at 64 returns 0.80 (20% reduction)", () => {
    // 36 months early = 36 × 5/900 = 0.20
    expect(claimingAdjustment(64, fra)).toBeCloseTo(0.8, 4);
  });

  it("at 65 returns ~0.8667 (13.33% reduction)", () => {
    // 24 months early = 24 × 5/900 = 0.1333
    expect(claimingAdjustment(65, fra)).toBeCloseTo(0.8667, 3);
  });

  it("at 66 returns ~0.9333 (6.67% reduction)", () => {
    expect(claimingAdjustment(66, fra)).toBeCloseTo(0.9333, 3);
  });

  it("at 68 returns 1.08 (8% DRC)", () => {
    expect(claimingAdjustment(68, fra)).toBeCloseTo(1.08, 4);
  });

  it("at 69 returns 1.16 (16% DRC)", () => {
    expect(claimingAdjustment(69, fra)).toBeCloseTo(1.16, 4);
  });

  it("at 70 returns 1.24 (24% DRC)", () => {
    expect(claimingAdjustment(70, fra)).toBeCloseTo(1.24, 4);
  });

  it("claiming beyond 70 caps at 70 benefit (no additional DRC)", () => {
    expect(claimingAdjustment(71, fra)).toBeCloseTo(1.24, 4);
    expect(claimingAdjustment(75, fra)).toBeCloseTo(1.24, 4);
  });

  describe("FRA = 66", () => {
    it("at 62 returns 0.75", () => {
      // 48 months early = 36 × 5/900 + 12 × 5/1200 = 0.20 + 0.05 = 0.25
      expect(claimingAdjustment(62, 66)).toBeCloseTo(0.75, 4);
    });

    it("at 70 returns 1.32 (32% DRC)", () => {
      // 48 months late = 48 × 2/300 = 0.32
      expect(claimingAdjustment(70, 66)).toBeCloseTo(1.32, 4);
    });
  });
});

describe("computeAnnualSSBenefit", () => {
  const basePerson: SocialSecurityPerson = {
    enabled: true,
    fraMonthlyBenefit: 2500,
    claimingAge: 67,
    fra: 67,
  };

  const baseConfig: SocialSecurityConfig = {
    self: basePerson,
    spouse: null,
    colaRate: 0.025,
    useSolvencyHaircut: false,
    solvencyHaircutYear: 2034,
    solvencyHaircutFactor: 0.79,
  };

  it("returns 0 before claiming age", () => {
    expect(computeAnnualSSBenefit(basePerson, 65, 2055, 1.0, baseConfig)).toBe(0);
  });

  it("returns full annual benefit at claiming age with no COLA accrued", () => {
    // colaMultiplier=1.0 means no COLA growth applied yet, so the benefit is
    // the user's stated FRA monthly × 12.
    const benefit = computeAnnualSSBenefit(basePerson, 67, 2057, 1.0, baseConfig);
    expect(benefit).toBeCloseTo(30_000, 0);
  });

  it("applies COLA via passed-in multiplier (compounded since age 62)", () => {
    // Caller supplies the cumulative COLA multiplier; the function just scales.
    const cola5y = Math.pow(1.025, 5);
    const benefit = computeAnnualSSBenefit(basePerson, 67, 2057, cola5y, baseConfig);
    expect(benefit).toBeCloseTo(30_000 * cola5y, 0);
  });

  it("applies early claiming reduction", () => {
    const earlyPerson = { ...basePerson, claimingAge: 62 };
    const benefit = computeAnnualSSBenefit(earlyPerson, 62, 2052, 1.0, baseConfig);
    // 0.70 × $2,500 × 12 = $21,000
    expect(benefit).toBeCloseTo(21_000, 0);
  });

  it("applies delayed claiming increase", () => {
    const latePerson = { ...basePerson, claimingAge: 70 };
    const benefit = computeAnnualSSBenefit(latePerson, 70, 2060, 1.0, baseConfig);
    // 1.24 × $2,500 × 12 = $37,200
    expect(benefit).toBeCloseTo(37_200, 0);
  });

  it("returns 0 when disabled", () => {
    const disabled = { ...basePerson, enabled: false };
    expect(computeAnnualSSBenefit(disabled, 67, 2057, 1.0, baseConfig)).toBe(0);
  });

  it("returns 0 when FRA benefit is 0", () => {
    const zeroBenefit = { ...basePerson, fraMonthlyBenefit: 0 };
    expect(computeAnnualSSBenefit(zeroBenefit, 67, 2057, 1.0, baseConfig)).toBe(0);
  });

  it("applies solvency haircut when enabled and past haircut year", () => {
    const config = { ...baseConfig, useSolvencyHaircut: true };
    const benefit = computeAnnualSSBenefit(basePerson, 67, 2040, 1.0, config);
    // $30,000 × 0.79 = $23,700
    expect(benefit).toBeCloseTo(23_700, 0);
  });

  it("does not apply solvency haircut before haircut year", () => {
    const config = { ...baseConfig, useSolvencyHaircut: true };
    const benefit = computeAnnualSSBenefit(basePerson, 67, 2030, 1.0, config);
    expect(benefit).toBeCloseTo(30_000, 0);
  });

  it("first-year proration: born July, claim at 67 → 5 months collected (Aug-Dec)", () => {
    const benefit = computeAnnualSSBenefit(basePerson, 67, 2057, 1.0, baseConfig, 7);
    // $2,500 × 5 months = $12,500
    expect(benefit).toBeCloseTo(12_500, 0);
  });

  it("first-year proration: born January, claim at 67 → 11 months collected", () => {
    const benefit = computeAnnualSSBenefit(basePerson, 67, 2057, 1.0, baseConfig, 1);
    // $2,500 × 11 months = $27,500
    expect(benefit).toBeCloseTo(27_500, 0);
  });

  it("first-year proration: born December, claim at 67 → 0 months collected", () => {
    const benefit = computeAnnualSSBenefit(basePerson, 67, 2057, 1.0, baseConfig, 12);
    expect(benefit).toBe(0);
  });

  it("subsequent years are full year regardless of birth month", () => {
    const benefit = computeAnnualSSBenefit(basePerson, 68, 2058, 1.0, baseConfig, 7);
    expect(benefit).toBeCloseTo(30_000, 0);
  });
});

describe("computeHouseholdSSIncome", () => {
  const selfPerson: SocialSecurityPerson = {
    enabled: true,
    fraMonthlyBenefit: 2500,
    claimingAge: 67,
    fra: 67,
  };

  const spousePerson: SocialSecurityPerson = {
    enabled: true,
    fraMonthlyBenefit: 1500,
    claimingAge: 67,
    fra: 67,
  };

  it("sums both benefits when both are claiming", () => {
    const config: SocialSecurityConfig = {
      self: selfPerson,
      spouse: spousePerson,
      colaRate: 0.025,
      useSolvencyHaircut: false,
      solvencyHaircutYear: 2034,
      solvencyHaircutFactor: 0.79,
    };
    const total = computeHouseholdSSIncome(config, 67, 67, 2057, 1.0, 1.0);
    // self: $30,000 + spouse: $18,000 = $48,000
    expect(total).toBeCloseTo(48_000, 0);
  });

  it("only includes self when spouse is null", () => {
    const config: SocialSecurityConfig = {
      self: selfPerson,
      spouse: null,
      colaRate: 0.025,
      useSolvencyHaircut: false,
      solvencyHaircutYear: 2034,
      solvencyHaircutFactor: 0.79,
    };
    const total = computeHouseholdSSIncome(config, 67, null, 2057, 1.0, 1.0);
    expect(total).toBeCloseTo(30_000, 0);
  });
});
