import type { FilingStatus } from "@/models/core";
import {
  FederalTaxFile,
  SocialSecurityTaxFile,
  PayrollTaxFile,
  EarlyWithdrawalPenaltiesFile,
  StateIncomeTaxFile,
  type StateEntry,
  type LtcgTreatment,
} from "./schemas";
import federalRaw from "./federal-tax-2026.yaml";
import ssRaw from "./social-security-tax.yaml";
import payrollRaw from "./payroll-tax-2026.yaml";
import penaltiesRaw from "./early-withdrawal-penalties.yaml";
import stateRaw from "./state-income-tax-2026.yaml";

// Validate at module load. If a YAML edit drifts from the schema we
// fail fast at app startup rather than producing wrong tax math.
const federal = FederalTaxFile.parse(federalRaw);
const ss = SocialSecurityTaxFile.parse(ssRaw);
const payroll = PayrollTaxFile.parse(payrollRaw);
const penalties = EarlyWithdrawalPenaltiesFile.parse(penaltiesRaw);
const state = StateIncomeTaxFile.parse(stateRaw);

export interface TaxBracket {
  rate: number;
  threshold: number;
}
export interface LTCGBracket {
  rate: number;
  threshold: number;
}

// ─── Federal tax ───
export const FEDERAL_BRACKETS: Record<FilingStatus, TaxBracket[]> = federal.ordinary_brackets;
export const STANDARD_DEDUCTION: Record<FilingStatus, number> = federal.standard_deduction;
export const ADDITIONAL_DEDUCTION_MARRIED = federal.additional_deduction_age_65.married;
export const ADDITIONAL_DEDUCTION_SINGLE = federal.additional_deduction_age_65.single;

export const SENIOR_BONUS_AMOUNT = federal.senior_bonus.amount;
export const SENIOR_BONUS_START_YEAR = federal.senior_bonus.start_year;
export const SENIOR_BONUS_END_YEAR = federal.senior_bonus.end_year;
export const SENIOR_BONUS_PHASEOUT_RATE = federal.senior_bonus.phaseout_rate;
export const SENIOR_BONUS_PHASEOUT_THRESHOLD: Record<string, number> =
  federal.senior_bonus.phaseout_threshold;

export const LTCG_BRACKETS: Record<FilingStatus, LTCGBracket[]> = federal.ltcg_brackets;

export const NIIT_RATE = federal.niit.rate;
export const NIIT_THRESHOLDS: Record<FilingStatus, number> = federal.niit.threshold;

export const TAX_BASE_YEAR = federal.base_year;

// ─── Social Security taxability ───
export const SS_TAXABILITY: Record<string, { tier1: number; tier2: number }> = ss.taxability_thresholds;

// ─── Payroll tax ───
export const SS_WAGE_BASE_2026 = payroll.ss_wage_base;
export const OASDI_RATE = payroll.oasdi_rate;
export const MEDICARE_RATE = payroll.medicare_rate;

// ─── Early-withdrawal penalties ───
export const EARLY_WITHDRAWAL_PENALTY_RATE = penalties.early_withdrawal.penalty_rate;
export const EARLY_WITHDRAWAL_AGE_THRESHOLD = penalties.early_withdrawal.age_threshold;
export const RULE_OF_55_AGE = penalties.rule_of_55_age;
export const HSA_NONMEDICAL_PENALTY_RATE = penalties.hsa_nonmedical.penalty_rate;
export const HSA_PENALTY_AGE_THRESHOLD = penalties.hsa_nonmedical.age_threshold;
export const NQ_529_PENALTY_RATE = penalties.nq_529_penalty_rate;

// ─── State tax ───
// Per-filing-status normalized state config. Tax Foundation publishes only
// Single and MFJ tables; we extend to a full FilingStatus map here so the
// engine can index by filing status without conditional branching:
//   head_of_household        -> single brackets and deduction
//   married_filing_separately -> MFJ brackets and deduction divided by 2
// MFS is rare in retirement and few states publish MFS tables, so the
// MFJ/2 fallback is a planner-grade approximation.
export interface StateBrackets {
  rate: number;
  threshold: number;
}
export interface StateTaxConfig {
  brackets: Record<FilingStatus, StateBrackets[]>;
  standardDeduction: Record<FilingStatus, number>;
  ltcgTreatment: LtcgTreatment | undefined;
}

function expandStateEntry(entry: StateEntry): StateTaxConfig {
  const halveBrackets = (bs: StateBrackets[]): StateBrackets[] =>
    bs.map((b) => ({ rate: b.rate, threshold: Math.round(b.threshold / 2) }));
  return {
    brackets: {
      single: entry.brackets.single,
      married_filing_jointly: entry.brackets.mfj,
      head_of_household: entry.brackets.single,
      married_filing_separately: halveBrackets(entry.brackets.mfj),
    },
    standardDeduction: {
      single: entry.standard_deduction.single,
      married_filing_jointly: entry.standard_deduction.mfj,
      head_of_household: entry.standard_deduction.single,
      married_filing_separately: Math.round(entry.standard_deduction.mfj / 2),
    },
    ltcgTreatment: entry.ltcg_treatment,
  };
}

export const STATE_TAX: Record<string, StateTaxConfig> = Object.fromEntries(
  Object.entries(state.states).map(([code, entry]) => [code, expandStateEntry(entry)]),
);
