import { describe, it, expect } from "vitest";
import { computeFederalTax, computeTaxableSS, computeEarlyWithdrawalPenalty } from "../tax";
import type { TaxInput } from "../tax";

function makeTaxInput(overrides: Partial<TaxInput> = {}): TaxInput {
  return {
    ordinaryIncome: 0,
    longTermCapGains: 0,
    ssIncome: 0,
    filingStatus: "single",
    selfAge: 45,
    spouseAge: null,
    year: 2026,
    cumulativeInflation: 1.0,
    ...overrides,
  };
}

describe("federal tax, single filer, 2026 brackets", () => {
  // Standard deduction: $16,100

  it("zero income → zero tax", () => {
    const result = computeFederalTax(makeTaxInput());
    expect(result.federalTax).toBe(0);
  });

  it("income at standard deduction → zero tax", () => {
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 16_100 }));
    expect(result.federalTax).toBe(0);
  });

  it("income just above standard deduction → 10% bracket", () => {
    // $16,101 → taxable = $1, tax = $0.10
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 16_101 }));
    expect(result.federalTax).toBeCloseTo(0.1, 2);
  });

  it("income at top of 10% bracket", () => {
    // Taxable income of $12,400 → income = $12,400 + $16,100 = $28,500
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 28_500 }));
    expect(result.federalTax).toBeCloseTo(12_400 * 0.1, 0);
  });

  it("$50,000 income crosses into 12% bracket", () => {
    // Taxable: $50,000 - $16,100 = $33,900
    // 10%: $12,400 × 0.10 = $1,240.00
    // 12%: ($33,900 - $12,400) × 0.12 = $21,500 × 0.12 = $2,580.00
    // Total: $3,820.00
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 50_000 }));
    expect(result.federalTax).toBeCloseTo(3_820, 0);
  });

  it("$100,000 income crosses into 22% bracket", () => {
    // Taxable: $100,000 - $16,100 = $83,900
    // 10%: $12,400 × 0.10 = $1,240.00
    // 12%: ($50,400 - $12,400) × 0.12 = $38,000 × 0.12 = $4,560.00
    // 22%: ($83,900 - $50,400) × 0.22 = $33,500 × 0.22 = $7,370.00
    // Total: $13,170.00
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 100_000 }));
    expect(result.federalTax).toBeCloseTo(13_170, 0);
  });

  it("$250,000 income crosses into 32% bracket", () => {
    // Taxable: $250,000 - $16,100 = $233,900
    // 10%: $12,400 × 0.10 = $1,240.00
    // 12%: $38,000 × 0.12 = $4,560.00
    // 22%: ($105,700 - $50,400) × 0.22 = $55,300 × 0.22 = $12,166.00
    // 24%: ($201,775 - $105,700) × 0.24 = $96,075 × 0.24 = $23,058.00
    // 32%: ($233,900 - $201,775) × 0.32 = $32,125 × 0.32 = $10,280.00
    // Total: $51,304.00
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 250_000 }));
    expect(result.federalTax).toBeCloseTo(51_304, 0);
  });

  it("$700,000 income crosses into 37% bracket", () => {
    // Taxable: $700,000 - $16,100 = $683,900
    // 10%: $12,400 × 0.10 = $1,240.00
    // 12%: $38,000 × 0.12 = $4,560.00
    // 22%: $55,300 × 0.22 = $12,166.00
    // 24%: $96,075 × 0.24 = $23,058.00
    // 32%: ($256,225 - $201,775) × 0.32 = $54,450 × 0.32 = $17,424.00
    // 35%: ($640,600 - $256,225) × 0.35 = $384,375 × 0.35 = $134,531.25
    // 37%: ($683,900 - $640,600) × 0.37 = $43,300 × 0.37 = $16,021.00
    // Total: $209,000.25
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 700_000 }));
    expect(result.federalTax).toBeCloseTo(209_000.25, 0);
  });

  it("marginal rate is correct at each bracket boundary", () => {
    // Income in 10% bracket
    const r10 = computeFederalTax(makeTaxInput({ ordinaryIncome: 20_000 }));
    expect(r10.marginalOrdinaryRate).toBe(0.1);

    // Income in 12% bracket
    const r12 = computeFederalTax(makeTaxInput({ ordinaryIncome: 50_000 }));
    expect(r12.marginalOrdinaryRate).toBe(0.12);

    // Income in 22% bracket
    const r22 = computeFederalTax(makeTaxInput({ ordinaryIncome: 100_000 }));
    expect(r22.marginalOrdinaryRate).toBe(0.22);

    // Income in 35% bracket: $500K - $16.1K = $483.9K, in [256_225, 640_600)
    const r35 = computeFederalTax(makeTaxInput({ ordinaryIncome: 500_000 }));
    expect(r35.marginalOrdinaryRate).toBe(0.35);

    // Income in 37% bracket: $700K - $16.1K = $683.9K, > $640,600
    const r37 = computeFederalTax(makeTaxInput({ ordinaryIncome: 700_000 }));
    expect(r37.marginalOrdinaryRate).toBe(0.37);
  });
});

describe("federal tax, married filing jointly, 2026 brackets", () => {
  // Standard deduction: $32,200

  it("$100,000 income stays in 10%/12% brackets", () => {
    // Taxable: $100,000 - $32,200 = $67,800
    // 10%: $24,800 × 0.10 = $2,480.00
    // 12%: ($67,800 - $24,800) × 0.12 = $43,000 × 0.12 = $5,160.00
    // Total: $7,640.00
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 100_000,
        filingStatus: "married_filing_jointly",
        spouseAge: 45,
      }),
    );
    expect(result.federalTax).toBeCloseTo(7_640, 0);
  });

  it("$200,000 income crosses into 22% bracket", () => {
    // Taxable: $200,000 - $32,200 = $167,800
    // 10%: $24,800 × 0.10 = $2,480.00
    // 12%: ($100,800 - $24,800) × 0.12 = $76,000 × 0.12 = $9,120.00
    // 22%: ($167,800 - $100,800) × 0.22 = $67,000 × 0.22 = $14,740.00
    // Total: $26,340.00
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 200_000,
        filingStatus: "married_filing_jointly",
        spouseAge: 45,
      }),
    );
    expect(result.federalTax).toBeCloseTo(26_340, 0);
  });
});

describe("LTCG tax stacking", () => {
  it("0% LTCG when total income is below threshold (single)", () => {
    // $49,450 is the 0% LTCG threshold for single
    // Taxable ordinary: $30,000 - $16,100 = $13,900
    // LTCG stacks on top: $13,900 + $10,000 = $23,900 < $49,450 → all 0%
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 30_000,
        longTermCapGains: 10_000,
      }),
    );
    // Ordinary tax only, LTCG = 0
    const ordinaryOnly = computeFederalTax(makeTaxInput({ ordinaryIncome: 30_000 }));
    expect(result.federalTax).toBeCloseTo(ordinaryOnly.federalTax, 0);
    expect(result.marginalLTCGRate).toBe(0);
  });

  it("15% LTCG when stacked income crosses 0% threshold (single)", () => {
    // $50,000 ordinary → taxable = $33,900
    // $50,000 LTCG stacks on top: $33,900 + $50,000 = $83,900
    // 0% threshold: $49,450
    // First ($49,450 - $33,900) = $15,550 of LTCG at 0% = $0
    // Remaining ($50,000 - $15,550) = $34,450 at 15% = $5,167.50
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 50_000,
        longTermCapGains: 50_000,
      }),
    );
    const ordinaryOnly = computeFederalTax(makeTaxInput({ ordinaryIncome: 50_000 }));
    const ltcgTax = result.federalTax - ordinaryOnly.federalTax;
    expect(ltcgTax).toBeCloseTo(5_167.5, 0);
  });

  it("MFJ $50k ordinary + $50k LTCG → partially 0% LTCG", () => {
    // MFJ standard deduction: $32,200
    // Taxable ordinary: $50,000 - $32,200 = $17,800
    // 0% LTCG threshold: $98,900
    // All $50k LTCG is below threshold: $17,800 + $50,000 = $67,800 < $98,900
    // LTCG tax = $0
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 50_000,
        longTermCapGains: 50_000,
        filingStatus: "married_filing_jointly",
        spouseAge: 45,
      }),
    );
    const ordinaryOnly = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 50_000,
        filingStatus: "married_filing_jointly",
        spouseAge: 45,
      }),
    );
    const ltcgTax = result.federalTax - ordinaryOnly.federalTax;
    expect(ltcgTax).toBeCloseTo(0, 0);
  });

  it("high income: 20% LTCG bracket applies", () => {
    // Single, $600,000 ordinary + $100,000 LTCG
    // Taxable ordinary: $600,000 - $16,100 = $583,900
    // LTCG stacks: $583,900 + $100,000 = $683,900
    // 20% threshold (2026 single): $545,500
    // All LTCG is above $545,500 → all at 20% (since base $583,900 > $545,500)
    // NIIT (3.8% on $100K LTCG, since MAGI > $200K single threshold) also
    // applies; we strip it from the difference before checking the bracket.
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 600_000,
        longTermCapGains: 100_000,
      }),
    );
    const ordinaryOnly = computeFederalTax(makeTaxInput({ ordinaryIncome: 600_000 }));
    const ltcgTax = result.federalTax - ordinaryOnly.federalTax - result.niit;
    expect(ltcgTax).toBeCloseTo(100_000 * 0.2, 0);
    expect(result.niit).toBeCloseTo(100_000 * 0.038, 0);
  });
});

describe("Social Security taxability", () => {
  // Source: IRC §86, SSA Notice 703

  describe("single filer thresholds", () => {
    it("provisional income ≤ $25,000 → 0% taxable", () => {
      // AGI $20,000 + 50% × $10,000 SS = $25,000 → exactly at tier 1
      const taxable = computeTaxableSS(10_000, 20_000, "single");
      expect(taxable).toBe(0);
    });

    it("provisional income $30,000 → up to 50% taxable", () => {
      // AGI $25,000 + 50% × $10,000 SS = $30,000
      // 0.5 × ($30,000 - $25,000) = $2,500
      // Max 50% × $10,000 = $5,000
      // Taxable = min($2,500, $5,000) = $2,500
      const taxable = computeTaxableSS(10_000, 25_000, "single");
      expect(taxable).toBeCloseTo(2_500, 0);
    });

    it("provisional income $34,000 → boundary of 85% tier", () => {
      // AGI $29,000 + 50% × $10,000 SS = $34,000 → exactly at tier 2
      // Tier 1: 0.5 × ($34,000 - $25,000) = $4,500, capped at 0.5 × $10,000 = $5,000
      // But since PI is exactly at tier 2, use tier 1 formula
      const taxable = computeTaxableSS(10_000, 29_000, "single");
      expect(taxable).toBeCloseTo(4_500, 0);
    });

    it("provisional income $50,000 → 85% taxable", () => {
      // AGI $30,000 + 50% × $40,000 SS = $50,000
      // Tier 1 amount: min(0.5 × ($34,000 - $25,000), 0.5 × $40,000) = min($4,500, $20,000) = $4,500
      // Tier 2 amount: 0.85 × ($50,000 - $34,000) = $13,600
      // Total: $18,100, capped at 0.85 × $40,000 = $34,000
      // Taxable = $18,100
      const taxable = computeTaxableSS(40_000, 30_000, "single");
      expect(taxable).toBeCloseTo(18_100, 0);
    });

    it("very high income → capped at 85% of SS benefit", () => {
      // AGI $200,000 + 50% × $30,000 = $215,000
      // Taxable capped at 0.85 × $30,000 = $25,500
      const taxable = computeTaxableSS(30_000, 200_000, "single");
      expect(taxable).toBeCloseTo(25_500, 0);
    });

    it("zero SS → zero taxable", () => {
      expect(computeTaxableSS(0, 100_000, "single")).toBe(0);
    });
  });

  describe("MFJ thresholds", () => {
    it("provisional income ≤ $32,000 → 0% taxable", () => {
      const taxable = computeTaxableSS(10_000, 27_000, "married_filing_jointly");
      // PI = $27,000 + $5,000 = $32,000
      expect(taxable).toBe(0);
    });

    it("provisional income $38,000 → up to 50% taxable", () => {
      // AGI $33,000 + 50% × $10,000 = $38,000
      // 0.5 × ($38,000 - $32,000) = $3,000
      const taxable = computeTaxableSS(10_000, 33_000, "married_filing_jointly");
      expect(taxable).toBeCloseTo(3_000, 0);
    });

    it("provisional income above $44,000 → up to 85% taxable", () => {
      // AGI $40,000 + 50% × $30,000 = $55,000
      // Tier 1: min(0.5 × ($44,000 - $32,000), 0.5 × $30,000) = min($6,000, $15,000) = $6,000
      // Tier 2: 0.85 × ($55,000 - $44,000) = $9,350
      // Total: $15,350, cap: 0.85 × $30,000 = $25,500
      const taxable = computeTaxableSS(30_000, 40_000, "married_filing_jointly");
      expect(taxable).toBeCloseTo(15_350, 0);
    });
  });

  describe("MFS thresholds", () => {
    it("any SS income is taxable for MFS (tier1 = tier2 = $0)", () => {
      // PI = $10,000 + 50% × $10,000 = $15,000 > $0
      // Both tiers are at $0, so immediately in 85% tier
      // Tier 1: min(0.5 × ($0 - $0), 0.5 × $10,000) = 0
      // Tier 2: 0.85 × ($15,000 - $0) = $12,750
      // Capped at 0.85 × $10,000 = $8,500
      const taxable = computeTaxableSS(10_000, 10_000, "married_filing_separately");
      expect(taxable).toBeCloseTo(8_500, 0);
    });
  });
});

describe("age 65+ additional deduction", () => {
  it("single filer age 65+ gets additional $2,050 deduction + $6,000 senior bonus (2026)", () => {
    // Standard deduction: $16,100 + $2,050 + $6,000 senior bonus = $24,150
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 24_150,
        selfAge: 65,
      }),
    );
    expect(result.federalTax).toBe(0);

    // Income of $24,151 → $1 taxable at 10%
    const result2 = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 24_151,
        selfAge: 65,
      }),
    );
    expect(result2.federalTax).toBeCloseTo(0.1, 2);
  });

  it("single filer age 65+ without senior bonus (year 2030)", () => {
    // Standard deduction: $16,100 + $2,050 = $18,150 (no bonus after 2028)
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 18_150,
        selfAge: 65,
        year: 2030,
      }),
    );
    expect(result.federalTax).toBe(0);

    const result2 = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 18_151,
        selfAge: 65,
        year: 2030,
      }),
    );
    expect(result2.federalTax).toBeCloseTo(0.1, 2);
  });

  it("MFJ both 65+ gets 2 × $1,650 additional + 2 × $6,000 senior bonus (2026)", () => {
    // Standard deduction: $32,200 + $1,650 + $1,650 + $6,000 + $6,000 = $47,500
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 47_500,
        filingStatus: "married_filing_jointly",
        selfAge: 65,
        spouseAge: 65,
      }),
    );
    expect(result.federalTax).toBe(0);
  });

  it("MFJ one spouse 65+ gets 1 × $1,650 additional + $6,000 senior bonus (2026)", () => {
    // Standard deduction: $32,200 + $1,650 + $6,000 senior bonus = $39,850
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 39_850,
        filingStatus: "married_filing_jointly",
        selfAge: 65,
        spouseAge: 55,
      }),
    );
    expect(result.federalTax).toBe(0);

    const result2 = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 39_851,
        filingStatus: "married_filing_jointly",
        selfAge: 65,
        spouseAge: 55,
      }),
    );
    expect(result2.federalTax).toBeCloseTo(0.1, 2);
  });
});

describe("OBBBA Senior Bonus phase-out", () => {
  it("full bonus for single 65+ with income below $75k threshold", () => {
    // Standard deduction: $16,100 + $2,050 (age 65+) + $6,000 (bonus) = $24,150
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 24_150,
        selfAge: 65,
      }),
    );
    expect(result.federalTax).toBe(0);
  });

  it("partial bonus for single 65+ with MAGI above $75k", () => {
    // MAGI = $100,000, threshold = $75,000, excess = $25,000
    // Reduction = $25,000 × 0.06 = $1,500
    // Bonus = $6,000 - $1,500 = $4,500
    // Total deduction: $16,100 + $2,050 + $4,500 = $22,650
    // Taxable: $100,000 - $22,650 = $77,350
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 100_000,
        selfAge: 65,
      }),
    );
    // Verify vs manually calculated deduction
    // 10%: $12,400 × 0.10 = $1,240.00
    // 12%: ($50,400 - $12,400) × 0.12 = $4,560.00
    // 22%: ($77,350 - $50,400) × 0.22 = $26,950 × 0.22 = $5,929.00
    // Total: $11,729.00
    expect(result.federalTax).toBeCloseTo(11_729, 0);
  });

  it("full phase-out for single 65+ with very high MAGI", () => {
    // MAGI = $300,000, threshold = $75,000, excess = $225,000
    // Reduction = $225,000 × 0.06 = $13,500 > $6,000 bonus → bonus = $0
    // Total deduction: $16,100 + $2,050 = $18,150
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 300_000,
        selfAge: 65,
      }),
    );
    // Also verify without bonus (year 2030)
    const noBonusResult = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 300_000,
        selfAge: 65,
        year: 2030,
      }),
    );
    // Both should produce the same tax since bonus is fully phased out
    expect(result.federalTax).toBeCloseTo(noBonusResult.federalTax, 0);
  });

  it("MFJ bonus phases out at $150k threshold", () => {
    // MAGI = $200,000, threshold = $150,000, excess = $50,000
    // Both 65+ → 2 × $6,000 = $12,000 full bonus
    // Reduction = $50,000 × 0.06 = $3,000
    // Bonus = $12,000 - $3,000 = $9,000
    // Deduction: $32,200 + $1,650 + $1,650 + $9,000 = $44,500
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 200_000,
        filingStatus: "married_filing_jointly",
        selfAge: 67,
        spouseAge: 66,
      }),
    );
    // Taxable: $200,000 - $44,500 = $155,500
    // 10%: $24,800 × 0.10 = $2,480.00
    // 12%: ($100,800 - $24,800) × 0.12 = $9,120.00
    // 22%: ($155,500 - $100,800) × 0.22 = $54,700 × 0.22 = $12,034.00
    // Total: $23,634.00
    expect(result.federalTax).toBeCloseTo(23_634, 0);
  });
});

describe("inflation indexing of brackets", () => {
  it("brackets scale with cumulative inflation", () => {
    // 10% inflation → all thresholds are 10% higher
    const base = computeFederalTax(makeTaxInput({ ordinaryIncome: 50_000 }));
    const inflated = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 55_000,
        cumulativeInflation: 1.1,
      }),
    );
    // Both should have similar effective rates (roughly)
    expect(inflated.effectiveRate).toBeCloseTo(base.effectiveRate, 1);
  });
});

describe("early withdrawal penalty (IRC §72(t), §223(f)(4), §530(d)(4))", () => {
  describe("Traditional IRA", () => {
    it("10% penalty before 59", () => {
      expect(computeEarlyWithdrawalPenalty("traditional_ira", 50, 65, 6, 10_000)).toBe(1_000);
      expect(computeEarlyWithdrawalPenalty("traditional_ira", 58, 65, 6, 10_000)).toBe(1_000);
    });

    it("at age 59, penalty depends on birth month (59½ check)", () => {
      // Born Jan-Jun: crosses 59½ within engine-age 59 → no penalty
      expect(computeEarlyWithdrawalPenalty("traditional_ira", 59, 65, 1, 10_000)).toBe(0);
      expect(computeEarlyWithdrawalPenalty("traditional_ira", 59, 65, 6, 10_000)).toBe(0);
      // Born Jul-Dec: still pre-59½ for all of engine-age 59 → penalty applies
      expect(computeEarlyWithdrawalPenalty("traditional_ira", 59, 65, 7, 10_000)).toBe(1_000);
      expect(computeEarlyWithdrawalPenalty("traditional_ira", 59, 65, 12, 10_000)).toBe(1_000);
    });

    it("no penalty at 60+", () => {
      expect(computeEarlyWithdrawalPenalty("traditional_ira", 60, 65, 12, 10_000)).toBe(0);
      expect(computeEarlyWithdrawalPenalty("traditional_ira", 70, 70, 6, 10_000)).toBe(0);
    });

    it("Rule of 55 does NOT apply to IRAs", () => {
      expect(computeEarlyWithdrawalPenalty("traditional_ira", 56, 55, 6, 10_000)).toBe(1_000);
    });
  });

  describe("Traditional 401(k)", () => {
    it("10% penalty before 59 if retired before 55", () => {
      expect(computeEarlyWithdrawalPenalty("traditional_401k", 50, 50, 6, 10_000)).toBe(1_000);
      expect(computeEarlyWithdrawalPenalty("traditional_401k", 54, 50, 6, 10_000)).toBe(1_000);
    });

    it("Rule of 55: no penalty if retired at 55+ and currently 55+", () => {
      expect(computeEarlyWithdrawalPenalty("traditional_401k", 55, 55, 6, 10_000)).toBe(0);
      expect(computeEarlyWithdrawalPenalty("traditional_401k", 57, 55, 6, 10_000)).toBe(0);
      expect(computeEarlyWithdrawalPenalty("traditional_401k", 58, 56, 6, 10_000)).toBe(0);
    });

    it("Rule of 55 doesn't help if user hasn't reached 55 yet", () => {
      expect(computeEarlyWithdrawalPenalty("traditional_401k", 54, 55, 6, 10_000)).toBe(1_000);
    });

    it("no penalty past 59½", () => {
      expect(computeEarlyWithdrawalPenalty("traditional_401k", 59, 30, 1, 10_000)).toBe(0);
      expect(computeEarlyWithdrawalPenalty("traditional_401k", 60, 30, 12, 10_000)).toBe(0);
      expect(computeEarlyWithdrawalPenalty("traditional_401k", 65, 65, 6, 10_000)).toBe(0);
    });
  });

  describe("Roth IRA / Roth 401(k)", () => {
    it("10% penalty on earnings before 59½", () => {
      expect(computeEarlyWithdrawalPenalty("roth_ira", 50, 65, 6, 5_000)).toBe(500);
      expect(computeEarlyWithdrawalPenalty("roth_401k", 50, 65, 6, 5_000)).toBe(500);
      // age 59 born late, still pre-59½
      expect(computeEarlyWithdrawalPenalty("roth_ira", 59, 65, 11, 5_000)).toBe(500);
    });

    it("no penalty past 59½", () => {
      expect(computeEarlyWithdrawalPenalty("roth_ira", 60, 65, 6, 5_000)).toBe(0);
      expect(computeEarlyWithdrawalPenalty("roth_401k", 60, 65, 6, 5_000)).toBe(0);
    });
  });

  describe("HSA", () => {
    it("20% penalty before 65 (assumes non-medical)", () => {
      expect(computeEarlyWithdrawalPenalty("hsa", 50, 65, 6, 10_000)).toBe(2_000);
      expect(computeEarlyWithdrawalPenalty("hsa", 64, 65, 6, 10_000)).toBe(2_000);
    });

    it("no penalty at 65+", () => {
      expect(computeEarlyWithdrawalPenalty("hsa", 65, 65, 6, 10_000)).toBe(0);
      expect(computeEarlyWithdrawalPenalty("hsa", 70, 65, 6, 10_000)).toBe(0);
    });
  });

  describe("529", () => {
    it("10% penalty on earnings at any age (assumes non-qualified)", () => {
      expect(computeEarlyWithdrawalPenalty("529", 30, 65, 6, 5_000)).toBe(500);
      expect(computeEarlyWithdrawalPenalty("529", 70, 65, 6, 5_000)).toBe(500);
    });
  });

  describe("non-penalized account types", () => {
    it("brokerage / fixed-interest accounts have no §72(t) penalty", () => {
      expect(computeEarlyWithdrawalPenalty("taxable", 30, 65, 6, 10_000)).toBe(0);
      expect(computeEarlyWithdrawalPenalty("hysa", 30, 65, 6, 10_000)).toBe(0);
      expect(computeEarlyWithdrawalPenalty("cd", 30, 65, 6, 10_000)).toBe(0);
      expect(computeEarlyWithdrawalPenalty("money_market", 30, 65, 6, 10_000)).toBe(0);
      expect(computeEarlyWithdrawalPenalty("i_bonds", 30, 65, 6, 10_000)).toBe(0);
    });

    it("zero or negative withdrawal yields no penalty", () => {
      expect(computeEarlyWithdrawalPenalty("traditional_ira", 50, 65, 6, 0)).toBe(0);
      expect(computeEarlyWithdrawalPenalty("traditional_ira", 50, 65, 6, -100)).toBe(0);
    });
  });
});

describe("effective rate", () => {
  it("is computed correctly", () => {
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 100_000 }));
    expect(result.effectiveRate).toBeCloseTo(result.federalTax / 100_000, 4);
  });

  it("is 0 for zero income", () => {
    const result = computeFederalTax(makeTaxInput());
    expect(result.effectiveRate).toBe(0);
  });
});

describe("NIIT (IRC §1411)", () => {
  it("does not apply when MAGI is below the threshold", () => {
    // Single MAGI threshold $200K. With $150K ordinary + $20K LTCG, MAGI =
    // $170K < $200K, so NIIT base = 0.
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 150_000, longTermCapGains: 20_000 }));
    expect(result.niit).toBe(0);
  });

  it("applies 3.8% to the lesser of net investment income or MAGI excess", () => {
    // Single, $250K ordinary + $50K LTCG. MAGI = $300K, excess over $200K
    // = $100K. Net investment income = $50K. NIIT base = min($50K, $100K) =
    // $50K. NIIT = $50K × 0.038 = $1,900.
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 250_000, longTermCapGains: 50_000 }));
    expect(result.niit).toBeCloseTo(50_000 * 0.038, 0);
  });

  it("MFJ threshold is $250K (vs single $200K)", () => {
    // MFJ at $260K MAGI ($210K ordinary + $50K LTCG). Excess over $250K
    // = $10K. NIIT base = min($50K, $10K) = $10K. NIIT = $10K × 0.038 = $380.
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 210_000,
        longTermCapGains: 50_000,
        filingStatus: "married_filing_jointly",
        spouseAge: 50,
      }),
    );
    expect(result.niit).toBeCloseTo(10_000 * 0.038, 0);
  });
});

describe("SS taxability with LTCG", () => {
  it("LTCG counts toward provisional income for SS taxability", () => {
    // Single retiree, $30K SS, $30K LTCG, no ordinary. Provisional income
    // = $30K LTCG + 0.5 × $30K SS = $45K. Tier1 $25K, tier2 $34K.
    //   tier1 portion: 0.5 × ($34K - $25K) = $4,500
    //   tier2 portion: 0.85 × ($45K - $34K) = $9,350
    //   total = $13,850 (well under 0.85 × SS cap of $25,500).
    const taxable = computeTaxableSS(30_000, 30_000, "single");
    expect(taxable).toBeCloseTo(13_850, 0);
  });
});

describe("standard deduction with OBBBA + LTCG MAGI", () => {
  it("senior bonus phases out as LTCG-heavy MAGI rises", () => {
    // Single age 65, year 2026, no ordinary + large LTCG so MAGI is
    // dominated by LTCG. Phaseout threshold for single is $75K, rate 6%.
    // We assert the monotone direction (higher MAGI → larger total tax via
    // reduced senior bonus) without re-deriving the deduction here.
    const lowMagi = computeFederalTax(
      makeTaxInput({ ordinaryIncome: 0, longTermCapGains: 50_000, selfAge: 65 }),
    );
    const highMagi = computeFederalTax(
      makeTaxInput({ ordinaryIncome: 0, longTermCapGains: 200_000, selfAge: 65 }),
    );
    expect(highMagi.federalTax).toBeGreaterThan(lowMagi.federalTax);
  });
});

describe("state tax", () => {
  it("CA single with $100K LTCG steps through brackets after $5,540 state std deduction", () => {
    // CA single std deduction $5,540. LTCG taxed as ordinary at the state level.
    // Taxable = 100,000 − 5,540 = 94,460.
    // CA single brackets: 1% < $11,079, 2% < $26,264, 4% < $41,452, 6% < $57,542,
    // 8% < $72,724, 9.3% < $371,479.
    // tax = 110.79 + 303.70 + 607.52 + 965.40 + 1214.56 + 2021.45 ≈ 5223.42
    const result = computeFederalTax(makeTaxInput({ longTermCapGains: 100_000, stateOfResidence: "CA" }));
    expect(result.stateTax).toBeCloseTo(5223.42, 0);
  });

  it("HI single with $100K LTCG pays the preferential 7.25% flat rate, no state std deduction applied", () => {
    // HI uses flat LTCG treatment: LTCG taxed separately at 7.25%, ordinary
    // income (zero here) goes through the bracket sweep with std deduction.
    // tax = 100,000 × 0.0725 = $7,250
    const result = computeFederalTax(makeTaxInput({ longTermCapGains: 100_000, stateOfResidence: "HI" }));
    expect(result.stateTax).toBeCloseTo(7_250, 0);
  });

  it("AR single with $50K LTCG applies the 50% LTCG exclusion before the bracket sweep", () => {
    // AR exclusion 0.50: bracket taxable = 50,000 × 0.50 = 25,000.
    // After AR std deduction of $2,470, taxable = 22,530.
    // AR brackets: 2% < $4,600, 3.9% otherwise.
    // tax = 4,600 × 0.02 + (22,530 − 4,600) × 0.039 = 92 + 699.27 ≈ $791.27
    const result = computeFederalTax(makeTaxInput({ longTermCapGains: 50_000, stateOfResidence: "AR" }));
    expect(result.stateTax).toBeCloseTo(791.27, 0);
  });

  it("TX (no income tax) pays zero state tax even on large LTCG", () => {
    const result = computeFederalTax(makeTaxInput({ longTermCapGains: 500_000, stateOfResidence: "TX" }));
    expect(result.stateTax).toBe(0);
  });

  it("WA returns zero state tax (capital-gains-only excise not modeled)", () => {
    const result = computeFederalTax(makeTaxInput({ longTermCapGains: 1_000_000, stateOfResidence: "WA" }));
    expect(result.stateTax).toBe(0);
  });

  it("NY single with $100K ordinary steps through brackets after $8,000 std deduction", () => {
    // Taxable = 92,000. NY single brackets: 3.9% < 8,500; 4.4% < 11,700;
    // 5.15% < 13,900; 5.4% < 80,650; 5.9% < 215,400.
    // tax = 331.50 + 140.80 + 113.30 + 3,604.50 + 669.65 ≈ 4,859.75
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 100_000, stateOfResidence: "NY" }));
    expect(result.stateTax).toBeCloseTo(4_859.75, 0);
  });

  it("low-income CA retiree pays much less than (top rate × income) thanks to brackets", () => {
    // $40K ordinary, single. Old flat-top model: 40K × 9.3% = $3,720.
    // Bracketed model: 40,000 − 5,540 = 34,460 taxable.
    // 110.79 + 303.70 + 327.84 = 742.33 (an order of magnitude less).
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 40_000, stateOfResidence: "CA" }));
    expect(result.stateTax).toBeLessThan(800);
    expect(result.stateTax).toBeCloseTo(742.33, 0);
  });

  it("MFJ uses the doubled MFJ brackets and deduction", () => {
    // CA MFJ std deduction $11,080, brackets are doubled. With $80K ordinary,
    // taxable = 68,920, all inside the 1% and 2% brackets.
    // 22,158 × 0.01 + (52,528 − 22,158) × 0.02 + (68,920 − 52,528) × 0.04
    // = 221.58 + 607.40 + 655.68 = 1,484.66
    const result = computeFederalTax(
      makeTaxInput({
        ordinaryIncome: 80_000,
        filingStatus: "married_filing_jointly",
        spouseAge: 60,
        stateOfResidence: "CA",
      }),
    );
    expect(result.stateTax).toBeCloseTo(1_484.66, 0);
  });

  it("PA flat 3.07% with no standard deduction applies to full income", () => {
    // PA has neither std deduction nor personal exemption. 100,000 × 0.0307 = 3,070.
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 100_000, stateOfResidence: "PA" }));
    expect(result.stateTax).toBeCloseTo(3_070, 0);
  });

  it("CT applies the personal exemption as if it were a standard deduction", () => {
    // Single $20K ordinary with $15,000 CT personal exemption -> taxable $5,000.
    // CT brackets: 2% < $10,000.
    // tax = 5,000 × 0.02 = $100
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 20_000, stateOfResidence: "CT" }));
    expect(result.stateTax).toBeCloseTo(100, 0);
  });

  it("no stateOfResidence yields zero state tax", () => {
    const result = computeFederalTax(makeTaxInput({ ordinaryIncome: 100_000, longTermCapGains: 50_000 }));
    expect(result.stateTax).toBe(0);
  });
});
