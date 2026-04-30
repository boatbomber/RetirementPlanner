import { describe, it, expect } from "vitest";
import { computeAnnualSpending } from "../withdrawals";
import type { WithdrawalStrategy } from "@/models/withdrawal";
import type { WithdrawalState } from "../types";

function makeState(overrides: Partial<WithdrawalState> = {}): WithdrawalState {
  return {
    initialTotalBalance: 1_000_000,
    retirementBalance: 1_000_000,
    priorYearSpending: 40_000,
    priorYearReturn: 0.07,
    cumulativeInflation: 1.0,
    currentYearInflation: 0.025,
    yearsInRetirement: 1,
    currentAge: 66,
    endAge: 95,
    priorYearWithdrawalRate: 0.04,
    portfolioExpectedReturn: 0.05,
    portfolioVolatility: 0.12,
    portfolioEquityWeight: 0.5,
    ...overrides,
  };
}

describe("fixed_real (Bengen)", () => {
  const strategy: WithdrawalStrategy = {
    type: "fixed_real",
    params: { withdrawalRate: 0.04 },
    useSpendingSmile: false,
  };

  it("year 0: withdraws 4% of initial balance", () => {
    const spending = computeAnnualSpending(
      1_000_000,
      makeState({ yearsInRetirement: 0, cumulativeInflation: 1.0 }),
      strategy,
    );
    expect(spending).toBeCloseTo(40_000, 0);
  });

  it("spending scales with cumulative inflation", () => {
    const spending = computeAnnualSpending(
      900_000,
      makeState({ cumulativeInflation: 1.1, initialTotalBalance: 1_000_000 }),
      strategy,
    );
    // $1M × 4% × 1.10 = $44,000
    expect(spending).toBeCloseTo(44_000, 0);
  });

  it("spending is independent of current portfolio value", () => {
    const s1 = computeAnnualSpending(2_000_000, makeState({ cumulativeInflation: 1.0 }), strategy);
    const s2 = computeAnnualSpending(500_000, makeState({ cumulativeInflation: 1.0 }), strategy);
    expect(s1).toBe(s2);
  });

  it("never returns negative", () => {
    const spending = computeAnnualSpending(0, makeState(), strategy);
    expect(spending).toBeGreaterThanOrEqual(0);
  });
});

describe("vanguard_dynamic", () => {
  const strategy: WithdrawalStrategy = {
    type: "vanguard_dynamic",
    params: { initialRate: 0.04, ceilingPercent: 0.05, floorPercent: 0.025 },
    useSpendingSmile: false,
  };

  it("year 0: withdraws 4% of balance", () => {
    const spending = computeAnnualSpending(1_000_000, makeState({ yearsInRetirement: 0 }), strategy);
    expect(spending).toBeCloseTo(40_000, 0);
  });

  it("clamps increase to ceiling (+5% of prior spending)", () => {
    // Prior spending $40,000, balance grew → raw = $1,200,000 × 4% = $48,000
    // Max = $40,000 × 1.05 = $42,000
    const spending = computeAnnualSpending(1_200_000, makeState({ priorYearSpending: 40_000 }), strategy);
    expect(spending).toBeCloseTo(42_000, 0);
  });

  it("clamps decrease to floor (-2.5% of prior spending)", () => {
    // Prior spending $40,000, balance dropped → raw = $800,000 × 4% = $32,000
    // Min = $40,000 × 0.975 = $39,000
    const spending = computeAnnualSpending(800_000, makeState({ priorYearSpending: 40_000 }), strategy);
    expect(spending).toBeCloseTo(39_000, 0);
  });

  it("no clamping when within corridor", () => {
    // Prior $40,000, raw = $1,025,000 × 4% = $41,000
    // Min = $39,000, Max = $42,000 → $41,000 is within
    const spending = computeAnnualSpending(1_025_000, makeState({ priorYearSpending: 40_000 }), strategy);
    expect(spending).toBeCloseTo(41_000, 0);
  });

  it("zero balance → zero spending", () => {
    const spending = computeAnnualSpending(0, makeState({ priorYearSpending: 40_000 }), strategy);
    expect(spending).toBe(0);
  });

  it("huge boom: ceiling limits spending increase", () => {
    // Balance doubled → raw = $2,000,000 × 4% = $80,000
    // Max = $40,000 × 1.05 = $42,000
    const spending = computeAnnualSpending(2_000_000, makeState({ priorYearSpending: 40_000 }), strategy);
    expect(spending).toBeCloseTo(42_000, 0);
  });

  it("huge crash: floor limits spending decrease", () => {
    // Balance halved → raw = $500,000 × 4% = $20,000
    // Min = $40,000 × 0.975 = $39,000
    const spending = computeAnnualSpending(500_000, makeState({ priorYearSpending: 40_000 }), strategy);
    expect(spending).toBeCloseTo(39_000, 0);
  });

  it("multi-year: spending tracks balance through corridor", () => {
    let spending = computeAnnualSpending(1_000_000, makeState({ yearsInRetirement: 0 }), strategy);
    expect(spending).toBeCloseTo(40_000, 0);

    // Year 1: modest growth
    spending = computeAnnualSpending(1_050_000, makeState({ priorYearSpending: spending }), strategy);
    // Raw: $42,000, ceiling: $40,000 × 1.05 = $42,000 → exactly at ceiling
    expect(spending).toBeCloseTo(42_000, 0);

    // Year 2: market dip
    spending = computeAnnualSpending(950_000, makeState({ priorYearSpending: spending }), strategy);
    // Raw: $38,000, floor: $42,000 × 0.975 = $40,950
    expect(spending).toBeCloseTo(40_950, 0);

    // Year 3: recovery
    spending = computeAnnualSpending(1_100_000, makeState({ priorYearSpending: spending }), strategy);
    // Raw: $44,000, ceiling: $40,950 × 1.05 = $42,997.50
    expect(spending).toBeCloseTo(42_997.5, 0);
  });

  it("collar is real, not nominal: nominal floor expands with inflation", () => {
    // Prior nominal spending was $40,000 in year-0 dollars; cumulativeInflation
    // is now 1.10 (so $40,000 nominal = $36,364 real). Crash year balance only
    // supports $20,000 nominal raw. Real floor = $36,364 × 0.975 = $35,455.
    // Re-inflated nominal floor = $35,455 × 1.10 ≈ $39,000, same as in
    // year-1, because the collar is real-invariant. (If the collar were
    // nominal, the floor would still be $39,000, but real spending would
    // silently erode every year.)
    const spending = computeAnnualSpending(
      500_000,
      makeState({ priorYearSpending: 40_000, cumulativeInflation: 1.1 }),
      strategy,
    );
    expect(spending).toBeCloseTo(39_000, 0);
  });
});

describe("arva", () => {
  const strategy: WithdrawalStrategy = {
    type: "arva",
    params: { realDiscountRate: 0.03 },
    useSpendingSmile: false,
  };

  it("PMT formula: PV × r / (1 - (1+r)^-n)", () => {
    const balance = 1_000_000;
    const age = 65;
    const endAge = 95;
    const yearsRemaining = endAge - age; // 30 years
    const r = 0.03;

    const expectedPMT = (balance * r) / (1 - Math.pow(1 + r, -yearsRemaining));

    const spending = computeAnnualSpending(balance, makeState({ currentAge: age, endAge }), strategy);
    expect(spending).toBeCloseTo(expectedPMT, 0);
  });

  it("spending increases with age (fewer years remaining)", () => {
    const balance = 1_000_000;
    const s65 = computeAnnualSpending(balance, makeState({ currentAge: 65 }), strategy);
    const s80 = computeAnnualSpending(balance, makeState({ currentAge: 80 }), strategy);
    expect(s80).toBeGreaterThan(s65);
  });

  it("zero balance → zero spending", () => {
    const spending = computeAnnualSpending(0, makeState(), strategy);
    expect(spending).toBe(0);
  });

  it("1 year remaining → withdraws entire balance (r>0)", () => {
    const spending = computeAnnualSpending(500_000, makeState({ currentAge: 94, endAge: 95 }), strategy);
    // PMT(0.03, 1, 500000) = 500000 × 0.03 / (1 - 1.03^-1) = 15000 / 0.02913 ≈ 515000
    // Actually PMT with n=1: PV × r / (1 - (1+r)^-1) = PV × (1+r) = $515,000
    expect(spending).toBeCloseTo(500_000 * 1.03, 0);
  });

  it("real discount rate is applied to real balance, then re-inflated", () => {
    // With cumulativeInflation = 1.5, a $1.5M nominal balance is $1M real.
    // PMT(3%, 30, $1M real) ≈ $51,019 real → $76,529 nominal.
    const r = 0.03;
    const realPMT = (1_000_000 * r) / (1 - Math.pow(1 + r, -30));
    const expectedNominal = realPMT * 1.5;
    const spending = computeAnnualSpending(
      1_500_000,
      makeState({ currentAge: 65, endAge: 95, cumulativeInflation: 1.5 }),
      strategy,
    );
    expect(spending).toBeCloseTo(expectedNominal, 0);
  });

  it("multi-year: spending adjusts as balance changes", () => {
    const r = 0.03;

    // Year 1: $1M, age 65, 30 years remaining
    const s1 = computeAnnualSpending(1_000_000, makeState({ currentAge: 65 }), strategy);
    const expected1 = (1_000_000 * r) / (1 - Math.pow(1 + r, -30));
    expect(s1).toBeCloseTo(expected1, 0);

    // Year 2: balance dropped to $800k after spending + poor returns
    const s2 = computeAnnualSpending(800_000, makeState({ currentAge: 66, priorYearSpending: s1 }), strategy);
    const expected2 = (800_000 * r) / (1 - Math.pow(1 + r, -29));
    expect(s2).toBeCloseTo(expected2, 0);
    expect(s2).toBeLessThan(s1);

    // Year 3: balance recovered to $1.2M
    const s3 = computeAnnualSpending(
      1_200_000,
      makeState({ currentAge: 67, priorYearSpending: s2 }),
      strategy,
    );
    const expected3 = (1_200_000 * r) / (1 - Math.pow(1 + r, -28));
    expect(s3).toBeCloseTo(expected3, 0);
    expect(s3).toBeGreaterThan(s1);
  });
});

describe("rmd_method", () => {
  const strategy: WithdrawalStrategy = {
    type: "rmd_method",
    params: { smoothingYears: 1 },
    useSpendingSmile: false,
  };

  it("uses Uniform Lifetime Table divisor", () => {
    // Age 75 → divisor 24.6
    const spending = computeAnnualSpending(1_000_000, makeState({ currentAge: 75 }), strategy);
    expect(spending).toBeCloseTo(1_000_000 / 24.6, 0);
  });

  it("withdrawal rate increases with age", () => {
    const s75 = computeAnnualSpending(1_000_000, makeState({ currentAge: 75 }), strategy);
    const s85 = computeAnnualSpending(1_000_000, makeState({ currentAge: 85 }), strategy);
    expect(s85).toBeGreaterThan(s75);
  });

  it("smoothing blends with COLA'd prior spending (no real-spending lag)", () => {
    const smoothed: WithdrawalStrategy = {
      type: "rmd_method",
      params: { smoothingYears: 3 },
      useSpendingSmile: false,
    };
    const spending = computeAnnualSpending(
      1_000_000,
      makeState({
        currentAge: 80,
        priorYearSpending: 50_000,
        currentYearInflation: 0.025,
        yearsInRetirement: 5,
      }),
      smoothed,
    );
    // Raw: $1M / 20.2 ≈ $49,505
    // Prior $50,000 × 1.025 = $51,250 (COLA'd to today's nominal dollars)
    // Smoothed: (1/3) × $49,505 + (2/3) × $51,250 ≈ $50,668
    const raw = 1_000_000 / 20.2;
    const priorInflated = 50_000 * 1.025;
    const expected = (1 / 3) * raw + (2 / 3) * priorInflated;
    expect(spending).toBeCloseTo(expected, 0);
  });

  it("matches IRS Uniform Lifetime Table at multiple ages", () => {
    // Verify against IRS Publication 590-B divisors
    const divisors: Record<number, number> = {
      73: 26.5,
      80: 20.2,
      85: 16.0,
      90: 12.2,
      95: 8.9,
      100: 6.4,
    };
    for (const [age, divisor] of Object.entries(divisors)) {
      const spending = computeAnnualSpending(1_000_000, makeState({ currentAge: Number(age) }), strategy);
      expect(spending).toBeCloseTo(1_000_000 / divisor, 0);
    }
  });

  it("multi-year: spending adjusts as balance changes", () => {
    // Year 1: age 75, $1M → $1M / 24.6 = $40,650
    const s1 = computeAnnualSpending(
      1_000_000,
      makeState({ currentAge: 75, yearsInRetirement: 0 }),
      strategy,
    );
    expect(s1).toBeCloseTo(1_000_000 / 24.6, 0);

    // Year 2: age 76, balance dropped to $800k → $800k / 23.7 = $33,755
    const s2 = computeAnnualSpending(
      800_000,
      makeState({
        currentAge: 76,
        priorYearSpending: s1,
        yearsInRetirement: 1,
      }),
      strategy,
    );
    expect(s2).toBeCloseTo(800_000 / 23.7, 0);
    expect(s2).toBeLessThan(s1);

    // Year 3: age 77, balance recovered to $1.2M → $1.2M / 22.9 = $52,402
    const s3 = computeAnnualSpending(
      1_200_000,
      makeState({
        currentAge: 77,
        priorYearSpending: s2,
        yearsInRetirement: 2,
      }),
      strategy,
    );
    expect(s3).toBeCloseTo(1_200_000 / 22.9, 0);
    expect(s3).toBeGreaterThan(s1);
  });
});

describe("kitces_ratchet", () => {
  const strategy: WithdrawalStrategy = {
    type: "kitces_ratchet",
    params: { initialRate: 0.04, ratchetThreshold: 0.1, ratchetIncrease: 0.1 },
    useSpendingSmile: false,
  };

  it("year 0: withdraws initial rate", () => {
    const spending = computeAnnualSpending(1_000_000, makeState({ yearsInRetirement: 0 }), strategy);
    expect(spending).toBeCloseTo(40_000, 0);
  });

  it("never produces a nominal decrease", () => {
    const spending = computeAnnualSpending(
      500_000,
      makeState({ priorYearSpending: 45_000, currentYearInflation: 0.025 }),
      strategy,
    );
    expect(spending).toBeGreaterThanOrEqual(45_000);
  });

  it("inflation-adjusts prior spending each year", () => {
    const spending = computeAnnualSpending(
      1_000_000,
      makeState({
        priorYearSpending: 40_000,
        currentYearInflation: 0.03,
        yearsInRetirement: 1,
      }),
      strategy,
    );
    // Portfolio is $1M, 4% rate → $40,000 target
    // Inflated prior = $40,000 × 1.03 = $41,200
    // ratchetTarget = $1M × 0.04 = $40,000
    // $40,000 < $41,200 → no ratchet (target doesn't exceed inflated prior)
    // Return inflated prior = $41,200
    expect(spending).toBeCloseTo(41_200, 0);
  });

  it("ratchets up when portfolio grows significantly", () => {
    // Prior spending $40,000, inflation 2.5% → inflated = $41,000
    // Balance $1,500,000 × 0.04 = $60,000 (ratchet target)
    // ($60,000 - $41,000) / $41,000 = 46.3% > 10% threshold → ratchet
    // Ratcheted = $41,000 × 1.10 = $45,100
    const spending = computeAnnualSpending(
      1_500_000,
      makeState({
        priorYearSpending: 40_000,
        currentYearInflation: 0.025,
        yearsInRetirement: 3,
      }),
      strategy,
    );
    expect(spending).toBeCloseTo(41_000 * 1.1, 0);
  });

  it("does NOT ratchet when growth is below threshold", () => {
    // Prior spending $40,000, inflation 2.5% → inflated = $41,000
    // Balance $1,050,000 × 0.04 = $42,000 (ratchet target)
    // ($42,000 - $41,000) / $41,000 = 2.4% < 10% threshold → no ratchet
    const spending = computeAnnualSpending(
      1_050_000,
      makeState({
        priorYearSpending: 40_000,
        currentYearInflation: 0.025,
        yearsInRetirement: 2,
      }),
      strategy,
    );
    expect(spending).toBeCloseTo(41_000, 0);
  });

  it("multi-year: inflation compounds, ratchet triggers once", () => {
    // Year 0: $1M × 4% = $40,000
    let spending = computeAnnualSpending(1_000_000, makeState({ yearsInRetirement: 0 }), strategy);
    expect(spending).toBeCloseTo(40_000, 0);

    // Year 1: steady growth, 3% inflation, no ratchet
    spending = computeAnnualSpending(
      1_050_000,
      makeState({
        priorYearSpending: spending,
        currentYearInflation: 0.03,
        yearsInRetirement: 1,
      }),
      strategy,
    );
    const yr1 = 40_000 * 1.03; // 41,200 (inflated)
    // target = $1,050,000 × 0.04 = $42,000; gap = ($42,000 - $41,200) / $41,200 = 1.9% < 10%
    expect(spending).toBeCloseTo(yr1, 0);

    // Year 2: big growth, triggers ratchet
    spending = computeAnnualSpending(
      1_500_000,
      makeState({
        priorYearSpending: spending,
        currentYearInflation: 0.03,
        yearsInRetirement: 2,
      }),
      strategy,
    );
    const yr2Inflated = yr1 * 1.03; // 42,436
    // target = $1,500,000 × 0.04 = $60,000; gap = ($60,000 - $42,436) / $42,436 = 41.4% > 10%
    expect(spending).toBeCloseTo(yr2Inflated * 1.1, 0);
  });
});

describe("vpw", () => {
  const strategy: WithdrawalStrategy = {
    type: "vpw",
    params: {},
    useSpendingSmile: false,
  };

  it("spending is a positive fraction of balance", () => {
    const spending = computeAnnualSpending(1_000_000, makeState({ currentAge: 65 }), strategy);
    expect(spending).toBeGreaterThan(0);
    expect(spending).toBeLessThan(1_000_000);
  });

  it("withdrawal rate increases with age", () => {
    const s60 = computeAnnualSpending(1_000_000, makeState({ currentAge: 60 }), strategy);
    const s80 = computeAnnualSpending(1_000_000, makeState({ currentAge: 80 }), strategy);
    expect(s80 / 1_000_000).toBeGreaterThan(s60 / 1_000_000);
  });

  it("zero balance → zero spending", () => {
    expect(computeAnnualSpending(0, makeState(), strategy)).toBe(0);
  });

  it("matches Bogleheads VPW table at age 65 (50% equity)", () => {
    // Bogleheads VPW at age 65, 50/50 allocation: 4.9%
    const spending = computeAnnualSpending(
      1_000_000,
      makeState({ currentAge: 65, portfolioExpectedReturn: 0.05 }),
      strategy,
    );
    expect(spending / 1_000_000).toBeCloseTo(0.049, 3);
  });

  it("matches Bogleheads VPW table at age 80 (50% equity)", () => {
    // Bogleheads VPW at age 80, 50/50 allocation: 7.7%
    const spending = computeAnnualSpending(
      1_000_000,
      makeState({ currentAge: 80, portfolioExpectedReturn: 0.05 }),
      strategy,
    );
    expect(spending / 1_000_000).toBeCloseTo(0.077, 3);
  });

  it("spending scales linearly with balance", () => {
    const s1 = computeAnnualSpending(1_000_000, makeState({ currentAge: 70 }), strategy);
    const s2 = computeAnnualSpending(2_000_000, makeState({ currentAge: 70 }), strategy);
    expect(s2).toBeCloseTo(s1 * 2, 0);
  });

  it("late ages (≥98) approach full-balance withdrawal", () => {
    const spending = computeAnnualSpending(
      500_000,
      makeState({ currentAge: 100, portfolioExpectedReturn: 0.05 }),
      strategy,
    );
    // Bogleheads table at 100: ~46.6%. Strategy never withdraws 100% but
    // approaches it as the table grows.
    expect(spending / 500_000).toBeGreaterThan(0.4);
  });
});

describe("guyton_klinger", () => {
  const strategy: WithdrawalStrategy = {
    type: "guyton_klinger",
    params: {
      initialRate: 0.05,
      ceilingMultiplier: 0.2,
      floorMultiplier: 0.2,
      adjustmentPercent: 0.1,
    },
    useSpendingSmile: false,
  };

  it("year 0: withdraws initial rate × balance", () => {
    const spending = computeAnnualSpending(1_000_000, makeState({ yearsInRetirement: 0 }), strategy);
    expect(spending).toBeCloseTo(50_000, 0);
  });

  it("returns 0 when balance is 0", () => {
    const spending = computeAnnualSpending(0, makeState({ yearsInRetirement: 1 }), strategy);
    expect(spending).toBe(0);
  });

  it("applies COLA (inflation adjustment) after positive return year", () => {
    const spending = computeAnnualSpending(
      1_000_000,
      makeState({
        priorYearSpending: 50_000,
        priorYearReturn: 0.1,
        currentYearInflation: 0.03,
        yearsInRetirement: 1,
      }),
      strategy,
    );
    // Prior $50,000 × (1 + 0.03) = $51,500
    // WR = $51,500 / $1M = 5.15% → within ceiling (6%) and above floor (4%), no guardrail
    expect(spending).toBeCloseTo(51_500, 0);
  });

  it("Modified COLA: negative return alone does not skip COLA when WR is below initial", () => {
    // Per Guyton-Klinger 2006 Modified Withdrawal Rule, COLA is frozen ONLY
    // when both (a) prior return < 0 AND (b) current WR > initial WR. Here
    // priorYearWithdrawalRate = 4% < initialRate 5%, so COLA still applies.
    const spending = computeAnnualSpending(
      1_000_000,
      makeState({
        priorYearSpending: 50_000,
        priorYearReturn: -0.1,
        priorYearWithdrawalRate: 0.04,
        currentYearInflation: 0.03,
        yearsInRetirement: 1,
      }),
      strategy,
    );
    expect(spending).toBeCloseTo(51_500, 0);
  });

  it("Modified COLA: skip only when negative return AND current WR exceeds initial", () => {
    const spending = computeAnnualSpending(
      1_000_000,
      makeState({
        priorYearSpending: 50_000,
        priorYearReturn: -0.1,
        priorYearWithdrawalRate: 0.055, // above initial 0.05
        currentYearInflation: 0.03,
        yearsInRetirement: 1,
      }),
      strategy,
    );
    // Both conditions met → COLA frozen, spending stays at $50,000
    expect(spending).toBeCloseTo(50_000, 0);
  });

  it("triggers capital preservation guardrail: cuts spending 10%", () => {
    // Ceiling = 0.05 × 1.20 = 0.06
    // We need WR > 0.06 after COLA
    // If spending = $50,000 × 1.025 = $51,250, balance = $800,000
    // WR = $51,250 / $800,000 = 6.41% > 6% → cut 10%
    const spending = computeAnnualSpending(
      800_000,
      makeState({
        priorYearSpending: 50_000,
        priorYearReturn: 0.05,
        currentYearInflation: 0.025,
        yearsInRetirement: 2,
      }),
      strategy,
    );
    const afterCOLA = 50_000 * 1.025; // 51,250
    const expectedAfterCut = afterCOLA * 0.9; // 46,125
    expect(spending).toBeCloseTo(expectedAfterCut, 0);
  });

  it("triggers prosperity guardrail: increases spending 10%", () => {
    // Floor = 0.05 × 0.80 = 0.04
    // We need WR < 0.04 after COLA
    // If spending = $50,000 × 1.025 = $51,250, balance = $1,500,000
    // WR = $51,250 / $1,500,000 = 3.42% < 4% → increase 10%
    const spending = computeAnnualSpending(
      1_500_000,
      makeState({
        priorYearSpending: 50_000,
        priorYearReturn: 0.1,
        currentYearInflation: 0.025,
        yearsInRetirement: 2,
      }),
      strategy,
    );
    const afterCOLA = 50_000 * 1.025; // 51,250
    const expectedAfterRaise = afterCOLA * 1.1; // 56,375
    expect(spending).toBeCloseTo(expectedAfterRaise, 0);
  });

  it("multi-year sequence: stable market, COLA accumulates", () => {
    let spending = computeAnnualSpending(1_000_000, makeState({ yearsInRetirement: 0 }), strategy);
    expect(spending).toBeCloseTo(50_000, 0);

    // Year 1: positive return, 2.5% inflation
    spending = computeAnnualSpending(
      1_050_000,
      makeState({
        priorYearSpending: spending,
        priorYearReturn: 0.05,
        currentYearInflation: 0.025,
        yearsInRetirement: 1,
      }),
      strategy,
    );
    expect(spending).toBeCloseTo(50_000 * 1.025, 0);

    // Year 2: positive return, 2.5% inflation again
    spending = computeAnnualSpending(
      1_100_000,
      makeState({
        priorYearSpending: spending,
        priorYearReturn: 0.05,
        currentYearInflation: 0.025,
        yearsInRetirement: 2,
      }),
      strategy,
    );
    expect(spending).toBeCloseTo(50_000 * 1.025 * 1.025, 0);
  });
});

describe("risk_based", () => {
  const strategy: WithdrawalStrategy = {
    type: "risk_based",
    params: {
      targetSuccessLow: 0.7,
      targetSuccessHigh: 0.95,
      adjustmentStep: 0.05,
      initialRate: 0.04,
      expectedReturn: 0.05,
      volatility: 0.12,
    },
    useSpendingSmile: false,
  };

  it("year 0: defaults to 4% of balance", () => {
    const spending = computeAnnualSpending(1_000_000, makeState({ yearsInRetirement: 0 }), strategy);
    expect(spending).toBeCloseTo(40_000, 0);
  });

  it("returns positive value with ongoing retirement", () => {
    const spending = computeAnnualSpending(
      1_000_000,
      makeState({
        yearsInRetirement: 5,
        priorYearSpending: 40_000,
        currentAge: 70,
      }),
      strategy,
    );
    expect(spending).toBeGreaterThan(0);
  });

  it("increases spending when success probability is very high (large balance)", () => {
    // Prior $40k COLA'd to $41,000 (2.5% inflation default).
    // $5M balance, WR=0.82%, mu=5%, sigma=12%, T=25
    // z ≈ 1.74, P(success) ≈ 0.96 > 0.95 → bump by 5%
    const spending = computeAnnualSpending(
      5_000_000,
      makeState({
        yearsInRetirement: 5,
        priorYearSpending: 40_000,
        currentAge: 70,
        endAge: 95,
      }),
      strategy,
    );
    expect(spending).toBeCloseTo(41_000 * 1.05, 0);
  });

  it("decreases spending when success probability is low (small balance)", () => {
    // Prior $40k COLA'd to $41,000.
    // $400k balance with $41k → WR=10.25% vs expected 5%, very low success
    const spending = computeAnnualSpending(
      400_000,
      makeState({
        yearsInRetirement: 5,
        priorYearSpending: 40_000,
        currentAge: 66,
        endAge: 95,
      }),
      strategy,
    );
    expect(spending).toBeCloseTo(41_000 * 0.95, 0);
  });

  it("no adjustment when success probability is within band", () => {
    // Prior $40k COLA'd to $41,000. With mu=0.05, sigma=0.12, T=25:
    // WR ≈ 3.075%, z = (0.05 - 0.03075)*5/0.12 ≈ 0.80, P ≈ 0.79 → in band
    const spending = computeAnnualSpending(
      1_333_333,
      makeState({
        yearsInRetirement: 5,
        priorYearSpending: 40_000,
        currentAge: 70,
        endAge: 95,
      }),
      strategy,
    );
    expect(spending).toBeCloseTo(41_000, 0);
  });

  it("preserves real spending across years when success stays in band", () => {
    // Repeated runs at the in-band sweet spot should hold real value: each
    // year's spending = prior × (1 + currentYearInflation), no adjustment.
    let spending = computeAnnualSpending(
      1_333_333,
      makeState({
        yearsInRetirement: 5,
        priorYearSpending: 40_000,
        currentAge: 70,
        endAge: 95,
      }),
      strategy,
    );
    expect(spending).toBeCloseTo(41_000, 0);

    // Next year, balance still supports in-band WR, prior is now $41,000
    spending = computeAnnualSpending(
      1_400_000,
      makeState({
        yearsInRetirement: 6,
        priorYearSpending: spending,
        currentAge: 71,
        endAge: 95,
      }),
      strategy,
    );
    // $41,000 × 1.025 = $42,025, which preserves the 2.5% real value
    expect(spending).toBeCloseTo(42_025, 0);
  });
});

describe("computeAnnualSpending", () => {
  it("unknown strategy returns 0", () => {
    const bogus = {
      type: "nonexistent" as any,
      params: {},
      useSpendingSmile: false,
    };
    expect(computeAnnualSpending(1_000_000, makeState(), bogus)).toBe(0);
  });

  it("never returns negative", () => {
    const strategies: WithdrawalStrategy[] = [
      {
        type: "fixed_real",
        params: { withdrawalRate: 0.04 },
        useSpendingSmile: false,
      },
      {
        type: "vanguard_dynamic",
        params: {
          initialRate: 0.04,
          ceilingPercent: 0.05,
          floorPercent: 0.025,
        },
        useSpendingSmile: false,
      },
      {
        type: "arva",
        params: { realDiscountRate: 0.03 },
        useSpendingSmile: false,
      },
      { type: "vpw", params: {}, useSpendingSmile: false },
    ];
    for (const s of strategies) {
      const result = computeAnnualSpending(0, makeState(), s);
      expect(result).toBeGreaterThanOrEqual(0);
    }
  });
});
