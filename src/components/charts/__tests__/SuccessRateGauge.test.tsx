import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SuccessRateGauge } from "../SuccessRateGauge";

describe("SuccessRateGauge", () => {
  it("renders an SVG with correct aria-label", () => {
    const { container } = render(<SuccessRateGauge value={0.85} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("aria-label")).toBe("85% success rate");
  });

  it("uses success color for values >= 80%", () => {
    const { container } = render(<SuccessRateGauge value={0.9} />);
    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    expect(progressCircle?.getAttribute("stroke")).toBe("var(--color-success)");
  });

  it("uses warning color for values 60-79%", () => {
    const { container } = render(<SuccessRateGauge value={0.7} />);
    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    expect(progressCircle?.getAttribute("stroke")).toBe("var(--color-warning)");
  });

  it("uses danger color for values < 60%", () => {
    const { container } = render(<SuccessRateGauge value={0.4} />);
    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    expect(progressCircle?.getAttribute("stroke")).toBe("var(--color-danger)");
  });

  it("clamps value to [0, 1]", () => {
    const { container } = render(<SuccessRateGauge value={1.5} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("100% success rate");
  });

  it("handles zero value", () => {
    const { container } = render(<SuccessRateGauge value={0} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("0% success rate");
  });

  it("respects custom size", () => {
    const { container } = render(<SuccessRateGauge value={0.5} size={64} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("64");
    expect(svg?.getAttribute("height")).toBe("64");
  });
});
