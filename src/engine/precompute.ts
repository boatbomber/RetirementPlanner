import type { Age, Dollars, UUID, Year } from "@/models/core";
import type { Scenario } from "@/models/scenario";
import type { IncomeSource, IncomeType } from "@/models/income";
import type { LifeEvent } from "@/models/life-event";
import type { AccountState, PrecomputedConfig, PrecomputedIncome, PrecomputedExpense } from "./types";
import { buildCorrelationMatrix, choleskyDecompositionWithDiagnostic } from "./returns";
import { interpolateGlidePath } from "./glide-path";
import type { AssetAllocation } from "@/models/account";

const WAGE_LIKE_INCOME_TYPES = new Set<IncomeType>(["salary", "self_employment", "bonus", "part_time"]);

export function precompute(scenario: Scenario, referenceYear?: Year): PrecomputedConfig {
  const { profile, simulationConfig } = scenario;
  const cma = simulationConfig.capitalMarketAssumptions;

  const currentYear = referenceYear ?? new Date().getFullYear();
  const currentAge = currentYear - profile.birthYear;
  // Always start the simulation at the user's *current* age. For already-
  // retired users (currentAge >= retirementAge) this is critical. Using the
  // configured retirement age would silently roll the simulation back in time
  // and mis-state balances by however many years have passed.
  const startAge = Math.max(20, currentAge);
  // Under stochastic_mortality the year-loop breaks as soon as both members
  // of the household are dead, so the configured upper bound just sets the
  // ceiling for tail draws. Capping at planningHorizonAge (default 95) would
  // truncate the right tail of the Gompertz distribution (modal age 87.5-91.5,
  // dispersion ~9), silently understating longevity risk. Clamp to a floor
  // of 110 so the rare long-lived paths the model is meant to draw actually
  // run to completion.
  const endAge =
    simulationConfig.longevityModel === "fixed_age"
      ? simulationConfig.fixedEndAge
      : simulationConfig.longevityModel === "stochastic_mortality"
        ? Math.max(profile.planningHorizonAge, 110)
        : profile.planningHorizonAge;
  const startYear = profile.birthYear + startAge;

  const corrLow = buildCorrelationMatrix(cma, false);
  const corrHigh = buildCorrelationMatrix(cma, true);
  const choleskyLowResult = choleskyDecompositionWithDiagnostic(corrLow);
  const choleskyHighResult = choleskyDecompositionWithDiagnostic(corrHigh);
  const choleskyLow = choleskyLowResult.L;
  const choleskyHigh = choleskyHighResult.L;
  const warnings: string[] = [];
  if (choleskyLowResult.nonPD || choleskyHighResult.nonPD) {
    warnings.push(
      "Asset-class correlation matrix is not positive-definite. A small ridge was added to keep the simulation usable. Results may be slightly biased; review stockBondCorrelationLow/High and per-class CMAs.",
    );
  }
  // Surface the Roth-conversion 5-year rule limitation for FIRE-style users
  // who retire pre-59½ with conversions enabled. The engine doesn't model
  // the 10% §72(t) penalty on conversion principal withdrawn within 5 years
  // of conversion, which can understate tax meaningfully for these paths.
  if (scenario.withdrawalOrder.rothConversionEnabled && profile.retirementAge < 55) {
    warnings.push(
      "Roth conversion ladder before age 55 is not fully modeled. The engine omits the IRC §72(t) 10% penalty on conversion principal withdrawn within 5 years of each conversion, which understates tax in early FIRE-style scenarios.",
    );
  }

  // Build income map with source IDs for life event modification.
  // Effective end age: when `endsAtRetirement` is set, the income stops the
  // year before the owner's retirement age (last working year). Otherwise
  // the explicit endAge applies, falling back to the planning horizon.
  const selfRetAge = profile.retirementAge;
  const spouseRetAge = profile.spouse?.retirementAge ?? profile.retirementAge;
  const incomeByAge = new Map<Age, PrecomputedIncome[]>();
  for (const inc of scenario.incomeSources) {
    const start = inc.startAge;
    const ownerRetAge = inc.owner === "spouse" ? spouseRetAge : selfRetAge;
    const end = inc.endsAtRetirement ? ownerRetAge - 1 : (inc.endAge ?? endAge);
    const isWageLike = WAGE_LIKE_INCOME_TYPES.has(inc.type);
    for (let age = start; age <= end; age++) {
      const list = incomeByAge.get(age) ?? [];
      const yearsFromStart = age - start;
      const growthMultiplier = Math.pow(1 + inc.growthRate, yearsFromStart);
      list.push({
        sourceId: inc.id,
        amount: inc.annualAmount * growthMultiplier,
        taxable: inc.taxable,
        owner: inc.owner,
        inflationAdjusted: inc.inflationAdjusted,
        isWageLike,
      });
      incomeByAge.set(age, list);
    }
  }

  // Build expense map with IDs for life event modification.
  // Expenses are entered in today's dollars (i.e., dollars at sim start age),
  // so baseAge = startAge. Life-event-added expenses reset baseAge to the
  // event trigger age so they're inflated from when they begin.
  //
  // We pre-bake the year-specific inflation multiplier (Math.pow(1+r, yrs)
  // plus the healthcare 2× CPI bump for ages 85+) into each per-age entry's
  // `amount` field. Expense amounts use the user's expected expense growth
  // rate (NOT the per-iteration stochastic inflation), so this is fully
  // deterministic and saves ~3M Math.pow calls per 10k-iter run.
  const expenseByAge = new Map<Age, PrecomputedExpense[]>();
  const fixedInflationRate = simulationConfig.fixedInflationRate;
  for (const exp of scenario.expenses) {
    const start = exp.startAge;
    const end = exp.endAge ?? endAge;
    const baseRate = exp.inflationRate != null ? exp.inflationRate : fixedInflationRate;
    for (let age = start; age <= end; age++) {
      const mult = expenseInflationMult(age, startAge, baseRate, exp.category);
      const list = expenseByAge.get(age) ?? [];
      list.push({
        expenseId: exp.id,
        amount: exp.annualAmount * mult,
        inflationRate: exp.inflationRate,
        baseAge: startAge,
        category: exp.category,
      });
      expenseByAge.set(age, list);
    }
  }

  // Spread life events with duration across multiple ages
  const lifeEventsByAge = new Map<Age, LifeEvent[]>();
  for (const event of scenario.lifeEvents) {
    if (event.durationYears != null && event.durationYears > 1) {
      for (let y = 0; y < event.durationYears; y++) {
        const age = event.triggerAge + y;
        if (age > endAge) break;
        const list = lifeEventsByAge.get(age) ?? [];
        list.push(event);
        lifeEventsByAge.set(age, list);
      }
    } else {
      const list = lifeEventsByAge.get(event.triggerAge) ?? [];
      list.push(event);
      lifeEventsByAge.set(event.triggerAge, list);
    }
  }

  // Build contribution overrides map
  const contributionOverridesByAge = new Map<Age, Map<UUID, Dollars>>();

  // Process life event income/expense/contribution changes
  for (const event of scenario.lifeEvents) {
    const eventStart = event.triggerAge;
    const eventEnd = event.durationYears != null ? eventStart + event.durationYears - 1 : endAge;

    applyIncomeChanges(event, eventStart, eventEnd, incomeByAge, scenario.incomeSources, endAge);
    applyExpenseChanges(event, eventStart, eventEnd, expenseByAge, fixedInflationRate);
    applyContributionChanges(event, eventStart, eventEnd, contributionOverridesByAge);
  }

  const initialAccounts: AccountState[] = scenario.accounts.map((a) => {
    // Default cost basis = balance for accounts where the basis represents
    // "money the user has already paid in" (and the user almost certainly
    // doesn't track basis manually):
    //   - I-Bonds: principal already paid for (only future growth is taxable
    //     interest).
    //   - Roth IRA / Roth 401(k): existing balances are predominantly
    //     contributions + conversions (basis), not earnings. Without this
    //     default, early Roth withdrawals would all be treated as taxable
    //     earnings + §72(t) penalty.
    //   - 529: existing balances are predominantly contributions.
    // Brokerage stays at the user-supplied basis (0 is a meaningful "pure
    // gain" signal there). Traditional / HSA accounts have effective basis
    // of 0 for tax purposes (contributions were deducted), so they don't
    // need this defaulting.
    const basisDefaultsToBalance =
      a.type === "i_bonds" || a.type === "roth_ira" || a.type === "roth_401k" || a.type === "529";
    const costBasis = basisDefaultsToBalance && a.costBasis === 0 ? a.balance : a.costBasis;
    return {
      id: a.id,
      owner: a.owner,
      type: a.type,
      balance: a.balance,
      costBasis,
      annualContribution: a.annualContribution,
      employerMatch: a.employerMatch,
      contributionEndAge: a.contributionEndAge,
      // allocation, baseAllocation, glidePath are read-only after this point.
      // We share references across all iterations rather than deep-cloning;
      // the runtime engine looks up year-current allocation via the
      // precomputed `allocationsByAccountAge` table below.
      allocation: a.allocation,
      baseAllocation: a.allocation,
      useGlidePath: a.useGlidePath,
      glidePath: a.glidePath.slice().sort((p1, p2) => p1.age - p2.age),
      fixedAnnualReturn: a.fixedAnnualReturn,
    };
  });

  // Precompute the per-(account, year) allocation by interpolating the glide
  // path once. Removes ~6 × ~70 = ~420 interpolations per iteration, ~4M
  // across a 10k-iter run. allocationsByAccountAge[accountIdx][y] is the
  // AssetAllocation to use at age (startAge + y).
  const allocationsByAccountAge: AssetAllocation[][] = initialAccounts.map((acct) => {
    const out: AssetAllocation[] = new Array(endAge - startAge + 1);
    for (let y = 0; y <= endAge - startAge; y++) {
      const age = startAge + y;
      out[y] =
        acct.useGlidePath && acct.glidePath.length > 0
          ? interpolateGlidePath(age, acct.glidePath, acct.baseAllocation)
          : acct.baseAllocation;
    }
    return out;
  });

  return {
    startAge,
    endAge,
    startYear,
    birthYear: profile.birthYear,
    retirementAge: profile.retirementAge,
    spouseRetirementAge: profile.spouse?.retirementAge ?? null,
    isMarried: profile.filingStatus === "married_filing_jointly",
    selfSex: profile.sex,
    spouseSex: profile.spouse?.sex ?? null,
    spouseBirthYear: profile.spouse?.birthYear ?? null,
    selfBirthMonth: profile.birthMonth,
    spouseBirthMonth: profile.spouse?.birthMonth ?? null,
    choleskyLow,
    choleskyHigh,
    incomeByAge,
    expenseByAge,
    contributionOverridesByAge,
    lifeEventsByAge,
    initialAccounts,
    allocationsByAccountAge,
    ssConfig: scenario.socialSecurity,
    withdrawalStrategy: scenario.withdrawalStrategy,
    withdrawalOrder: scenario.withdrawalOrder,
    simulationConfig,
    warnings,
    stateOfResidence: profile.stateOfResidence,
  };
}

function applyIncomeChanges(
  event: LifeEvent,
  eventStart: Age,
  eventEnd: Age,
  incomeByAge: Map<Age, PrecomputedIncome[]>,
  incomeSources: IncomeSource[],
  endAge: Age,
): void {
  for (const change of event.financialImpact.incomeChanges) {
    if (change.existingIncomeId) {
      // Modify existing income source for the affected age range
      const original = incomeSources.find((s) => s.id === change.existingIncomeId);
      if (!original) continue;

      const newAmount = change.newIncome.annualAmount ?? original.annualAmount;
      const newGrowthRate = change.newIncome.growthRate ?? original.growthRate;
      const newTaxable = change.newIncome.taxable ?? original.taxable;
      const newInflationAdjusted = change.newIncome.inflationAdjusted ?? original.inflationAdjusted;

      const wageLike = WAGE_LIKE_INCOME_TYPES.has(original.type);
      for (let age = eventStart; age <= Math.min(eventEnd, endAge); age++) {
        const list = incomeByAge.get(age);
        if (!list) continue;

        const idx = list.findIndex((e) => e.sourceId === change.existingIncomeId);
        if (idx !== -1) {
          const yearsFromEventStart = age - eventStart;
          const growthMultiplier = Math.pow(1 + newGrowthRate, yearsFromEventStart);
          list[idx] = {
            sourceId: original.id,
            amount: newAmount * growthMultiplier,
            taxable: newTaxable,
            owner: change.newIncome.owner ?? original.owner,
            inflationAdjusted: newInflationAdjusted,
            isWageLike: wageLike,
          };
        }
      }
    } else if (change.newIncome.annualAmount != null) {
      // Add new income source for the affected age range
      const newId = crypto.randomUUID();
      const amount = change.newIncome.annualAmount;
      const growthRate = change.newIncome.growthRate ?? 0;
      const taxable = change.newIncome.taxable ?? true;
      const owner = change.newIncome.owner ?? "self";
      const inflationAdjusted = change.newIncome.inflationAdjusted ?? true;
      // Life-event income additions don't carry an income type. Treat as
      // wage-like only when the impact looks like work income (taxable + has
      // owner). Conservative default is non-wage so it doesn't get cut off
      // unexpectedly at retirement.
      const isWageLike = false;

      for (let age = eventStart; age <= Math.min(eventEnd, endAge); age++) {
        const list = incomeByAge.get(age) ?? [];
        const yearsFromStart = age - eventStart;
        const growthMultiplier = Math.pow(1 + growthRate, yearsFromStart);
        list.push({
          sourceId: newId,
          amount: amount * growthMultiplier,
          taxable,
          owner,
          inflationAdjusted,
          isWageLike,
        });
        incomeByAge.set(age, list);
      }
    }
  }
}

// Expense inflation multiplier from `baseAge` to `age` at annual `rate`.
// Healthcare expenses receive an additional CPI factor per year past age 85,
// approximating the empirical observation that medical costs accelerate
// faster than headline CPI in late life. The effect is "double-compound".
// e.g. a $100 healthcare cost at base 65, rate 4%, age 90 grows by
// 1.04^25 × 1.04^5 = 1.04^30 ≈ 3.24× rather than 1.04^25 ≈ 2.67×. This is
// not exactly "2× CPI for ages 85+" (which would be 1.08^5 in the late
// segment); the implementation adds one extra CPI factor per year past 85,
// which approximates a 2× rate at small per-year rates but diverges
// slightly above ~5%.
function expenseInflationMult(age: Age, baseAge: Age, rate: number, category: string): number {
  const yrs = age - baseAge;
  let mult = Math.pow(1 + rate, yrs);
  if (category === "healthcare" && age >= 85) {
    mult *= Math.pow(1 + rate, age - 85);
  }
  return mult;
}

function applyExpenseChanges(
  event: LifeEvent,
  eventStart: Age,
  eventEnd: Age,
  expenseByAge: Map<Age, PrecomputedExpense[]>,
  fixedInflationRate: number,
): void {
  for (const change of event.financialImpact.expenseChanges) {
    if (change.existingExpenseId) {
      // Modify existing expense for the affected age range. The override
      // amount is interpreted in dollars of the event-trigger age.
      for (let age = eventStart; age <= eventEnd; age++) {
        const list = expenseByAge.get(age);
        if (!list) continue;

        const idx = list.findIndex((e) => e.expenseId === change.existingExpenseId);
        if (idx !== -1 && change.newExpense.annualAmount != null) {
          const newRate = change.newExpense.inflationRate ?? list[idx].inflationRate ?? fixedInflationRate;
          const mult = expenseInflationMult(age, eventStart, newRate, list[idx].category);
          list[idx] = {
            ...list[idx],
            amount: change.newExpense.annualAmount * mult,
            inflationRate: change.newExpense.inflationRate ?? list[idx].inflationRate,
            baseAge: eventStart,
          };
        }
      }
    } else if (change.newExpense.annualAmount != null) {
      // New expense, denominated in dollars of the event-trigger age
      const newId = crypto.randomUUID();
      const newCategory = change.newExpense.category ?? "discretionary";
      const newRate = change.newExpense.inflationRate ?? fixedInflationRate;
      for (let age = eventStart; age <= eventEnd; age++) {
        const list = expenseByAge.get(age) ?? [];
        const mult = expenseInflationMult(age, eventStart, newRate, newCategory);
        list.push({
          expenseId: newId,
          amount: change.newExpense.annualAmount * mult,
          inflationRate: change.newExpense.inflationRate ?? null,
          baseAge: eventStart,
          category: newCategory,
        });
        expenseByAge.set(age, list);
      }
    }
  }
}

function applyContributionChanges(
  event: LifeEvent,
  eventStart: Age,
  eventEnd: Age,
  contributionOverridesByAge: Map<Age, Map<UUID, Dollars>>,
): void {
  for (const change of event.financialImpact.contributionChanges) {
    for (let age = eventStart; age <= eventEnd; age++) {
      const overrides = contributionOverridesByAge.get(age) ?? new Map<UUID, Dollars>();
      overrides.set(change.accountId, change.newAnnualContribution);
      contributionOverridesByAge.set(age, overrides);
    }
  }
}
