import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppStore } from "@/store";
import { createDefaultScenario } from "@/models/defaults";
import type { SimulationResult } from "@/models/results";
import { DEFAULT_SIMULATION_CONFIG } from "@/models/defaults";
import { DashboardPage } from "../DashboardPage";

vi.mock("@/hooks/useSimulation", () => ({
  useSimulation: vi.fn(() => ({ rerun: vi.fn() })),
  useRerun: vi.fn(() => vi.fn()),
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

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <DashboardPage />
    </MemoryRouter>,
  );
}

function makeResult(scenarioId: string): SimulationResult {
  const numYears = 30;
  const wealthByYear = Array.from({ length: numYears }, (_, i) => ({
    year: 2026 + i,
    age: 35 + i,
    p5: 100_000 + i * 5_000,
    p10: 200_000 + i * 8_000,
    p25: 400_000 + i * 15_000,
    p50: 600_000 + i * 20_000,
    p75: 900_000 + i * 30_000,
    p90: 1_200_000 + i * 40_000,
    p95: 1_500_000 + i * 50_000,
  }));

  return {
    scenarioId,
    timestamp: new Date().toISOString(),
    configSnapshot: DEFAULT_SIMULATION_CONFIG,
    durationMs: 800,
    successRate: 0.85,
    medianTerminalWealth: 1_200_000,
    medianPortfolioAtRetirement: 1_800_000,
    estimatedRetirementAge: 65,
    confidenceAge: 92,
    wealthByYear,
    incomeByYear: wealthByYear,
    spendingByYear: wealthByYear,
    taxByYear: wealthByYear,
    ssIncomeByYear: wealthByYear,
    withdrawalsByYear: wealthByYear,
    rmdByYear: wealthByYear,
    rothConversionByYear: wealthByYear,
    accountBalancesByYear: [],
    adjustmentProbability: 0.15,
    medianMaxCutPercent: 0.08,
    p90MaxCutPercent: 0.18,
    terminalWealthBuckets: [],
    depletionAgeBuckets: [],
    warnings: [],
  };
}

describe("DashboardPage", () => {
  beforeEach(resetStore);

  it("shows empty state when no scenario exists", () => {
    renderDashboard();
    expect(screen.getByText("No scenario")).toBeInTheDocument();
    expect(screen.getByText("Start wizard")).toBeInTheDocument();
  });

  it("shows scenario name when active scenario exists", () => {
    const s = createDefaultScenario("Test Plan");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
    });
    renderDashboard();
    expect(screen.getByText("Test Plan")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Edit scenario")).toBeInTheDocument();
  });

  it("shows simulation progress bar when running", () => {
    const s = createDefaultScenario("Running Sim");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
      simulations: {
        [s.id]: {
          status: "running",
          progress: 0.45,
          result: null,
          error: null,
          fingerprint: null,
        },
      },
    });
    renderDashboard();
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows error state", () => {
    const s = createDefaultScenario("Error Case");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
      simulations: {
        [s.id]: {
          status: "error",
          progress: 0,
          result: null,
          error: "Worker crashed",
          fingerprint: null,
        },
      },
    });
    renderDashboard();
    expect(screen.getByText(/Worker crashed/)).toBeInTheDocument();
  });

  it("shows metric cards and fan chart when simulation complete", () => {
    const s = createDefaultScenario("Complete Sim");
    const result = makeResult(s.id);
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
      simulations: {
        [s.id]: {
          status: "complete",
          progress: 1,
          result,
          error: null,
          fingerprint: null,
        },
      },
    });
    renderDashboard();

    expect(screen.getByText("Success Rate")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("Median Portfolio")).toBeInTheDocument();
    expect(screen.getByText("Adjustment Risk")).toBeInTheDocument();
    expect(screen.getByText("Worst Cut")).toBeInTheDocument();
    expect(screen.getByText("Confidence Age")).toBeInTheDocument();
    expect(screen.getByText("92")).toBeInTheDocument();
  });

  it("shows scenario summary details", () => {
    const s = createDefaultScenario("Summary Test");
    useAppStore.setState({
      scenarios: [s],
      activeScenarioId: s.id,
    });
    renderDashboard();

    expect(screen.getByText("65")).toBeInTheDocument();
    expect(screen.getByText("Age 95")).toBeInTheDocument();
    expect(screen.getByText("fixed real")).toBeInTheDocument();
    expect(screen.getByText("10,000")).toBeInTheDocument();
  });
});
