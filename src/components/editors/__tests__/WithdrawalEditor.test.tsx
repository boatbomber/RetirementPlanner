import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createDefaultScenario } from "@/models/defaults";
import { WithdrawalEditor } from "../WithdrawalEditor";
import type { Scenario } from "@/models";

function renderEditor(overrides: Partial<Scenario> = {}) {
  const scenario = { ...createDefaultScenario("Test"), ...overrides };
  const onUpdate = vi.fn();
  render(<WithdrawalEditor scenario={scenario} onUpdate={onUpdate} />);
  return { scenario, onUpdate };
}

describe("WithdrawalEditor", () => {
  it("renders strategy and order fields", () => {
    renderEditor();
    expect(screen.getByText("Strategy type")).toBeInTheDocument();
    expect(screen.getByText("Account withdrawal order")).toBeInTheDocument();
  });

  it("shows fixed real params by default", () => {
    renderEditor();
    expect(screen.getByText("Withdrawal rate")).toBeInTheDocument();
  });

  it("shows strategy description", () => {
    renderEditor();
    expect(screen.getByText(/classic "4% rule"/)).toBeInTheDocument();
  });

  it("shows Roth conversion section", () => {
    renderEditor();
    expect(screen.getByText("Enable Roth conversions")).toBeInTheDocument();
  });

  it("shows spending smile toggle", () => {
    renderEditor();
    expect(screen.getByText(/spending smile/)).toBeInTheDocument();
  });

  it("shows Guyton-Klinger params when strategy is guyton_klinger", () => {
    renderEditor({
      withdrawalStrategy: {
        type: "guyton_klinger",
        params: {
          initialRate: 0.05,
          ceilingMultiplier: 0.2,
          floorMultiplier: 0.2,
          adjustmentPercent: 0.1,
        },
        useSpendingSmile: false,
      },
    });
    expect(screen.getByText("Initial withdrawal rate")).toBeInTheDocument();
    expect(screen.getByText("Ceiling drift band")).toBeInTheDocument();
    expect(screen.getByText("Floor drift band")).toBeInTheDocument();
    expect(screen.getByText("Adjustment size")).toBeInTheDocument();
  });

  it("shows VPW message when strategy is vpw", () => {
    renderEditor({
      withdrawalStrategy: {
        type: "vpw",
        params: {},
        useSpendingSmile: false,
      },
    });
    expect(screen.getByText(/No additional parameters needed/)).toBeInTheDocument();
  });

  it("shows Roth conversion bracket selector when enabled", () => {
    renderEditor({
      withdrawalOrder: {
        type: "conventional",
        rothConversionEnabled: true,
        rothConversionTargetBracket: 0.22,
        bracketFillingTargetBracket: 0.12,
        customOrder: [],
      },
    });
    expect(screen.getByText("Convert to fill up to bracket")).toBeInTheDocument();
  });
});
