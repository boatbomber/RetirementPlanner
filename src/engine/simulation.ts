import type { Dollars, Rate, Age } from "@/models/core";
import type { Scenario } from "@/models/scenario";
import type { SimulationResult } from "@/models/results";
import type {
  AccountState,
  AnnualSnapshot,
  AssetReturns,
  IterationResult,
  PackedIterations,
  PrecomputedConfig,
  WithdrawalState,
} from "./types";
import { PRNG } from "./prng";
import { generateAnnualInflation } from "./inflation";
import { generateCorrelatedReturns, applyReturnsToBalance, makeAssetReturns } from "./returns";
import { computeHouseholdSSIncome } from "./social-security";
import type { SocialSecurityPerson } from "@/models/social-security";
import { computeRMD } from "./rmd";
import { computeFederalTax, computeEarlyWithdrawalPenalty, computeStandardDeduction } from "./tax";
import { computeAnnualSpending } from "./withdrawals";
import { precompute } from "./precompute";
import { aggregateResults, aggregatePackedBatches } from "./aggregation";
import { estimateEarliestRetirementAge } from "./retirement-age-search";
import { packIterations } from "./packed";
import { SS_WAGE_BASE_2026, OASDI_RATE, MEDICARE_RATE } from "./data";
import { SEED_FALLBACK } from "./prng";
import { blanchettSpendingMultiplier } from "./spending-smile";
import { survivesYear } from "./mortality";
import { FIXED_INTEREST_TYPES } from "@/models/account";
import type { AccountType } from "@/models/account";
import { cloneAccounts, getFixedRate, depositToAccount, computePortfolioRiskStats } from "./account-utils";
import {
  sortAccountsForWithdrawalOrder,
  sortAccountsForTaxPay,
  sortAccountsForLifeEventDrain,
  getTargetBracketIncome,
} from "./account-ordering";

// FILE STRUCTURE
// This file owns the year-loop hot path. Anything called inside `runIteration`
// 7M+ times per 10k-iter sim stays here so V8 can inline it monomorphically:
//   - the four account predicates (isTraditional / isRoth / isBrokerage /
//     isFixedInterest) — exported so neighbour modules can use them
//   - TaxAccum + makeTaxAccum — per-iteration scratchpad
//   - applyWithdrawalTaxImpact — the per-withdrawal tax/basis/penalty router
//   - totalBalance, selectCashSink — tight inner-loop helpers
//   - runIteration itself plus the public entry points (runSimulation,
//     runIterations, aggregateAcrossWorkers, runIterationsPacked,
//     aggregateAcrossWorkersPacked)
//
// Warm/cold neighbours that don't run inside the year-loop body:
//   ./account-utils       — cloneAccounts, getFixedRate, depositToAccount,
//                           ALLOCATION_KEYS, computePortfolioRiskStats
//   ./account-ordering    — sortAccountsForWithdrawalOrder / TaxPay /
//                           LifeEventDrain, getTargetBracketIncome
//   ./retirement-age-search — estimateEarliestRetirementAge (binary search,
//                           runIteration injected as a callback to avoid a
//                           runtime import cycle)
//   ./packed              — createPackedIterations, packedIterationsBuffers,
//                           packIterations (worker-transferable buffer plumbing)

function totalBalance(accounts: AccountState[]): Dollars {
  return accounts.reduce((sum, a) => sum + a.balance, 0);
}

export function isTraditional(type: AccountType): boolean {
  return type === "traditional_ira" || type === "traditional_401k";
}

export function isRoth(type: AccountType): boolean {
  return type === "roth_ira" || type === "roth_401k";
}

// Brokerage / general investment account, taxable on growth + LTCG on sale
export function isBrokerage(type: AccountType): boolean {
  return type === "taxable";
}

// Fixed-interest accounts that hold cash-like principal. Interest accrues
// annually as ordinary income (HYSA/CD/MMA) or tax-deferred (I-bonds).
// Withdrawals of principal are not themselves taxable.
export function isFixedInterest(type: AccountType): boolean {
  return FIXED_INTEREST_TYPES.has(type);
}

// Accounts that hold liquid post-tax cash and can absorb savings inflows
// (excess income) and tax-paid distributions. Ordered by preference.
function selectCashSink(accounts: AccountState[]): AccountState | undefined {
  return (
    accounts.find((a) => isBrokerage(a.type)) ??
    accounts.find((a) => a.type === "hysa") ??
    accounts.find((a) => a.type === "money_market") ??
    accounts.find((a) => a.type === "cd")
  );
}

// Mutable accumulator passed into `applyWithdrawalTaxImpact`. The function
// resets the three fields and writes the per-call deltas; the caller adds
// them onto its own running totals (this year's or deferred-to-next-year's).
// Reused across calls to avoid per-call closure allocation in the hot path.
interface TaxAccum {
  ordinary: Dollars;
  ltcg: Dollars;
  penalty: Dollars;
}

function makeTaxAccum(): TaxAccum {
  return { ordinary: 0, ltcg: 0, penalty: 0 };
}

// Compute and route the tax / basis / penalty consequences of a single
// withdrawal. Caller has already debited `acct.balance` by `withdraw`.
// Writes deltas to `out` (zeroed first) which the caller adds to its running
// totals.
//
// - Brokerage: pro-rata cost basis recovery; gain → LTCG.
// - Traditional IRA / 401(k): full amount → ordinary income; §72(t) penalty
//   on the entire withdrawal if before 59½ (401(k) Rule of 55 may waive).
// - Roth IRA: contributions/conversions basis comes out FIRST per IRS
//   ordering rule (§408A(d)). No tax/penalty until basis exhausted; any
//   excess is earnings taxed as ordinary income + §72(t) penalty.
// - Roth 401(k): pro-rata earnings ratio applies (§402A). Earnings portion
//   is taxable + §72(t) penalty before 59½.
// - HSA: full amount → ordinary income (basis recovered via deduction at
//   contribution time); §223(f)(4) 20% penalty before 65.
// - 529: pro-rata earnings → ordinary income + §530(d)(4) 10% penalty
//   (engine assumes any retirement-age 529 draw is non-qualified).
// - I-Bonds: deferred interest comes due as ordinary income (gain ratio).
// - HYSA / CD / Money Market: principal only. Interest is already taxed
//   annually as it accrued, so withdrawal itself has no tax impact.
function applyWithdrawalTaxImpact(
  acct: AccountState,
  withdraw: Dollars,
  selfAge: Age,
  spouseAge: Age | null,
  config: PrecomputedConfig,
  out: TaxAccum,
): void {
  out.ordinary = 0;
  out.ltcg = 0;
  out.penalty = 0;
  if (withdraw <= 0) return;

  const ownerAge = acct.owner === "self" ? selfAge : (spouseAge ?? selfAge);
  const ownerRetirementAge =
    acct.owner === "self" ? config.retirementAge : (config.spouseRetirementAge ?? config.retirementAge);
  const ownerBirthMonth =
    acct.owner === "self" ? config.selfBirthMonth : (config.spouseBirthMonth ?? config.selfBirthMonth);
  const type = acct.type;

  if (type === "taxable") {
    const preBalance = acct.balance + withdraw;
    const gainRatio = preBalance > 0 ? Math.max(0, 1 - acct.costBasis / preBalance) : 1.0;
    out.ltcg = withdraw * gainRatio;
    acct.costBasis = Math.max(0, acct.costBasis - withdraw * (1 - gainRatio));
    return;
  }

  if (type === "traditional_ira" || type === "traditional_401k") {
    out.ordinary = withdraw;
    out.penalty = computeEarlyWithdrawalPenalty(
      type,
      ownerAge,
      ownerRetirementAge,
      ownerBirthMonth,
      withdraw,
    );
    return;
  }

  if (type === "roth_ira") {
    const fromBasis = Math.min(withdraw, Math.max(0, acct.costBasis));
    const fromEarnings = withdraw - fromBasis;
    acct.costBasis = Math.max(0, acct.costBasis - fromBasis);
    if (fromEarnings > 0) {
      out.ordinary = fromEarnings;
      out.penalty = computeEarlyWithdrawalPenalty(
        "roth_ira",
        ownerAge,
        ownerRetirementAge,
        ownerBirthMonth,
        fromEarnings,
      );
    }
    return;
  }

  if (type === "roth_401k") {
    const preBalance = acct.balance + withdraw;
    const gainRatio = preBalance > 0 ? Math.max(0, 1 - acct.costBasis / preBalance) : 1.0;
    const earnings = withdraw * gainRatio;
    acct.costBasis = Math.max(0, acct.costBasis - withdraw * (1 - gainRatio));
    if (earnings > 0) {
      out.ordinary = earnings;
      out.penalty = computeEarlyWithdrawalPenalty(
        "roth_401k",
        ownerAge,
        ownerRetirementAge,
        ownerBirthMonth,
        earnings,
      );
    }
    return;
  }

  if (type === "hsa") {
    out.ordinary = withdraw;
    out.penalty = computeEarlyWithdrawalPenalty(
      "hsa",
      ownerAge,
      ownerRetirementAge,
      ownerBirthMonth,
      withdraw,
    );
    return;
  }

  if (type === "529") {
    const preBalance = acct.balance + withdraw;
    const gainRatio = preBalance > 0 ? Math.max(0, 1 - acct.costBasis / preBalance) : 1.0;
    const earnings = withdraw * gainRatio;
    acct.costBasis = Math.max(0, acct.costBasis - withdraw * (1 - gainRatio));
    if (earnings > 0) {
      out.ordinary = earnings;
      out.penalty = computeEarlyWithdrawalPenalty(
        "529",
        ownerAge,
        ownerRetirementAge,
        ownerBirthMonth,
        earnings,
      );
    }
    return;
  }

  if (type === "i_bonds") {
    const preBalance = acct.balance + withdraw;
    const gainRatio = preBalance > 0 ? Math.max(0, 1 - acct.costBasis / preBalance) : 1.0;
    out.ordinary = withdraw * gainRatio;
    acct.costBasis = Math.max(0, acct.costBasis - withdraw * (1 - gainRatio));
    return;
  }

  // HYSA / CD / Money Market: principal withdrawal is not a taxable event.
}

export interface IterationParams {
  config: PrecomputedConfig;
  rng: PRNG;
}

function runIteration({ config, rng }: IterationParams): IterationResult {
  const accounts = cloneAccounts(config.initialAccounts);
  const snapshots: AnnualSnapshot[] = [];

  // Pre-sort withdrawal and tax-pay orders ONCE per iteration. Both depend
  // only on account *type*, not balance, so the result is reusable across
  // every retirement year (balance>0 is checked inline at the consumer).
  const withdrawalOrderAccounts = sortAccountsForWithdrawalOrder(
    accounts,
    config.withdrawalOrder.type,
    config.withdrawalOrder.customOrder,
  );
  const taxPayOrderAccounts = sortAccountsForTaxPay(accounts);
  const lifeEventDrainOrderAccounts = sortAccountsForLifeEventDrain(accounts);

  // Reusable scratch buffers, re-zeroed each year-step or per-call. Held
  // for the lifetime of the iteration (~70 year-steps) to avoid per-step
  // allocations in the hot path.
  const realReturns: AssetReturns = makeAssetReturns();
  const nominalReturns: AssetReturns = makeAssetReturns();
  const txAccum: TaxAccum = makeTaxAccum();

  let cumulativeInflation = 1.0;
  // Seed AR(1) at the long-run mean when stochastic, otherwise at the
  // user-set fixed rate. Without this, stochastic mode that uses a different
  // longRunMean than fixedInflationRate gets a transient bias in year 1.
  let prevInflation =
    config.simulationConfig.inflationMode === "stochastic"
      ? config.simulationConfig.stochasticInflation.longRunMean
      : config.simulationConfig.fixedInflationRate;
  let isRuined = false;
  let depletionAge: Age | null = null;
  let maxSpendingCut: Rate = 0;

  let priorYearSpending = 0;
  let priorYearReturn = 0;
  // Fallback bucket for cash that has nowhere to land (no taxable / HYSA /
  // CD / MMA account). Common in FIRE setups with only Trad+Roth. Without
  // this, RMD overflow and pre-retirement savings would just disappear.
  // Treated as a stable cash account: no growth modeled, but it preserves the
  // cash for terminal wealth and emergency draws.
  let virtualCash: Dollars = 0;
  // LTCG realized by selling brokerage shares to pay tax. We don't recompute
  // tax recursively in the same year, so the gain rolls into next year's LTCG
  // bucket. Without this, brokerage liquidations to pay tax would be untaxed
  // forever.
  let deferredLTCG: Dollars = 0;
  // Same idea for ordinary income: when an after-tax operation (life-event
  // outflow, tax-payment liquidation of Traditional/HSA/529/etc.) realizes
  // taxable income, defer it to next year so it lands in that year's tax
  // computation. Otherwise these operations are silently tax-free.
  let deferredOrdinaryIncome: Dollars = 0;
  // §72(t)/§223(f)(4)/§530(d)(4) additional taxes incurred by post-tax
  // operations (life events drawn from pre-59½ Traditional accounts, etc.)
  // also roll into next year's penalty so they're actually paid.
  let deferredEarlyPenalty: Dollars = 0;
  const initialBalance = totalBalance(accounts);
  // Snapped at the moment the simulation crosses into retirement so withdrawal
  // strategies that anchor on the retirement-day portfolio (Bengen 4%, Kitces
  // ratchet) use the right base. Stored in REAL (sim-start) dollars; strategies
  // re-apply state.cumulativeInflation to recover nominal spending. If the user
  // is already retired at sim start, sim-start cumulativeInflation is 1.0 so
  // this equals the current nominal balance.
  let retirementBalance: Dollars = config.startAge >= config.retirementAge ? initialBalance : 0;

  // SS COLA multipliers start at 1.0 at sim start. Once a person reaches age
  // 62, multiply by (1 + thisYearCola) each subsequent year. (SSA: COLAs apply
  // to PIA starting in the year a worker turns 62, claimed or not.)
  let selfColaMultiplier = 1.0;
  let spouseColaMultiplier = 1.0;

  // Stochastic mortality state
  const useStochasticMortality = config.simulationConfig.longevityModel === "stochastic_mortality";
  const useImprovement = config.simulationConfig.mortalityImprovement;
  let selfAlive = true;
  let spouseAlive = config.spouseBirthYear !== null;

  // Survivor SS benefit state: when the higher-earning spouse dies, the
  // surviving spouse can elect to receive the deceased's benefit if it
  // exceeds their own (IRC §202(b)). We capture the deceased's SS person
  // params at the moment of death and continue compounding a survivor COLA
  // multiplier so the survivor benefit grows with subsequent SSA COLAs.
  let deceasedSpouse: SocialSecurityPerson | null = null;
  let survivorColaMultiplier = 1.0;

  for (let age = config.startAge; age <= config.endAge; age++) {
    const year = config.birthYear + age;
    const spouseAge = config.spouseBirthYear ? age - (config.birthYear - config.spouseBirthYear) : null;
    const yearsSinceStart = age - config.startAge;
    // Filing-status state: married only while spouse is alive. After spouse
    // death, simplify to "single" (skipping the 2-year Qualifying Surviving
    // Spouse window since we don't model dependents. IRS §2 grants MFJ-
    // equivalent rates to a surviving spouse with a qualifying dependent
    // child for up to two years. Without dependent modeling this would
    // never apply, so collapsing to "single" is materially correct for
    // typical retiree scenarios but mildly overstates tax for the rare
    // user whose plan involves a qualifying dependent post-death). This
    // drives bracket widths, standard deduction, and SS taxability for
    // the year.
    const currentlyMarried = config.isMarried && spouseAlive;
    const effectiveSpouseAge = spouseAlive ? spouseAge : null;

    // Step 1: Generate inflation for this year. The cumulative multiplier is
    // applied at end-of-year (see Step 16) so today's-dollar inputs hit the
    // year-zero step un-inflated; year 1 sees one year of inflation, etc.
    const annualInflation = generateAnnualInflation(prevInflation, config.simulationConfig, rng);
    prevInflation = annualInflation;

    // SS COLA: per spec, when stochastic inflation is enabled, the COLA equals
    // the simulated inflation rate for the year; otherwise use config.colaRate.
    // Per SSA, COLAs are bottom-bounded at 0%. Benefits never decrease
    // year-over-year even in deflationary periods.
    const rawCola =
      config.simulationConfig.inflationMode === "stochastic" ? annualInflation : config.ssConfig.colaRate;
    const colaThisYear = Math.max(0, rawCola);
    if (selfAlive && age >= 62) {
      selfColaMultiplier *= 1 + colaThisYear;
    }
    if (spouseAlive && spouseAge !== null && spouseAge >= 62) {
      spouseColaMultiplier *= 1 + colaThisYear;
    }
    // Survivor benefits also receive annual COLAs once the survivor is at
    // least 60 (the earliest survivor-claiming age we model).
    if (deceasedSpouse !== null && age >= 60) {
      survivorColaMultiplier *= 1 + colaThisYear;
    }

    // Step 2-3: Generate correlated asset returns (regime-switching by inflation)
    const choleskyL =
      annualInflation > config.simulationConfig.inflationRegimeThreshold
        ? config.choleskyHigh
        : config.choleskyLow;
    generateCorrelatedReturns(config.simulationConfig.capitalMarketAssumptions, choleskyL, rng, realReturns);
    // The CMA inputs are REAL returns (per the AssumptionsEditor label),
    // but the rest of the engine lives in nominal dollars (income, expenses,
    // brackets all inflate via cumulativeInflation). So we Fisher-convert
    // each asset's real return to nominal using this year's inflation:
    // (1 + nominal) = (1 + real) × (1 + inflation). Without this, every
    // account silently grew at the real rate while expenses inflated,
    // pessimistically biasing every result.
    const inflMul = 1 + annualInflation;
    nominalReturns.usLargeCap = (1 + realReturns.usLargeCap) * inflMul - 1;
    nominalReturns.usSmallCap = (1 + realReturns.usSmallCap) * inflMul - 1;
    nominalReturns.intlDeveloped = (1 + realReturns.intlDeveloped) * inflMul - 1;
    nominalReturns.intlEmerging = (1 + realReturns.intlEmerging) * inflMul - 1;
    nominalReturns.usBonds = (1 + realReturns.usBonds) * inflMul - 1;
    nominalReturns.tips = (1 + realReturns.tips) * inflMul - 1;
    nominalReturns.cash = (1 + realReturns.cash) * inflMul - 1;
    const returns = nominalReturns;

    // Year-current allocation per account is read from the precomputed table
    // at the call sites below (applyReturnsToBalance, computePortfolioRiskStats).
    // We no longer mutate acct.allocation per year. That field is unused
    // post-precompute and remains at its initial value.
    const yearIdx = age - config.startAge;
    const allocationsThisYear = config.allocationsByAccountAge;

    // Step 4: Receive non-investment income (wages, pensions, etc.)
    let totalIncome = 0;
    let ordinaryIncome = 0;
    // Track wage-like income per spouse so FICA OASDI can be capped per person
    // (each worker has their own wage base; the household doesn't share it).
    let selfWages = 0;
    let spouseWages = 0;
    const incomes = config.incomeByAge.get(age) ?? [];
    for (const inc of incomes) {
      // Skip income tied to a deceased owner. Retirement-age cutoffs are
      // applied at precompute time via IncomeSource.endsAtRetirement, so the
      // map only contains incomes that are still flowing this year.
      if (inc.owner === "self" && !selfAlive) continue;
      if (inc.owner === "spouse" && !spouseAlive) continue;
      const amount = inc.inflationAdjusted ? inc.amount * cumulativeInflation : inc.amount;
      totalIncome += amount;
      if (inc.taxable) {
        ordinaryIncome += amount;
        if (inc.isWageLike) {
          if (inc.owner === "self") selfWages += amount;
          else if (inc.owner === "spouse") spouseWages += amount;
        }
      }
    }

    // Social Security income (uses per-person COLA multipliers; passes
    // deceasedSpouse so a surviving spouse can claim the higher of own vs
    // survivor benefit per IRC §202(b)).
    const ssIncome = computeHouseholdSSIncome(
      config.ssConfig,
      selfAlive ? age : -1,
      spouseAlive && spouseAge !== null ? spouseAge : null,
      year,
      selfColaMultiplier,
      spouseColaMultiplier,
      config.selfBirthMonth,
      config.spouseBirthMonth ?? undefined,
      deceasedSpouse,
      survivorColaMultiplier,
    );
    totalIncome += ssIncome;

    // Step 5: Compute RMDs based on prior-year (pre-contribution, pre-growth)
    // balance. IRS Pub 590-B uses Dec 31 of the prior year. We capture the
    // current balance here, before contributions / growth bumps it for the
    // remainder of this year.
    let totalRMD = 0;
    for (const acct of accounts) {
      if (!isTraditional(acct.type) || acct.balance <= 0) continue;
      const ownerAge = acct.owner === "self" ? age : spouseAge;
      const ownerBirthYear =
        acct.owner === "self" ? config.birthYear : (config.spouseBirthYear ?? config.birthYear);
      if (ownerAge == null) continue;
      if (acct.owner === "self" && !selfAlive) continue;
      if (acct.owner === "spouse" && !spouseAlive) continue;
      const rmd = computeRMD(acct.balance, ownerAge, ownerBirthYear);
      if (rmd > 0) {
        acct.balance -= rmd;
        totalRMD += rmd;
        ordinaryIncome += rmd;
      }
    }

    // Step 6: Contributions (working years)
    let totalContributions = 0;
    // Sum of *employee* contributions only (excluding match) for pre-retirement
    // take-home accounting. Tracked here instead of via a second walk later so
    // we don't iterate accounts twice.
    let totalEmployeeContributions = 0;
    const contributionOverrides = config.contributionOverridesByAge.get(age);
    for (const acct of accounts) {
      if (age > acct.contributionEndAge) continue;
      if (acct.owner === "self" && !selfAlive) continue;
      if (acct.owner === "spouse" && !spouseAlive) continue;
      // Contributions require wages, so stop them once the owner retires.
      // Without this gate, a user with contributionEndAge > retirementAge gets
      // post-retirement contributions added to balance from thin air, which
      // makes nonsensically-young retirements look feasible to the solver.
      if (acct.owner === "self" && age >= config.retirementAge) {
        continue;
      }
      if (
        acct.owner === "spouse" &&
        config.spouseRetirementAge !== null &&
        spouseAge !== null &&
        spouseAge >= config.spouseRetirementAge
      ) {
        continue;
      }
      const overrideAmount = contributionOverrides?.get(acct.id);
      const baseContribution = overrideAmount != null ? overrideAmount : acct.annualContribution;
      const contribution = baseContribution * cumulativeInflation;
      const match = overrideAmount != null ? 0 : acct.employerMatch * cumulativeInflation;
      const total = contribution + match;
      if (total <= 0) continue;
      acct.balance += total;
      if (isBrokerage(acct.type) || acct.type === "i_bonds") {
        // Brokerage and I-Bond contributions raise cost basis dollar-for-dollar
        // (newly purchased shares / bonds add no immediate gain).
        acct.costBasis += total;
      } else if (isRoth(acct.type) || acct.type === "529") {
        // Roth and 529 contributions are after-tax, so they form the basis
        // recovered tax-free on withdrawal. Employer match in a Roth 401(k) is
        // typically deposited to a pre-tax sub-account (taxable on withdrawal),
        // so we exclude `match` from basis and let it flow as future earnings.
        acct.costBasis += contribution;
      }
      totalContributions += total;
      totalEmployeeContributions += contribution;
      // Pre-tax contributions reduce taxable ordinary income: Traditional
      // IRA / 401(k) (IRC §219, §402(g)) and HSA (IRC §223). HSA
      // contributions made through a cafeteria plan would also escape FICA;
      // we don't model that simplification here.
      if (isTraditional(acct.type) || acct.type === "hsa") {
        ordinaryIncome -= contribution;
      }
    }
    if (ordinaryIncome < 0) ordinaryIncome = 0;

    // Step 5b: Accrue interest on fixed-interest accounts.
    // HYSA/CD/MMA interest is taxed annually as ordinary income.
    // I-Bond interest is federally tax-deferred until withdrawal.
    // Convention: interest accrues on the post-contribution balance, so this
    // year's contributions earn a full year of interest (start-of-year
    // contribution timing). Equity returns (Step 12) instead apply at year-end
    // to the post-contribution post-withdrawal balance, so withdrawn cash
    // earns no return that year. The two timings are not symmetric, but the
    // magnitude is small and matches typical APY-quoting convention; both
    // are documented to deter future "phantom growth on withdrawals" reports.
    let fixedInterestIncome = 0;
    for (const acct of accounts) {
      if (!isFixedInterest(acct.type)) continue;
      if (acct.balance <= 0) continue;
      const rate = getFixedRate(acct);
      if (rate === 0) continue;
      const interest = acct.balance * rate;
      acct.balance += interest;
      if (acct.type !== "i_bonds") {
        fixedInterestIncome += interest;
      }
    }
    ordinaryIncome += fixedInterestIncome;
    totalIncome += fixedInterestIncome;

    const isRetired = age >= config.retirementAge;
    let targetSpending = 0;
    let actualSpending = 0;
    let preRetExpensesThisYear = 0;
    let withdrawals = 0;
    let rothConversion = 0;
    // Pull in any LTCG / ordinary income deferred from prior year's
    // tax-payment liquidations and life-event outflows.
    let ltcg = deferredLTCG;
    deferredLTCG = 0;
    ordinaryIncome += deferredOrdinaryIncome;
    deferredOrdinaryIncome = 0;
    let totalTax = 0;
    // IRC §72(t) / §223(f)(4) / §530(d)(4) additional taxes accrued this
    // year. Tracked separately so we can surface it on the snapshot, then
    // folded into totalTax for the cash payment. Seeded with any deferred
    // penalty from prior year's after-tax operations.
    let earlyPenalty = deferredEarlyPenalty;
    deferredEarlyPenalty = 0;

    // Step 7-12: Spending, withdrawals, taxes
    if (isRetired) {
      // Snap retirement-day balance the first year we're retired. Store it in
      // real (sim-start) dollars by dividing by the running cumulative
      // inflation, so strategies that reapply `state.cumulativeInflation`
      // (e.g. Bengen) end up at the right nominal spending level.
      if (age === config.retirementAge && retirementBalance === 0) {
        retirementBalance = totalBalance(accounts) / cumulativeInflation;
      }

      // Base expenses (inflation-indexed from the expense's baseAge).
      // Healthcare expenses get an additional 2× CPI bump for ages 85+ to
      // approximate the late-life medical / long-term-care surge.
      const expenseList = config.expenseByAge.get(age) ?? [];
      let baseExpenses = 0;
      for (const exp of expenseList) {
        // exp.amount is already inflation-baked at precompute time (includes
        // the healthcare 2× CPI bump for ages 85+). Expense inflation uses
        // the user's expected expense growth rate, not the per-iteration
        // stochastic Monte Carlo inflation, so this is fully deterministic.
        baseExpenses += exp.amount;
      }

      // Strategy-driven spending target
      const balance = totalBalance(accounts);
      // Risk stats are only consumed by `risk_based` and `vpw` strategies.
      // For everything else (Bengen / Guyton-Klinger / Vanguard / RMD / ARVA /
      // Kitces) the fields go unread, so skip the per-year recompute.
      const stratType = config.withdrawalStrategy.type;
      const needsRiskStats = stratType === "risk_based" || stratType === "vpw";
      let expR = 0;
      let volR = 0;
      let eqW = 0;
      if (needsRiskStats) {
        const riskStats = computePortfolioRiskStats(
          accounts,
          config.simulationConfig.capitalMarketAssumptions,
        );
        expR = riskStats.expectedReturn;
        volR = riskStats.volatility;
        eqW = riskStats.equityWeight;
      }
      const withdrawalState: WithdrawalState = {
        initialTotalBalance: initialBalance,
        retirementBalance,
        priorYearSpending,
        priorYearReturn,
        cumulativeInflation,
        currentYearInflation: annualInflation,
        yearsInRetirement: age - config.retirementAge,
        currentAge: age,
        endAge: config.endAge,
        priorYearWithdrawalRate: balance > 0 ? priorYearSpending / balance : 0,
        portfolioExpectedReturn: expR,
        portfolioVolatility: volR,
        portfolioEquityWeight: eqW,
      };

      let strategySpending = computeAnnualSpending(balance, withdrawalState, config.withdrawalStrategy);

      // Apply Blanchett spending smile if enabled
      if (config.withdrawalStrategy.useSpendingSmile) {
        const smile = blanchettSpendingMultiplier(age, config.retirementAge);
        strategySpending *= smile;
        baseExpenses *= smile;
      }

      // When the user has listed expenses, those ARE the spending plan, and
      // the strategy is then a sustainability test against the plan, not a
      // floor that forces overspending. (Bengen 4% on a fat portfolio used to
      // pin target ~3× higher than expenses, creating a fake "retirement-day
      // jump" in the cash-flow chart.) Without listed expenses, the strategy
      // drives.
      targetSpending = baseExpenses > 0 ? baseExpenses : strategySpending;

      // Step 8: Net spending need after non-investment income and RMDs
      const cashFromIncome = totalIncome + totalRMD;
      let netNeed = Math.max(0, targetSpending - cashFromIncome);
      // Excess cash beyond spending need (e.g. RMD > spending) flows to a
      // taxable cash account if one exists; otherwise it's effectively
      // consumed as discretionary.
      const surplusFromIncome = Math.max(0, cashFromIncome - targetSpending);

      // Step 9: Execute withdrawals by ordering strategy
      let remaining = netNeed;
      // `withdrawalOrderAccounts` is pre-sorted at iteration start; balance>0
      // is checked inside the loop so we don't re-allocate per year-step.
      const withdrawalOrder = withdrawalOrderAccounts;

      // For "bracket_filling", limit Traditional withdrawals so post-tax
      // ordinary income stays inside the target bracket (e.g. 12% / 22%).
      // Cook/Meyer/Reichenstein 2015, Kitces. Without the cap, this strategy
      // collapses into "Traditional first", exactly what it's meant to avoid.
      let traditionalCap: Dollars | null = null;
      if (config.withdrawalOrder.type === "bracket_filling") {
        const filingStatus = currentlyMarried ? "married_filing_jointly" : "single";
        // Use computeStandardDeduction so the cap honors the age-65 additional
        // deduction and OBBBA senior bonus. MAGI estimate uses the income
        // accumulated so far this year (best available before withdrawal).
        const magiEstimate = ordinaryIncome + ltcg + ssIncome;
        const standardDeduction = computeStandardDeduction(
          filingStatus,
          age,
          effectiveSpouseAge,
          year,
          cumulativeInflation,
          magiEstimate,
        );
        const targetBracketTop = getTargetBracketIncome(
          config.withdrawalOrder.bracketFillingTargetBracket,
          cumulativeInflation,
          currentlyMarried,
        );
        const taxableOrdinarySoFar = Math.max(0, ordinaryIncome - standardDeduction);
        traditionalCap = Math.max(0, targetBracketTop - taxableOrdinarySoFar);
      }

      // Drain virtual cash first. It's stable, untaxed cash on hand from
      // prior surpluses with no eligible account.
      if (remaining > 0 && virtualCash > 0) {
        const fromCash = Math.min(remaining, virtualCash);
        virtualCash -= fromCash;
        remaining -= fromCash;
        withdrawals += fromCash;
      }

      for (const acct of withdrawalOrder) {
        if (remaining <= 0) break;
        if (acct.balance <= 0) continue;
        let available = acct.balance;
        // Bracket-filling: clamp Traditional withdrawals at the per-year cap.
        if (traditionalCap !== null && isTraditional(acct.type)) {
          available = Math.min(available, traditionalCap);
        }
        const withdraw = Math.min(remaining, available);
        if (withdraw <= 0) continue;

        acct.balance -= withdraw;
        remaining -= withdraw;
        withdrawals += withdraw;

        applyWithdrawalTaxImpact(acct, withdraw, age, spouseAge, config, txAccum);
        ordinaryIncome += txAccum.ordinary;
        ltcg += txAccum.ltcg;
        earlyPenalty += txAccum.penalty;
        if (traditionalCap !== null && isTraditional(acct.type)) {
          traditionalCap -= withdraw;
        }
      }

      // Bracket-filling fallback: if Traditional was capped and we still need
      // cash, drain Roth to make up the residual (Roth is the last resort
      // since pulling it loses tax-free growth).
      if (remaining > 0 && config.withdrawalOrder.type === "bracket_filling") {
        for (const acct of accounts) {
          if (remaining <= 0) break;
          if (!isRoth(acct.type)) continue;
          const available = Math.max(0, acct.balance);
          const withdraw = Math.min(remaining, available);
          if (withdraw <= 0) continue;
          acct.balance -= withdraw;
          remaining -= withdraw;
          withdrawals += withdraw;
          applyWithdrawalTaxImpact(acct, withdraw, age, spouseAge, config, txAccum);
          ordinaryIncome += txAccum.ordinary;
          ltcg += txAccum.ltcg;
          earlyPenalty += txAccum.penalty;
        }
      }

      actualSpending = targetSpending - remaining;

      // Track spending cuts. If portfolio depletes mid-year and we couldn't
      // meet target, treat remaining shortfall as up to a 100% cut; otherwise
      // the percentage cut.
      if (targetSpending > 0 && actualSpending < targetSpending) {
        const cutPct = 1 - actualSpending / targetSpending;
        maxSpendingCut = Math.max(maxSpendingCut, cutPct);
      }

      // Step 10: Optional Roth conversion (compares against TAXABLE income,
      // not gross, so subtract standard deduction first). Pulls across ALL
      // Traditional accounts until conversion room is exhausted; if the user
      // has no Roth account, skip rather than burn Traditional balance into
      // phantom income.
      if (config.withdrawalOrder.rothConversionEnabled) {
        const rothAcct = accounts.find((a) => isRoth(a.type));
        if (rothAcct) {
          const filingStatus = currentlyMarried ? "married_filing_jointly" : "single";
          const magiEstimate = ordinaryIncome + ltcg + ssIncome;
          const standardDeduction = computeStandardDeduction(
            filingStatus,
            age,
            effectiveSpouseAge,
            year,
            cumulativeInflation,
            magiEstimate,
          );
          const currentTaxableOrdinary = Math.max(0, ordinaryIncome - standardDeduction);
          const targetBracketTopTaxable = getTargetBracketIncome(
            config.withdrawalOrder.rothConversionTargetBracket,
            cumulativeInflation,
            currentlyMarried,
          );
          let conversionRoom = Math.max(0, targetBracketTopTaxable - currentTaxableOrdinary);
          for (const acct of accounts) {
            if (conversionRoom <= 0) break;
            if (!isTraditional(acct.type) || acct.balance <= 0) continue;
            const convert = Math.min(conversionRoom, acct.balance);
            acct.balance -= convert;
            rothAcct.balance += convert;
            // Conversions are taxed as ordinary income now, then become Roth
            // basis recoverable tax/penalty-free. (We elide the per-conversion
            // 5-year rule. Most users hold conversions ≥ 5 years before any
            // withdrawal, and tracking each conversion's age is overkill for
            // a planning sim.)
            rothAcct.costBasis += convert;
            rothConversion += convert;
            ordinaryIncome += convert;
            conversionRoom -= convert;
          }
        }
      }

      // Step 11: Compute federal + simplified state tax on this year's income
      const taxResult = computeFederalTax({
        ordinaryIncome,
        longTermCapGains: ltcg,
        ssIncome,
        filingStatus: currentlyMarried ? "married_filing_jointly" : "single",
        selfAge: age,
        spouseAge: effectiveSpouseAge,
        year,
        cumulativeInflation,
        stateOfResidence: config.stateOfResidence,
      });
      // Add early-withdrawal additional taxes accrued during this year's
      // withdrawals (IRC §72(t) / §223(f)(4) / §530(d)(4)). They're paid out
      // of the same cash flow as regular tax.
      totalTax = taxResult.federalTax + taxResult.stateTax + earlyPenalty;

      // Pay tax: prefer to use surplus cash from income/RMDs first (it's
      // already on hand and prevents an extra taxable-account liquidation).
      let taxRemaining = Math.max(0, totalTax - surplusFromIncome);
      // What's left of the income surplus after taxes goes to cash sink.
      const cashAfterTax = Math.max(0, surplusFromIncome - totalTax);
      const sink = selectCashSink(accounts);
      if (cashAfterTax > 0) {
        if (sink) depositToAccount(sink, cashAfterTax);
        else virtualCash += cashAfterTax;
      }

      // First absorb any tax from the virtual cash bucket. It's the most
      // liquid source and avoids creating a deferred LTCG event.
      if (taxRemaining > 0 && virtualCash > 0) {
        const fromCash = Math.min(taxRemaining, virtualCash);
        virtualCash -= fromCash;
        taxRemaining -= fromCash;
      }

      // Tax-pay liquidation: drains brokerage → fixed-interest (excluding
      // i_bonds) → Roth → Traditional. Tax/penalty consequences of these
      // liquidations land in next year's tax computation (we already finished
      // this year's). Pre-sorted at iteration start as `taxPayOrderAccounts`.
      const taxPayOrder = taxPayOrderAccounts;
      for (const acct of taxPayOrder) {
        if (taxRemaining <= 0) break;
        if (acct.balance <= 0) continue;
        const pay = Math.min(taxRemaining, acct.balance);
        acct.balance -= pay;
        taxRemaining -= pay;
        applyWithdrawalTaxImpact(acct, pay, age, effectiveSpouseAge, config, txAccum);
        deferredOrdinaryIncome += txAccum.ordinary;
        deferredLTCG += txAccum.ltcg;
        deferredEarlyPenalty += txAccum.penalty;
      }
    } else {
      // ─── Pre-retirement: tax wages, route net savings to a cash sink ───
      const filingStatus = currentlyMarried ? "married_filing_jointly" : "single";
      // FICA: OASDI (6.2%) on wages up to the SS wage base (indexed annually,
      // here treated as today's-dollar cap × cumulativeInflation), plus
      // Medicare (1.45%) uncapped. Each worker has their own wage base, so
      // dual-earner couples cap per spouse, not on combined household wages.
      // Pension/rental/non-wage taxable income is excluded. Additional Medicare
      // Tax (0.9% above MAGI thresholds) is not modeled.
      const wageBase = SS_WAGE_BASE_2026 * cumulativeInflation;
      const totalWages = selfWages + spouseWages;
      const ficaTax =
        Math.min(selfWages, wageBase) * OASDI_RATE +
        Math.min(spouseWages, wageBase) * OASDI_RATE +
        totalWages * MEDICARE_RATE;

      const taxResult = computeFederalTax({
        ordinaryIncome,
        longTermCapGains: 0,
        ssIncome: 0,
        filingStatus,
        selfAge: age,
        spouseAge: effectiveSpouseAge,
        year,
        cumulativeInflation,
        stateOfResidence: config.stateOfResidence,
      });
      totalTax = taxResult.federalTax + taxResult.stateTax + ficaTax;

      // Pre-retirement expenses (if user specified any starting before retirement).
      // exp.amount is already inflation-baked at precompute time.
      const expenseList = config.expenseByAge.get(age) ?? [];
      let preRetExpenses = 0;
      for (const exp of expenseList) {
        preRetExpenses += exp.amount;
      }
      preRetExpensesThisYear = preRetExpenses;

      // Take-home cash after tax. ALL employee contributions (Traditional,
      // Roth, Brokerage, HSA, 529, HYSA, etc.) were already credited to their
      // accounts in the contribution step, but the cash to fund them came from
      // the user's paycheck. Subtract every employee contribution here so the
      // surplus represents only what's left to fund pre-retirement expenses.
      // Employer match comes from outside the paycheck, so it's excluded.
      // (Tracked alongside the contribution loop in Step 6 to avoid a second
      // walk over the accounts array.)
      const takeHome = Math.max(0, totalIncome - totalTax - totalEmployeeContributions);
      const surplus = takeHome - preRetExpenses;

      // Pre-retirement surplus is treated as discretionary lifestyle spending;
      // explicit contributions are the only modeled savings. Deficits still
      // pull from cash (the user defined an expense they need to fund).
      if (surplus < 0) {
        let gap = -surplus;
        const sink = selectCashSink(accounts);
        if (virtualCash > 0) {
          const fromCash = Math.min(gap, virtualCash);
          virtualCash -= fromCash;
          gap -= fromCash;
        }
        if (gap > 0 && sink && sink.balance > 0) {
          const fromSink = Math.min(gap, sink.balance);
          sink.balance -= fromSink;
          if (isBrokerage(sink.type)) {
            const preBalance = sink.balance + fromSink;
            const gainRatio = preBalance > 0 ? Math.max(0, 1 - sink.costBasis / preBalance) : 1.0;
            sink.costBasis = Math.max(0, sink.costBasis - fromSink * (1 - gainRatio));
            // Realized gain rolls into next year's LTCG so it gets taxed.
            deferredLTCG += fromSink * gainRatio;
          }
        }
      }

      // Pre-retirement "spending" reported in snapshots stays at 0. These
      // are accumulation-phase living expenses that don't affect retirement-
      // spend metrics; tax is reported separately so cash-flow viz still works.
    }

    // Step 12: Apply investment returns to non-fixed-interest accounts.
    // Convention: returns apply to the post-contribution, post-withdrawal,
    // post-conversion, post-tax balance (i.e. only dollars that remain in
    // the account at year-end accrue returns). Withdrawn dollars do NOT earn
    // returns (they were subtracted at Steps 5/9/10/11 before this step), so
    // there is no "phantom growth" on money that already left the portfolio.
    // This is the standard end-of-year convention; symmetrically, contributions
    // were added before this step so they do earn a full year of return.
    let portfolioReturn = 0;
    for (let ai = 0; ai < accounts.length; ai++) {
      const acct = accounts[ai];
      if (acct.balance <= 0) continue;
      if (isFixedInterest(acct.type)) continue;
      const prevBal = acct.balance;
      if (acct.fixedAnnualReturn != null) {
        acct.balance *= 1 + acct.fixedAnnualReturn;
      } else {
        acct.balance = applyReturnsToBalance(acct.balance, allocationsThisYear[ai][yearIdx], returns);
      }
      portfolioReturn += acct.balance - prevBal;
    }

    if (isRetired) {
      const totalAfter = totalBalance(accounts);
      const preReturnBalance = totalAfter - portfolioReturn;
      // Require a meaningful pre-return balance before computing a return
      // ratio. If the portfolio is essentially depleted, the dollar return is
      // tiny but the ratio explodes, so surface 0 in that case. That way
      // downstream consumers (Guyton-Klinger COLA-skip rule, tooltips,
      // exports) don't see garbage like 5,000% returns.
      priorYearReturn = preReturnBalance >= 1000 ? portfolioReturn / preReturnBalance : 0;
      priorYearSpending = actualSpending;
    }
    // Note: priorYearSpending stays at 0 throughout pre-retirement and is
    // first written here in the first retirement year. Dynamic strategies
    // (Vanguard, GK, Risk-Based, Kitces) all branch on yearsInRetirement === 0
    // (or priorYearSpending <= 0) to use the initial-rate fallback, so they
    // anchor cleanly to the retirement-day balance rather than carrying any
    // pre-retirement expense level forward as a "prior" spending number
    // (which would be a meaningless mix of mortgage, daycare, etc.).

    // Step 13: Apply life event impacts (one-time inflows/outflows are entered
    // in today's-dollars and inflated to current nominal dollars).
    const events = config.lifeEventsByAge.get(age);
    if (events) {
      for (const event of events) {
        const impact = event.financialImpact;
        if (impact.oneTimeInflow > 0) {
          const inflowNominal = impact.oneTimeInflow * cumulativeInflation;
          const target = impact.targetAccountId
            ? accounts.find((a) => a.id === impact.targetAccountId)
            : (selectCashSink(accounts) ?? accounts[0]);
          if (target) depositToAccount(target, inflowNominal);
        }
        if (impact.oneTimeOutflow > 0) {
          let outflowRemaining = impact.oneTimeOutflow * cumulativeInflation;
          // Tax/penalty consequences land in *next* year's tax computation
          // (this step runs after this year's tax has already been paid).
          // If the user pinned the outflow to a specific account, draw from
          // that one first (matches the inflow behavior). Otherwise use the
          // standard drain order pre-sorted at iteration start.
          if (impact.targetAccountId) {
            const target = accounts.find((a) => a.id === impact.targetAccountId);
            if (target && target.balance > 0) {
              const pay = Math.min(outflowRemaining, target.balance);
              target.balance -= pay;
              outflowRemaining -= pay;
              applyWithdrawalTaxImpact(target, pay, age, effectiveSpouseAge, config, txAccum);
              deferredOrdinaryIncome += txAccum.ordinary;
              deferredLTCG += txAccum.ltcg;
              deferredEarlyPenalty += txAccum.penalty;
            }
          }
          // Cash-sink-preferred order, then traditional, then Roth.
          if (outflowRemaining > 0 && virtualCash > 0) {
            const fromCash = Math.min(outflowRemaining, virtualCash);
            virtualCash -= fromCash;
            outflowRemaining -= fromCash;
          }
          for (const acct of lifeEventDrainOrderAccounts) {
            if (outflowRemaining <= 0) break;
            if (acct.balance <= 0) continue;
            const pay = Math.min(outflowRemaining, acct.balance);
            acct.balance -= pay;
            outflowRemaining -= pay;
            applyWithdrawalTaxImpact(acct, pay, age, effectiveSpouseAge, config, txAccum);
            deferredOrdinaryIncome += txAccum.ordinary;
            deferredLTCG += txAccum.ltcg;
            deferredEarlyPenalty += txAccum.penalty;
          }
        }
      }
    }

    // Step 14: Snapshot
    const currentTotal = totalBalance(accounts) + virtualCash;
    // Float64Array indexed by account position. Order matches
    // config.initialAccounts (preserved by cloneAccounts). Aggregation maps
    // positions → UUIDs once, not per-snapshot.
    const accountBalances = new Float64Array(accounts.length);
    for (let i = 0; i < accounts.length; i++) {
      accountBalances[i] = accounts[i].balance;
    }

    snapshots.push({
      age,
      year,
      totalWealth: currentTotal,
      totalIncome,
      // Report pre-retirement living expenses too. Without this, the cash-flow
      // visualizations and reports show $0 spending in accumulation years even
      // when the user provided expenses that started before retirement.
      totalSpending: isRetired ? actualSpending : preRetExpensesThisYear,
      totalTax,
      earlyWithdrawalPenalty: earlyPenalty,
      ssIncome,
      withdrawals,
      contributions: totalContributions,
      rmdAmount: totalRMD,
      rothConversion,
      accountBalances,
      isRuined: currentTotal <= 0 && isRetired,
    });

    // Step 15: Ruin check (only meaningful in retirement)
    if (isRetired && currentTotal <= 0 && !isRuined) {
      isRuined = true;
      depletionAge = age;
      // Bump max cut to 100% if depleted with unmet need
      maxSpendingCut = Math.max(maxSpendingCut, 1.0);
    }

    // End-of-year: roll the cumulative inflation forward so next year's
    // today's-dollar inputs are inflated by one year.
    cumulativeInflation *= 1 + annualInflation;

    // Step 16: Mortality check at year-end. Convention: a person determined
    // to die "during age X" is treated as alive for all of age X's cash flows
    // (wages, SS, withdrawals, RMDs, contributions, returns) and dead from
    // age X+1 onward. This matches the IRS year-of-death convention (filing
    // status stays MFJ for the year someone dies). For couples the spending
    // impact of an individual's death is small because the surviving spouse
    // continues to draw from the household; for single-person scenarios this
    // optimistically assumes a full year of withdrawals on the deceased's
    // accounts, which becomes terminal-wealth distribution noise.
    if (useStochasticMortality) {
      const mortalityTable = config.simulationConfig.mortalityTable;
      if (
        selfAlive &&
        !survivesYear(age, config.selfSex, useImprovement ? yearsSinceStart : 0, rng, mortalityTable)
      ) {
        selfAlive = false;
      }
      if (
        spouseAlive &&
        spouseAge !== null &&
        config.spouseSex !== null &&
        !survivesYear(spouseAge, config.spouseSex, useImprovement ? yearsSinceStart : 0, rng, mortalityTable)
      ) {
        spouseAlive = false;
        // Survivor SS benefit step-up (IRC §202(b)): capture the deceased's
        // SS person params so future years can pay the survivor the higher
        // of own vs survivor benefit. Carry forward spouseColaMultiplier so
        // the survivor benefit picks up where the deceased's PIA left off.
        if (config.ssConfig.spouse) {
          deceasedSpouse = config.ssConfig.spouse;
          survivorColaMultiplier = spouseColaMultiplier;
        }
        // Surviving-spouse rollover: a surviving spouse can treat inherited
        // IRAs / 401(k)s as their own (IRC §408(d)(3)(C); SECURE Act 2.0
        // generally exempts surviving spouses from the 10-year rule). We
        // simplify by transferring ownership to "self" so future RMDs use
        // self's age, §72(t) penalties use self's birth month, and the
        // withdrawal/contribution loops stop skipping the account. We do
        // NOT model the limited Inherited-IRA election to delay RMDs.
        if (selfAlive) {
          for (const acct of accounts) {
            if (acct.owner === "spouse") acct.owner = "self";
          }
        }
      }
      if (!selfAlive && !spouseAlive) break;
    }
  }

  return {
    snapshots,
    terminalWealth: isRuined ? 0 : totalBalance(accounts) + virtualCash,
    depletionAge,
    maxSpendingCut,
  };
}

export function runSimulation(
  scenario: Scenario,
  onProgress?: (completed: number, total: number) => void,
): SimulationResult {
  const startTime = performance.now();
  const config = precompute(scenario);
  const iterations = config.simulationConfig.iterations;
  const baseSeed = config.simulationConfig.seed ?? SEED_FALLBACK;

  const allResults: IterationResult[] = [];

  for (let i = 0; i < iterations; i++) {
    // Seed each iteration independently. Sharing a single PRNG across
    // iterations couples them through residual state (e.g. the unconsumed
    // Marsaglia-polar Gaussian carry between calls), which leaks structure
    // when stochastic mortality terminates iterations at different lengths.
    // Per-iteration seeding also makes any iteration reproducible standalone.
    const rng = new PRNG((baseSeed + Math.imul(i, 0x9e3779b9)) >>> 0);
    allResults.push(runIteration({ config, rng }));

    if (onProgress && (i + 1) % 500 === 0) {
      onProgress(i + 1, iterations);
    }
  }

  const durationMs = performance.now() - startTime;
  const result = aggregateResults(scenario.id, allResults, config, scenario.simulationConfig, durationMs);
  result.estimatedRetirementAge = estimateEarliestRetirementAge(scenario, runIteration);
  return result;
}

// ─── Parallel-execution helpers ────────────────────────────────────────────
// The browser runtime (useSimulation) splits the iteration work across a pool
// of N web workers, then aggregates. These two exports are the seams the pool
// needs. Single-threaded callers continue to use `runSimulation` above.

export interface PartialIterationsResult {
  results: IterationResult[];
  durationMs: number;
}

// Run `count` iterations against `scenario` with the given seed. No
// aggregation, no retirement-age estimation. Each pool worker calls this with
// `seed = baseSeed + workerIdx`, so two workers with the same baseSeed and
// the same partition produce the same iteration set as a single-threaded run
// with that partition's seed offset.
export function runIterations(
  scenario: Scenario,
  count: number,
  seed: number,
  onProgress?: (completed: number) => void,
): PartialIterationsResult {
  const startTime = performance.now();
  const config = precompute(scenario);
  const results: IterationResult[] = new Array(count);
  for (let i = 0; i < count; i++) {
    // Per-iteration seeding (see runSimulation for rationale).
    const rng = new PRNG((seed + Math.imul(i, 0x9e3779b9)) >>> 0);
    results[i] = runIteration({ config, rng });
    if (onProgress && (i + 1) % 500 === 0) onProgress(i + 1);
  }
  return { results, durationMs: performance.now() - startTime };
}

// Combine partial iteration sets from multiple workers into the final
// SimulationResult. Runs `aggregateResults` and the retirement-age search.
// `durationMs` is the wall-clock time the user actually waited (measured by
// the orchestrator), not the sum of per-worker compute times.
export function aggregateAcrossWorkers(
  scenario: Scenario,
  partials: IterationResult[][],
  durationMs: number,
): SimulationResult {
  const config = precompute(scenario);
  const merged: IterationResult[] = [];
  for (const part of partials) {
    for (const iter of part) merged.push(iter);
  }
  const result = aggregateResults(scenario.id, merged, config, scenario.simulationConfig, durationMs);
  result.estimatedRetirementAge = estimateEarliestRetirementAge(scenario, runIteration);
  return result;
}

// ─── Packed (transferable) variants ───────────────────────────────────────
// Worker entry / aggregator counterparts to runIterations / aggregateAcrossWorkers
// that use packed Float64/Int32 buffers (transferList-friendly). Buffer
// allocation, packing, and `.buffer` extraction live in `./packed`; here we
// just compose them with the year-loop runner.

// Pool-worker entry: run `count` iterations and pack the results into a
// transferable PackedIterations. Sized once up front from the precomputed
// numYears / numAccounts so we don't grow buffers mid-run.
export function runIterationsPacked(
  scenario: Scenario,
  count: number,
  seed: number,
  onProgress?: (completed: number) => void,
): { packed: PackedIterations; durationMs: number } {
  const startTime = performance.now();
  const { results } = runIterations(scenario, count, seed, onProgress);
  const config = precompute(scenario);
  const numYears = config.endAge - config.startAge + 1;
  const numAccounts = config.initialAccounts.length;
  const packed = packIterations(results, numYears, numAccounts);
  return { packed, durationMs: performance.now() - startTime };
}

// Aggregator that reads directly from PackedIterations[] without ever
// materializing IterationResult objects. Same percentile math as
// `aggregateResults`, just with positional reads.
export function aggregateAcrossWorkersPacked(
  scenario: Scenario,
  batches: PackedIterations[],
  durationMs: number,
): SimulationResult {
  const config = precompute(scenario);
  const result = aggregatePackedBatches(scenario.id, batches, config, scenario.simulationConfig, durationMs);
  result.estimatedRetirementAge = estimateEarliestRetirementAge(scenario, runIteration);
  return result;
}
