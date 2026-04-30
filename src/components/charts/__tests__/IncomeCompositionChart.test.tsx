import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { IncomeCompositionChart } from "../IncomeCompositionChart";
import type { YearlyPercentiles } from "@/models/results";

function makePercentiles(startAge: number, years: number, base: number): YearlyPercentiles[] {
  return Array.from({ length: years }, (_, i) => ({
    year: 2026 + i,
    age: startAge + i,
    p5: base * 0.5 * (i + 1),
    p10: base * 0.6 * (i + 1),
    p25: base * 0.8 * (i + 1),
    p50: base * (i + 1),
    p75: base * 1.2 * (i + 1),
    p90: base * 1.4 * (i + 1),
    p95: base * 1.5 * (i + 1),
  }));
}

describe("IncomeCompositionChart", () => {
  it("renders without error with typical data", () => {
    const { container } = render(
      <IncomeCompositionChart
        income={makePercentiles(65, 10, 50_000)}
        spending={makePercentiles(65, 10, 40_000)}
        tax={makePercentiles(65, 10, 10_000)}
        retirementAge={65}
      />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("renders without error with empty data", () => {
    const { container } = render(<IncomeCompositionChart income={[]} spending={[]} tax={[]} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("renders without error with single year", () => {
    const { container } = render(
      <IncomeCompositionChart
        income={makePercentiles(65, 1, 50_000)}
        spending={makePercentiles(65, 1, 40_000)}
        tax={makePercentiles(65, 1, 10_000)}
      />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("renders legend items", () => {
    const { container } = render(
      <IncomeCompositionChart
        income={makePercentiles(65, 5, 50_000)}
        spending={makePercentiles(65, 5, 40_000)}
        tax={makePercentiles(65, 5, 10_000)}
      />,
    );
    expect(container.textContent).toContain("Spending");
    expect(container.textContent).toContain("Taxes");
    expect(container.textContent).toContain("Net Income");
  });
});
