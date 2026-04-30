import type { Age } from "@/models/core";
import type { Scenario } from "@/models/scenario";
import type { IterationResult } from "./types";
import { PRNG } from "./prng";
import { precompute } from "./precompute";
import type { IterationParams } from "./simulation";

// Earliest retirement age the plan supports at >= TARGET_SUCCESS_RATE.
// Binary-searches over retirement age using a small iteration budget. The
// goal is a meaningful estimate, not a primary result. Returns the configured
// retirement age if the search can't find a younger viable age (or no younger
// age is even possible because the user is already past it).
const ESTIMATED_RETIREMENT_TARGET_SUCCESS = 0.85;
const ESTIMATED_RETIREMENT_SEARCH_ITERATIONS = 500;

// `runIter` is dependency-injected to keep this module free of a runtime
// circular import on simulation.ts. The `IterationParams` type import is
// erased at runtime so it does not introduce one.
export function estimateEarliestRetirementAge(
  scenario: Scenario,
  runIter: (params: IterationParams) => IterationResult,
): Age {
  const baseConfig = precompute(scenario);
  const currentAge = baseConfig.startAge;
  const userTarget = baseConfig.retirementAge;
  const horizon = baseConfig.endAge;

  // Search lower bound: the user's current age (can't retire before now).
  // Upper bound: configured retirement age. The user already wants this, so
  // anything earlier-than-or-equal that meets the threshold is the answer.
  const lo = Math.max(currentAge, 50);
  const hi = userTarget;
  if (lo >= hi) return userTarget;

  const seed = scenario.simulationConfig.seed ?? 12345;

  const succeedsAt = (retirementAge: Age): boolean => {
    if (retirementAge >= horizon) return false;
    const trial: Scenario = {
      ...scenario,
      profile: { ...scenario.profile, retirementAge },
    };
    const trialConfig = precompute(trial);
    let successes = 0;
    for (let i = 0; i < ESTIMATED_RETIREMENT_SEARCH_ITERATIONS; i++) {
      // Per-iteration seeding so this trial's outcome is independent of
      // search-path order and reproducible standalone for debugging.
      const rng = new PRNG((seed + Math.imul(i, 0x9e3779b9)) >>> 0);
      const r = runIter({ config: trialConfig, rng });
      if (r.depletionAge === null) successes++;
    }
    return successes / ESTIMATED_RETIREMENT_SEARCH_ITERATIONS >= ESTIMATED_RETIREMENT_TARGET_SUCCESS;
  };

  // Binary search for the smallest retirement age in [lo, hi] that succeeds.
  let l = lo;
  let h = hi;
  let best: Age = userTarget;
  while (l <= h) {
    const mid = Math.floor((l + h) / 2);
    if (succeedsAt(mid)) {
      best = mid;
      h = mid - 1;
    } else {
      l = mid + 1;
    }
  }
  return best;
}
