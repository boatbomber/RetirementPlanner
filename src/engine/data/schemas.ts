import { z } from "zod";

const filingStatusKeys = [
  "married_filing_jointly",
  "single",
  "married_filing_separately",
  "head_of_household",
] as const;

const FilingStatusKey = z.enum(filingStatusKeys);

const PerFilingStatus = <T extends z.ZodTypeAny>(value: T) =>
  z
    .object({
      married_filing_jointly: value,
      single: value,
      married_filing_separately: value,
      head_of_household: value,
    })
    .strict();

const Bracket = z
  .object({
    rate: z.number().min(0).max(1),
    threshold: z.number().min(0),
  })
  .strict();

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const SourceUrl = z.string().url();

// ─── Federal tax year file ───
export const FederalTaxFile = z
  .object({
    source_url: SourceUrl,
    last_updated: IsoDate,
    base_year: z.number().int().min(2000).max(2100),
    ordinary_brackets: PerFilingStatus(z.array(Bracket).min(1)),
    standard_deduction: PerFilingStatus(z.number().min(0)),
    additional_deduction_age_65: z
      .object({
        married: z.number().min(0),
        single: z.number().min(0),
      })
      .strict(),
    senior_bonus: z
      .object({
        amount: z.number().min(0),
        start_year: z.number().int(),
        end_year: z.number().int(),
        phaseout_rate: z.number().min(0).max(1),
        phaseout_threshold: PerFilingStatus(z.number().min(0)),
      })
      .strict(),
    ltcg_brackets: PerFilingStatus(z.array(Bracket).min(1)),
    niit: z
      .object({
        rate: z.number().min(0).max(1),
        threshold: PerFilingStatus(z.number().min(0)),
      })
      .strict(),
  })
  .strict();
export type FederalTaxFile = z.infer<typeof FederalTaxFile>;

// ─── Social Security taxability file ───
export const SocialSecurityTaxFile = z
  .object({
    source_url: SourceUrl,
    last_updated: IsoDate,
    taxability_thresholds: PerFilingStatus(
      z
        .object({
          tier1: z.number().min(0),
          tier2: z.number().min(0),
        })
        .strict(),
    ),
  })
  .strict();
export type SocialSecurityTaxFile = z.infer<typeof SocialSecurityTaxFile>;

// ─── Payroll tax file ───
export const PayrollTaxFile = z
  .object({
    source_url: SourceUrl,
    last_updated: IsoDate,
    ss_wage_base: z.number().min(0),
    oasdi_rate: z.number().min(0).max(1),
    medicare_rate: z.number().min(0).max(1),
  })
  .strict();
export type PayrollTaxFile = z.infer<typeof PayrollTaxFile>;

// ─── Early-withdrawal penalty file ───
export const EarlyWithdrawalPenaltiesFile = z
  .object({
    source_url: SourceUrl,
    last_updated: IsoDate,
    early_withdrawal: z
      .object({
        penalty_rate: z.number().min(0).max(1),
        age_threshold: z.number().int().min(0),
      })
      .strict(),
    rule_of_55_age: z.number().int().min(0),
    hsa_nonmedical: z
      .object({
        penalty_rate: z.number().min(0).max(1),
        age_threshold: z.number().int().min(0),
      })
      .strict(),
    nq_529_penalty_rate: z.number().min(0).max(1),
  })
  .strict();
export type EarlyWithdrawalPenaltiesFile = z.infer<typeof EarlyWithdrawalPenaltiesFile>;

// ─── State income tax file ───
const StateCode = z.string().regex(/^[A-Z]{2}$/, "expected 2-letter state code");

const StateBrackets = z
  .object({
    single: z.array(Bracket).min(1),
    mfj: z.array(Bracket).min(1),
  })
  .strict();

const StateStandardDeduction = z
  .object({
    single: z.number().min(0),
    mfj: z.number().min(0),
  })
  .strict();

const LtcgTreatment = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("flat"), rate: z.number().min(0).max(1) }).strict(),
  z.object({ kind: z.literal("exclusion"), fraction: z.number().min(0).max(1) }).strict(),
]);

const StateEntry = z
  .object({
    standard_deduction: StateStandardDeduction,
    brackets: StateBrackets,
    ltcg_treatment: LtcgTreatment.optional(),
  })
  .strict();

export const StateIncomeTaxFile = z
  .object({
    source_url: SourceUrl,
    last_updated: IsoDate,
    states: z.record(StateCode, StateEntry),
  })
  .strict();
export type StateIncomeTaxFile = z.infer<typeof StateIncomeTaxFile>;
export type StateEntry = z.infer<typeof StateEntry>;
export type LtcgTreatment = z.infer<typeof LtcgTreatment>;

export { filingStatusKeys, FilingStatusKey };
