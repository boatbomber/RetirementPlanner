import { useWizard, STEP_ORDER } from "./useWizard";
import { BasicsStep } from "./steps/BasicsStep";
import { IncomeStep } from "./steps/IncomeStep";
import { AccountsStep } from "./steps/AccountsStep";
import { ExpensesStep } from "./steps/ExpensesStep";
import { LifeEventsStep } from "./steps/LifeEventsStep";
import { ReviewStep } from "./steps/ReviewStep";
import { Button } from "@/components/primitives/Button";

const STEP_COMPONENTS = {
  basics: BasicsStep,
  income: IncomeStep,
  accounts: AccountsStep,
  expenses: ExpensesStep,
  events: LifeEventsStep,
  review: ReviewStep,
} as const;

export function WizardPage() {
  const wizard = useWizard();
  const { currentStep, stepIndex, stepCount, title, isFirst, isLast, scenario } = wizard;

  if (!scenario) return null;

  const StepComponent = STEP_COMPONENTS[currentStep];

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col items-center px-[var(--space-5)] py-[var(--space-6)] md:px-[var(--space-7)] md:py-[var(--space-8)]">
        <div className="flex w-full max-w-[640px] flex-col gap-[var(--space-7)]">
          <div
            role="progressbar"
            aria-label="Wizard progress"
            aria-valuemin={1}
            aria-valuemax={stepCount}
            aria-valuenow={stepIndex + 1}
            aria-valuetext={`Step ${stepIndex + 1} of ${stepCount}`}
            className="flex gap-[var(--space-2)]"
          >
            {STEP_ORDER.map((s, i) => {
              // Distinguish completed (filled, primary) vs current (filled,
              // primary with a darker outline ring) vs upcoming (subtle).
              // Returning users can quickly see "you are here" without
              // counting bars.
              const state = i < stepIndex ? "done" : i === stepIndex ? "current" : "upcoming";
              return (
                <div
                  key={s}
                  aria-hidden="true"
                  className={
                    state === "done"
                      ? "h-1.5 flex-1 rounded-full bg-[var(--color-primary)]"
                      : state === "current"
                        ? "h-1.5 flex-1 rounded-full bg-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/40 ring-offset-1 ring-offset-[var(--color-surface)]"
                        : "h-1.5 flex-1 rounded-full bg-[var(--color-border-subtle)]"
                  }
                />
              );
            })}
          </div>

          <div className="flex flex-col gap-[var(--space-1)]">
            <h1 className="text-heading-lg font-semibold text-text-primary">{title}</h1>
            <p className="text-body-sm text-text-secondary">
              Step {stepIndex + 1} of {stepCount}
            </p>
          </div>

          <StepComponent wizard={wizard} />
        </div>
      </div>

      <div className="sticky bottom-0 flex shrink-0 justify-center border-t border-[var(--color-border-subtle)] bg-surface px-[var(--space-5)] py-[var(--space-4)] pb-[max(var(--space-4),env(safe-area-inset-bottom))] md:px-[var(--space-7)]">
        <div className="flex w-full max-w-[640px] items-center justify-between gap-[var(--space-3)]">
          {!isFirst ? (
            <Button variant="ghost" onClick={wizard.goBack}>
              Back
            </Button>
          ) : (
            <div />
          )}
          {!isLast ? (
            <Button onClick={wizard.goNext}>Next</Button>
          ) : (
            <Button onClick={wizard.finish}>Continue to Dashboard</Button>
          )}
        </div>
      </div>
    </div>
  );
}
