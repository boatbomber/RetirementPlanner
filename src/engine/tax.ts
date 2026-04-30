import type { Dollars, FilingStatus, Age, Year, Rate } from "@/models/core";
import type { AccountType } from "@/models/account";
import {
  FEDERAL_BRACKETS,
  STANDARD_DEDUCTION,
  ADDITIONAL_DEDUCTION_MARRIED,
  ADDITIONAL_DEDUCTION_SINGLE,
  SENIOR_BONUS_AMOUNT,
  SENIOR_BONUS_START_YEAR,
  SENIOR_BONUS_END_YEAR,
  SENIOR_BONUS_PHASEOUT_RATE,
  SENIOR_BONUS_PHASEOUT_THRESHOLD,
  LTCG_BRACKETS,
  SS_TAXABILITY,
  EARLY_WITHDRAWAL_PENALTY_RATE,
  EARLY_WITHDRAWAL_AGE_THRESHOLD,
  RULE_OF_55_AGE,
  HSA_NONMEDICAL_PENALTY_RATE,
  HSA_PENALTY_AGE_THRESHOLD,
  NQ_529_PENALTY_RATE,
  STATE_TAX,
  NIIT_RATE,
  NIIT_THRESHOLDS,
} from "./data";

export interface TaxInput {
  ordinaryIncome: Dollars;
  longTermCapGains: Dollars;
  ssIncome: Dollars;
  filingStatus: FilingStatus;
  selfAge: Age;
  spouseAge: Age | null;
  year: Year;
  cumulativeInflation: number;
  // US state abbreviation (e.g., "CA"). Empty string or unknown ⇒ no state
  // tax modeled. Engine applies the state's bracket schedule and standard
  // deduction (with personal exemption folded in) to ordinary income plus
  // taxable Social Security. LTCG is taxed as ordinary income except in the
  // states with statutory preferential treatment (HI/MT flat cap, AR/ND/NM/
  // SC/VT/WI partial exclusion). Not a substitute for actual filing.
  stateOfResidence?: string;
}

export interface TaxResult {
  federalTax: Dollars;
  stateTax: Dollars;
  // Net Investment Income Tax (3.8% on the lesser of investment income or
  // MAGI − threshold). Reported separately from federalTax for transparency
  // but already included in `federalTax`'s total.
  niit: Dollars;
  taxableSSIncome: Dollars;
  effectiveRate: Rate;
  marginalOrdinaryRate: Rate;
  marginalLTCGRate: Rate;
}

function indexedValue(base: number, inflation: number): number {
  return Math.round(base * inflation);
}

export function computeStandardDeduction(
  filingStatus: FilingStatus,
  selfAge: Age,
  spouseAge: Age | null,
  year: Year,
  inflation: number,
  magi: Dollars,
): Dollars {
  let deduction = indexedValue(STANDARD_DEDUCTION[filingStatus], inflation);

  // Fast path: no one is 65+ ⇒ no age-65 additional deduction and no senior
  // bonus eligibility. The deduction is independent of MAGI in this case, so
  // accumulation-phase and pre-65 retirement years (the bulk of any sim that
  // retires early) skip three branches and a multiply.
  const isMarried = filingStatus === "married_filing_jointly";
  const selfElig = selfAge >= 65;
  const spouseElig = isMarried && spouseAge !== null && spouseAge >= 65;
  if (!selfElig && !spouseElig) return deduction;

  const additionalPer = isMarried ? ADDITIONAL_DEDUCTION_MARRIED : ADDITIONAL_DEDUCTION_SINGLE;
  if (selfElig) deduction += indexedValue(additionalPer, inflation);
  if (spouseElig) deduction += indexedValue(additionalPer, inflation);

  if (year >= SENIOR_BONUS_START_YEAR && year <= SENIOR_BONUS_END_YEAR) {
    const bonusEligible = (selfElig ? 1 : 0) + (spouseElig ? 1 : 0);
    const threshold = SENIOR_BONUS_PHASEOUT_THRESHOLD[filingStatus] ?? 75_000;
    const fullBonus = bonusEligible * SENIOR_BONUS_AMOUNT;
    const excessMagi = Math.max(0, magi - threshold);
    const reduction = excessMagi * SENIOR_BONUS_PHASEOUT_RATE;
    deduction += Math.max(0, fullBonus - reduction);
  }

  return deduction;
}

// IRC §86: Social Security benefit taxability. `otherIncome` is the
// "modified AGI" sum (AGI excluding SS) plus tax-exempt interest. The engine
// doesn't model tax-exempt municipal interest as a separate input today.
// Callers can fold it into otherIncome at the call site if needed (a future
// enhancement is to add a `taxExemptInterest` field to TaxInput and inject
// it here).
export function computeTaxableSS(
  ssIncome: Dollars,
  otherIncome: Dollars,
  filingStatus: FilingStatus,
): Dollars {
  if (ssIncome <= 0) return 0;

  const thresholds = SS_TAXABILITY[filingStatus] ?? SS_TAXABILITY.single;
  const provisionalIncome = otherIncome + ssIncome * 0.5;

  if (provisionalIncome <= thresholds.tier1) return 0;

  let taxable = 0;

  if (provisionalIncome <= thresholds.tier2) {
    taxable = Math.min(0.5 * (provisionalIncome - thresholds.tier1), 0.5 * ssIncome);
  } else {
    const tier1Amount = Math.min(0.5 * (thresholds.tier2 - thresholds.tier1), 0.5 * ssIncome);
    const tier2Amount = 0.85 * (provisionalIncome - thresholds.tier2);
    taxable = Math.min(tier1Amount + tier2Amount, 0.85 * ssIncome);
  }

  return Math.max(0, taxable);
}

// Pre-indexed bracket pair: thresholds rounded against the year's
// cumulativeInflation, plus the parallel rate array. Built once at the top of
// computeFederalTax and shared across all four bracket sweeps (ordinary tax,
// LTCG tax, marginal ordinary, marginal LTCG) so we don't repeat the
// `Math.round(threshold * inflation)` work four times per tax call.
interface IndexedBrackets {
  thresholds: Float64Array;
  rates: Float64Array;
}

function indexBrackets(brackets: { threshold: number; rate: number }[], inflation: number): IndexedBrackets {
  const n = brackets.length;
  const thresholds = new Float64Array(n);
  const rates = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    thresholds[i] = Math.round(brackets[i].threshold * inflation);
    rates[i] = brackets[i].rate;
  }
  return { thresholds, rates };
}

function computeOrdinaryTaxIndexed(taxableIncome: Dollars, ib: IndexedBrackets): Dollars {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let remaining = taxableIncome;
  for (let i = ib.thresholds.length - 1; i >= 0; i--) {
    const threshold = ib.thresholds[i];
    if (remaining > threshold) {
      tax += (remaining - threshold) * ib.rates[i];
      remaining = threshold;
    }
  }
  return tax;
}

// LTCG stacking: LTCG sits on top of ordinary income in its own bracket system
function computeLTCGTaxIndexed(ordinaryTaxableIncome: Dollars, ltcg: Dollars, ib: IndexedBrackets): Dollars {
  if (ltcg <= 0) return 0;
  let tax = 0;
  let remaining = ltcg;
  const baseIncome = Math.max(0, ordinaryTaxableIncome);
  for (let i = ib.thresholds.length - 1; i >= 0; i--) {
    const threshold = ib.thresholds[i];
    const effectiveFloor = Math.max(0, threshold - baseIncome);
    if (remaining > effectiveFloor) {
      tax += (remaining - effectiveFloor) * ib.rates[i];
      remaining = effectiveFloor;
    }
  }
  return tax;
}

function getMarginalOrdinaryRateIndexed(taxableIncome: Dollars, ib: IndexedBrackets): Rate {
  for (let i = ib.thresholds.length - 1; i >= 0; i--) {
    if (taxableIncome > ib.thresholds[i]) return ib.rates[i];
  }
  return ib.rates[0];
}

function getMarginalLTCGRateIndexed(
  ordinaryTaxableIncome: Dollars,
  ltcg: Dollars,
  ib: IndexedBrackets,
): Rate {
  const totalIncome = ordinaryTaxableIncome + ltcg;
  for (let i = ib.thresholds.length - 1; i >= 0; i--) {
    if (totalIncome > ib.thresholds[i]) return ib.rates[i];
  }
  return 0;
}

// Plain bracket sweep for state tax. State brackets are NOT inflation-indexed
// in this engine (most states don't index in real life either, and the few
// that do see only modest annual updates), so we skip the IndexedBrackets
// dance and read the YAML brackets directly.
function computeStateBracketTax(
  taxableIncome: Dollars,
  brackets: { threshold: number; rate: number }[],
): Dollars {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let remaining = taxableIncome;
  for (let i = brackets.length - 1; i >= 0; i--) {
    const { threshold, rate } = brackets[i];
    if (remaining > threshold) {
      tax += (remaining - threshold) * rate;
      remaining = threshold;
    }
  }
  return tax;
}

// State income tax using each state's bracket schedule and standard
// deduction (with personal exemption folded in at YAML load time).
//
// Filing-status mapping happens in the loader: HoH falls back to single
// brackets/deduction, MFS falls back to MFJ/2. STATE_TAX is keyed by
// FilingStatus on both `brackets` and `standardDeduction`.
//
// LTCG handling depends on the state's `ltcg_treatment`:
//   ordinary (default): LTCG flows into the same bracket sweep as ordinary
//     income, sharing the standard deduction. This matches the majority of
//     states (CA, NY, MN, OR, etc.) which have no LTCG preferential rate.
//   flat: LTCG taxed at a separate flat preferential rate (HI cap, MT top
//     LTCG bracket simplified). Ordinary brackets see only ordinary income.
//   exclusion: a fraction of LTCG is excluded from state AGI; the remainder
//     joins ordinary income in the bracket sweep (AR/ND/NM/SC/VT/WI).
function computeStateTax(
  ordinaryIncome: Dollars,
  ltcg: Dollars,
  filingStatus: FilingStatus,
  stateCode: string | undefined,
): Dollars {
  if (!stateCode) return 0;
  const cfg = STATE_TAX[stateCode];
  if (!cfg) return 0;

  const brackets = cfg.brackets[filingStatus];
  const stdDeduction = cfg.standardDeduction[filingStatus];
  const treatment = cfg.ltcgTreatment;

  let bracketTaxableIncome = Math.max(0, ordinaryIncome);
  let separateLtcgTax = 0;

  if (!treatment) {
    bracketTaxableIncome += Math.max(0, ltcg);
  } else if (treatment.kind === "flat") {
    separateLtcgTax = Math.max(0, ltcg) * treatment.rate;
  } else {
    bracketTaxableIncome += Math.max(0, ltcg) * (1 - treatment.fraction);
  }

  const taxable = Math.max(0, bracketTaxableIncome - stdDeduction);
  return computeStateBracketTax(taxable, brackets) + separateLtcgTax;
}

// IRC §72(t), §223(f)(4), §530(d)(4) impose additional tax on premature
// distributions. Returns the penalty owed on the *taxable* portion of a
// withdrawal (caller is responsible for splitting earnings vs. basis where
// the rule allows that, e.g. Roth IRA contributions-first ordering).
//
// `taxablePortion` is the amount subject to penalty:
//   - Traditional IRA / 401(k) / HSA: entire withdrawal (basis-zero accounts).
//   - Roth IRA: only the amount drawn beyond the contributions/conversions
//     basis (caller passes 0 if all came from basis).
//   - Roth 401(k) / 529: pro-rata earnings portion (caller passes
//     withdrawal × gainRatio).
//
// `ownerRetirementAge` is the retirement age of the account's *owner* (self
// or spouse). Used only for the 401(k) Rule of 55: separation from service
// at age 55+ waives §72(t) on that employer's plan.
//
// `ownerBirthMonth` (1-12) determines whether the owner has actually crossed
// the 59½ / 65 threshold within the engine-age year. The engine's integer
// `age` is calendar-year age (currentYear - birthYear), so an owner who is
// engine-age 59 reaches 59½ during the year only if born Jan-Jun. Owners
// born Jul-Dec are still pre-59½ for all of engine-age 59.
export function isPast59Half(ownerAge: Age, ownerBirthMonth: number): boolean {
  if (ownerAge > EARLY_WITHDRAWAL_AGE_THRESHOLD) return true;
  if (ownerAge < EARLY_WITHDRAWAL_AGE_THRESHOLD) return false;
  // engine-age 59: crossed 59½ within this year only if born first half.
  return ownerBirthMonth <= 6;
}

export function computeEarlyWithdrawalPenalty(
  accountType: AccountType,
  ownerAge: Age,
  ownerRetirementAge: Age,
  ownerBirthMonth: number,
  taxablePortion: Dollars,
): Dollars {
  if (taxablePortion <= 0) return 0;

  const past59Half = isPast59Half(ownerAge, ownerBirthMonth);

  switch (accountType) {
    case "traditional_ira":
    case "roth_ira":
    case "roth_401k":
      return past59Half ? 0 : taxablePortion * EARLY_WITHDRAWAL_PENALTY_RATE;

    case "traditional_401k": {
      if (past59Half) return 0;
      // Rule of 55: penalty-free if separated from service in/after the
      // calendar year the owner turned 55.
      if (ownerAge >= RULE_OF_55_AGE && ownerRetirementAge <= ownerAge) return 0;
      return taxablePortion * EARLY_WITHDRAWAL_PENALTY_RATE;
    }

    case "hsa":
      return ownerAge < HSA_PENALTY_AGE_THRESHOLD ? taxablePortion * HSA_NONMEDICAL_PENALTY_RATE : 0;

    case "529":
      // Non-qualified earnings are always subject to the 10% additional tax
      // regardless of age (no 59½ relief). Engine assumes any 529 balance
      // drawn in retirement is non-qualified.
      return taxablePortion * NQ_529_PENALTY_RATE;

    default:
      return 0;
  }
}

export function computeFederalTax(input: TaxInput): TaxResult {
  const inflation = input.cumulativeInflation;

  const taxableSS = computeTaxableSS(
    input.ssIncome,
    input.ordinaryIncome + input.longTermCapGains,
    input.filingStatus,
  );

  const magi = input.ordinaryIncome + input.longTermCapGains + taxableSS;

  const standardDeduction = computeStandardDeduction(
    input.filingStatus,
    input.selfAge,
    input.spouseAge,
    input.year,
    inflation,
    magi,
  );

  const grossOrdinary = input.ordinaryIncome + taxableSS;
  // Standard deduction first reduces ordinary income; any excess flows through
  // to reduce taxable LTCG (matches the Qualified Dividends and Capital Gain
  // Tax Worksheet, Form 1040 line 16). Without this, retirees with only LTCG
  // income would lose the full deduction and pay 15% on income that should be
  // entirely inside the 0% LTCG bracket.
  const ordinaryTaxableIncome = Math.max(0, grossOrdinary - standardDeduction);
  const deductionRemaining = Math.max(0, standardDeduction - grossOrdinary);
  const taxableLTCG = Math.max(0, input.longTermCapGains - deductionRemaining);

  // Index the bracket tables once for this call. Both tax sweeps and both
  // marginal-rate lookups read from the same Float64Arrays. Saves ~24
  // Math.round calls per computeFederalTax invocation.
  const ordIB = indexBrackets(FEDERAL_BRACKETS[input.filingStatus], inflation);
  const ltcgIB = indexBrackets(LTCG_BRACKETS[input.filingStatus], inflation);

  const ordinaryTax = computeOrdinaryTaxIndexed(ordinaryTaxableIncome, ordIB);
  const ltcgTax = computeLTCGTaxIndexed(ordinaryTaxableIncome, taxableLTCG, ltcgIB);

  // NIIT (IRC §1411): 3.8% × min(net investment income, max(0, MAGI − threshold)).
  // We use LTCG as a proxy for net investment income. Brokerage taxable
  // interest and qualified dividends would also feed in if separately tracked,
  // but those flow through ordinaryIncome today. Thresholds are NOT inflation-
  // indexed, so they tighten in real terms over a long sim. MAGI for §1411
  // approximates AGI, which is what `magi` already represents here (ordinary
  // + LTCG + taxableSS).
  const niitThreshold = NIIT_THRESHOLDS[input.filingStatus] ?? NIIT_THRESHOLDS.single;
  const niitBase = Math.min(Math.max(0, input.longTermCapGains), Math.max(0, magi - niitThreshold));
  const niit = niitBase * NIIT_RATE;

  const stateTax = computeStateTax(
    input.ordinaryIncome + taxableSS,
    input.longTermCapGains,
    input.filingStatus,
    input.stateOfResidence,
  );

  const federalTotal = ordinaryTax + ltcgTax + niit;
  const totalTax = federalTotal + stateTax;
  const totalIncome = input.ordinaryIncome + input.longTermCapGains + input.ssIncome;

  return {
    federalTax: Math.max(0, federalTotal),
    stateTax: Math.max(0, stateTax),
    niit: Math.max(0, niit),
    taxableSSIncome: taxableSS,
    effectiveRate: totalIncome > 0 ? totalTax / totalIncome : 0,
    marginalOrdinaryRate: getMarginalOrdinaryRateIndexed(ordinaryTaxableIncome, ordIB),
    marginalLTCGRate: getMarginalLTCGRateIndexed(ordinaryTaxableIncome, taxableLTCG, ltcgIB),
  };
}
