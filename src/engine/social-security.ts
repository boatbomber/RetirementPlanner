import type { Age, Dollars, Year } from "@/models/core";
import type { SocialSecurityConfig, SocialSecurityPerson } from "@/models/social-security";

// SSA early/delayed claiming adjustment
// Before FRA: 5/9 of 1% per month for first 36 months, 5/12 of 1% per month beyond
// After FRA: 2/3 of 1% per month (8%/year) delayed retirement credits up to age 70
// Source: SSA.gov "Effect of Early or Delayed Retirement on Retirement Benefits"
export function claimingAdjustment(claimingAge: Age, fra: Age): number {
  if (claimingAge === fra) return 1.0;
  if (claimingAge < fra) {
    const monthsEarly = (fra - claimingAge) * 12;
    const first36 = Math.min(monthsEarly, 36);
    const beyond36 = Math.max(monthsEarly - 36, 0);
    return 1 - first36 * (5 / 900) - beyond36 * (5 / 1200);
  }
  const monthsLate = Math.min((claimingAge - fra) * 12, (70 - fra) * 12);
  return 1 + monthsLate * (2 / 300);
}

// Compute SS benefit using a precomputed COLA multiplier.
// COLAs apply to PIA starting the year the worker turns 62 whether or not
// they've claimed (per SSA), so the multiplier is tracked in the simulation
// loop and passed in here.
//
// `birthMonth` (1-12) prorates the first-year benefit: claiming at age 67 with
// a December birth only collects ~1 month of SS in the year you turn 67.
//
// `wageIncome` enables the SSA earnings test (RS 02501.020): for early
// claimants below FRA, $1 of benefit is withheld for every $2 of wage above
// the annual exempt amount. We omit the year-of-FRA $1-for-$3 special rule
// since the engine doesn't know the user's birth-month relative to wage
// timing. After-FRA recoupment (PIA recomputation that increases the post-FRA
// monthly amount to recover the withheld benefits) is also not modeled.
//
// 2026 exempt amount: $24,360 (annual). Source: SSA 2026 COLA Fact Sheet.
const SS_EARNINGS_TEST_EXEMPT_2026 = 24_360;
const SS_EARNINGS_TEST_WITHHOLD_RATIO = 0.5; // $1 withheld per $2 of excess

export function computeAnnualSSBenefit(
  person: SocialSecurityPerson,
  currentAge: Age,
  currentYear: Year,
  colaMultiplier: number,
  config: SocialSecurityConfig,
  birthMonth?: number,
  wageIncome?: Dollars,
  cumulativeInflation?: number,
): Dollars {
  if (!person.enabled || person.fraMonthlyBenefit <= 0) return 0;
  if (currentAge < person.claimingAge) return 0;

  const adjustment = claimingAdjustment(person.claimingAge, person.fra);
  const monthlyAtClaim = person.fraMonthlyBenefit * adjustment;

  let monthsInYear = 12;
  if (currentAge === person.claimingAge && birthMonth) {
    // First year of claiming: per SSA "month after attainment" rule, the
    // first benefit MONTH is the month after the worker reaches claiming
    // age. Months collected = 12 - birthMonth (clamped to [0, 12]). For
    // example, a July birth claiming at age 67 reaches 67 in July, gets
    // first payment for August, collects Aug-Dec = 5 months. Born in
    // December: 0 months that year. (Special-case "born 1st/2nd of month"
    // would give one extra month, but day-of-birth isn't modeled.)
    monthsInYear = Math.max(0, Math.min(12, 12 - birthMonth));
  }

  let annualBenefit = monthlyAtClaim * monthsInYear * colaMultiplier;

  // Pre-FRA earnings test: withhold $1 per $2 of wages above the (inflation-
  // indexed) exempt amount. Applied only when wageIncome is supplied; the
  // engine passes self-employment + salary-type income (inflation-adjusted)
  // when known. The exempt threshold is itself indexed by cumulative
  // inflation since 2026.
  if (currentAge < person.fra && wageIncome != null && wageIncome > 0) {
    const exempt = SS_EARNINGS_TEST_EXEMPT_2026 * (cumulativeInflation ?? 1);
    const excess = Math.max(0, wageIncome - exempt);
    const withheld = excess * SS_EARNINGS_TEST_WITHHOLD_RATIO;
    annualBenefit = Math.max(0, annualBenefit - withheld);
  }

  if (config.useSolvencyHaircut && currentYear >= config.solvencyHaircutYear) {
    annualBenefit *= config.solvencyHaircutFactor;
  }

  return annualBenefit;
}

// Survivor benefit (IRC §202(b), SSA Survivor Benefits): when a spouse dies,
// the surviving spouse may elect to receive the higher of their own benefit
// or the deceased's benefit. The deceased's claiming-adjusted PIA forms the
// upper bound; the survivor's *own* age at claiming further reduces it if
// they claim before their own (survivor) FRA.
//
// Survivor early-claim reduction (per SSA POMS RS 00615.302): the reduction
// scales linearly from 0 at survivor FRA down to a maximum of 28.5% at age 60
// (the standard earliest survivor age). We apply that reduction here.
// Pre-60 widowhood (disability/caring-for-child cases) is not modeled.
const MAX_SURVIVOR_EARLY_REDUCTION = 0.285;
const EARLIEST_SURVIVOR_AGE: Age = 60;

export function computeSurvivorBenefit(
  deceasedSpouse: SocialSecurityPerson,
  survivorAge: Age,
  currentYear: Year,
  survivorColaMultiplier: number,
  config: SocialSecurityConfig,
  // Survivor's own FRA. Used to scale the early-claim reduction. When omitted
  // the function falls back to config.self.fra (the typical case: "self" is
  // the survivor when a spouse dies).
  survivorFra?: Age,
): Dollars {
  if (survivorAge < EARLIEST_SURVIVOR_AGE) return 0;
  if (!deceasedSpouse.enabled || deceasedSpouse.fraMonthlyBenefit <= 0) return 0;
  const adjustment = claimingAdjustment(deceasedSpouse.claimingAge, deceasedSpouse.fra);
  const monthlyAtClaim = deceasedSpouse.fraMonthlyBenefit * adjustment;

  // Apply the survivor's own early-claim reduction (0 → 28.5% as age 60 → FRA).
  const fra = survivorFra ?? config.self.fra;
  let earlyReduction = 0;
  if (survivorAge < fra) {
    const yearsEarly = fra - survivorAge;
    const yearsBetween60AndFra = Math.max(1, fra - EARLIEST_SURVIVOR_AGE);
    earlyReduction = Math.min(
      MAX_SURVIVOR_EARLY_REDUCTION,
      (yearsEarly / yearsBetween60AndFra) * MAX_SURVIVOR_EARLY_REDUCTION,
    );
  }

  let annual = monthlyAtClaim * (1 - earlyReduction) * 12 * survivorColaMultiplier;
  if (config.useSolvencyHaircut && currentYear >= config.solvencyHaircutYear) {
    annual *= config.solvencyHaircutFactor;
  }
  return annual;
}

export function computeHouseholdSSIncome(
  config: SocialSecurityConfig,
  selfAge: Age,
  spouseAge: Age | null,
  currentYear: Year,
  selfColaMultiplier: number,
  spouseColaMultiplier: number,
  selfBirthMonth?: number,
  spouseBirthMonth?: number,
  // When the spouse has died, the survivor receives the higher of their own
  // benefit or the deceased's benefit (not both). Pass the deceased's SS
  // person object plus the survivor's running COLA accumulator.
  deceasedSpouse?: SocialSecurityPerson | null,
  survivorColaMultiplier?: number,
): Dollars {
  const ownBenefit = computeAnnualSSBenefit(
    config.self,
    selfAge,
    currentYear,
    selfColaMultiplier,
    config,
    selfBirthMonth,
  );

  if (config.spouse && spouseAge !== null) {
    const spouseBenefit = computeAnnualSSBenefit(
      config.spouse,
      spouseAge,
      currentYear,
      spouseColaMultiplier,
      config,
      spouseBirthMonth,
    );
    return ownBenefit + spouseBenefit;
  }

  if (deceasedSpouse && selfAge >= 0 && survivorColaMultiplier !== undefined) {
    const survivorBenefit = computeSurvivorBenefit(
      deceasedSpouse,
      selfAge,
      currentYear,
      survivorColaMultiplier,
      config,
    );
    return Math.max(ownBenefit, survivorBenefit);
  }

  return ownBenefit;
}
