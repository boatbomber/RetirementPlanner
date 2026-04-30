import { useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppStore } from "@/store";
import type { Scenario } from "@/models";

export const STEP_ORDER = ["basics", "income", "accounts", "expenses", "events", "review"] as const;

export type WizardStep = (typeof STEP_ORDER)[number];

export const STEP_TITLES: Record<WizardStep, string> = {
  basics: "Personal Information",
  income: "Income Sources",
  accounts: "Accounts & Savings",
  expenses: "Spending",
  events: "Life Events",
  review: "Review & Run",
};

export function useWizard() {
  const { step } = useParams<{ step: string }>();
  const navigate = useNavigate();

  const currentStep = (STEP_ORDER.includes(step as WizardStep) ? step : "basics") as WizardStep;
  const stepIndex = STEP_ORDER.indexOf(currentStep);

  const scenario = useAppStore((s) => s.getActiveScenario());
  const addScenario = useAppStore((s) => s.addScenario);
  const updateScenario = useAppStore((s) => s.updateScenario);
  const setWizardCompleted = useAppStore((s) => s.setWizardCompleted);

  useEffect(() => {
    if (!scenario) {
      addScenario();
    }
  }, [scenario, addScenario]);

  const goNext = useCallback(() => {
    const next = STEP_ORDER[stepIndex + 1];
    if (next) {
      navigate(`/wizard/${next}`);
    }
  }, [stepIndex, navigate]);

  const goBack = useCallback(() => {
    const prev = STEP_ORDER[stepIndex - 1];
    if (prev) {
      navigate(`/wizard/${prev}`);
    }
  }, [stepIndex, navigate]);

  const finish = useCallback(() => {
    setWizardCompleted(true);
    navigate("/dashboard");
  }, [setWizardCompleted, navigate]);

  const updateActiveScenario = useCallback(
    (patch: Partial<Scenario>) => {
      if (scenario) {
        updateScenario(scenario.id, patch);
      }
    },
    [scenario, updateScenario],
  );

  return useMemo(
    () => ({
      currentStep,
      stepIndex,
      stepCount: STEP_ORDER.length,
      title: STEP_TITLES[currentStep],
      scenario,
      isFirst: stepIndex === 0,
      isLast: stepIndex === STEP_ORDER.length - 1,
      goNext,
      goBack,
      finish,
      updateActiveScenario,
    }),
    [currentStep, stepIndex, scenario, goNext, goBack, finish, updateActiveScenario],
  );
}
