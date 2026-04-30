import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppStore } from "@/store";
import { createDefaultScenario } from "@/models/defaults";
import type { SimulationResult } from "@/models/results";
import { ScenarioComparePage } from "../ScenarioComparePage";

vi.mock("@/hooks/useSimulation", () => ({
  useSimulation: vi.fn(),
}));

function resetStore() {
  useAppStore.setState({
    scenarios: [],
    activeScenarioId: null,
    comparisonScenarioId: null,
    wizardCompleted: false,
    simulations: {},
  });
}

function makeResult(scenarioId: string, overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    scenarioId,
    timestamp: new Date().toISOString(),
    configSnapshot: {} as SimulationResult["configSnapshot"],
    durationMs: 500,
    successRate: 0.85,
    medianTerminalWealth: 1_000_000,
    medianPortfolioAtRetirement: 1_500_000,
    estimatedRetirementAge: 65,
    confidenceAge: 90,
    wealthByYear: [],
    incomeByYear: [],
    spendingByYear: [],
    taxByYear: [],
    ssIncomeByYear: [],
    withdrawalsByYear: [],
    rmdByYear: [],
    rothConversionByYear: [],
    accountBalancesByYear: [],
    adjustmentProbability: 0.12,
    medianMaxCutPercent: 0.05,
    p90MaxCutPercent: 0.12,
    terminalWealthBuckets: [],
    depletionAgeBuckets: [],
    warnings: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ScenarioComparePage />
    </MemoryRouter>,
  );
}

describe("ScenarioComparePage", () => {
  beforeEach(resetStore);

  it("shows scenario selectors", () => {
    const s1 = createDefaultScenario("Plan A");
    const s2 = createDefaultScenario("Plan B");
    useAppStore.setState({
      scenarios: [s1, s2],
      activeScenarioId: s1.id,
      comparisonScenarioId: s2.id,
    });
    renderPage();
    expect(screen.getByText("Compare Scenarios")).toBeInTheDocument();
    expect(screen.getByText("Comparisons")).toBeInTheDocument();
  });

  it("shows delta metrics when both simulations complete", () => {
    const s1 = createDefaultScenario("Base");
    const s2 = createDefaultScenario("Compare");
    const r1 = makeResult(s1.id, {
      successRate: 0.85,
      confidenceAge: 90,
      medianPortfolioAtRetirement: 1_500_000,
      adjustmentProbability: 0.12,
    });
    const r2 = makeResult(s2.id, {
      successRate: 0.92,
      confidenceAge: 93,
      medianPortfolioAtRetirement: 1_800_000,
      adjustmentProbability: 0.08,
    });

    useAppStore.setState({
      scenarios: [s1, s2],
      activeScenarioId: s1.id,
      comparisonScenarioId: s2.id,
      simulations: {
        [s1.id]: {
          status: "complete",
          progress: 1,
          result: r1,
          error: null,
          fingerprint: null,
        },
        [s2.id]: {
          status: "complete",
          progress: 1,
          result: r2,
          error: null,
          fingerprint: null,
        },
      },
    });
    renderPage();

    expect(screen.getByText("Success Rate")).toBeInTheDocument();
    expect(screen.getByText("Median Portfolio")).toBeInTheDocument();
    expect(screen.getByText("Confidence Age")).toBeInTheDocument();
    expect(screen.getByText("Adjustment Risk")).toBeInTheDocument();

    expect(screen.getByText("+7%")).toBeInTheDocument();
    expect(screen.getByText("+3 years")).toBeInTheDocument();
  });

  it("shows placeholder when comparison not selected", () => {
    const s1 = createDefaultScenario("Only Base");
    useAppStore.setState({
      scenarios: [s1],
      activeScenarioId: s1.id,
      comparisonScenarioId: null,
    });
    renderPage();
    expect(screen.getByText("Select a comparison scenario")).toBeInTheDocument();
  });

  it("shows 'No change' for equal metrics", () => {
    const s1 = createDefaultScenario("Same A");
    const s2 = createDefaultScenario("Same B");
    const r1 = makeResult(s1.id, {
      successRate: 0.85,
      confidenceAge: 90,
      medianPortfolioAtRetirement: 1_500_000,
      adjustmentProbability: 0.12,
    });
    const r2 = makeResult(s2.id, {
      successRate: 0.85,
      confidenceAge: 90,
      medianPortfolioAtRetirement: 1_500_000,
      adjustmentProbability: 0.12,
    });

    useAppStore.setState({
      scenarios: [s1, s2],
      activeScenarioId: s1.id,
      comparisonScenarioId: s2.id,
      simulations: {
        [s1.id]: {
          status: "complete",
          progress: 1,
          result: r1,
          error: null,
          fingerprint: null,
        },
        [s2.id]: {
          status: "complete",
          progress: 1,
          result: r2,
          error: null,
          fingerprint: null,
        },
      },
    });
    renderPage();

    const noChanges = screen.getAllByText("No change");
    expect(noChanges.length).toBe(4);
  });
});
