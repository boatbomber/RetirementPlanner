import type { Age } from "@/models/core";
import type { Sex } from "@/models/core";
import type { MortalityTable } from "@/models/simulation-config";
import type { PRNG } from "./prng";

// Gompertz mortality parameters per table choice.
// q(x) ≈ 1 - exp(-(1/b) × exp((x - m)/b))
// References:
//   - SSA Period Life Table 2020 (general U.S. population)
//   - Society of Actuaries RP-2014 mortality study (annuitants, a healthier
//     subpopulation with longer lifespans than SSA period)
const TABLE_PARAMS: Record<MortalityTable, { mode: Record<Sex, number>; dispersion: Record<Sex, number> }> = {
  ssa_period: {
    mode: { male: 87.5, female: 91.5 },
    dispersion: { male: 9.5, female: 9.0 },
  },
  soa_rp2014: {
    // RP-2014 healthy-annuitant cohort runs ~2 years longer than SSA period
    // at modal age, with slightly tighter dispersion.
    mode: { male: 89.5, female: 93.0 },
    dispersion: { male: 9.0, female: 8.5 },
  },
};

// Annual mortality improvement (mortality rates fall ~1% per year of cohort
// progression). Applied multiplicatively when mortalityImprovement is enabled.
const ANNUAL_IMPROVEMENT_FACTOR = 0.99;

export interface MortalityState {
  selfAlive: boolean;
  spouseAlive: boolean;
  // Number of years simulated since start, used for cohort improvement
  yearsSinceStart: number;
}

export function annualMortalityProbability(
  age: Age,
  sex: Sex,
  yearsImprovement: number = 0,
  table: MortalityTable = "ssa_period",
): number {
  if (age <= 0) return 0;
  const params = TABLE_PARAMS[table];
  const m = params.mode[sex];
  const b = params.dispersion[sex];
  const mu = (1 / b) * Math.exp((age - m) / b);
  const baseQ = 1 - Math.exp(-mu);
  const improvement = Math.pow(ANNUAL_IMPROVEMENT_FACTOR, Math.max(0, yearsImprovement));
  return Math.min(1, baseQ * improvement);
}

export function survivesYear(
  age: Age,
  sex: Sex,
  yearsImprovement: number,
  rng: PRNG,
  table: MortalityTable = "ssa_period",
): boolean {
  const q = annualMortalityProbability(age, sex, yearsImprovement, table);
  return rng.nextFloat() > q;
}
