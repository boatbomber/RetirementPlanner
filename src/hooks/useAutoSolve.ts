import { useEffect, useMemo, useRef } from "react";
import { useAppStore } from "@/store";
import { runOnce } from "./useSimulation";
import { solve, solverFingerprint, type SolveInput } from "@/engine/solver";
import type { Scenario } from "@/models/scenario";
import type { Goal, GoalQuestion } from "@/models/goal";
import type { Dollars, Rate, Age } from "@/models/core";

// Auto-solve runs the two prescriptive questions the dashboard surfaces:
//   Q1 (earliest_retirement_age): "When can the user retire safely?"
//   Q2 (required_savings):        "How much more do they need to save to
//                                  hit their target retirement age?"
// Both targets are derived from the active scenario, no user-editable goal
// form. The dashboard reads the cache directly.
//
// Sequencing: auto-sim and auto-solve share a single worker pool, so we wait
// for the active scenario's sim to reach `complete` (with the matching
// solverFingerprint) before kicking off solver trials. That avoids the solver
// preempting an in-flight sim and showing a transient "Cancelled" error on
// the dashboard.
const QUESTIONS: GoalQuestion[] = ["earliest_retirement_age", "required_savings"];

// Hard-coded confidence target for both auto-solved questions. Industry
// standard for "safe withdrawal" math; user doesn't pick this anymore.
const TARGET_SUCCESS_RATE: Rate = 0.9;

export function useAutoSolve(scenario: Scenario | undefined) {
  const updateScenario = useAppStore((s) => s.updateScenario);
  // Subscribe via primitive selectors so progress updates (a stream of
  // `progress` writes during the sim) don't re-render this hook.
  const simStatus = useAppStore((s) => (scenario ? s.simulations[scenario.id]?.status : undefined));
  const simFingerprint = useAppStore((s) =>
    scenario ? (s.simulations[scenario.id]?.fingerprint ?? null) : null,
  );

  const abortRef = useRef<AbortController | null>(null);

  // Memoized fingerprint prevents recomputation churn on every store update.
  // `expectedFp` is what we'd write back into goal.fingerprint after a fresh
  // solve; if it equals goal.fingerprint we know the cache is up to date.
  const expectedFp = useMemo(() => (scenario ? solverFingerprint(scenario) : null), [scenario]);

  // Targets are derived from the scenario fresh on every solve cycle. If the
  // user has no retirement-period expenses, we can't give a meaningful answer,
  // so skip solving and let the dashboard render an empty state instead of
  // bogus numbers.
  const annualSpend = useMemo(
    () => (scenario ? retirementSpend(scenario) : 0),
    // Narrow deps: `scenario` itself changes on every keystroke in unrelated
    // fields, but retirementSpend only reads expenses + retirementAge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenario?.expenses, scenario?.profile.retirementAge],
  );

  // Sim-ready check: the simulation slice's fingerprint matches the solver
  // fingerprint AND status is `complete`. Both useSimulation and the solver
  // hash via solverFingerprint, so they're directly comparable.
  const simReady = simStatus === "complete" && simFingerprint === expectedFp;
  const goalStale =
    !scenario?.goal ||
    scenario.goal.fingerprint !== expectedFp ||
    !scenario.goal.cache.earliest_retirement_age ||
    !scenario.goal.cache.required_savings;
  const shouldSolve = !!scenario && annualSpend > 0 && goalStale && simReady;

  useEffect(() => {
    if (!shouldSolve || !scenario || !expectedFp) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const targets = {
      retirementAge: scenario.profile.retirementAge,
      annualSpend,
      successRate: TARGET_SUCCESS_RATE,
    };

    const run = async () => {
      try {
        const solvedEntries: Partial<Goal["cache"]> = {};
        for (const q of QUESTIONS) {
          if (ac.signal.aborted) return;
          const input: SolveInput = { question: q, targets };
          const result = await solve(
            scenario,
            input,
            (s, opts) => runOnce(s, { ...opts, signal: ac.signal }),
            { signal: ac.signal },
          );
          if (ac.signal.aborted) return;
          solvedEntries[q] = result;
        }
        if (ac.signal.aborted) return;

        // Read the live scenario state at writeback time. The captured
        // `scenario` is from the effect's closure, so if the user edited
        // goal.cache mid-solve (e.g., another auto-solve cycle finished, or
        // they switched scenarios and back), merging into the closure's
        // value would clobber that edit. getState() is always current.
        const live = useAppStore.getState().scenarios.find((s) => s.id === scenario.id);
        if (!live) return;
        updateScenario(scenario.id, {
          goal: {
            cache: { ...(live.goal?.cache ?? {}), ...solvedEntries },
            fingerprint: expectedFp,
            lastSolvedAt: new Date().toISOString(),
          },
        });
      } catch (e) {
        if (ac.signal.aborted) return;
        // Auto-solve is best-effort: cached values from prior solves remain
        // visible. Surfacing this as a hard error would be more annoying than
        // useful since the user didn't initiate the run.
        console.warn("Auto-solve failed:", e);
      }
    };

    run();

    return () => {
      ac.abort();
    };
    // Stable deps: scenario.id catches active-scenario switches; expectedFp
    // catches input changes. The closure captures `scenario` and
    // `updateScenario` directly. Both are intentionally omitted from the
    // dep array because:
    //   - Zustand action references (`updateScenario`) are guaranteed stable
    //     across renders, so adding it would never re-fire the effect.
    //   - `scenario` mutates frequently mid-typing; firing the effect on
    //     every keystroke would cancel and restart the solver constantly.
    //     The partial-patch updateScenario protects unrelated fields, and
    //     a new effect cycle picks up the change via expectedFp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldSolve, expectedFp, scenario?.id, annualSpend]);

  // Belt-and-braces unmount cleanup: aborts any in-flight solver run when the
  // hook owner (AppShell) is torn down (e.g., on hard navigation away from
  // the app or full reload-triggered remounts).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
}

// Sum of expenses active at the scenario's retirement age (excluding
// one_time, which fire once and aren't part of the steady retirement spend).
// Used as the target spend for both Q1 and Q2.
function retirementSpend(scenario: Scenario): Dollars {
  const refAge: Age = scenario.profile.retirementAge;
  let total = 0;
  for (const e of scenario.expenses) {
    if (e.category === "one_time") continue;
    const startsBy = e.startAge <= refAge;
    const endsAfter = e.endAge == null || e.endAge >= refAge;
    if (startsBy && endsAfter) total += e.annualAmount;
  }
  return total;
}
