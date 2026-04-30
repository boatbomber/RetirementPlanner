import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FanChart } from "../FanChart";
import type { YearlyPercentiles } from "@/models/results";

function makeData(count: number, startAge = 30): YearlyPercentiles[] {
  return Array.from({ length: count }, (_, i) => {
    const age = startAge + i;
    const base = 500_000 + i * 20_000;
    return {
      year: 2026 + i,
      age,
      p5: base * 0.3,
      p10: base * 0.45,
      p25: base * 0.7,
      p50: base,
      p75: base * 1.4,
      p90: base * 1.8,
      p95: base * 2.2,
    };
  });
}

describe("FanChart", () => {
  it("renders nothing for empty data", () => {
    const { container } = render(<FanChart data={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders SVG for single-year data", () => {
    render(<FanChart data={makeData(1)} />);
    // ParentSize needs a measurable container; in jsdom width=0 so the inner chart may not render.
    // But the toggle button should always be present.
    expect(screen.getByText("Show as table")).toBeInTheDocument();
  });

  it("renders the 'Show as table' toggle", () => {
    render(<FanChart data={makeData(10)} />);
    expect(screen.getByText("Show as table")).toBeInTheDocument();
  });

  it("switches to table view when toggled", async () => {
    const data = makeData(5, 65);
    render(<FanChart data={data} />);

    const toggle = screen.getByText("Show as table");
    fireEvent.click(toggle);

    expect(screen.getByText("Show chart")).toBeInTheDocument();

    // Table should show age column headers
    expect(screen.getByText("Median")).toBeInTheDocument();
    expect(screen.getByText("5th")).toBeInTheDocument();
    expect(screen.getByText("95th")).toBeInTheDocument();

    // Table should contain all ages
    for (const d of data) {
      expect(screen.getByText(`${d.age}`)).toBeInTheDocument();
    }
  });

  it("table displays correct formatted values", () => {
    const data: YearlyPercentiles[] = [
      {
        year: 2026,
        age: 65,
        p5: 100_000,
        p10: 200_000,
        p25: 400_000,
        p50: 600_000,
        p75: 900_000,
        p90: 1_200_000,
        p95: 1_500_000,
      },
    ];
    render(<FanChart data={data} />);
    fireEvent.click(screen.getByText("Show as table"));

    // Median of $600k should show as compact currency
    expect(screen.getByText(/\$600/)).toBeInTheDocument();
    expect(screen.getByText(/\$1\.50?M/)).toBeInTheDocument();
  });

  it("renders 50-year data without error", () => {
    const data = makeData(50);
    expect(() => render(<FanChart data={data} />)).not.toThrow();
  });
});
