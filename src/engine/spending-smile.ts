import type { Age } from "@/models/core";

// Blanchett (2014) "Estimating the True Cost of Retirement" describes an
// empirical "spending smile" with three life-stage phases tied to age:
//   - Go-go (65→75):   real spending declines ~1%/yr (active travel/leisure
//                      tapering off)
//   - Slow-go (75→85): declines ~2%/yr (reduced discretionary spending)
//   - No-go (85+):     modest rise from medical/care costs
//
// Anchored to chronological age 65, because Blanchett's data is calibrated
// to age and not "years since retirement". The no-go phase is driven by
// late-life medical costs rather than time-since-job. A 50-year-old retiree
// who follows this curve sees their multiplier stay flat (1.0) until age
// 65, then enter the go-go decline.
//
// Source: David Blanchett, Journal of Financial Planning, May 2014
const SMILE_ANCHOR_AGE = 65;

export function blanchettSpendingMultiplier(age: Age, _retirementAge: Age): number {
  if (age <= SMILE_ANCHOR_AGE) return 1.0;

  const yearsPastAnchor = age - SMILE_ANCHOR_AGE;
  // Phase boundaries: 65-75 go-go, 75-85 slow-go, 85+ no-go.
  const goGoYears = Math.min(yearsPastAnchor, 10);
  const slowGoYears = Math.min(Math.max(0, yearsPastAnchor - 10), 10);
  const noGoYears = Math.max(0, yearsPastAnchor - 20);

  const m = Math.pow(1 - 0.01, goGoYears) * Math.pow(1 - 0.02, slowGoYears) * Math.pow(1 + 0.01, noGoYears);

  return Math.max(0.5, Math.min(1.2, m));
}
