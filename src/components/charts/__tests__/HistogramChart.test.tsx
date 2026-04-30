import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HistogramChart } from "../HistogramChart";
import type { WealthBucket } from "@/models/results";

function makeBuckets(): WealthBucket[] {
  return [
    { min: 0, max: 100_000, count: 50 },
    { min: 100_000, max: 250_000, count: 150 },
    { min: 250_000, max: 500_000, count: 300 },
    { min: 500_000, max: 1_000_000, count: 250 },
    { min: 1_000_000, max: 2_000_000, count: 150 },
    { min: 2_000_000, max: 5_000_000, count: 80 },
    { min: 5_000_000, max: 10_000_000, count: 15 },
    { min: 10_000_000, max: Infinity, count: 5 },
  ];
}

describe("HistogramChart", () => {
  it("renders without error with typical data", () => {
    const { container } = render(<HistogramChart data={makeBuckets()} totalIterations={1000} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("renders without error with empty data", () => {
    const { container } = render(<HistogramChart data={[]} totalIterations={0} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("renders without error with single bucket", () => {
    const { container } = render(
      <HistogramChart data={[{ min: 0, max: 100_000, count: 100 }]} totalIterations={100} />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("filters out zero-count buckets", () => {
    const data: WealthBucket[] = [
      { min: 0, max: 100_000, count: 0 },
      { min: 100_000, max: 250_000, count: 50 },
      { min: 250_000, max: 500_000, count: 0 },
    ];
    const { container } = render(<HistogramChart data={data} totalIterations={50} />);
    expect(container.firstChild).toBeTruthy();
  });
});
