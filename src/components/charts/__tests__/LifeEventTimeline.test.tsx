import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/primitives";
import { LifeEventTimeline } from "../LifeEventTimeline";
import type { LifeEvent, FinancialImpact } from "@/models/life-event";

function renderWithProvider(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

function emptyImpact(): FinancialImpact {
  return {
    oneTimeInflow: 0,
    oneTimeOutflow: 0,
    targetAccountId: null,
    incomeChanges: [],
    expenseChanges: [],
    contributionChanges: [],
  };
}

function makeEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: crypto.randomUUID(),
    type: "major_expense",
    label: "Test Event",
    description: "",
    triggerAge: 40,
    durationYears: null,
    financialImpact: emptyImpact(),
    ...overrides,
  };
}

describe("LifeEventTimeline", () => {
  it("renders nothing when no events", () => {
    const { container } = renderWithProvider(
      <LifeEventTimeline events={[]} currentAge={35} retirementAge={65} endAge={95} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders with a single event", () => {
    renderWithProvider(
      <LifeEventTimeline
        events={[makeEvent({ label: "Home Purchase", triggerAge: 40 })]}
        currentAge={35}
        retirementAge={65}
        endAge={95}
      />,
    );
    expect(screen.getByText("Life events")).toBeInTheDocument();
    expect(screen.getByLabelText("Retirement at age 65")).toBeInTheDocument();
  });

  it("renders multiple events", () => {
    const events = [
      makeEvent({ label: "Home", triggerAge: 35 }),
      makeEvent({
        label: "College",
        triggerAge: 50,
        durationYears: 4,
        type: "education",
      }),
      makeEvent({ label: "Inherit", triggerAge: 60, type: "inheritance" }),
    ];
    renderWithProvider(<LifeEventTimeline events={events} currentAge={30} retirementAge={65} endAge={95} />);
    expect(screen.getByText("Life events")).toBeInTheDocument();
  });

  it("shows age range labels", () => {
    renderWithProvider(
      <LifeEventTimeline events={[makeEvent()]} currentAge={35} retirementAge={65} endAge={95} />,
    );
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });
});
